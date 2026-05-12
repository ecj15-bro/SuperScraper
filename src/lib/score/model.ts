import { db } from "../db/client";
import { companies, contracts, companyTags, verticals } from "../db/schema";
import { eq, sql, isNotNull } from "drizzle-orm";

export interface ScoreFeatures {
  totalValue: number;
  contractCount: number;
  agencyDiversityCount: number;   // distinct agencies — replaces DoD-specific bias
  daysSinceLastWin: number;
  recentWinCount90d: number;
  primaryVerticalPriority: number;
  hasNewsSignal: boolean;         // fresh news signal bonus
  newsSignalAgeDays: number;
}

export async function computeFeatures(companyId: string): Promise<ScoreFeatures> {
  const [co] = await db.select().from(companies).where(eq(companies.id, companyId));

  const aggResult = await db.execute(sql`
    SELECT
      COALESCE(SUM(${contracts.awardAmount}::numeric), 0)::float        AS total_value,
      COUNT(*)::int                                                       AS contract_count,
      COUNT(DISTINCT ${contracts.awardingAgency})::int                   AS agency_diversity,
      COUNT(*) FILTER (WHERE ${contracts.awardDate} > NOW() - INTERVAL '90 days')::int AS recent_90d,
      EXTRACT(EPOCH FROM (NOW() - MAX(${contracts.awardDate}))) / 86400  AS days_since_last
    FROM ${contracts}
    WHERE ${contracts.companyId} = ${companyId}
  `);
  const agg = (aggResult as any).rows?.[0] ?? (aggResult as any)[0] ?? {};

  const tags = await db.select().from(companyTags).where(eq(companyTags.companyId, companyId));
  const vs   = await db.select().from(verticals);
  const vMap = new Map(vs.map((v) => [v.id, v]));
  const priorities = tags.map((t) => vMap.get(t.verticalId)?.priority ?? 5);
  const primaryPriority = priorities.length ? Math.min(...priorities) : 5;

  const newsSignalAt = co?.newsSignalAt;
  const newsSignalAgeDays = newsSignalAt
    ? (Date.now() - newsSignalAt.getTime()) / 86_400_000
    : 999;

  return {
    totalValue:            Number(agg.total_value ?? 0),
    contractCount:         Number(agg.contract_count ?? 0),
    agencyDiversityCount:  Number(agg.agency_diversity ?? 0),
    daysSinceLastWin:      Number(agg.days_since_last ?? 999),
    recentWinCount90d:     Number(agg.recent_90d ?? 0),
    primaryVerticalPriority: primaryPriority,
    hasNewsSignal:         newsSignalAgeDays <= 30,
    newsSignalAgeDays,
  };
}

export function scoreCompany(f: ScoreFeatures): { score: number; temp: "hot" | "warm" | "monitor" } {
  let score = 0;

  // Vertical fit (0-30): lower priority number = higher score
  score += (6 - f.primaryVerticalPriority) * 6;

  // Contract value (0-25): logarithmic so small contractors can still qualify
  if (f.totalValue > 0) score += Math.min(25, Math.log10(f.totalValue) * 4);

  // Contract volume (0-15)
  score += Math.min(15, f.contractCount * 1.5);

  // Agency diversity (0-15): multiple agencies = more established, no agency bias
  score += Math.min(15, f.agencyDiversityCount * 5);

  // Recency bonus (0-10)
  if      (f.daysSinceLastWin < 30)  score += 10;
  else if (f.daysSinceLastWin < 90)  score += 6;
  else if (f.daysSinceLastWin < 180) score += 3;

  // Recent activity burst (0-15)
  score += Math.min(15, f.recentWinCount90d * 2.5);

  // Fresh news signal bonus (0-10): company recently appeared in industry news
  if (f.hasNewsSignal) score += 10;

  score = Math.min(100, Math.round(score));
  const temp: "hot" | "warm" | "monitor" = score >= 70 ? "hot" : score >= 45 ? "warm" : "monitor";
  return { score, temp };
}

export async function scoreCompanyAndPersist(companyId: string) {
  const features = await computeFeatures(companyId);
  const { score, temp } = scoreCompany(features);
  await db.update(companies).set({
    opportunityScore: score,
    leadTemperature:  temp,
    scoredAt:         new Date(),
  }).where(eq(companies.id, companyId));
  return { score, temp, features };
}

export async function scoreBatch(limit = 500) {
  const rows = await db.execute(sql`
    SELECT DISTINCT c.id
    FROM ${companies} c
    LEFT JOIN ${companyTags} ct ON ct.company_id = c.id
    WHERE (ct.company_id IS NOT NULL OR c.news_signal IS NOT NULL)
      AND (c.scored_at IS NULL OR c.scored_at < NOW() - INTERVAL '6 hours')
    LIMIT ${limit}
  `);
  const ids: string[] = ((rows as any).rows ?? (rows as any)).map((r: any) => r.id);

  let processed = 0;
  for (const id of ids) {
    try { await scoreCompanyAndPersist(id); processed++; }
    catch (e) { console.error("score failed", id, e); }
  }
  return { attempted: ids.length, processed };
}
