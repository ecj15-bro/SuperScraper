import { db } from "../db/client";
import { ingestionRuns } from "../db/schema";
import { eq, desc, and, isNotNull } from "drizzle-orm";

const OVERLAP_HOURS    = 48;
const MAX_LOOKBACK_DAYS  = 30;
const DEFAULT_LOOKBACK_DAYS = 7;

export interface CursorResult {
  startDate: string;
  reason: "first_run" | "cursor" | "capped_lookback";
  lastRunAt: Date | null;
}

export async function getIngestStartDate(): Promise<CursorResult> {
  const [lastSuccess] = await db
    .select()
    .from(ingestionRuns)
    .where(and(eq(ingestionRuns.status, "completed"), isNotNull(ingestionRuns.finishedAt)))
    .orderBy(desc(ingestionRuns.finishedAt))
    .limit(1);

  const now = Date.now();
  const cap = new Date(now - MAX_LOOKBACK_DAYS * 86_400_000);

  if (!lastSuccess?.finishedAt) {
    return {
      startDate: new Date(now - DEFAULT_LOOKBACK_DAYS * 86_400_000).toISOString().slice(0, 10),
      reason: "first_run",
      lastRunAt: null,
    };
  }

  const cursor   = new Date(lastSuccess.finishedAt.getTime() - OVERLAP_HOURS * 3_600_000);
  const effective = cursor < cap ? cap : cursor;
  return {
    startDate: effective.toISOString().slice(0, 10),
    reason:    cursor < cap ? "capped_lookback" : "cursor",
    lastRunAt: lastSuccess.finishedAt,
  };
}
