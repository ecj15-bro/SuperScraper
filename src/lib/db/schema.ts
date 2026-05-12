import {
  pgTable, text, integer, numeric, timestamp,
  jsonb, boolean, real, uniqueIndex, index, primaryKey,
} from "drizzle-orm/pg-core";

// ─── VERTICALS ───────────────────────────────────────────────────────────────

export const verticals = pgTable("verticals", {
  id:          text("id").primaryKey(),
  name:        text("name").notNull(),
  priority:    integer("priority").notNull().default(5),
  keywords:    jsonb("keywords").$type<string[]>().notNull(),
  naicsHints:  jsonb("naics_hints").$type<string[]>().default([]),
  pscHints:    jsonb("psc_hints").$type<string[]>().default([]),
  active:      boolean("active").notNull().default(true),
  createdAt:   timestamp("created_at").defaultNow().notNull(),
  updatedAt:   timestamp("updated_at").defaultNow().notNull(),
});

// ─── COMPANIES ───────────────────────────────────────────────────────────────
// Central entity. Both USASpending ingest and Watchtower news search write here.
// Dedup: UEI first, then SHA1(normalized name).

export const companies = pgTable("companies", {
  id:             text("id").primaryKey(),
  uei:            text("uei").unique(),
  duns:           text("duns"),
  name:           text("name").notNull(),
  legalName:      text("legal_name"),
  website:        text("website"),
  city:           text("city"),
  state:          text("state"),
  zip:            text("zip"),

  // Which channel(s) found this company
  source:         text("source").default("usaspending"), // 'usaspending' | 'news' | 'both'

  // News signal fields (set by Watchtower)
  newsSignal:     jsonb("news_signal").$type<{
    title: string; snippet: string; url: string; source: string; relevanceScore: number;
  } | null>().default(null),
  newsSignalAt:   timestamp("news_signal_at"),

  // Contract aggregates (updated by USASpending ingest)
  totalAwardsCount: integer("total_awards_count").default(0),
  totalAwardsValue: numeric("total_awards_value", { precision: 18, scale: 2 }).default("0"),
  firstSeenAt:    timestamp("first_seen_at").defaultNow().notNull(),
  lastWinAt:      timestamp("last_win_at"),

  // Scoring (set by score cron)
  opportunityScore: real("opportunity_score").default(0),
  leadTemperature:  text("lead_temperature"), // 'hot' | 'warm' | 'monitor'
  scoredAt:         timestamp("scored_at"),

  // Enrichment state machine
  enrichmentStatus: text("enrichment_status").default("pending"),
  // 'pending' | 'queued' | 'profiling' | 'complete'
  // | 'filtered_gate1' | 'filtered_gate2' | 'filtered_competitor' | 'stale' | 'error'
  enqueuedAt:     timestamp("enqueued_at"),   // set once; prevents double-enqueue
  profiledAt:     timestamp("profiled_at"),   // set when Detective completes
  pitchedAt:      timestamp("pitched_at"),    // set when Salesman completes

  // Detective outputs
  dmFirstName:      text("dm_first_name"),
  dmLastName:       text("dm_last_name"),
  decisionMaker:    text("decision_maker"),
  dmTitle:          text("dm_title"),
  dmLinkedin:       text("dm_linkedin"),
  companyProfile:   text("company_profile"),
  personProfile:    text("person_profile"),
  confidenceScore:  real("confidence_score"),

  // Context agent outputs
  varFitScore:    jsonb("var_fit_score"),    // VARFitScore
  pitchContext:   jsonb("pitch_context"),   // PitchContext
  briefing:       text("briefing"),
}, (t) => ({
  scoreIdx:   index("companies_score_idx").on(t.opportunityScore),
  tempIdx:    index("companies_temp_idx").on(t.leadTemperature),
  statusIdx:  index("companies_status_idx").on(t.enrichmentStatus),
  sourceIdx:  index("companies_source_idx").on(t.source),
}));

// ─── CONTRACTS ───────────────────────────────────────────────────────────────

export const contracts = pgTable("contracts", {
  id:                       text("id").primaryKey(),
  awardId:                  text("award_id").notNull(),
  companyId:                text("company_id").notNull().references(() => companies.id),
  awardingAgency:           text("awarding_agency"),
  awardingSubAgency:        text("awarding_sub_agency"),
  agencyType:               text("agency_type"), // 'defense' | 'civilian' | 'state_local' | 'other'
  naicsCode:                text("naics_code"),
  naicsDescription:         text("naics_description"),
  pscCode:                  text("psc_code"),
  pscDescription:           text("psc_description"),
  description:              text("description"),
  awardAmount:              numeric("award_amount", { precision: 18, scale: 2 }),
  baseObligation:           numeric("base_obligation", { precision: 18, scale: 2 }),
  awardDate:                timestamp("award_date"),
  periodOfPerformanceStart: timestamp("pop_start"),
  periodOfPerformanceEnd:   timestamp("pop_end"),
  rawPayload:               jsonb("raw_payload"),
  ingestedAt:               timestamp("ingested_at").defaultNow().notNull(),
  classifiedAt:             timestamp("classified_at"),
}, (t) => ({
  companyIdx:  index("contracts_company_idx").on(t.companyId),
  awardDateIdx: index("contracts_award_date_idx").on(t.awardDate),
  agencyIdx:   index("contracts_agency_idx").on(t.awardingAgency),
  awardIdUniq: uniqueIndex("contracts_award_id_uniq").on(t.awardId),
}));

// ─── CONTRACT TAGS ────────────────────────────────────────────────────────────

export const contractTags = pgTable("contract_tags", {
  contractId:      text("contract_id").notNull().references(() => contracts.id, { onDelete: "cascade" }),
  verticalId:      text("vertical_id").notNull().references(() => verticals.id),
  isPrimary:       boolean("is_primary").notNull().default(false),
  confidence:      real("confidence").notNull(),
  matchedKeywords: jsonb("matched_keywords").$type<string[]>().default([]),
  source:          text("source").notNull(), // 'rules' | 'llm'
  taggedAt:        timestamp("tagged_at").defaultNow().notNull(),
}, (t) => ({
  pk:          primaryKey({ columns: [t.contractId, t.verticalId] }),
  verticalIdx: index("contract_tags_vertical_idx").on(t.verticalId),
}));

// ─── COMPANY TAGS ─────────────────────────────────────────────────────────────

export const companyTags = pgTable("company_tags", {
  companyId:     text("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  verticalId:    text("vertical_id").notNull().references(() => verticals.id),
  contractCount: integer("contract_count").notNull().default(0),
  totalValue:    numeric("total_value", { precision: 18, scale: 2 }).notNull().default("0"),
  firstTaggedAt: timestamp("first_tagged_at").defaultNow().notNull(),
  lastTaggedAt:  timestamp("last_tagged_at").defaultNow().notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.companyId, t.verticalId] }),
}));

// ─── ALERTS ───────────────────────────────────────────────────────────────────

export const alerts = pgTable("alerts", {
  id:               text("id").primaryKey(),
  type:             text("type").notNull(),
  severity:         text("severity").notNull(), // 'critical' | 'high' | 'normal'
  contractId:       text("contract_id").references(() => contracts.id),
  companyId:        text("company_id").references(() => companies.id),
  verticalId:       text("vertical_id").references(() => verticals.id),
  payload:          jsonb("payload"),
  delivered:        boolean("delivered").notNull().default(false),
  deliveredChannels: jsonb("delivered_channels").$type<string[]>().default([]),
  createdAt:        timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  undeliveredIdx: index("alerts_undelivered_idx").on(t.delivered, t.createdAt),
}));

// ─── INGESTION RUNS ───────────────────────────────────────────────────────────

export const ingestionRuns = pgTable("ingestion_runs", {
  id:             text("id").primaryKey(),
  startedAt:      timestamp("started_at").defaultNow().notNull(),
  finishedAt:     timestamp("finished_at"),
  cursor:         jsonb("cursor"),
  recordsFetched: integer("records_fetched").default(0),
  recordsNew:     integer("records_new").default(0),
  recordsUpdated: integer("records_updated").default(0),
  errors:         jsonb("errors").$type<string[]>().default([]),
  status:         text("status").notNull(),
});

// ─── TOKEN STATS (discovery) ──────────────────────────────────────────────────

export const tokenStats = pgTable("token_stats", {
  token:          text("token").primaryKey(),
  globalCount:    integer("global_count").notNull().default(0),
  verticalCounts: jsonb("vertical_counts").$type<Record<string, number>>().default({}),
  lastSeenAt:     timestamp("last_seen_at").defaultNow().notNull(),
});

// ─── PITCHES ─────────────────────────────────────────────────────────────────
// One row per pitch generation run per company.

export const pitches = pgTable("pitches", {
  id:                text("id").primaryKey(),
  companyId:         text("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  personalizedIntro: text("personalized_intro"),
  coldEmail:         text("cold_email"),
  linkedinMessage:   text("linkedin_message"),
  followupEmail:     text("followup_email"),
  textMessage:       text("text_message"),
  executiveBrief:    text("executive_brief"),
  selectedPitch:     text("selected_pitch"),
  newsTriggerTitle:  text("news_trigger_title"),
  newsTriggerSource: text("news_trigger_source"),
  jobId:             text("job_id"),
  createdAt:         timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  companyIdx: index("pitches_company_idx").on(t.companyId),
}));

// ─── EXPORT QUEUE ─────────────────────────────────────────────────────────────
// Leads ready for CSV download into Instantly / Apollo / any outreach tool.

export const exportQueue = pgTable("export_queue", {
  id:                text("id").primaryKey(),
  companyId:         text("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  firstName:         text("first_name").default(""),
  lastName:          text("last_name").default(""),
  personalizedIntro: text("personalized_intro"),
  companyName:       text("company_name").notNull(),
  linkedinUrl:       text("linkedin_url").default(""),
  source:            text("source").notNull(),     // 'usaspending' | 'news' | 'both'
  industry:          text("industry").default(""), // primary vertical name
  opportunityScore:  integer("opportunity_score").default(0),
  addedAt:           timestamp("added_at").defaultNow().notNull(),
  exportedAt:        timestamp("exported_at"),     // null = pending
  jobId:             text("job_id"),
}, (t) => ({
  pendingIdx: index("export_queue_pending_idx").on(t.exportedAt),
}));

// ─── JOBS ─────────────────────────────────────────────────────────────────────

export const jobs = pgTable("jobs", {
  id:             text("id").primaryKey(),
  type:           text("type").notNull(), // 'watchtower' | 'backfill' | 'manual'
  status:         text("status").notNull().default("pending"),
  leadsFound:     integer("leads_found").default(0),
  leadsEnqueued:  integer("leads_enqueued").default(0),
  leadsProcessed: integer("leads_processed").default(0),
  leadsFiltered:  integer("leads_filtered").default(0),
  errors:         jsonb("errors").$type<string[]>().default([]),
  searchEvolution: jsonb("search_evolution"),
  createdAt:      timestamp("created_at").defaultNow().notNull(),
  completedAt:    timestamp("completed_at"),
});

// ─── SINGLETON CONFIG TABLES ──────────────────────────────────────────────────
// Each table holds exactly one row with id = 'singleton'.

export const brandConfig = pgTable("brand_config", {
  id:           text("id").primaryKey().default("singleton"),
  companyName:  text("company_name").notNull().default(""),
  tagline:      text("tagline").default(""),
  primaryColor: text("primary_color").default("#6366f1"),
  logoDataUrl:  text("logo_data_url"),
  updatedAt:    timestamp("updated_at").defaultNow().notNull(),
});

export const businessProfile = pgTable("business_profile", {
  id:                 text("id").primaryKey().default("singleton"),
  companyName:        text("company_name").default(""),
  websiteUrl:         text("website_url").default(""),
  whatYouSell:        text("what_you_sell").default(""),
  whoBuysFromYou:     text("who_buys_from_you").default(""),
  whyChooseYou:       text("why_choose_you").default(""),
  avgDealSize:        text("avg_deal_size").default("10k-50k"),
  salesCycleLength:   text("sales_cycle_length").default("weeks"),
  distributionModel:  jsonb("distribution_model").$type<string[]>().default([]),
  lookingFor:         jsonb("looking_for").$type<string[]>().default([]),
  updatedAt:          timestamp("updated_at").defaultNow().notNull(),
});

export const watchtowerConfig = pgTable("watchtower_config", {
  id:                text("id").primaryKey().default("singleton"),
  searchCategories:  jsonb("search_categories").$type<{
    name: string; description: string; queries: string[]; priority: string;
  }[]>().default([]),
  idealVARProfile:   text("ideal_var_profile").default(""),
  targetVerticals:   jsonb("target_verticals").$type<string[]>().default([]),
  avoidVerticals:    jsonb("avoid_verticals").$type<string[]>().default([]),
  partnerEcosystem:  jsonb("partner_ecosystem").$type<string[]>().default([]),
  dealSizeGuidance:  text("deal_size_guidance").default(""),
  pitchTone:         text("pitch_tone").default("formal"),
  keyValueProps:     jsonb("key_value_props").$type<string[]>().default([]),
  redFlagPatterns:   jsonb("red_flag_patterns").$type<string[]>().default([]),
  competitorNames:   jsonb("competitor_names").$type<string[]>().default([]),
  competitorDomains: jsonb("competitor_domains").$type<string[]>().default([]),
  competitorKeywords: jsonb("competitor_keywords").$type<string[]>().default([]),
  newsMaxAgeDays:    integer("news_max_age_days").default(30),
  updatedAt:         timestamp("updated_at").defaultNow().notNull(),
});

export const knowledgeBase = pgTable("knowledge_base", {
  id:                  text("id").primaryKey().default("singleton"),
  lastRefreshed:       text("last_refreshed").default(""),
  industryTrends:      jsonb("industry_trends").$type<string[]>().default([]),
  competitorIntel:     jsonb("competitor_intel").$type<string[]>().default([]),
  partnerEcosystem:    jsonb("partner_ecosystem").$type<string[]>().default([]),
  varMarketSignals:    jsonb("var_market_signals").$type<string[]>().default([]),
  refinedIdealVARProfile: text("refined_ideal_var_profile").default(""),
  hotVerticals:        jsonb("hot_verticals").$type<string[]>().default([]),
  coldVerticals:       jsonb("cold_verticals").$type<string[]>().default([]),
  lastInsights:        text("last_insights").default(""),
  lastSearchEvolution: jsonb("last_search_evolution"),
  updatedAt:           timestamp("updated_at").defaultNow().notNull(),
});

export const searchHistory = pgTable("search_history", {
  id:                  text("id").primaryKey(),
  timestamp:           text("timestamp").notNull(),
  query:               text("query").notNull(),
  category:            text("category").notNull(),
  resultsCount:        integer("results_count").notNull().default(0),
  qualifiedLeadsCount: integer("qualified_leads_count").notNull().default(0),
  avgRelevanceScore:   real("avg_relevance_score").notNull().default(0),
  companiesFound:      jsonb("companies_found").$type<string[]>().default([]),
}, (t) => ({
  tsIdx: index("search_history_ts_idx").on(t.timestamp),
}));
