import { askClaude } from "@/lib/claude";
import { searchWeb } from "@/lib/search";
import { createConcurrencyLimiter } from "@/lib/concurrency";
import { getBrandConfig } from "@/lib/brand";
import type { ScoredLead } from "./watchtower";

// ─── TYPES ───────────────────────────────────────────────────────────────────

export interface DetectiveResult {
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
  newsSnippet: string;
  newsUrl: string;
  newsSource: string;
  relevanceScore: number;
}

// ─── EXTRACTION ──────────────────────────────────────────────────────────────

async function extractProfile(
  lead: ScoredLead,
  webResults: string,
  brandName: string,
): Promise<DetectiveResult> {
  const response = await askClaude(
    `You are a research analyst building partner intelligence profiles. Extract structured information about a company and its most likely decision maker for a ${brandName} partnership discussion.

Never use em dashes in any output.

Decision maker priority: CRO > VP Sales > VP Business Development > COO > CEO/Founder (for SMBs)

Return ONLY a JSON object:
{
  "companyName": "official company name",
  "decisionMaker": "Full Name",
  "firstName": "First",
  "lastName": "Last",
  "title": "their exact title",
  "linkedinUrl": "https://linkedin.com/in/... or null",
  "companyWebsite": "https://... or null",
  "companyProfile": "2-3 sentence company summary: what they do, who they serve, estimated size",
  "personProfile": "2-3 sentence person summary: background, tenure, likely priorities",
  "confidenceScore": 7
}

confidenceScore: 1-10 based on how much real data you found (not guessing). If <4, still return best guess.`,
    `Company: ${lead.companyName}
News trigger: "${lead.newsTitle}"
Snippet: "${lead.newsSnippet}"

Web research results:
${webResults}`,
  );

  try {
    const parsed = JSON.parse(response.replace(/```json|```/g, "").trim());
    return {
      companyName:     parsed.companyName ?? lead.companyName,
      decisionMaker:   parsed.decisionMaker ?? "Unknown",
      firstName:       parsed.firstName ?? "",
      lastName:        parsed.lastName ?? "",
      title:           parsed.title ?? "Unknown",
      linkedinUrl:     parsed.linkedinUrl ?? null,
      companyWebsite:  parsed.companyWebsite ?? null,
      companyProfile:  parsed.companyProfile ?? "",
      personProfile:   parsed.personProfile ?? "",
      confidenceScore: parsed.confidenceScore ?? 5,
      newsTitle:       lead.newsTitle,
      newsSnippet:     lead.newsSnippet,
      newsUrl:         lead.newsUrl,
      newsSource:      lead.newsSource,
      relevanceScore:  lead.relevanceScore,
    };
  } catch {
    return {
      companyName:     lead.companyName,
      decisionMaker:   "Unknown",
      firstName:       "",
      lastName:        "",
      title:           "Unknown",
      linkedinUrl:     null,
      companyWebsite:  null,
      companyProfile:  `${lead.companyName} — profile could not be extracted.`,
      personProfile:   "Decision maker not identified.",
      confidenceScore: 2,
      newsTitle:       lead.newsTitle,
      newsSnippet:     lead.newsSnippet,
      newsUrl:         lead.newsUrl,
      newsSource:      lead.newsSource,
      relevanceScore:  lead.relevanceScore,
    };
  }
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

const limit = createConcurrencyLimiter(5);

export async function runDetective(leads: ScoredLead[]): Promise<DetectiveResult[]> {
  const brand = await getBrandConfig();

  const tasks = leads.map((lead) =>
    limit(async () => {
      // Run web searches in parallel
      const [companyResults, personResults] = await Promise.all([
        searchWeb(`${lead.companyName} company overview site OR about OR LinkedIn`, 5).catch(() => []),
        searchWeb(`${lead.companyName} VP Sales OR CRO OR "Business Development" site:linkedin.com`, 5).catch(() => []),
      ]);

      const allResults = [...companyResults, ...personResults];
      const webText = allResults
        .slice(0, 8)
        .map((r) => `${r.title}\n${r.snippet}\n${r.link}`)
        .join("\n\n");

      return extractProfile(lead, webText, brand.companyName);
    }),
  );

  const results = await Promise.allSettled(tasks);
  return results
    .filter((r): r is PromiseFulfilledResult<DetectiveResult> => r.status === "fulfilled")
    .map((r) => r.value);
}
