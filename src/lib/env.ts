export interface Env {
  anthropicApiKey: string;
  serperApiKey: string;
  resendApiKey: string;
  resendFrom: string;
  reportToEmail: string;
  enableEmailDelivery: boolean;
  teamsWebhookUrl: string | null;
  slackWebhookUrl: string | null;
  cronSecret: string;
  newsMaxAgeDays: number;
  maxEnrichmentAgeDays: number;
  alertValueThreshold: number;
  enableLLMClassification: boolean;
}

let _env: Env | null = null;

export function getEnv(): Env {
  if (_env) return _env;
  const missing: string[] = [];
  function req(key: string): string {
    const v = process.env[key];
    if (!v) missing.push(key);
    return v ?? "";
  }
  const env: Env = {
    anthropicApiKey:       req("ANTHROPIC_API_KEY"),
    serperApiKey:          req("SERPER_API_KEY"),
    resendApiKey:          process.env.RESEND_API_KEY ?? "",
    resendFrom:            process.env.RESEND_FROM ?? "",
    reportToEmail:         process.env.REPORT_TO_EMAIL ?? "",
    enableEmailDelivery:   process.env.ENABLE_EMAIL_DELIVERY === "true",
    teamsWebhookUrl:       process.env.TEAMS_WEBHOOK_URL || null,
    slackWebhookUrl:       process.env.SLACK_WEBHOOK_URL || null,
    cronSecret:            req("CRON_SECRET"),
    newsMaxAgeDays:        Number(process.env.NEWS_MAX_AGE_DAYS ?? 30),
    maxEnrichmentAgeDays:  Number(process.env.MAX_ENRICHMENT_AGE_DAYS ?? 180),
    alertValueThreshold:   Number(process.env.ALERT_VALUE_THRESHOLD ?? 100_000),
    enableLLMClassification: process.env.ENABLE_LLM_CLASSIFICATION !== "false",
  };
  if (missing.length) {
    throw new Error(`Missing required env vars: ${missing.join(", ")}`);
  }
  _env = env;
  return _env;
}
