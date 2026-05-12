import { createHash } from "crypto";

const DEFENSE_KEYWORDS = [
  "defense", "army", "navy", "air force", "marine corps",
  "space force", "defense logistics", "dla",
];

function classifyAgency(agency: string | null): string {
  if (!agency) return "other";
  const lower = agency.toLowerCase();
  if (DEFENSE_KEYWORDS.some((kw) => lower.includes(kw))) return "defense";
  if (lower.includes("state") || lower.includes("county") || lower.includes("city")) return "state_local";
  return "civilian";
}

export function normalizeAward(raw: any) {
  const uei = raw["Recipient UEI"] || null;
  const recipientName: string = raw["Recipient Name"] || "UNKNOWN";
  const companyId =
    uei ||
    createHash("sha1").update(recipientName.toLowerCase().trim()).digest("hex").slice(0, 24);

  const company = {
    id:        companyId,
    uei,
    duns:      raw["Recipient DUNS Number"] || null,
    name:      recipientName,
    legalName: recipientName,
    state:     raw["Place of Performance State Code"] || null,
  };

  const awardingAgency = raw["Awarding Agency"] || null;

  const contract = {
    id:                       raw.generated_internal_id || raw["Award ID"],
    awardId:                  raw["Award ID"],
    companyId,
    awardingAgency,
    awardingSubAgency:        raw["Awarding Sub Agency"] || null,
    agencyType:               classifyAgency(awardingAgency),
    naicsCode:                raw.NAICS?.code || null,
    naicsDescription:         raw.NAICS?.description || null,
    pscCode:                  raw.PSC?.code || null,
    pscDescription:           raw.PSC?.description || null,
    description:              raw.Description || "",
    awardAmount:              (raw["Award Amount"] ?? 0).toString(),
    baseObligation:           raw["Base Obligation"]?.toString() || null,
    awardDate:                raw["Start Date"] ? new Date(raw["Start Date"]) : null,
    periodOfPerformanceStart: raw["Start Date"] ? new Date(raw["Start Date"]) : null,
    periodOfPerformanceEnd:   raw["End Date"] ? new Date(raw["End Date"]) : null,
    rawPayload:               raw,
  };

  return { company, contract };
}
