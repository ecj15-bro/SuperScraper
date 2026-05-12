// lib/data.ts — DB-backed data access layer.
// Exposes the same interface as the old file-based store.ts so agents
// need zero import changes. All reads/writes go to Postgres via Drizzle.

import { db } from "./db/client";
import {
  companies, pitches, knowledgeBase as kbTable,
  brandConfig as brandTable, businessProfile as profileTable,
  watchtowerConfig as wConfigTable, searchHistory as historyTable,
  jobs as jobsTable,
} from "./db/schema";
import { eq, gte, desc, sql } from "drizzle-orm";
import { randomUUID } from "crypto";

// ─── TYPES (re-exported — agents import from here) ───────────────────────────

export interface SearchHistoryEntry {
  id: string;
  timestamp: string;
  query: string;
  category: string;
  resultsCount: number;
  qualifiedLeadsCount: number;
  avgRelevanceScore: number;
  companiesFound: string[];
}

export interface EvolvedSearchParams {
  retireQueries: string[];
  addQueries: string[];
  hotVerticalQueries: string[];
  ecosystemQueries: string[];
  saturatedQueries: string[];
  evolutionRationale: string;
}

export interface KnowledgeBase {
  lastRefreshed: string;
  industryTrends: string[];
  competitorIntel: string[];
  partnerEcosystem: string[];
  varMarketSignals: string[];
  refinedIdealVARProfile: string;
  hotVerticals: string[];
  coldVerticals: string[];
  lastInsights: string;
}

export interface BrandConfig {
  companyName: string;
  tagline: string;
  primaryColor: string;
  logoDataUrl?: string;
}

export interface BusinessProfile {
  companyName: string;
  websiteUrl: string;
  whatYouSell: string;
  whoBuysFromYou: string;
  whyChooseYou: string;
  avgDealSize: "under10k" | "10k-50k" | "50k-100k" | "100k+" | "enterprise";
  salesCycleLength: "days" | "weeks" | "1-3months" | "3-6months" | "6months+";
  distributionModel: string[];
  lookingFor: string[];
}

export interface WatchtowerSearchCategory {
  name: string;
  description: string;
  queries: string[];
  priority: "high" | "medium" | "low";
}

export interface WatchtowerConfig {
  searchCategories: WatchtowerSearchCategory[];
  idealVARProfile: string;
  targetVerticals: string[];
  avoidVerticals: string[];
  partnerEcosystem: string[];
  dealSizeGuidance: string;
  pitchTone: "formal" | "casual" | "technical" | "executive";
  keyValueProps: string[];
  redFlagPatterns: string[];
  competitorNames: string[];
  competitorDomains: string[];
  competitorKeywords: string[];
  newsMaxAgeDays: number;
}

export interface PitchVariants {
  cold_email: string;
  linkedin_message: string;
  followup_email: string;
  text_message: string;
  executive_brief: string;
}

export interface ReportEntry {
  id: string;
  timestamp: string;
  companyName: string;
  decisionMaker: string;
  title: string;
  linkedinUrl?: string;
  companyWebsite?: string;
  companyProfile: string;
  personProfile: string;
  pitch: string;
  newsTitle: string;
  newsSource: string;
  pitchVariants?: PitchVariants;
  relevanceScore?: number;
  confidenceScore?: number;
  varFitScore?: any;
  pitchContext?: any;
  briefing?: string;
  personalizedIntro?: string;
}

export interface JobStatus {
  id: string;
  type: string;
  status: "pending" | "running" | "complete" | "error";
  leadsFound: number;
  leadsEnqueued: number;
  leadsProcessed: number;
  leadsFiltered: number;
  errors: string[];
  searchEvolution?: EvolvedSearchParams;
  createdAt: string;
  completedAt?: string;
}

// ─── COMPANY DEDUP ────────────────────────────────────────────────────────────

export async function getSeenCompanies(): Promise<string[]> {
  const rows = await db
    .select({ name: companies.name })
    .from(companies)
    .where(sql`${companies.enrichmentStatus} IN ('complete', 'filtered_gate1', 'filtered_gate2', 'filtered_competitor', 'queued', 'profiling')`);
  return rows.map((r) => r.name.toLowerCase().trim());
}

export async function hasSeenCompany(name: string): Promise<boolean> {
  const [row] = await db
    .select({ id: companies.id })
    .from(companies)
    .where(sql`LOWER(${companies.name}) = ${name.toLowerCase().trim()}`)
    .limit(1);
  return !!row;
}

export async function markCompanySeen(name: string): Promise<void> {
  // Companies are considered "seen" once they enter the pipeline.
  // The enrichmentStatus column tracks this — no separate action needed.
  // This is a no-op kept for interface compatibility.
  void name;
}

// ─── REPORTS (backed by pitches + companies join) ─────────────────────────────

export async function saveReport(
  report: Omit<ReportEntry, "id" | "timestamp"> & {
    pitchVariants?: PitchVariants;
    varFitScore?: any;
    pitchContext?: any;
    briefing?: string;
    personalizedIntro?: string;
    firstName?: string;
    lastName?: string;
    jobId?: string;
  }
): Promise<string> {
  const [company] = await db
    .select({ id: companies.id })
    .from(companies)
    .where(sql`LOWER(${companies.name}) = ${report.companyName.toLowerCase().trim()}`)
    .limit(1);

  const companyId = company?.id ?? randomUUID();

  if (!company) {
    await db.insert(companies).values({
      id: companyId,
      name: report.companyName,
      source: "news",
      enrichmentStatus: "complete",
    }).onConflictDoNothing();
  }

  const pitchId = randomUUID();
  await db.insert(pitches).values({
    id: pitchId,
    companyId,
    personalizedIntro: report.personalizedIntro,
    coldEmail:         report.pitchVariants?.cold_email,
    linkedinMessage:   report.pitchVariants?.linkedin_message,
    followupEmail:     report.pitchVariants?.followup_email,
    textMessage:       report.pitchVariants?.text_message,
    executiveBrief:    report.pitchVariants?.executive_brief,
    selectedPitch:     report.pitch,
    newsTriggerTitle:  report.newsTitle,
    newsTriggerSource: report.newsSource,
    jobId:             (report as any).jobId,
  });

  await db.update(companies).set({
    decisionMaker:   report.decisionMaker,
    dmTitle:         report.title,
    dmLinkedin:      report.linkedinUrl ?? undefined,
    website:         report.companyWebsite ?? undefined,
    companyProfile:  report.companyProfile,
    personProfile:   report.personProfile,
    confidenceScore: report.confidenceScore ?? undefined,
    varFitScore:     report.varFitScore ?? undefined,
    pitchContext:    report.pitchContext ?? undefined,
    briefing:        report.briefing ?? undefined,
    pitchedAt:       new Date(),
    enrichmentStatus: "complete",
  }).where(eq(companies.id, companyId));

  return pitchId;
}

export async function getReports(): Promise<ReportEntry[]> {
  const rows = await db
    .select()
    .from(pitches)
    .innerJoin(companies, eq(pitches.companyId, companies.id))
    .orderBy(desc(pitches.createdAt))
    .limit(200);

  return rows.map(({ pitches: p, companies: c }) => ({
    id:             p.id,
    timestamp:      p.createdAt.toISOString(),
    companyName:    c.name,
    decisionMaker:  c.decisionMaker ?? "",
    title:          c.dmTitle ?? "",
    linkedinUrl:    c.dmLinkedin ?? undefined,
    companyWebsite: c.website ?? undefined,
    companyProfile: c.companyProfile ?? "",
    personProfile:  c.personProfile ?? "",
    pitch:          p.selectedPitch ?? "",
    newsTitle:      p.newsTriggerTitle ?? "",
    newsSource:     p.newsTriggerSource ?? "",
    pitchVariants:  p.coldEmail ? {
      cold_email:       p.coldEmail,
      linkedin_message: p.linkedinMessage ?? "",
      followup_email:   p.followupEmail ?? "",
      text_message:     p.textMessage ?? "",
      executive_brief:  p.executiveBrief ?? "",
    } : undefined,
    relevanceScore:    (c.newsSignal as any)?.relevanceScore,
    confidenceScore:   c.confidenceScore ?? undefined,
    varFitScore:       c.varFitScore ?? undefined,
    pitchContext:      c.pitchContext ?? undefined,
    briefing:          c.briefing ?? undefined,
    personalizedIntro: p.personalizedIntro ?? undefined,
  }));
}

export async function deleteReport(id: string): Promise<boolean> {
  const result = await db.delete(pitches).where(eq(pitches.id, id)).returning({ id: pitches.id });
  return result.length > 0;
}

// ─── SEARCH HISTORY ───────────────────────────────────────────────────────────

export async function saveSearchHistory(entry: SearchHistoryEntry): Promise<void> {
  await db.insert(historyTable).values(entry).onConflictDoNothing();
}

export async function getSearchHistory(): Promise<SearchHistoryEntry[]> {
  const cutoff = new Date(Date.now() - 90 * 86_400_000).toISOString();
  const rows = await db
    .select()
    .from(historyTable)
    .where(gte(historyTable.timestamp, cutoff))
    .orderBy(historyTable.timestamp)
    .limit(1000);
  return rows.map((r) => ({
    id:                  r.id,
    timestamp:           r.timestamp,
    query:               r.query,
    category:            r.category,
    resultsCount:        r.resultsCount,
    qualifiedLeadsCount: r.qualifiedLeadsCount,
    avgRelevanceScore:   r.avgRelevanceScore,
    companiesFound:      (r.companiesFound as string[]) ?? [],
  }));
}

// ─── SEARCH EVOLUTION ─────────────────────────────────────────────────────────

export async function saveSearchEvolution(evolution: EvolvedSearchParams): Promise<void> {
  await db
    .insert(kbTable)
    .values({ id: "singleton", lastSearchEvolution: evolution, lastRefreshed: new Date().toISOString() })
    .onConflictDoUpdate({
      target: kbTable.id,
      set: { lastSearchEvolution: evolution, updatedAt: new Date() },
    });
}

export async function getSearchEvolution(): Promise<EvolvedSearchParams | null> {
  const [row] = await db.select({ v: kbTable.lastSearchEvolution }).from(kbTable).limit(1);
  return (row?.v as EvolvedSearchParams | null) ?? null;
}

// ─── KNOWLEDGE BASE ───────────────────────────────────────────────────────────

export async function saveKnowledgeBase(kb: KnowledgeBase): Promise<void> {
  await db
    .insert(kbTable)
    .values({ id: "singleton", ...kb, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: kbTable.id,
      set: { ...kb, updatedAt: new Date() },
    });
}

export async function getKnowledgeBase(): Promise<KnowledgeBase | null> {
  const [row] = await db.select().from(kbTable).limit(1);
  if (!row || !row.lastRefreshed) return null;
  return {
    lastRefreshed:         row.lastRefreshed,
    industryTrends:        (row.industryTrends as string[]) ?? [],
    competitorIntel:       (row.competitorIntel as string[]) ?? [],
    partnerEcosystem:      (row.partnerEcosystem as string[]) ?? [],
    varMarketSignals:      (row.varMarketSignals as string[]) ?? [],
    refinedIdealVARProfile: row.refinedIdealVARProfile ?? "",
    hotVerticals:          (row.hotVerticals as string[]) ?? [],
    coldVerticals:         (row.coldVerticals as string[]) ?? [],
    lastInsights:          row.lastInsights ?? "",
  };
}

// ─── BRAND CONFIG ─────────────────────────────────────────────────────────────

export async function saveBrandConfig(brand: BrandConfig): Promise<void> {
  await db
    .insert(brandTable)
    .values({ id: "singleton", ...brand, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: brandTable.id,
      set: { ...brand, updatedAt: new Date() },
    });
}

export async function getStoredBrandConfig(): Promise<BrandConfig | null> {
  const [row] = await db.select().from(brandTable).limit(1);
  if (!row || !row.companyName) return null;
  return {
    companyName:  row.companyName,
    tagline:      row.tagline ?? "",
    primaryColor: row.primaryColor ?? "#6366f1",
    logoDataUrl:  row.logoDataUrl ?? undefined,
  };
}

// ─── BUSINESS PROFILE ─────────────────────────────────────────────────────────

export async function saveBusinessProfile(profile: BusinessProfile): Promise<void> {
  await db
    .insert(profileTable)
    .values({ id: "singleton", ...profile, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: profileTable.id,
      set: { ...profile, updatedAt: new Date() },
    });
}

export async function getStoredBusinessProfile(): Promise<BusinessProfile | null> {
  const [row] = await db.select().from(profileTable).limit(1);
  if (!row || !row.whatYouSell) return null;
  return {
    companyName:       row.companyName ?? "",
    websiteUrl:        row.websiteUrl ?? "",
    whatYouSell:       row.whatYouSell ?? "",
    whoBuysFromYou:    row.whoBuysFromYou ?? "",
    whyChooseYou:      row.whyChooseYou ?? "",
    avgDealSize:       (row.avgDealSize as any) ?? "10k-50k",
    salesCycleLength:  (row.salesCycleLength as any) ?? "weeks",
    distributionModel: (row.distributionModel as string[]) ?? [],
    lookingFor:        (row.lookingFor as string[]) ?? [],
  };
}

// ─── WATCHTOWER CONFIG ────────────────────────────────────────────────────────

export async function saveWatchtowerConfig(config: WatchtowerConfig): Promise<void> {
  await db
    .insert(wConfigTable)
    .values({ id: "singleton", ...config, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: wConfigTable.id,
      set: { ...config, updatedAt: new Date() },
    });
}

export async function getStoredWatchtowerConfig(): Promise<WatchtowerConfig | null> {
  const [row] = await db.select().from(wConfigTable).limit(1);
  if (!row || !(row.searchCategories as any[])?.length) return null;
  return {
    searchCategories:   (row.searchCategories as any[]) ?? [],
    idealVARProfile:    row.idealVARProfile ?? "",
    targetVerticals:    (row.targetVerticals as string[]) ?? [],
    avoidVerticals:     (row.avoidVerticals as string[]) ?? [],
    partnerEcosystem:   (row.partnerEcosystem as string[]) ?? [],
    dealSizeGuidance:   row.dealSizeGuidance ?? "",
    pitchTone:          (row.pitchTone as any) ?? "formal",
    keyValueProps:      (row.keyValueProps as string[]) ?? [],
    redFlagPatterns:    (row.redFlagPatterns as string[]) ?? [],
    competitorNames:    (row.competitorNames as string[]) ?? [],
    competitorDomains:  (row.competitorDomains as string[]) ?? [],
    competitorKeywords: (row.competitorKeywords as string[]) ?? [],
    newsMaxAgeDays:     row.newsMaxAgeDays ?? 30,
  };
}

// ─── JOBS ─────────────────────────────────────────────────────────────────────

export async function createJob(id: string, type: string): Promise<void> {
  await db.insert(jobsTable).values({ id, type, status: "pending" });
}

export async function updateJob(id: string, update: Partial<{
  status: string; leadsFound: number; leadsEnqueued: number;
  leadsProcessed: number; leadsFiltered: number;
  errors: string[]; searchEvolution: EvolvedSearchParams; completedAt: Date;
}>): Promise<void> {
  await db.update(jobsTable).set({ ...update } as any).where(eq(jobsTable.id, id));
}

export async function getJob(id: string): Promise<JobStatus | null> {
  const [row] = await db.select().from(jobsTable).where(eq(jobsTable.id, id)).limit(1);
  if (!row) return null;
  return {
    id: row.id,
    type: row.type,
    status: row.status as any,
    leadsFound:     row.leadsFound ?? 0,
    leadsEnqueued:  row.leadsEnqueued ?? 0,
    leadsProcessed: row.leadsProcessed ?? 0,
    leadsFiltered:  row.leadsFiltered ?? 0,
    errors:         (row.errors as string[]) ?? [],
    searchEvolution: row.searchEvolution as any ?? undefined,
    createdAt:      row.createdAt.toISOString(),
    completedAt:    row.completedAt?.toISOString(),
  };
}
