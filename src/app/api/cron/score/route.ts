import { NextRequest, NextResponse } from "next/server";
import { scoreBatch } from "@/lib/score/model";
import { inngest } from "@/lib/inngest/client";
import { db } from "@/lib/db/client";
import { companies } from "@/lib/db/schema";
import { eq, sql, and, isNull } from "drizzle-orm";
import { getEnv } from "@/lib/env";

export async function GET(req: NextRequest) {
  if (req.headers.get("Authorization") !== `Bearer ${getEnv().cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    // Score all unscored companies
    const scored = await scoreBatch();

    // Enqueue high-scoring companies that haven't been enriched yet
    const toEnqueue = await db
      .select({ id: companies.id })
      .from(companies)
      .where(
        and(
          eq(companies.enrichmentStatus, "pending"),
          isNull(companies.enqueuedAt),
          sql`${companies.opportunityScore} >= 40`,
        ),
      )
      .limit(100);

    let enqueued = 0;
    for (const { id } of toEnqueue) {
      await db.update(companies)
        .set({ enrichmentStatus: "queued", enqueuedAt: new Date() } as any)
        .where(eq(companies.id, id));
      await inngest.send({ name: "superscraper/lead.enqueue", data: { companyId: id } });
      enqueued++;
    }

    return NextResponse.json({ scored, enqueued });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
