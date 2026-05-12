import { getStoredBrandConfig, BrandConfig, saveBrandConfig } from "./data";

export type { BrandConfig };

const DEFAULT: BrandConfig = {
  companyName: "SuperScraper",
  tagline: "Intelligent Lead Prospecting",
  primaryColor: "#6366f1",
};

export async function getBrandConfig(): Promise<BrandConfig> {
  return (await getStoredBrandConfig()) ?? DEFAULT;
}

export { saveBrandConfig };
