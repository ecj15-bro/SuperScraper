import { askClaude } from "../claude";
import type { ClassificationResult } from "./rules";

interface LLMClassifyInput {
  description: string;
  candidates: { id: string; name: string; keywords: string[] }[];
}

export async function classifyByLLM(input: LLMClassifyInput): Promise<ClassificationResult[]> {
  if (!input.description || !input.candidates.length) return [];

  const candidateBlock = input.candidates
    .map((c) => `- ${c.id}: ${c.name} (keywords: ${c.keywords.slice(0, 8).join(", ")})`)
    .join("\n");

  const response = await askClaude(
    `You are a government contract classification system. Given a contract description, classify it into the most relevant vertical categories from the provided list. Return ONLY a JSON array, no explanation.`,
    `Contract description: "${input.description.slice(0, 500)}"

Available verticals:
${candidateBlock}

Return an array of matches with confidence 0-1. Only include verticals where confidence >= 0.35. Max 3 results.
[{"verticalId": "id", "confidence": 0.8, "matchedKeywords": ["keyword"]}]`
  );

  try {
    const cleaned = response.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned) as { verticalId: string; confidence: number; matchedKeywords?: string[] }[];
    return parsed.map((r) => ({
      verticalId:      r.verticalId,
      confidence:      Math.min(1, Math.max(0, r.confidence)),
      matchedKeywords: r.matchedKeywords ?? [],
      source:          "llm" as const,
    }));
  } catch {
    return [];
  }
}
