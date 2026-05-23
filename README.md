# AI Funding Daily

Production-grade daily AI fundraising intelligence system.

The system automatically scrapes [aifunding.me](https://aifunding.me), stores structured funding rounds in Neon Postgres, and posts **one clean Telegram message per new funding event** to a channel (modeled after successful crypto fundraising channels).

## What it does

- Daily scrape of AI funding activity
- Deduplicated storage of rounds + companies
- One individual Telegram message per new round (no batching)
- Optional backfill for historical data
- Fully automated via Vercel Cron

## Tech Stack

- **Next.js 16** (TypeScript, App Router)
- **Neon Postgres** + **Drizzle ORM**
- **Grammy** (Telegram bot framework)
- **Vercel** (hosting + Cron jobs at 14:00 UTC)
- Lightweight scraping (fetch + cheerio on `llms-full.txt` + homepage)

---

## Local Development Setup

### 1. Clone and install

```bash
git clone https://github.com/gatesyp/ai-funding-daily.git
cd ai-funding-daily
npm install
```

### 2. Environment Variables

Create a `.env.local` file with the following variables:

```env
# Neon Database (required)
DATABASE_URL="postgresql://..."

# Telegram (required for posting)
TELEGRAM_BOT_TOKEN="123456:ABC-..."
TELEGRAM_CHANNEL_ID="-1003920707625"

# Security (protects the ingest endpoint)
INGEST_SECRET="your-long-random-string-here"
```

#### How to get each value:

**DATABASE_URL**
- Log into [Neon](https://neon.tech)
- Copy the connection string for your project

**TELEGRAM_BOT_TOKEN**
1. Open Telegram and talk to [@BotFather](https://t.me/BotFather)
2. Send `/newbot`
3. Follow the prompts and copy the token

**TELEGRAM_CHANNEL_ID**
1. Create (or use) your target channel
2. Add your bot as an **Administrator** with "Post Messages" permission
3. Forward any message from the channel to [@userinfobot](https://t.me/userinfobot)
4. It will reply with the correct ID (starts with `-100...`)

**INGEST_SECRET**
- Generate any long random string (used to protect the `/api/ingest` endpoint)

### 3. Run locally

```bash
npm run dev
```

The app will be available at http://localhost:3000

### 4. Test the system locally

Trigger a manual scrape + post:

```bash
# Basic ingest (scrape + store + post new rounds)
curl -X POST "http://localhost:3000/api/ingest?secret=YOUR_INGEST_SECRET"
```

Backfill recent historical data (useful when first setting up):

```bash
# Post the last 25 rounds as individual messages
curl "http://localhost:3000/api/backfill?limit=25&secret=YOUR_INGEST_SECRET"
```

Test Telegram connection only:

```bash
curl "http://localhost:3000/api/test-telegram?secret=YOUR_INGEST_SECRET"
```

Health check:

```bash
curl http://localhost:3000/api/health
```

---

## Project Structure

```
app/
├── api/
│   ├── backfill/      # Force-post historical rounds (rich format)
│   ├── health/
│   ├── ingest/        # Main daily job (scrape + store + post)
│   └── test-telegram/
├── layout.tsx
└── page.tsx

lib/
├── db.ts              # Neon + Drizzle client
├── ingest.ts          # Core logic (scrape → dedupe → insert)
├── scraper.ts         # aifunding.me parsing + company page enrichment
└── telegram.ts        # Message formatting + sending via Grammy

db/
└── schema.ts          # companies, funding_rounds, ingestion_runs

vercel.json            # Cron configuration (runs at 14:00 UTC)
```

---

## Deployment (Vercel + GitHub)

The project is already set up for Vercel.

### Environment Variables on Vercel

Make sure these are set in your Vercel project (Production + Preview):

- `DATABASE_URL`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHANNEL_ID`
- `INGEST_SECRET`

You can add them via the Vercel dashboard or CLI:

```bash
vercel env add DATABASE_URL production
vercel env add TELEGRAM_BOT_TOKEN production
vercel env add TELEGRAM_CHANNEL_ID production
vercel env add INGEST_SECRET production
```

### Cron Job

Defined in `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/ingest",
      "schedule": "0 14 * * *"
    }
  ]
}
```

This runs every day at **14:00 UTC** (~8–9 AM Central Time).

---

## API Endpoints

| Endpoint                        | Description                                      | Auth                  |
|--------------------------------|--------------------------------------------------|-----------------------|
| `POST /api/ingest`             | Full scrape + store + post new rounds            | `?secret=` or header  |
| `GET /api/backfill?limit=30`   | Force post recent/historical rounds (enriched)   | `?secret=`            |
| `GET /api/test-telegram`       | Send a test message to verify bot + channel      | `?secret=`            |
| `GET /api/health`              | Basic health check                               | None                  |

All protected endpoints accept the secret via query parameter or `x-ingest-secret` header.

---

## Important Notes

- The system only posts **new** rounds it hasn't seen before (deduplication is based on company + round type + amount).
- When enriching messages, it visits individual company pages to pull the one-sentence description and lead investors.
- Some rounds legitimately have "Investors not disclosed" on aifunding.me.
- The default test secret used during development was `test-secret-123` — **change this** for production.

---

Built following the original "AI Funding Daily — Production System Plan".
