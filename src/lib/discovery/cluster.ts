import { db } from "../db/client";
import { tokenStats, contracts, contractTags } from "../db/schema";
import { sql } from "drizzle-orm";

const STOP = new Set([
  "the","and","for","with","will","shall","this","that","from","have",
  "contract","contracts","services","service","provide","provides","support",
  "system","systems","program","government","federal","agency","department",
  "requirement","requirements","including","pursuant","vendor","contractor",
  "task","order","item","items","delivery","deliverable","base","period",
]);

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 4 && !STOP.has(t) && !/^\d+$/.test(t));
}

export async function ingestTokens(batchSize = 500) {
  const rows = (await db.execute(sql`
    SELECT c.id, c.description
    FROM ${contracts} c
    WHERE c.classified_at IS NOT NULL
      AND c.description IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM ${contractTags} ct WHERE ct.contract_id = c.id)
    LIMIT ${batchSize}
  `)) as any;

  const list: { id: string; description: string }[] = rows.rows ?? rows;
  const counts = new Map<string, number>();

  for (const r of list) {
    for (const t of new Set(tokenize(r.description ?? ""))) {
      counts.set(t, (counts.get(t) ?? 0) + 1);
    }
  }

  for (const [token, n] of counts) {
    await db
      .insert(tokenStats)
      .values({ token, globalCount: n, lastSeenAt: new Date() })
      .onConflictDoUpdate({
        target: tokenStats.token,
        set: { globalCount: sql`${tokenStats.globalCount} + ${n}`, lastSeenAt: new Date() },
      });
  }

  return { processed: list.length, distinctTokens: counts.size };
}

export async function proposeEmergingVerticals() {
  const rows = (await db.execute(sql`
    SELECT token, global_count
    FROM ${tokenStats}
    WHERE global_count >= 50
      AND NOT EXISTS (
        SELECT 1 FROM verticals v
        WHERE v.keywords::jsonb ? token
      )
    ORDER BY global_count DESC
    LIMIT 30
  `)) as any;
  return rows.rows ?? rows;
}
