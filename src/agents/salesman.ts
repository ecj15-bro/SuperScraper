import { askClaude } from "@/lib/claude";
import { getBrandConfig } from "@/lib/brand";
import { getBusinessProfile, buildProductKnowledgeBlock } from "@/lib/business-profile";
import { createConcurrencyLimiter } from "@/lib/concurrency";
import type { DetectiveResult } from "./detective";
import type { VARFitScore, PitchContext } from "./context";
import type { PitchVariants } from "@/lib/data";

// ─── TYPES ───────────────────────────────────────────────────────────────────

export interface SalesmanInput {
  lead: DetectiveResult;
  varFitScore: VARFitScore;
  pitchContext: PitchContext;
  briefing: string;
}

export interface SalesmanResult {
  companyName: string;
  decisionMaker: string;
  firstName: string;
  lastName: string;
  title: string;
  linkedinUrl: string | null;
  companyWebsite: string | null;
  companyProfile: string;
  personProfile: string;
  confidenceScore: number;
  newsTitle: string;
  newsUrl: string;
  pitchVariants: PitchVariants;
  selectedPitch: string;
  personalizedIntro: string;
  relevanceScore: number;
  varFitScore: VARFitScore;
  pitchContext: PitchContext;
  briefing: string;
}

// ─── PITCH GENERATION ────────────────────────────────────────────────────────

async function generatePitches(input: SalesmanInput, brandName: string, productBlock: string): Promise<{ variants: PitchVariants; selected: string; intro: string }> {
  const { lead, varFitScore, pitchContext } = input;
  const tone = pitchContext.toneRecommendation;
  const hookAngle = pitchContext.hookAngle;
  const avoidList = pitchContext.avoidMentioning.join(", ") || "none";
  const painPoints = pitchContext.painPoints.join("; ");

  const response = await askClaude(
    `You are the ${brandName} sales intelligence system. Write high-converting outreach for a potential VAR/reseller partner.

Never use em dashes in any output.

${productBlock}

Tone: ${tone}. Hook angle: ${hookAngle}. Pain points to address: ${painPoints}. Avoid mentioning: ${avoidList}.

Personalized intro (personalizedIntro): 1-2 sentences. Reference the specific news trigger or business signal. Standalone — works as first line of any message. No generic openers ("I hope this finds you well").

cold_email: Subject line + 3 short paragraphs. Lead with hook angle. One clear CTA. Under 150 words body.
linkedin_message: Under 300 characters. Direct, no fluff.
followup_email: Shorter than cold email. Reference the previous outreach. New angle.
text_message: Under 160 chars. First name only.
executive_brief: 2 sentences max. Written for a CEO/CRO reading a forwarded email.

Return ONLY a JSON object:
{
  "personalizedIntro": "",
  "cold_email": "",
  "linkedin_message": "",
  "followup_email": "",
  "text_message": "",
  "executive_brief": ""
}`,
    `Company: ${lead.companyName}
Contact: ${lead.decisionMaker} (${lead.title})
Company profile: ${lead.companyProfile}
Person profile: ${lead.personProfile}
News trigger: "${lead.newsTitle}"
Fit score: ${varFitScore.overallScore}/10 (${varFitScore.fitCategory})
Fit reasons: ${varFitScore.fitReasons.join("; ")}
Strategic notes: ${varFitScore.strategicNotes}`,
  );

  try {
    const parsed = JSON.parse(response.replace(/```json|```/g, "").trim());
    const variants: PitchVariants = {
      cold_email:       parsed.cold_email ?? "",
      linkedin_message: parsed.linkedin_message ?? "",
      followup_email:   parsed.followup_email ?? "",
      text_message:     parsed.text_message ?? "",
      executive_brief:  parsed.executive_brief ?? "",
    };
    return {
      variants,
      selected: variants.cold_email,
      intro: parsed.personalizedIntro ?? `${lead.companyName} looks like a strong fit for a ${brandName} partnership.`,
    };
  } catch {
    const fallback = `Hi ${lead.firstName || lead.decisionMaker.split(" ")[0]}, I came across ${lead.companyName} and think there's a strong alignment with what we do at ${brandName}. Would you have 20 minutes this week?`;
    return {
      variants: {
        cold_email:       fallback,
        linkedin_message: fallback.slice(0, 295),
        followup_email:   `Following up on my last note — still think there's something worth exploring here.`,
        text_message:     `Hi ${lead.firstName || lead.decisionMaker.split(" ")[0]}, ${brandName} here — quick question about a potential partnership. Worth a 15 min chat?`,
        executive_brief:  `${lead.companyName} is a strong ${brandName} partner candidate based on recent activity.`,
      },
      selected: fallback,
      intro: `${lead.newsTitle} caught our attention — ${lead.companyName} looks like a strong partner fit.`,
    };
  }
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

const limit = createConcurrencyLimiter(5);

export async function runSalesman(inputs: SalesmanInput[]): Promise<SalesmanResult[]> {
  const [brand, profile] = await Promise.all([getBrandConfig(), getBusinessProfile()]);
  const productBlock = buildProductKnowledgeBlock(profile);

  const tasks = inputs.map((input) =>
    limit(async () => {
      const { lead } = input;
      const { variants, selected, intro } = await generatePitches(input, brand.companyName, productBlock);

      return {
        companyName:       lead.companyName,
        decisionMaker:     lead.decisionMaker,
        firstName:         lead.firstName,
        lastName:          lead.lastName,
        title:             lead.title,
        linkedinUrl:       lead.linkedinUrl,
        companyWebsite:    lead.companyWebsite,
        companyProfile:    lead.companyProfile,
        personProfile:     lead.personProfile,
        confidenceScore:   lead.confidenceScore,
        newsTitle:         lead.newsTitle,
        newsUrl:           lead.newsUrl,
        pitchVariants:     variants,
        selectedPitch:     selected,
        personalizedIntro: intro,
        relevanceScore:    lead.relevanceScore,
        varFitScore:       input.varFitScore,
        pitchContext:      input.pitchContext,
        briefing:          input.briefing,
      } satisfies SalesmanResult;
    }),
  );

  const results = await Promise.allSettled(tasks);
  return results
    .filter((r): r is PromiseFulfilledResult<SalesmanResult> => r.status === "fulfilled")
    .map((r) => r.value);
}
