import { askClaude } from "@/lib/claude";
import { getKnowledgeBase, KnowledgeBase, SearchHistoryEntry, EvolvedSearchParams, WatchtowerConfig, WatchtowerSearchCategory } from "@/lib/data";
import { getBrandConfig } from "@/lib/brand";
import { getBusinessProfile, buildProductKnowledgeBlock, BusinessProfile } from "@/lib/business-profile";

export type { WatchtowerConfig, WatchtowerSearchCategory };

// ─── TYPES ───────────────────────────────────────────────────────────────────

export interface VARFitScore {
  overallScore: number;
  fitCategory: "strong" | "moderate" | "weak" | "avoid";
  fitReasons: string[];
  redFlags: string[];
  deploymentEase: "easy" | "moderate" | "complex";
  estimatedDealSize: "small" | "mid" | "enterprise";
  strategicNotes: string;
}

export interface PitchContext {
  hookAngle: string;
  painPoints: string[];
  integrationAngle: string | null;
  toneRecommendation: "formal" | "casual" | "technical" | "executive";
  avoidMentioning: string[];
}

interface BriefingSubject { companyName: string; decisionMaker: string; }

// ─── KNOWLEDGE BLOCK BUILDERS ─────────────────────────────────────────────────

function buildKnowledgeBlock(profile: BusinessProfile | null, companyName: string): string {
  return buildProductKnowledgeBlock(profile) ||
    `${companyName.toUpperCase()} is a lead prospecting service. Evaluate whether this company is a strong partner or reseller candidate.`;
}

function buildLiveIntelligenceBlock(kb: KnowledgeBase, companyName: string): string {
  const age = Math.round((Date.now() - new Date(kb.lastRefreshed).getTime()) / 3_600_000);
  const ageLabel = age < 24 ? `${age}h ago` : `${Math.round(age / 24)}d ago`;
  const lines: string[] = [`\nLIVE MARKET INTELLIGENCE (last refreshed ${ageLabel}):`, `Summary: ${kb.lastInsights}`];

  if (kb.hotVerticals.length) {
    lines.push(`\nHOT VERTICALS (highest signal right now):\n${kb.hotVerticals.map((v) => `- ${v}`).join("\n")}`);
    lines.push(`SCORING RULE: If this company's customers are in a hot vertical, add 1 point to overallScore.`);
  }
  if (kb.coldVerticals.length) {
    lines.push(`\nCOLD VERTICALS (weak signals or budget freezes):\n${kb.coldVerticals.map((v) => `- ${v}`).join("\n")}`);
    lines.push(`SCORING RULE: If this company's customers are primarily in a cold vertical, add a red flag.`);
  }
  if (kb.refinedIdealVARProfile) lines.push(`\nCURRENT IDEAL PARTNER PROFILE:\n${kb.refinedIdealVARProfile}`);
  if (kb.varMarketSignals.length) lines.push(`\nMARKET SIGNALS:\n${kb.varMarketSignals.slice(0, 3).map((s) => `- ${s}`).join("\n")}`);

  return lines.join("\n");
}

// ─── scoreVARFit ──────────────────────────────────────────────────────────────

export async function scoreVARFit(
  companyName: string, companyProfile: string, personProfile: string, newsContext: string,
): Promise<VARFitScore> {
  const [brand, profile, kb] = await Promise.all([getBrandConfig(), getBusinessProfile(), getKnowledgeBase()]);
  const knowledgeBlock = buildKnowledgeBlock(profile, brand.companyName);
  const liveBlock = kb ? buildLiveIntelligenceBlock(kb, brand.companyName) : "";

  const response = await askClaude(
    `You are the ${brand.companyName} Partner Intelligence System. Evaluate whether a company is a strong candidate to become a reseller or VAR partner. Use the knowledge base below as ground truth.

Never use em dashes in any output.

If this company appears to sell a product that directly competes with ${brand.companyName} — same mechanism, same buyers, same outcome — return fitCategory: "avoid" with a redFlag explaining the conflict.

${knowledgeBlock}${liveBlock}

Return ONLY a JSON object (no markdown):
{
  "overallScore": 7,
  "fitCategory": "moderate",
  "fitReasons": ["reason 1", "reason 2"],
  "redFlags": [],
  "deploymentEase": "easy",
  "estimatedDealSize": "mid",
  "strategicNotes": "notes here"
}

fitCategory rules: strong=8-10, moderate=6-7, weak=4-5, avoid=0-3
estimatedDealSize: small=sub-$10k ARR, mid=$10k-$100k ARR, enterprise=$100k+ ARR`,
    `Company: ${companyName}
${companyProfile ? `Company profile:\n${companyProfile}` : "(no profile yet — scoring from context only)"}
${personProfile ? `\nDecision maker:\n${personProfile}` : ""}
\nContext: ${newsContext}`,
  );

  try {
    return JSON.parse(response.replace(/```json|```/g, "").trim()) as VARFitScore;
  } catch {
    return {
      overallScore: 5, fitCategory: "moderate",
      fitReasons: ["Insufficient data — manual review recommended"],
      redFlags: ["Scoring response could not be parsed"],
      deploymentEase: "moderate", estimatedDealSize: "small",
      strategicNotes: "Context agent could not score this lead.",
    };
  }
}

// ─── enrichPitchContext ───────────────────────────────────────────────────────

export async function enrichPitchContext(
  companyName: string, companyProfile: string, personProfile: string, varFitScore: VARFitScore,
): Promise<PitchContext> {
  const [brand, profile, kb] = await Promise.all([getBrandConfig(), getBusinessProfile(), getKnowledgeBase()]);
  const knowledgeBlock = buildKnowledgeBlock(profile, brand.companyName);
  const liveBlock = kb ? buildLiveIntelligenceBlock(kb, brand.companyName) : "";

  const response = await askClaude(
    `You are the ${brand.companyName} Pitch Intelligence System. Generate strategic pitch context.

Never use em dashes in any output.

${knowledgeBlock}${liveBlock}

Return ONLY a JSON object (no markdown):
{
  "hookAngle": "specific compelling reason this company should care right now",
  "painPoints": ["specific pain point 1", "specific pain point 2"],
  "integrationAngle": "if they work with a known partner tech, name it and explain the angle — or null",
  "toneRecommendation": "formal",
  "avoidMentioning": ["aspect to avoid for this company type"]
}

toneRecommendation: executive=CRO/CEO, formal=VP/Director, technical=IT/solutions, casual=founder/owner`,
    `Company: ${companyName}
Profile: ${companyProfile}
Decision maker: ${personProfile}

VAR fit: ${varFitScore.fitCategory} (${varFitScore.overallScore}/10)
Fit reasons: ${varFitScore.fitReasons.join("; ")}
Red flags: ${varFitScore.redFlags.join("; ") || "none"}
Strategic notes: ${varFitScore.strategicNotes}`,
  );

  try {
    return JSON.parse(response.replace(/```json|```/g, "").trim()) as PitchContext;
  } catch {
    return {
      hookAngle:           `${companyName}'s customers could benefit directly from what ${brand.companyName} offers`,
      painPoints:          ["Manual processes consuming staff time", "Lack of real-time visibility"],
      integrationAngle:    null,
      toneRecommendation:  "formal",
      avoidMentioning:     [],
    };
  }
}

// ─── isWorthPursuing ─────────────────────────────────────────────────────────

export function isWorthPursuing(score: VARFitScore): boolean {
  return score.fitCategory !== "avoid" && score.overallScore >= 5;
}

// ─── generateBriefing ────────────────────────────────────────────────────────

export async function generateBriefing(subject: BriefingSubject, varFitScore: VARFitScore, pitchContext: PitchContext): Promise<string> {
  const [brand, kb] = await Promise.all([getBrandConfig(), getKnowledgeBase()]);

  const topReason = varFitScore.fitReasons[0] ?? varFitScore.strategicNotes;
  const integrationNote = pitchContext.integrationAngle ? ` ${pitchContext.integrationAngle}.` : "";
  const dealSizeLabel = varFitScore.estimatedDealSize === "small" ? "small (<$10k ARR)"
    : varFitScore.estimatedDealSize === "mid" ? "mid-market ($10k-$100k ARR)" : "enterprise ($100k+ ARR)";

  let marketNote = "";
  if (kb) {
    const ageHours = (Date.now() - new Date(kb.lastRefreshed).getTime()) / 3_600_000;
    if (ageHours < 48 && kb.lastInsights) marketNote = ` Market context: ${kb.lastInsights.split(".")[0]}.`;
  }

  return (
    `Why this matters: ${subject.companyName} is a ${varFitScore.fitCategory} ${brand.companyName} partner fit ` +
    `(${varFitScore.overallScore}/10). ${topReason}.${integrationNote} ` +
    `Recommended approach: ${pitchContext.toneRecommendation} tone, targeting ${subject.decisionMaker}. ` +
    `Estimated deal size: ${dealSizeLabel}. ` +
    `Deployment complexity: ${varFitScore.deploymentEase}.${marketNote}`
  );
}

// ─── evolveSearchParameters ──────────────────────────────────────────────────

export async function evolveSearchParameters(
  currentQueries: string[], searchHistory: SearchHistoryEntry[],
  knowledgeBase: KnowledgeBase | null, seenCompanies: string[],
): Promise<EvolvedSearchParams> {
  const [brand, profile] = await Promise.all([getBrandConfig(), getBusinessProfile()]);
  const knowledgeBlock = buildKnowledgeBlock(profile, brand.companyName);

  const queryStats = new Map<string, { runs: number; totalLeads: number; totalResults: number; companies: Set<string> }>();
  for (const entry of searchHistory) {
    const s = queryStats.get(entry.query) ?? { runs: 0, totalLeads: 0, totalResults: 0, companies: new Set() };
    s.runs++; s.totalLeads += entry.qualifiedLeadsCount; s.totalResults += entry.resultsCount;
    entry.companiesFound.forEach((c) => s.companies.add(c));
    queryStats.set(entry.query, s);
  }

  const sorted = [...queryStats.entries()].sort((a, b) => b[1].totalLeads - a[1].totalLeads);
  const topQueries  = sorted.slice(0, 10).map(([q, s]) => `"${q}" — ${s.totalLeads} leads over ${s.runs} runs`).join("\n");
  const zeroQueries = sorted.slice(-10).filter(([, s]) => s.totalLeads === 0).map(([q, s]) => `"${q}" — 0 leads over ${s.runs} runs`).join("\n");

  const kbBlock = knowledgeBase
    ? `Hot verticals: ${knowledgeBase.hotVerticals.join(", ") || "none"}\nCold verticals: ${knowledgeBase.coldVerticals.join(", ") || "none"}\nInsights: ${knowledgeBase.lastInsights}`
    : "No knowledge base yet.";

  const response = await askClaude(
    `You are a search strategy analyst for ${brand.companyName}'s partner prospecting pipeline. Evolve the query set to find better leads over time.

Never use em dashes in any output.

${knowledgeBlock}

${kbBlock}

Recently processed companies (do not retarget):
${seenCompanies.slice(-30).join(", ") || "none"}

Performance data (${searchHistory.length} runs in last 90 days):
Best queries:\n${topQueries || "No history yet."}
Zero-result queries:\n${zeroQueries || "None."}

Current active queries (${currentQueries.length}):
${currentQueries.map((q) => `"${q}"`).join("\n")}

TASK: retire 0-yield queries (3+ runs), generate 5-10 new queries, 2-3 hot-vertical queries, 1-2 ecosystem queries. Flag saturated queries.

Return ONLY JSON:
{
  "retireQueries": [],
  "addQueries": [],
  "hotVerticalQueries": [],
  "ecosystemQueries": [],
  "saturatedQueries": [],
  "evolutionRationale": "2-3 sentences"
}`,
    `Evolve search parameters. Current queries: ${currentQueries.length}. History entries: ${searchHistory.length}.`,
  );

  try {
    return JSON.parse(response.replace(/```json|```/g, "").trim()) as EvolvedSearchParams;
  } catch {
    return { retireQueries: [], addQueries: [], hotVerticalQueries: [], ecosystemQueries: [], saturatedQueries: [], evolutionRationale: "Evolution parsing failed." };
  }
}

// ─── translateBusinessContext ─────────────────────────────────────────────────

export async function translateBusinessContext(profile: BusinessProfile): Promise<WatchtowerConfig> {
  const profileBlock = buildProductKnowledgeBlock(profile);

  const response = await askClaude(
    `You are a channel sales strategist. Translate a business profile into a precise VAR partner search and outreach strategy.

Never use em dashes in any output.

${profileBlock}

Return ONLY a JSON object:
{
  "searchCategories": [{"name":"","description":"","queries":["3-5 queries"],"priority":"high"}],
  "idealVARProfile": "paragraph describing ideal partner",
  "targetVerticals": ["5-8 industries"],
  "avoidVerticals": ["2-4 industries"],
  "partnerEcosystem": ["4-8 technologies a good partner would already sell"],
  "dealSizeGuidance": "guidance on deal sizing",
  "pitchTone": "formal",
  "keyValueProps": ["3-5 reasons a VAR should add this product"],
  "redFlagPatterns": ["3-6 bad-fit signals"],
  "competitorNames": ["exact company names that compete directly"],
  "competitorDomains": ["competitor.com"],
  "competitorKeywords": ["4-8 specific phrases that appear in a direct competitor description"]
}

Rules: 4-6 search categories, 3-5 queries each, include 2026 in queries for freshness, competitorKeywords must be product-level specific not industry-level generic.`,
    `Translate this business profile for ${profile.companyName}.`,
  );

  try {
    const parsed = JSON.parse(response.replace(/```json|```/g, "").trim()) as WatchtowerConfig;
    return { ...parsed, newsMaxAgeDays: 30 };
  } catch {
    return {
      searchCategories: [{ name: "General partner search", description: "Broad VAR search", queries: [`${profile.companyName} reseller partnership 2026`, "VAR channel partner program expansion 2026"], priority: "high" }],
      idealVARProfile: `A partner that sells complementary solutions to ${profile.companyName}'s target customers.`,
      targetVerticals: [], avoidVerticals: [], partnerEcosystem: [],
      dealSizeGuidance: "Evaluate based on VAR's customer base.",
      pitchTone: "formal",
      keyValueProps: [profile.whyChooseYou || "Strong value proposition"],
      redFlagPatterns: ["No existing customer base in target verticals"],
      competitorNames: [], competitorDomains: [], competitorKeywords: [],
      newsMaxAgeDays: 30,
    };
  }
}
