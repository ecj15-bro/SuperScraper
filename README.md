# SuperScraper

Unified VAR and partner intelligence pipeline. Combines two lead acquisition channels — real-time news monitoring and federal contract data from USASpending.gov — into a single enrichment pipeline that researches companies, scores partner fit, generates personalized outreach, and exports leads as CSV.

## How it works

**Two input channels feed one pipeline:**

1. **Watchtower** — scans news using AI-generated search queries for companies signaling partner readiness (funding, expansion, new product launches, hiring). Runs on a configurable cron schedule.

2. **USASpending** — ingests federal contract awards across all agencies. Companies are scored by contract volume, agency diversity, and recency.

**Every lead passes through the same 6-step Inngest pipeline:**

```
Context Gate 1 → Detective → Context Gate 2 → Salesman → Export Queue → Deliver
```

- **Gate 1** — staleness check, competitor filter, initial AI fit score. Drops weak fits before spending resources on research.
- **Detective** — web research to extract company profile, decision maker name/title/LinkedIn.
- **Gate 2** — full re-score with the complete profile. Second chance to filter.
- **Salesman** — generates 5 pitch variants (cold email, LinkedIn, follow-up, text, executive brief) plus a standalone personalized intro line.
- **Export Queue** — stages leads for CSV download with: `first_name, last_name, personalized_intro, company_name, linkedin_url, source, industry`.
- **Deliver** — optional email/Slack/Teams notification per completed lead.

## Stack

- **Next.js 15** — App Router, TypeScript
- **Neon Postgres + Drizzle ORM** — single source of truth for all companies, contracts, leads, and config
- **Inngest v3** — durable per-lead enrichment with step-level retries and concurrency limits
- **Anthropic Claude Sonnet 4.6** — scoring, research synthesis, pitch generation
- **Serper.dev** — news and web search
- **USASpending.gov API** — federal contract ingestion
- **Resend** — optional email delivery

## Setup

### 1. Clone and install

```bash
git clone https://github.com/ecj15-bro/SuperScraper.git
cd SuperScraper
npm install
```

### 2. Configure environment

```bash
cp .env.local.example .env.local
```

Open `.env.local` and fill in:

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | Neon Postgres connection string |
| `ANTHROPIC_API_KEY` | Yes | Anthropic API key |
| `SERPER_API_KEY` | Yes | Serper.dev API key |
| `INNGEST_EVENT_KEY` | Yes | From Inngest dashboard |
| `INNGEST_SIGNING_KEY` | Yes | From Inngest dashboard |
| `CRON_SECRET` | Yes | Any random string — protects cron endpoints |
| `RESEND_API_KEY` | No | For email delivery |
| `RESEND_FROM_EMAIL` | No | Sender address |
| `RESEND_TO_EMAIL` | No | Recipient address |
| `SLACK_WEBHOOK_URL` | No | Slack incoming webhook |
| `TEAMS_WEBHOOK_URL` | No | Teams incoming webhook |
| `NEWS_MAX_AGE_DAYS` | No | Max age for news articles (default: 30) |
| `MAX_ENRICHMENT_AGE_DAYS` | No | Skip stale companies older than this (default: 180) |

### 3. Push the database schema

```bash
npm run db:push
```

### 4. Seed default verticals

```bash
npm run seed
```

### 5. Run the dev server

```bash
npm run dev
```

### 6. Configure your business profile

1. Open [http://localhost:3000/settings](http://localhost:3000/settings)
2. Fill in the **Business Profile** tab — what you sell, who buys it, why they choose you
3. Click **Generate Watchtower Config** — this uses AI to generate search queries, competitor detection rules, and scoring criteria from your profile

### 7. Connect Inngest

Run the Inngest dev server alongside Next.js so the enrichment pipeline can execute locally:

```bash
npx inngest-cli@latest dev
```

Inngest will automatically connect to `http://localhost:3000/api/inngest`.

### 8. Run the pipeline

Go to [http://localhost:3000](http://localhost:3000) and click **Run Now**. Watchtower scans news, qualified companies get enqueued, and Inngest processes each lead through the full pipeline asynchronously.

## Exporting leads

When leads are ready, a badge on the dashboard shows the count. Click **Export CSV** to download and clear the queue. The CSV is compatible with Instantly, Apollo, and any outreach tool that accepts contact lists.

## Cron schedules (Vercel)

| Cron | Schedule | What it does |
|---|---|---|
| `/api/cron/ingest` | Every 30 min | Pulls new federal contract awards |
| `/api/cron/classify` | Every 30 min | Classifies unclassified contracts into verticals |
| `/api/cron/score` | Hourly | Scores companies and enqueues high-scorers |
| `/api/cron/refresh-knowledge` | Daily 8am | Refreshes market intelligence knowledge base |
| `/api/cron/watchtower` | Daily 9am | Runs news search and enqueues leads |
| `/api/cron/alerts` | Daily 11am | Dispatches pending Slack/Teams alerts |
| `/api/cron/discovery` | Weekly Sunday 3am | Token analysis for emerging verticals |

All cron endpoints require `Authorization: Bearer <CRON_SECRET>`.

## Scripts

```bash
npm run seed      # Seed 8 default industry verticals
npm run backfill  # Re-enqueue high-scoring companies that were never enriched
npm run db:studio # Open Drizzle Studio to browse the database
```

## Deployment

Deploy to Vercel. Set all environment variables in the Vercel project settings. The `vercel.json` cron config is already in place.

```bash
vercel deploy
```
