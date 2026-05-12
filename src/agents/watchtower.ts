import { askClaude } from "@/lib/claude";
import { searchNews } from "@/lib/search";
import { getWatchtowerConfig } from "@/lib/watchtower-config";
import { hasSeenCompany, saveSearchHistory } from "@/lib/data";
import { isCompetitor } from "@/lib/competitors";
import { db } from "@/lib/db/client";
import { companies } from "@/lib/db/schema";
import { sql } from "drizzle-orm";
import { inngest } from "@/lib/inngest/client";
import { randomUUID } from "crypto";

// ─── TYPES ───────────────────────────────────────────────────────────────────

export interface ScoredLead {
  companyName: string;
  newsTitle: string;
  newsSnippet: string;
  newsUrl: string;
  newsSource: string;
  relevanceScore: number;
}

interface WatchtowerResult {
  leadsEnqueued: number;
  leadsScanned: number;
  leadsSkipped: number;
  byCategory: Record<string, { scanned: number; enqueued: number }>;
}

// ─── SCORING ─────────────────────────────────────────────────────────────────

async function scoreNewsResults(
  results: { title: string; snippet: string; link: string; source?: string }[],
  context: string,
): Promise<ScoredLead[]> {
  if (!results.length) return [];

  const response = await askClaude(
    `You are a partner intelligence analyst. Score each news item for how strongly it signals that the company would benefit from a VAR or reseller partnership. Context about our product and ideal partner:

${context}

Score each item 1-10:
- 8-10: Strong signal (growth, expansion, new product launch, funding, hiring sales team, entering new market)
- 5-7: Moderate signal (technology adoption, digital transformation, partnership mentions)
- 1-4: Weak signal (routine news, awards, unrelated topics)

Never use em dashes in any output.

Return ONLY a JSON array:
[{"companyName":"","relevanceScore":7,"reason":"brief reason"}]`,
    results.map((r, i) => `${i + 1}. "${r.title}" — ${r.snippet}`).join("\n"),
  );

  try {
    const scores = JSON.parse(response.replace(/```json|```/g, "").trim()) as {
      companyName: string;
      relevanceScore: number;
      reason: string;
    }[];

    return scores
      .map((s, i) => {
        const r = results[i];
        if (!r) return null;
        const companyName = s.companyName?.trim() ||
          r.title.replace(/\s+(announces|launches|raises|closes|expands|partners|wins|acquires|hires|reports|releases).*$/i, "").trim();
        return {
          companyName,
          newsTitle:   r.title,
          newsSnippet: r.snippet,
          newsUrl:     r.link,
          newsSource:  r.source ?? "",
          relevanceScore: s.relevanceScore ?? 5,
        };
      })
      .filter((x): x is ScoredLead => x !== null && x.relevanceScore >= 5);
  } catch {
    return results.slice(0, 3).map((r) => ({
      companyName:   r.title.split(" ").slice(0, 3).join(" "),
      newsTitle:     r.title,
      newsSnippet:   r.snippet,
      newsUrl:       r.link,
      newsSource:    r.source ?? "",
      relevanceScore: 5,
    }));
  }
}

// ─── UPSERT COMPANY ──────────────────────────────────────────────────────────

async function upsertNewsCompany(lead: ScoredLead): Promise<string> {
  const [existing] = await db
    .select({ id: companies.id, source: companies.source })
    .from(companies)
    .where(sql`LOWER(${companies.name}) = ${lead.companyName.toLowerCase().trim()}`)
    .limit(1);

  if (existing) {
    // If USASpending only, upgrade source to 'both'
    if (existing.source === "usaspending") {
      await db.update(companies)
        .set({
          source:        "both",
          newsSignal:    { title: lead.newsTitle, snippet: lead.newsSnippet, url: lead.newsUrl, source: lead.newsSource, relevanceScore: lead.relevanceScore },
          newsSignalAt:  new Date(),
          enqueuedAt:    null,
          enrichmentStatus: "pending",
        } as any)
        .where(sql`id = ${existing.id}`);
    }
    return existing.id;
  }

  const id = randomUUID();
  await db.insert(companies).values({
    id,
    name:           lead.companyName,
    source:         "news",
    newsSignal:     { title: lead.newsTitle, snippet: lead.newsSnippet, url: lead.newsUrl, source: lead.newsSource, relevanceScore: lead.relevanceScore },
    newsSignalAt:   new Date(),
    enrichmentStatus: "pending",
  } as any).onConflictDoNothing();
  return id;
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

export async function runWatchtower(jobId?: string): Promise<WatchtowerResult> {
  const config = await getWatchtowerConfig();
  if (!config) throw new Error("Watchtower config not set — complete the business profile first.");

  const maxAgeDays = config.newsMaxAgeDays ?? 30;
  const result: WatchtowerResult = {
    leadsEnqueued: 0,
    leadsScanned:  0,
    leadsSkipped:  0,
    byCategory:    {},
  };

  // Build a scoring context block from config
  const scoringContext = [
    config.idealVARProfile ? `Ideal partner: ${config.idealVARProfile}` : "",
    config.targetVerticals.length ? `Target verticals: ${config.targetVerticals.join(", ")}` : "",
    config.keyValueProps.length ? `Value props: ${config.keyValueProps.join("; ")}` : "",
  ].filter(Boolean).join("\n");

  // Process each search category
  for (const category of config.searchCategories) {
    const categoryKey = category.name;
    result.byCategory[categoryKey] = { scanned: 0, enqueued: 0 };

    for (const query of category.queries) {
      let rawResults: Awaited<ReturnType<typeof searchNews>> = [];
      try {
        rawResults = await searchNews(query, 10, maxAgeDays);
      } catch (e) {
        console.error(`[Watchtower] searchNews failed for query "${query}":`, e);
        continue;
      }

      if (!rawResults.length) continue;

      // Score the batch
      const scoredLeads = await scoreNewsResults(rawResults, scoringContext);
      result.leadsScanned += rawResults.length;
      result.byCategory[categoryKey].scanned += rawResults.length;

      for (const lead of scoredLeads) {
        // Skip already-seen companies
        if (await hasSeenCompany(lead.companyName)) {
          result.leadsSkipped++;
          continue;
        }

        // Competitor gate
        if (await isCompetitor(lead.companyName, lead.newsSnippet)) {
          result.leadsSkipped++;
          continue;
        }

        // Upsert to DB
        const companyId = await upsertNewsCompany(lead);

        // Mark enqueued to prevent double-fire
        await db.update(companies)
          .set({ enrichmentStatus: "queued", enqueuedAt: new Date() } as any)
          .where(sql`id = ${companyId} AND (enqueued_at IS NULL OR enrichment_status = 'pending')`);

        // Fire Inngest event
        await inngest.send({
          name: "superscraper/lead.enqueue",
          data: { companyId, jobId },
        });

        result.leadsEnqueued++;
        result.byCategory[categoryKey].enqueued++;
      }

      // Save search history per query
      await saveSearchHistory({
        id:                  randomUUID(),
        timestamp:           new Date().toISOString(),
        query,
        category:            categoryKey,
        resultsCount:        rawResults.length,
        qualifiedLeadsCount: scoredLeads.length,
        avgRelevanceScore:   scoredLeads.length
          ? scoredLeads.reduce((a, b) => a + b.relevanceScore, 0) / scoredLeads.length
          : 0,
        companiesFound: scoredLeads.map((l) => l.companyName),
      });
    }
  }

  return result;
}
