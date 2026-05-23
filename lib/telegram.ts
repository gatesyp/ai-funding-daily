import { Bot } from 'grammy';

let bot: Bot | null = null;

function getBot(): Bot {
  if (!bot) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) throw new Error('TELEGRAM_BOT_TOKEN not set');
    bot = new Bot(token);
  }
  return bot;
}

export interface PostableRound {
  companyName: string;
  roundType: string;
  amountText: string | null;
  aifundingUrl: string;
  sourceUrl?: string;
  description?: string; // if we had one
  investors?: string;
}

export async function postNewRounds(rounds: PostableRound[]): Promise<{ sent: number; errors: string[] }> {
  const bot = getBot();
  const channelId = process.env.TELEGRAM_CHANNEL_ID;
  if (!channelId) throw new Error('TELEGRAM_CHANNEL_ID not set');

  const errors: string[] = [];
  let sent = 0;

  for (const r of rounds) {
    const amount = r.amountText || 'Undisclosed';
    const type = r.roundType || 'round';
    const text =
      `🧠 New AI Funding\n\n` +
      `${r.companyName} — ${amount} ${type}\n\n` +
      (r.description ? `${r.description}\n\n` : '') +
      (r.investors ? `Lead: ${r.investors}\n` : '') +
      `aifunding.me: ${r.aifundingUrl}\n` +
      (r.sourceUrl && r.sourceUrl !== r.aifundingUrl ? `Source: ${r.sourceUrl}\n` : '');

    try {
      await bot.api.sendMessage(channelId, text, {
        link_preview_options: { is_disabled: false },
        parse_mode: 'HTML',
      });
      sent++;
      // small delay to avoid flood
      await new Promise((res) => setTimeout(res, 800));
    } catch (e: any) {
      errors.push(`${r.companyName}: ${e.message || e}`);
    }
  }

  return { sent, errors };
}

export async function testTelegramConnection(): Promise<{ ok: boolean; me?: string; error?: string }> {
  try {
    const b = getBot();
    const me = await b.api.getMe();
    return { ok: true, me: `${me.username} (${me.first_name})` };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
}
