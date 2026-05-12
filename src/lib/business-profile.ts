import {
  getStoredBusinessProfile, getStoredWatchtowerConfig,
  BusinessProfile, WatchtowerConfig, WatchtowerSearchCategory,
  saveBusinessProfile, saveWatchtowerConfig,
} from "./data";

export type { BusinessProfile, WatchtowerConfig, WatchtowerSearchCategory };
export { saveBusinessProfile, saveWatchtowerConfig };

export async function getBusinessProfile(): Promise<BusinessProfile | null> {
  return getStoredBusinessProfile();
}

export async function getWatchtowerConfig(): Promise<WatchtowerConfig | null> {
  return getStoredWatchtowerConfig();
}

export function buildProductKnowledgeBlock(profile: BusinessProfile | null): string {
  if (!profile?.whatYouSell) return "";
  const lines = [
    `COMPANY: ${profile.companyName}`,
    profile.websiteUrl ? `WEBSITE: ${profile.websiteUrl}` : "",
    `WHAT WE SELL: ${profile.whatYouSell}`,
    `WHO BUYS FROM US: ${profile.whoBuysFromYou}`,
    `WHY CHOOSE US: ${profile.whyChooseYou}`,
    `AVERAGE DEAL SIZE: ${profile.avgDealSize}`,
    `SALES CYCLE: ${profile.salesCycleLength}`,
    profile.distributionModel.length ? `DISTRIBUTION: ${profile.distributionModel.join(", ")}` : "",
    profile.lookingFor.length ? `IDEAL PARTNER QUALITIES: ${profile.lookingFor.join(", ")}` : "",
  ].filter(Boolean);
  return lines.join("\n");
}
