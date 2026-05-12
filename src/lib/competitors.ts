import { getStoredWatchtowerConfig } from "./data";

export async function isCompetitor(companyName: string, description?: string): Promise<boolean> {
  const config = await getStoredWatchtowerConfig();
  if (!config) return false;

  const nameLower  = companyName.toLowerCase();
  const descLower  = (description ?? "").toLowerCase();

  for (const n of config.competitorNames ?? []) {
    if (n && nameLower.includes(n.toLowerCase())) return true;
  }

  for (const d of config.competitorDomains ?? []) {
    if (d && (nameLower.includes(d.toLowerCase()) || descLower.includes(d.toLowerCase()))) return true;
  }

  for (const kw of config.competitorKeywords ?? []) {
    if (kw && descLower.includes(kw.toLowerCase())) return true;
  }

  return false;
}
