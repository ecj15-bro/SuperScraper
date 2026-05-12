import { db } from "./db/client";
import { exportQueue, companies, companyTags, verticals } from "./db/schema";
import { eq, isNull, desc, sql } from "drizzle-orm";
import { randomUUID } from "crypto";

export async function addToExportQueue(params: {
  companyId: string;
  firstName: string;
  lastName: string;
  personalizedIntro: string;
  companyName: string;
  linkedinUrl: string;
  source: string;
  opportunityScore: number;
  jobId?: string;
}): Promise<void> {
  // Resolve primary vertical name
  const tags = await db
    .select({ name: verticals.name, priority: verticals.priority })
    .from(companyTags)
    .innerJoin(verticals, eq(companyTags.verticalId, verticals.id))
    .where(eq(companyTags.companyId, params.companyId))
    .orderBy(verticals.priority)
    .limit(1);

  const industry = tags[0]?.name ?? "";

  await db.insert(exportQueue).values({
    id:                randomUUID(),
    companyId:         params.companyId,
    firstName:         params.firstName,
    lastName:          params.lastName,
    personalizedIntro: params.personalizedIntro,
    companyName:       params.companyName,
    linkedinUrl:       params.linkedinUrl,
    source:            params.source,
    industry,
    opportunityScore:  params.opportunityScore,
    jobId:             params.jobId,
  });
}

export async function getPendingExports() {
  return db
    .select()
    .from(exportQueue)
    .where(isNull(exportQueue.exportedAt))
    .orderBy(desc(exportQueue.opportunityScore));
}

export async function getAllExports() {
  return db
    .select()
    .from(exportQueue)
    .orderBy(desc(exportQueue.addedAt));
}

export async function markExported(ids: string[]): Promise<void> {
  if (!ids.length) return;
  await db
    .update(exportQueue)
    .set({ exportedAt: new Date() })
    .where(sql`${exportQueue.id} = ANY(${ids})`);
}

export async function getPendingCount(): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`COUNT(*)::int` })
    .from(exportQueue)
    .where(isNull(exportQueue.exportedAt));
  return row?.n ?? 0;
}

export function toCSV(rows: Awaited<ReturnType<typeof getPendingExports>>): string {
  const headers = [
    "first_name", "last_name", "personalized_intro",
    "company_name", "linkedin_url", "source", "industry",
  ];
  const escape = (v: string | null | undefined) => {
    const s = v ?? "";
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const lines = [
    headers.join(","),
    ...rows.map((r) =>
      [
        r.firstName, r.lastName, r.personalizedIntro,
        r.companyName, r.linkedinUrl, r.source, r.industry,
      ].map(escape).join(",")
    ),
  ];
  return lines.join("\n");
}
