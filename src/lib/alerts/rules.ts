import { db } from "../db/client";
import { alerts, contracts, companies, contractTags, verticals } from "../db/schema";
import { eq, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import { getEnv } from "../env";

export async function evaluateAlertsForContract(contractId: string) {
  const [c] = await db.select().from(contracts).where(eq(contracts.id, contractId));
  if (!c) return 0;

  const tags = await db.select().from(contractTags).where(eq(contractTags.contractId, contractId));
  if (!tags.length) return 0;

  const [co]  = await db.select().from(companies).where(eq(companies.id, c.companyId));
  const allVs = await db.select().from(verticals);
  const vMap  = new Map(allVs.map((v) => [v.id, v]));

  const triggered: { type: string; severity: string; verticalId: string }[] = [];

  // Rule 1: High-priority vertical (configurable via verticals.priority, not hardcoded)
  for (const t of tags) {
    const v = vMap.get(t.verticalId);
    if (!v) continue;
    if (v.priority === 1 && t.confidence >= 0.6) {
      triggered.push({ type: "high_priority_match", severity: "critical", verticalId: t.verticalId });
    } else if (v.priority === 2 && t.confidence >= 0.6) {
      triggered.push({ type: "high_priority_match", severity: "high", verticalId: t.verticalId });
    }
  }

  // Rule 2: Value threshold
  const threshold = getEnv().alertValueThreshold;
  if (Number(c.awardAmount ?? 0) >= threshold) {
    triggered.push({ type: "value_threshold", severity: "high", verticalId: tags[0].verticalId });
  }

  // Rule 3: New vendor in tracked vertical
  if (co && (co.totalAwardsCount ?? 0) === 1) {
    triggered.push({ type: "new_vendor", severity: "normal", verticalId: tags[0].verticalId });
  }

  // Rule 4: Repeat vendor (3+ wins in 90 days)
  const recentResult = await db.execute(sql`
    SELECT COUNT(*)::int AS n FROM ${contracts}
    WHERE ${contracts.companyId} = ${c.companyId}
      AND ${contracts.awardDate} > NOW() - INTERVAL '90 days'
  `);
  const recentCount = Number(((recentResult as any).rows ?? (recentResult as any))[0]?.n ?? 0);
  if (recentCount >= 3) {
    triggered.push({ type: "repeat_vendor", severity: "high", verticalId: tags[0].verticalId });
  }

  for (const t of triggered) {
    await db.insert(alerts).values({
      id: randomUUID(),
      type: t.type,
      severity: t.severity,
      verticalId: t.verticalId,
      contractId: c.id,
      companyId: c.companyId,
      payload: {
        companyName:  co?.name,
        amount:       c.awardAmount,
        agency:       c.awardingAgency,
        agencyType:   c.agencyType,
        description:  c.description?.slice(0, 200),
        naicsCode:    c.naicsCode,
      },
    });
  }

  return triggered.length;
}
