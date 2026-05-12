import { getStoredWatchtowerConfig, saveWatchtowerConfig, type WatchtowerConfig, type EvolvedSearchParams } from "./data";
import { getBrandConfig } from "./brand";

export async function getWatchtowerConfig(): Promise<WatchtowerConfig | null> {
  return getStoredWatchtowerConfig();
}

// Apply evolved search params: retire zero-yield queries, add new ones
export async function updateWatchtowerQueries(
  config: WatchtowerConfig,
  evolution: EvolvedSearchParams,
): Promise<void> {
  const retireSet = new Set(evolution.retireQueries);
  const newQueries = [
    ...evolution.addQueries,
    ...evolution.hotVerticalQueries,
    ...evolution.ecosystemQueries,
  ];

  const updated: WatchtowerConfig = {
    ...config,
    searchCategories: config.searchCategories.map((cat) => ({
      ...cat,
      queries: [
        ...cat.queries.filter((q) => !retireSet.has(q)),
      ],
    })),
  };

  // Add new queries to the highest-priority category
  const highPriority = updated.searchCategories.find((c) => c.priority === "high")
    ?? updated.searchCategories[0];

  if (highPriority && newQueries.length) {
    const existing = new Set(updated.searchCategories.flatMap((c) => c.queries));
    const toAdd = newQueries.filter((q) => !existing.has(q));
    highPriority.queries = [...highPriority.queries, ...toAdd].slice(0, 20);
  }

  // Remove empty categories
  updated.searchCategories = updated.searchCategories.filter((c) => c.queries.length > 0);

  if (!updated.searchCategories.length) {
    // Fallback: restore a generic category rather than leaving empty
    const brand = await getBrandConfig();
    updated.searchCategories = [{
      name: "General partner search",
      description: "Broad VAR and reseller search",
      queries: [`${brand.companyName} reseller partner 2026`, "VAR channel partner program 2026"],
      priority: "high",
    }];
  }

  await saveWatchtowerConfig(updated);
}
