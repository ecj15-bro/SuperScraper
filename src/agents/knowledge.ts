import { askClaude } from "@/lib/claude";
import { searchWeb } from "@/lib/search";
import { getBrandConfig } from "@/lib/brand";
import { getBusinessProfile, buildProductKnowledgeBlock } from "@/lib/business-profile";
import { saveKnowledgeBase, getKnowledgeBase, type KnowledgeBase } from "@/lib/data";

// ─── RESEARCH ────────────────────────────────────────────────────────────────

async function gatherMarketSignals(productBlock: string, brandName: string): Promise<string[]> {
  const queries = [
    `VAR reseller channel partner trends 2026`,
    `B2B SaaS partner ecosystem growth opportunities 2026`,
    `${brandName} competitor landscape 2026`,
    `channel sales indirect revenue growth 2026`,
  ];

  const allResults: string[] = [];
  for (const q of queries) {
    try {
      const results = await searchWeb(q, 5);
      allResults.push(...results.slice(0, 3).map((r) => `${r.title}: ${r.snippet}`));
    } catch {
      // non-fatal
    }
  }
  return allResults;
}

// ─── SYNTHESIS ───────────────────────────────────────────────────────────────

async function synthesizeKnowledge(
  signals: string[],
  productBlock: string,
  brandName: string,
  existing: KnowledgeBase | null,
): Promise<KnowledgeBase> {
  const response = await askClaude(
    `You are the ${brandName} Market Intelligence Engine. Synthesize live market signals into actionable partner prospecting intelligence.

Never use em dashes in any output.

${productBlock}

${existing ? `Previous knowledge (refresh and update, do not just repeat):\nHot verticals were: ${existing.hotVerticals.join(", ")}\nPrevious insights: ${existing.lastInsights}` : "No previous knowledge base — generate from scratch."}

Analyze the live signals and return ONLY a JSON object:
{
  "industryTrends": ["4-6 current trends affecting VAR/reseller channels"],
  "competitorIntel": ["2-4 insights about competitive landscape"],
  "partnerEcosystem": ["4-6 technologies or platforms a good partner would already sell"],
  "varMarketSignals": ["4-6 specific signals that a company is ready for a VAR partnership"],
  "refinedIdealVARProfile": "Updated 2-3 sentence profile of the ideal partner based on current signals",
  "hotVerticals": ["3-5 industry verticals with highest partner opportunity right now"],
  "coldVerticals": ["2-3 verticals where budget is frozen or competition too high"],
  "lastInsights": "2-3 sentence executive summary of current market state and what it means for partner recruitment"
}`,
    `Live market signals (${signals.length} sources):\n${signals.slice(0, 20).join("\n")}`,
  );

  try {
    const parsed = JSON.parse(response.replace(/```json|```/g, "").trim());
    return {
      lastRefreshed:         new Date().toISOString(),
      industryTrends:        parsed.industryTrends ?? [],
      competitorIntel:       parsed.competitorIntel ?? [],
      partnerEcosystem:      parsed.partnerEcosystem ?? [],
      varMarketSignals:      parsed.varMarketSignals ?? [],
      refinedIdealVARProfile: parsed.refinedIdealVARProfile ?? "",
      hotVerticals:          parsed.hotVerticals ?? [],
      coldVerticals:         parsed.coldVerticals ?? [],
      lastInsights:          parsed.lastInsights ?? "",
    };
  } catch {
    return {
      lastRefreshed:          new Date().toISOString(),
      industryTrends:         ["Market data unavailable — check API connectivity"],
      competitorIntel:        [],
      partnerEcosystem:       [],
      varMarketSignals:       [],
      refinedIdealVARProfile: "",
      hotVerticals:           [],
      coldVerticals:          [],
      lastInsights:           "Knowledge refresh encountered an error. Manual review recommended.",
    };
  }
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

export async function runKnowledgeRefresh(): Promise<KnowledgeBase> {
  const [brand, profile, existing] = await Promise.all([
    getBrandConfig(),
    getBusinessProfile(),
    getKnowledgeBase(),
  ]);

  const productBlock = buildProductKnowledgeBlock(profile);
  const signals = await gatherMarketSignals(productBlock, brand.companyName);
  const kb = await synthesizeKnowledge(signals, productBlock, brand.companyName, existing);

  await saveKnowledgeBase(kb);
  return kb;
}
