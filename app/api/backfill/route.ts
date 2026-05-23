import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { fundingRounds, companies } from '@/db/schema';
import { desc, eq } from 'drizzle-orm';
import { postNewRounds } from '@/lib/telegram';
import { enrichFromCompanyPage } from '@/lib/scraper';

export const runtime = 'nodejs';

function formatAmount(amount: string | null): string | null {
  if (!amount) return null;
  const num = parseFloat(amount);
  if (isNaN(num)) return null;

  if (num >= 1_000_000_000) {
    return '$' + (num / 1_000_000_000).toFixed(1).replace(/\.0$/, '') + 'B';
  }
  if (num >= 1_000_000) {
    return '$' + (num / 1_000_000).toFixed(0) + 'M';
  }
  if (num >= 1_000) {
    return '$' + (num / 1_000).toFixed(0) + 'K';
  }
  return '$' + num.toLocaleString();
}

export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-ingest-secret') || req.nextUrl.searchParams.get('secret');
  if (secret !== process.env.INGEST_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') || '30'), 100);

  // Get the most recently inserted real rounds (these represent recent activity snapshot)
  const rows = await db
    .select({
      companyName: companies.name,
      slug: companies.slug,
      roundType: fundingRounds.roundType,
      amountUsd: fundingRounds.amountUsd,
      aifundingUrl: companies.aifundingUrl,
    })
    .from(fundingRounds)
    .leftJoin(companies, eq(fundingRounds.companyId, companies.id))
    .orderBy(desc(fundingRounds.id))
    .limit(limit);

  // Enrich the batch with description + lead investors (one extra fetch per company, done only for backfills)
  const postable: any[] = [];
  for (const r of rows as any[]) {
    const base = {
      companyName: r.companyName || 'Unknown',
      roundType: r.roundType || 'round',
      amountText: formatAmount(r.amountUsd),
      aifundingUrl: r.aifundingUrl || `https://aifunding.me/companies/${r.slug}`,
    };

    // Try to get rich data
    const enriched = await enrichFromCompanyPage(r.slug);
    if (enriched.description) (base as any).description = enriched.description;
    if (enriched.leadInvestors) (base as any).investors = enriched.leadInvestors;
    if (enriched.roundSourceUrl) (base as any).sourceUrl = enriched.roundSourceUrl;

    postable.push(base);

    // Polite delay between company page fetches
    await new Promise((res) => setTimeout(res, 600));
  }

  const result = await postNewRounds(postable as any);

  return NextResponse.json({
    ok: true,
    requested: limit,
    attempted: postable.length,
    sent: result.sent,
    errors: result.errors.length ? result.errors.slice(0, 5) : [],
    message: `Backfilled ${result.sent} real AI funding rounds from the recent snapshot to your channel.`,
  });
}
