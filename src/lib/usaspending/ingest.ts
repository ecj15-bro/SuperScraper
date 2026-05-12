import { searchAwards } from "./client";
import { normalizeAward } from "./normalize";
import { db } from "../db/client";
import { contracts, companies, ingestionRuns } from "../db/schema";
import { sql, eq } from "drizzle-orm";
import { randomUUID } from "crypto";

export interface IngestOptions {
  startDate: string;
  endDate: string;
  naicsCodes?: string[];
  pscCodes?: string[];
  keywords?: string[];
  maxPages?: number;
}

export async function ingest(opts: IngestOptions) {
  const runId = randomUUID();
  const today = new Date().toISOString().slice(0, 10);

  await db.insert(ingestionRuns).values({ id: runId, status: "running", cursor: { page: 1 } });

  let page = 1;
  let totalNew = 0;
  let totalUpdated = 0;
  let totalFetched = 0;
  const errors: string[] = [];

  try {
    while (true) {
      const { results, page_metadata } = await searchAwards(
        {
          time_period: [{ start_date: opts.startDate, end_date: opts.endDate }],
          naics_codes: opts.naicsCodes,
          psc_codes:   opts.pscCodes,
          keywords:    opts.keywords,
        },
        page,
        100,
      );

      if (!results.length) break;
      totalFetched += results.length;

      for (const raw of results) {
        try {
          const { company, contract } = normalizeAward(raw);

          await db.insert(companies).values({
            ...company,
            source: "usaspending",
            firstSeenAt: new Date(),
          }).onConflictDoUpdate({
            target: companies.id,
            set: { name: company.name },
          });

          const inserted = await db
            .insert(contracts)
            .values(contract)
            .onConflictDoNothing({ target: contracts.id })
            .returning({ id: contracts.id });

          if (inserted.length) {
            totalNew++;
            await db.update(companies).set({
              totalAwardsCount: sql`${companies.totalAwardsCount} + 1`,
              totalAwardsValue: sql`${companies.totalAwardsValue} + ${contract.awardAmount}`,
              lastWinAt: sql`GREATEST(COALESCE(${companies.lastWinAt}, '1970-01-01'::timestamp), ${contract.awardDate ?? new Date(0)})`,
            }).where(eq(companies.id, company.id));
          } else {
            totalUpdated++;
          }
        } catch (err: any) {
          errors.push(`row ${raw["Award ID"]}: ${err.message}`);
        }
      }

      if (!page_metadata.hasNext) break;
      if (opts.maxPages && page >= opts.maxPages) break;
      page++;
      await new Promise((r) => setTimeout(r, 250));
    }

    await db.update(ingestionRuns).set({
      status: "completed", finishedAt: new Date(),
      recordsFetched: totalFetched, recordsNew: totalNew,
      recordsUpdated: totalUpdated, cursor: { page }, errors,
    }).where(eq(ingestionRuns.id, runId));

    return { runId, totalNew, totalUpdated, totalFetched, errors };
  } catch (err: any) {
    errors.push(err.message);
    await db.update(ingestionRuns).set({ status: "failed", finishedAt: new Date(), errors })
      .where(eq(ingestionRuns.id, runId));
    throw err;
  }
}
