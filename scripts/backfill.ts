// Backfill: enqueue companies that were ingested but never enriched.
// Run with: npx tsx scripts/backfill.ts

import { db } from "../src/lib/db/client";
import { companies } from "../src/lib/db/schema";
import { inngest } from "../src/lib/inngest/client";
import { eq, isNull, sql, and, gte } from "drizzle-orm";

const BATCH_SIZE = 50;
const MIN_SCORE  = 40;

async function backfill() {
  console.log("Backfilling unenriched companies...");

  const toEnqueue = await db
    .select({ id: companies.id, name: companies.name, score: companies.opportunityScore })
    .from(companies)
    .where(
      and(
        eq(companies.enrichmentStatus, "pending"),
        isNull(companies.enqueuedAt),
        sql`${companies.opportunityScore} >= ${MIN_SCORE}`,
      ),
    )
    .limit(BATCH_SIZE);

  if (!toEnqueue.length) {
    console.log("Nothing to backfill.");
    process.exit(0);
  }

  console.log(`Found ${toEnqueue.length} companies to enqueue.`);

  for (const { id, name, score } of toEnqueue) {
    await db.update(companies)
      .set({ enrichmentStatus: "queued", enqueuedAt: new Date() } as any)
      .where(eq(companies.id, id));

    await inngest.send({ name: "superscraper/lead.enqueue", data: { companyId: id } });
    console.log(`  Enqueued: ${name} (score: ${score})`);
  }

  console.log("Backfill complete.");
  process.exit(0);
}

backfill().catch((e) => { console.error(e); process.exit(1); });
