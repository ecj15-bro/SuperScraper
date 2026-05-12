import { runWatchtower } from "./watchtower";
import { evolveSearchParameters } from "./context";
import { getWatchtowerConfig, updateWatchtowerQueries } from "@/lib/watchtower-config";
import { getSearchHistory, getSeenCompanies, getKnowledgeBase, createJob, updateJob, type EvolvedSearchParams } from "@/lib/data";
import { randomUUID } from "crypto";

// ─── TYPES ───────────────────────────────────────────────────────────────────

export interface OrchestratorResult {
  jobId: string;
  leadsEnqueued: number;
  leadsScanned: number;
  leadsSkipped: number;
  byCategory: Record<string, { scanned: number; enqueued: number }>;
  searchEvolution?: EvolvedSearchParams;
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

export async function runOrchestrator(): Promise<OrchestratorResult> {
  const jobId = randomUUID();
  await createJob(jobId, "watchtower");
  await updateJob(jobId, { status: "running" });

  try {
    const config = await getWatchtowerConfig();
    if (!config) {
      await updateJob(jobId, { status: "error", errors: ["Watchtower config not configured"] });
      throw new Error("Watchtower config not configured — complete the business profile first.");
    }

    // Run Watchtower: scans news, upserts companies, fires Inngest enqueue events
    const watchtowerResult = await runWatchtower(jobId);

    await updateJob(jobId, {
      leadsFound:    watchtowerResult.leadsScanned,
      leadsEnqueued: watchtowerResult.leadsEnqueued,
    });

    // Evolve search parameters after each run
    let searchEvolution: EvolvedSearchParams | undefined;
    try {
      const [searchHistory, seenCompanies, kb] = await Promise.all([
        getSearchHistory(),
        getSeenCompanies(),
        getKnowledgeBase(),
      ]);

      const currentQueries = config.searchCategories.flatMap((c) => c.queries);

      searchEvolution = await evolveSearchParameters(
        currentQueries,
        searchHistory,
        kb,
        seenCompanies,
      );

      // Apply evolution: retire bad queries, add new ones
      if (searchEvolution.retireQueries.length || searchEvolution.addQueries.length ||
          searchEvolution.hotVerticalQueries.length || searchEvolution.ecosystemQueries.length) {
        await updateWatchtowerQueries(config, searchEvolution);
      }

      await updateJob(jobId, { searchEvolution });
    } catch (e) {
      console.error("[Orchestrator] Search evolution failed (non-fatal):", e);
    }

    await updateJob(jobId, { status: "complete", completedAt: new Date() });

    return {
      jobId,
      leadsEnqueued: watchtowerResult.leadsEnqueued,
      leadsScanned:  watchtowerResult.leadsScanned,
      leadsSkipped:  watchtowerResult.leadsSkipped,
      byCategory:    watchtowerResult.byCategory,
      searchEvolution,
    };
  } catch (e) {
    await updateJob(jobId, {
      status: "error",
      errors: [e instanceof Error ? e.message : String(e)],
    });
    throw e;
  }
}
