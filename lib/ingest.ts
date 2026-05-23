import { db } from './db';
import { companies, fundingRounds, ingestionRuns, NewCompany, NewFundingRound } from '../db/schema';
import { scrapeAifunding, ScrapedRound } from './scraper';
import { postNewRounds } from './telegram';
import { eq, and, isNull } from 'drizzle-orm';

export interface IngestResult {
  runId: string;
  dealsFound: number;
  newRounds: number;
  newRoundDetails: Array<{
    companyName: string;
    roundType: string;
    amountText: string | null;
    aifundingUrl: string;
  }>;
  errors: string[];
  posted?: number;
}

export async function runIngest(): Promise<IngestResult> {
  const startedAt = new Date();
  const run = await db
    .insert(ingestionRuns)
    .values({ startedAt, source: 'aifunding.me' })
    .returning({ id: ingestionRuns.id });

  const runId = run[0].id;

  const scrape = await scrapeAifunding();
  const errors = [...scrape.errors];
  let dealsFound = scrape.rounds.length;
  let newRounds = 0;
  const newRoundDetails: IngestResult['newRoundDetails'] = [];

  for (const r of scrape.rounds) {
    try {
      // 1. Upsert company
      const [company] = await db
        .insert(companies)
        .values({
          slug: r.slug,
          name: r.companyName,
          aifundingUrl: r.aifundingUrl,
          lastSyncedAt: new Date(),
        } as NewCompany)
        .onConflictDoUpdate({
          target: companies.slug,
          set: {
            name: r.companyName,
            aifundingUrl: r.aifundingUrl,
            lastSyncedAt: new Date(),
          },
        })
        .returning({ id: companies.id });

      if (!company) continue;

      // 2. Check if this round already exists (dedup by company + roundType + amount if present)
      const existing = await db
        .select({ id: fundingRounds.id })
        .from(fundingRounds)
        .where(
          and(
            eq(fundingRounds.companyId, company.id),
            eq(fundingRounds.roundType, r.roundType),
            r.amountUsd !== null
              ? eq(fundingRounds.amountUsd, r.amountUsd.toString())
              : isNull(fundingRounds.amountUsd)
          )
        )
        .limit(1);

      if (existing.length > 0) continue; // already have this round

      // 3. Insert new round
      const newRound: NewFundingRound = {
        companyId: company.id,
        roundType: r.roundType,
        amountUsd: r.amountUsd !== null ? r.amountUsd.toString() : null,
        announcedDate: new Date().toISOString().split('T')[0], // today as proxy since source doesn't give per-round date
        sourceUrl: r.sourceUrl,
        rawData: {
          scraped: r,
          ingestedFrom: 'llms-full.txt + homepage',
        },
        ingestedAt: new Date(),
      };

      await db.insert(fundingRounds).values(newRound);

      newRounds++;
      newRoundDetails.push({
        companyName: r.companyName,
        roundType: r.roundType,
        amountText: r.amountText,
        aifundingUrl: r.aifundingUrl,
      });
    } catch (e: any) {
      errors.push(`row ${r.slug}: ${e.message}`);
    }
  }

  // Post new rounds to Telegram (one message per new record, as required)
  let posted = 0;
  let postErrors: string[] = [];
  if (newRoundDetails.length > 0 && process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHANNEL_ID) {
    try {
      const postRes = await postNewRounds(
        newRoundDetails.map((d) => ({
          companyName: d.companyName,
          roundType: d.roundType,
          amountText: d.amountText,
          aifundingUrl: d.aifundingUrl,
        }))
      );
      posted = postRes.sent;
      postErrors = postRes.errors;
      if (postErrors.length) errors.push(...postErrors.map((e) => `telegram: ${e}`));
    } catch (e: any) {
      errors.push(`telegram post failed: ${e.message}`);
    }
  } else if (newRoundDetails.length > 0) {
    errors.push('telegram not configured (TELEGRAM_BOT_TOKEN / CHANNEL_ID) — skipping posts');
  }

  const finishedAt = new Date();
  await db
    .update(ingestionRuns)
    .set({
      finishedAt,
      dealsFound,
      newRounds,
      errors: errors.length ? errors.join('\n') : null,
    })
    .where(eq(ingestionRuns.id, runId));

  return { runId, dealsFound, newRounds, newRoundDetails, errors, posted };
}
