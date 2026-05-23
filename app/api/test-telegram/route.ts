import { NextRequest, NextResponse } from 'next/server';
import { postNewRounds, testTelegramConnection } from '@/lib/telegram';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-ingest-secret') || req.nextUrl.searchParams.get('secret');
  if (secret !== process.env.INGEST_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const conn = await testTelegramConnection();
  if (!conn.ok) {
    return NextResponse.json({ ok: false, connection: conn });
  }

  const testRound = [{
    companyName: 'Funding Bot Test',
    roundType: 'Seed',
    amountText: '$1 (test)',
    aifundingUrl: 'https://aifunding.me',
    sourceUrl: 'https://aifunding.me',
    description: 'This confirms your Telegram bot + channel wiring is working. Delete this message if desired.'
  }];

  const postRes = await postNewRounds(testRound as any);

  return NextResponse.json({
    ok: true,
    connection: conn,
    postResult: postRes,
    message: 'Check your Telegram channel for the test post (one message per round format).'
  });
}
