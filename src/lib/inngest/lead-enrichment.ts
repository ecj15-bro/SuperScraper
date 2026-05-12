import { inngest } from "./client";
import { db } from "../db/client";
import { companies, companyTags, verticals } from "../db/schema";
import { eq, desc } from "drizzle-orm";
import { isCompetitor } from "../competitors";
import { scoreVARFit, enrichPitchContext, generateBriefing, isWorthPursuing } from "../../agents/context";
import { runDetective } from "../../agents/detective";
import { runSalesman } from "../../agents/salesman";
import { addToExportQueue } from "../export-queue";
import { deliverReport } from "../deliver";
import { updateJob } from "../data";
import { saveReport } from "../data";
import { getEnv } from "../env";

// Build a context string from whatever signal a company has.
// Works for both news-sourced and USASpending-sourced companies.
function buildLeadContext(company: typeof companies.$inferSelect): string {
  if (company.newsSignal) {
    const sig = company.newsSignal as any;
    return `${sig.title}: ${sig.snippet}`;
  }
  // Synthetic context from contract history
  const value = Number(company.totalAwardsValue ?? 0);
  const count = company.totalAwardsCount ?? 0;
  const lastWin = company.lastWinAt
    ? `Last win: ${company.lastWinAt.toLocaleDateString()}.`
    : "";
  return `${company.name} has won ${count} government contract${count !== 1 ? "s" : ""} totaling $${value.toLocaleString()}. ${lastWin}`.trim();
}

function buildScoredLeadShape(company: typeof companies.$inferSelect) {
  const sig = company.newsSignal as any;
  return {
    companyName:   company.name,
    newsTitle:     sig?.title ?? `${company.name} — Government Contract Activity`,
    newsSnippet:   sig?.snippet ?? buildLeadContext(company),
    newsUrl:       sig?.url ?? "",
    newsSource:    sig?.source ?? "USASpending.gov",
    relevanceScore: sig?.relevanceScore ?? Math.round((company.opportunityScore ?? 50) / 10),
  };
}

export const enrichLeadFunction = inngest.createFunction(
  {
    id: "enrich-lead",
    retries: 3,
    concurrency: { limit: 10 },
  },
  { event: "superscraper/lead.enqueue" },
  async ({ event, step }) => {
    const { companyId, jobId } = event.data as { companyId: string; jobId?: string };

    // ── Step 1: Staleness + competitor gate + Context Gate 1 ─────────────────
    const gate1 = await step.run("context-gate-1", async () => {
      const [company] = await db.select().from(companies).where(eq(companies.id, companyId));
      if (!company) return { pass: false, reason: "not_found" };

      // Staleness check
      const lastActivity = Math.max(
        company.lastWinAt?.getTime() ?? 0,
        company.newsSignalAt?.getTime() ?? 0,
      );
      const ageDays = lastActivity > 0 ? (Date.now() - lastActivity) / 86_400_000 : 999;
      if (ageDays > getEnv().maxEnrichmentAgeDays) {
        await db.update(companies).set({ enrichmentStatus: "stale" }).where(eq(companies.id, companyId));
        return { pass: false, reason: "stale" };
      }

      // Competitor check (name + news snippet)
      const sig = company.newsSignal as any;
      if (await isCompetitor(company.name, sig?.snippet)) {
        await db.update(companies).set({ enrichmentStatus: "filtered_competitor" }).where(eq(companies.id, companyId));
        return { pass: false, reason: "competitor" };
      }

      // Context Gate 1: score from available data, no full profile yet
      const context = buildLeadContext(company);
      const varFitScore = await scoreVARFit(company.name, "", "", context);

      if (!isWorthPursuing(varFitScore)) {
        await db.update(companies)
          .set({ enrichmentStatus: "filtered_gate1", varFitScore })
          .where(eq(companies.id, companyId));
        return { pass: false, reason: "gate1", varFitScore };
      }

      await db.update(companies)
        .set({ enrichmentStatus: "profiling", varFitScore })
        .where(eq(companies.id, companyId));

      return { pass: true, varFitScore };
    });

    if (!gate1.pass) {
      if (jobId) await updateJob(jobId, { leadsFiltered: 1 } as any);
      return { filtered: gate1.reason };
    }

    // ── Step 2: Detective ────────────────────────────────────────────────────
    const detective = await step.run("detective", async () => {
      const [company] = await db.select().from(companies).where(eq(companies.id, companyId));
      if (!company) return null;

      const lead = buildScoredLeadShape(company);
      const results = await runDetective([lead]);
      if (!results.length) return null;

      const r = results[0];

      // Domain-level competitor check after Detective extracts website
      if (r.companyWebsite && await isCompetitor(r.companyName, r.companyWebsite)) {
        await db.update(companies)
          .set({ enrichmentStatus: "filtered_competitor" })
          .where(eq(companies.id, companyId));
        return null;
      }

      await db.update(companies).set({
        dmFirstName:     r.firstName ?? "",
        dmLastName:      r.lastName ?? "",
        decisionMaker:   r.decisionMaker,
        dmTitle:         r.title,
        dmLinkedin:      r.linkedinUrl ?? undefined,
        website:         r.companyWebsite ?? undefined,
        companyProfile:  r.companyProfile,
        personProfile:   r.personProfile,
        confidenceScore: r.confidenceScore,
        profiledAt:      new Date(),
      }).where(eq(companies.id, companyId));

      return r;
    });

    if (!detective) {
      await db.update(companies)
        .set({ enrichmentStatus: "filtered_competitor" })
        .where(eq(companies.id, companyId));
      return { error: "detective_failed_or_competitor" };
    }

    // ── Step 3: Context Gate 2 + Enrichment ───────────────────────────────────
    const enriched = await step.run("context-gate-2", async () => {
      const context = detective.newsTitle
        ? `${detective.newsTitle}: ${detective.newsSnippet}`
        : buildLeadContext({ name: detective.companyName } as any);

      const varFitScore = await scoreVARFit(
        detective.companyName, detective.companyProfile, detective.personProfile, context,
      );

      if (!isWorthPursuing(varFitScore)) {
        await db.update(companies)
          .set({ enrichmentStatus: "filtered_gate2", varFitScore })
          .where(eq(companies.id, companyId));
        return null;
      }

      const pitchContext = await enrichPitchContext(
        detective.companyName, detective.companyProfile, detective.personProfile, varFitScore,
      );
      const briefing = await generateBriefing(
        { companyName: detective.companyName, decisionMaker: detective.decisionMaker },
        varFitScore, pitchContext,
      );

      await db.update(companies).set({ varFitScore, pitchContext, briefing }).where(eq(companies.id, companyId));

      return { varFitScore, pitchContext, briefing };
    });

    if (!enriched) {
      if (jobId) await updateJob(jobId, { leadsFiltered: 1 } as any);
      return { filtered: "gate2" };
    }

    // ── Step 4: Salesman ──────────────────────────────────────────────────────
    const pitched = await step.run("salesman", async () => {
      const results = await runSalesman([{ lead: detective, ...enriched }]);
      if (!results.length) return null;
      const r = results[0];

      await saveReport({
        companyName:      r.companyName,
        decisionMaker:    r.decisionMaker,
        title:            r.title,
        linkedinUrl:      r.linkedinUrl ?? undefined,
        companyWebsite:   r.companyWebsite ?? undefined,
        companyProfile:   r.companyProfile,
        personProfile:    r.personProfile,
        pitch:            r.selectedPitch,
        newsTitle:        r.newsTitle,
        newsSource:       r.newsUrl,
        pitchVariants:    r.pitchVariants,
        relevanceScore:   r.relevanceScore,
        confidenceScore:  r.confidenceScore,
        varFitScore:      r.varFitScore,
        pitchContext:     r.pitchContext,
        briefing:         r.briefing,
        personalizedIntro: r.personalizedIntro,
        firstName:        r.firstName,
        lastName:         r.lastName,
        jobId,
      });

      return r;
    });

    if (!pitched) return { error: "salesman_failed" };

    // ── Step 5: Export Queue ──────────────────────────────────────────────────
    await step.run("export-queue", async () => {
      const [company] = await db.select().from(companies).where(eq(companies.id, companyId));
      if (!company) return;

      await addToExportQueue({
        companyId,
        firstName:         pitched.firstName ?? "",
        lastName:          pitched.lastName ?? "",
        personalizedIntro: pitched.personalizedIntro ?? "",
        companyName:       company.name,
        linkedinUrl:       pitched.linkedinUrl ?? "",
        source:            company.source ?? "news",
        opportunityScore:  Math.round(company.opportunityScore ?? 0),
        jobId,
      });
    });

    // ── Step 6: Deliver (email / Teams / Slack) ────────────────────────────────
    await step.run("deliver", async () => {
      try {
        await deliverReport({
          companyName:    pitched.companyName,
          decisionMaker:  pitched.decisionMaker,
          title:          pitched.title,
          linkedinUrl:    pitched.linkedinUrl ?? undefined,
          companyWebsite: pitched.companyWebsite ?? undefined,
          companyProfile: pitched.companyProfile,
          personProfile:  pitched.personProfile,
          pitch:          `${enriched.briefing}\n\n---\n\n${pitched.selectedPitch}`,
          newsTitle:      pitched.newsTitle,
          newsSource:     pitched.newsUrl,
        });
      } catch (e) {
        console.error("[Inngest] Delivery failed (non-fatal):", e);
      }
    });

    if (jobId) await updateJob(jobId, { leadsProcessed: 1 } as any);
    return { processed: true, companyId };
  },
);
