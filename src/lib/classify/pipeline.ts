import { classifyByRules, type ClassificationResult } from "./rules";
import { classifyByLLM } from "./llm";
import { db } from "../db/client";
import { contracts, contractTags, companyTags, verticals } from "../db/schema";
import { eq, isNull, sql } from "drizzle-orm";
import { evaluateAlertsForContract } from "../alerts/rules";
import { getEnv } from "../env";

const THRESHOLD = 0.4;

export async function classifyContract(contractId: string) {
  const [c] = await db.select().from(contracts).where(eq(contracts.id, contractId));
  if (!c) return;

  let results = await classifyByRules(c);

  const top  = results[0]?.confidence ?? 0;
  const tied = results.length >= 2 && Math.abs(results[0].confidence - results[1].confidence) < 0.1;
  const ambiguous =
    (top >= 0.35 && top <= 0.65) ||
    tied ||
    (top === 0 && (c.description?.length ?? 0) > 50);

  if (ambiguous && getEnv().enableLLMClassification) {
    const all = await db.select().from(verticals);
    const llmResults = await classifyByLLM({
      description: c.description ?? "",
      candidates:  all.map((v) => ({ id: v.id, name: v.name, keywords: v.keywords as string[] })),
    });

    const byVertical = new Map<string, ClassificationResult>();
    for (const r of [...results, ...llmResults]) {
      const ex = byVertical.get(r.verticalId);
      if (!ex || r.confidence > ex.confidence) byVertical.set(r.verticalId, r);
    }
    results = [...byVertical.values()].sort((a, b) => b.confidence - a.confidence);
  }

  const accepted = results.filter((r) => r.confidence >= THRESHOLD);

  await db.update(contracts).set({ classifiedAt: new Date() }).where(eq(contracts.id, contractId));

  if (!accepted.length) return { contractId, tags: [] };

  for (let i = 0; i < accepted.length; i++) {
    const r = accepted[i];

    await db.insert(contractTags).values({
      contractId, verticalId: r.verticalId, isPrimary: i === 0,
      confidence: r.confidence, matchedKeywords: r.matchedKeywords, source: r.source,
    }).onConflictDoUpdate({
      target: [contractTags.contractId, contractTags.verticalId],
      set: { confidence: r.confidence, isPrimary: i === 0, source: r.source, matchedKeywords: r.matchedKeywords },
    });

    await db.insert(companyTags).values({
      companyId: c.companyId, verticalId: r.verticalId,
      contractCount: 1, totalValue: c.awardAmount ?? "0",
    }).onConflictDoUpdate({
      target: [companyTags.companyId, companyTags.verticalId],
      set: {
        contractCount: sql`${companyTags.contractCount} + 1`,
        totalValue:    sql`${companyTags.totalValue} + ${c.awardAmount ?? 0}`,
        lastTaggedAt:  new Date(),
      },
    });
  }

  await evaluateAlertsForContract(contractId);
  return { contractId, tags: accepted };
}

export async function classifyBatch(limit = 200) {
  const pending = await db
    .select({ id: contracts.id })
    .from(contracts)
    .where(isNull(contracts.classifiedAt))
    .limit(limit);

  let processed = 0;
  for (const { id } of pending) {
    try { await classifyContract(id); processed++; }
    catch (e) { console.error("classify failed", id, e); }
  }
  return { attempted: pending.length, processed };
}
