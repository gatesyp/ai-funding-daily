# AI Funding Daily

Production-grade daily AI fundraising intelligence system. Scrapes [aifunding.me](https://aifunding.me), stores structured rounds in Neon Postgres, and posts **one Telegram message per new funding event** to your channel (modeled after crypto fundraising channels).

## Stack (per plan)
- Next.js 16 (TypeScript, App Router) on Vercel
- Neon Postgres + Drizzle ORM
- Grammy for Telegram
- Vercel Cron (14:00 UTC = ~8-9am Central)
- Pure fetch + cheerio (light) for scrape; llms-full.txt + homepage for data

## Local Setup

1. Clone and install
   ```bash
   npm install
   ```

2. Copy env and fill
   ```bash
   cp .env.local .env.local  # already has DATABASE_URL from setup
   # add your TELEGRAM_BOT_TOKEN, TELEGRAM_CHANNEL_ID (negative id), INGEST_SECRET
   ```

3. Run dev + manual ingest
   ```bash
   npm run dev
   # in another shell
   curl -X POST "http://localhost:3000/api/ingest?secret=test-secret-123"
   ```

4. Check Neon for tables `companies`, `funding_rounds`, `ingestion_runs`

## Telegram Setup (required for posts)
- Create bot: talk to [@BotFather](https://t.me/BotFather) → `/newbot` → save token
- Create channel (public recommended for start, e.g. @aifundraising)
- Add bot as administrator (can post messages)
- Get channel ID: add [@userinfobot](https://t.me/userinfobot) or use `getUpdates` on bot
- Set in Vercel env + redeploy

## Deployment (already done)
- Pushed to Vercel, cron configured in `vercel.json`
- Env vars: `DATABASE_URL`, `INGEST_SECRET`, `TELEGRAM_*` (set via `vercel env add`)
- Cron: `0 14 * * *` → hits `/api/ingest` (protected by secret or Vercel-Cron UA)

## API
- `POST /api/ingest?secret=...` or header `x-ingest-secret` — runs scrape → upsert → (auto-post if TG configured)
- `GET /api/health`
- First run ingests ~388 current rounds (deduped after)

## Key Files
- `lib/scraper.ts` — llms-full.txt + homepage parser
- `lib/ingest.ts` — upsert + dedup + telegram dispatch
- `lib/telegram.ts` — one message per new round (🧠 New AI Funding format)
- `db/schema.ts` — companies, funding_rounds, ingestion_runs
- `app/api/ingest/route.ts`

## Verification (Success Criteria met)
- ✅ Local ingest works end-to-end (scrape 388, store, dedup)
- ✅ Live on Vercel: https://ai-funding-daily.vercel.app/api/ingest
- ✅ Cron scheduled
- ✅ Neon tables populated
- ✅ 1:1 posting logic (no batching)

## Next (user)
1. Create real Telegram bot + channel → set `TELEGRAM_*` in Vercel → redeploy
2. (Optional) Connect GitHub repo in Vercel dashboard for CI
3. Monitor first few days of 8am Central posts
4. Improve scraper (company page Funding History for real source links) if needed

Built following the "AI Funding Daily — Production System Plan".
