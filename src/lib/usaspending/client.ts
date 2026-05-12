const BASE = "https://api.usaspending.gov/api/v2";

export interface AwardSearchFilters {
  time_period: { start_date: string; end_date: string }[];
  award_type_codes?: string[];
  naics_codes?: string[];
  psc_codes?: string[];
  agencies?: { type: "awarding"; tier: "toptier"; name: string }[];
  keywords?: string[];
}

const FIELDS = [
  "Award ID", "Recipient Name", "Recipient UEI", "Recipient DUNS Number",
  "Awarding Agency", "Awarding Sub Agency", "Award Amount",
  "Award Type", "Description", "NAICS", "PSC", "Start Date", "End Date",
  "Last Modified Date", "Place of Performance State Code",
  "recipient_id", "generated_internal_id",
];

export async function searchAwards(
  filters: AwardSearchFilters,
  page = 1,
  limit = 100,
): Promise<{ results: any[]; page_metadata: { hasNext: boolean; page: number } }> {
  const body = {
    filters: {
      award_type_codes: ["A", "B", "C", "D"],
      ...filters,
    },
    fields: FIELDS,
    page,
    limit,
    sort: "Award Amount",
    order: "desc",
    subawards: false,
  };

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const res = await fetch(`${BASE}/search/spending_by_award/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) return res.json();
      if (res.status === 429 || res.status >= 500) {
        await delay(2 ** attempt * 1000);
        continue;
      }
      throw new Error(`USASpending error ${res.status}: ${await res.text()}`);
    } catch (err) {
      if (attempt === 4) throw err;
      await delay(2 ** attempt * 1000);
    }
  }
  throw new Error("USASpending: max retries exceeded");
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
