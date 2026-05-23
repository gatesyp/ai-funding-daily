import { NextRequest, NextResponse } from 'next/server';
import { runIngest } from '@/lib/ingest';

export const runtime = 'nodejs'; // ensure node for now

function isVercelCron(req: NextRequest): boolean {
  const ua = req.headers.get('user-agent') || '';
  return ua.includes('Vercel-Cron') || ua.includes('vercel');
}

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-ingest-secret') || req.nextUrl.searchParams.get('secret');
  const needsAuth = !!process.env.INGEST_SECRET;
  const authorized = !needsAuth || secret === process.env.INGEST_SECRET || isVercelCron(req);

  if (!authorized) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    const result = await runIngest();
    return NextResponse.json({
      ok: true,
      ...result,
      message: result.newRounds > 0
        ? `${result.newRounds} new AI funding rounds detected and stored`
        : 'No new rounds since last ingest',
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message || String(e) }, { status: 500 });
  }
}

// Also allow GET for manual browser test (still requires secret)
export async function GET(req: NextRequest) {
  return POST(req);
}
