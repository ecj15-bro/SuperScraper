import { db } from "../db/client";
import { verticals } from "../db/schema";
import { eq } from "drizzle-orm";

export interface ClassificationResult {
  verticalId: string;
  confidence: number;
  matchedKeywords: string[];
  source: "rules" | "llm";
}

let cachedVerticals: Awaited<ReturnType<typeof db.select>> | null = null;
let cacheAt = 0;

async function getVerticals() {
  if (cachedVerticals && Date.now() - cacheAt < 60_000) return cachedVerticals;
  cachedVerticals = await db.select().from(verticals).where(eq(verticals.active, true));
  cacheAt = Date.now();
  return cachedVerticals;
}

export function invalidateVerticalCache() {
  cachedVerticals = null;
  cacheAt = 0;
}

export async function classifyByRules(contract: {
  description: string | null;
  naicsCode: string | null;
  pscCode: string | null;
  naicsDescription: string | null;
  pscDescription: string | null;
}): Promise<ClassificationResult[]> {
  const vs = await getVerticals();

  const haystack = [contract.description, contract.naicsDescription, contract.pscDescription]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const results: ClassificationResult[] = [];

  for (const v of vs) {
    let confidence = 0;
    const matched: string[] = [];

    if (contract.naicsCode && (v.naicsHints ?? []).includes(contract.naicsCode)) {
      confidence = Math.max(confidence, 0.85);
      matched.push(`naics:${contract.naicsCode}`);
    }
    if (contract.pscCode && (v.pscHints ?? []).includes(contract.pscCode)) {
      confidence = Math.max(confidence, 0.8);
      matched.push(`psc:${contract.pscCode}`);
    }

    let kwHits = 0;
    for (const kw of v.keywords as string[]) {
      const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (new RegExp(`\\b${escaped}\\b`, "i").test(haystack)) {
        kwHits++;
        matched.push(kw);
      }
    }
    if (kwHits > 0) {
      const kwConf = Math.min(0.75, 0.4 + 0.15 * Math.log2(kwHits + 1));
      confidence = Math.max(confidence, kwConf);
    }

    if (confidence > 0) results.push({ verticalId: v.id, confidence, matchedKeywords: matched, source: "rules" });
  }

  return results.sort((a, b) => b.confidence - a.confidence);
}
