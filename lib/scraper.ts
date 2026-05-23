import * as cheerio from 'cheerio';

export interface ScrapedRound {
  companyName: string;
  slug: string;
  aifundingUrl: string;
  roundType: string;
  amountText: string | null;
  amountUsd: number | null;
  valuationText?: string;
  sector?: string;
  sourceUrl: string; // citation, falls back to aifunding company page
  rawLine: string;
}

export interface ScrapeResult {
  rounds: ScrapedRound[];
  companies: { name: string; slug: string; url: string; latestRaw: string }[];
  errors: string[];
}

const AMOUNT_REGEX = /\$?([\d.]+)\s*([BMK])?/i;
const ROUND_REGEX = /(Seed|Series [A-Z]|Undisclosed|Convertible|growth|Debt|Non-dilutive|Token|Series [A-Z] \+)/i;

function parseAmount(text: string | null): { text: string | null; value: number | null } {
  if (!text) return { text: null, value: null };
  const m = text.match(AMOUNT_REGEX);
  if (!m) return { text, value: null };
  const num = parseFloat(m[1]);
  const unit = (m[2] || '').toUpperCase();
  let val = num;
  if (unit === 'B') val *= 1e9;
  else if (unit === 'M') val *= 1e6;
  else if (unit === 'K') val *= 1e3;
  return { text: text.trim(), value: Math.round(val) };
}

function parseRoundType(text: string): string {
  const m = text.match(ROUND_REGEX);
  if (m) return m[0].trim();
  if (/undisclosed/i.test(text)) return 'undisclosed';
  return 'unknown';
}

export async function scrapeAifunding(): Promise<ScrapeResult> {
  const result: ScrapeResult = { rounds: [], companies: [], errors: [] };
  try {
    // Primary: llms-full.txt for current state (reliable text)
    const llmsRes = await fetch('https://aifunding.me/llms-full.txt', {
      headers: { 'User-Agent': 'ai-funding-daily-bot/0.1 (contact: your@email)' },
    });
    if (!llmsRes.ok) throw new Error(`llms fetch ${llmsRes.status}`);
    const llmsText = await llmsRes.text();

    // Parse company profiles with "latest:"
    const companyLines = llmsText
      .split('\n')
      .filter((l) => l.includes('latest:') && l.includes('/companies/'));

    for (const line of companyLines) {
      // - [Name](url): ... latest: Round $X, ...
      const linkMatch = line.match(/\[(.*?)\]\((https?:\/\/aifunding\.me\/companies\/([^)]+))\)/);
      if (!linkMatch) continue;
      const name = linkMatch[1].trim();
      const url = linkMatch[2];
      const slug = linkMatch[3].split(/[\?#]/)[0];

      const latestMatch = line.match(/latest:\s*([^,]+(?:,\s*[^,]+)*?)(?:,\s*total raised:|$)/i);
      const latestRaw = latestMatch ? latestMatch[1].trim() : '';

      const amountMatch = latestRaw.match(/\$[\d.]+[BMK]?/i);
      const amountText = amountMatch ? amountMatch[0] : null;
      const { value: amountUsd } = parseAmount(amountText);

      const roundType = parseRoundType(latestRaw);

      result.companies.push({ name, slug, url, latestRaw });

      if (latestRaw) {
        result.rounds.push({
          companyName: name,
          slug,
          aifundingUrl: url,
          roundType,
          amountText,
          amountUsd,
          sourceUrl: url, // fallback citation to aifunding page (they link originals)
          rawLine: line,
        });
      }
    }

    // Secondary: try to enrich from homepage Latest Deals for fresher signals (DOM text)
    try {
      const homeRes = await fetch('https://aifunding.me/', {
        headers: { 'User-Agent': 'ai-funding-daily-bot/0.1' },
      });
      const homeHtml = await homeRes.text();
      const $ = cheerio.load(homeHtml);

      // Collect slugs mentioned near Latest Deals
      const latestSlugs = new Set<string>();
      let capture = false;
      $('h1, h2, h3, a, p, div').each((_, el) => {
        const t = $(el).text().trim();
        if (/^Latest Deals$/i.test(t)) capture = true;
        if (capture && /Latest Insights/i.test(t)) capture = false;
        if (capture) {
          const href = $(el).attr('href') || '';
          if (href.includes('/companies/')) {
            const s = href.split('/companies/')[1]?.split(/[\?/#]/)[0];
            if (s) latestSlugs.add(s);
          }
        }
      });
      // If we found fresh slugs not in main list, we could fetch their pages, but for v1 skip extra calls
      if (latestSlugs.size > 0) {
        // could cross-reference or add as candidates
      }
    } catch (e: any) {
      result.errors.push('homepage enrichment failed: ' + e.message);
    }
  } catch (e: any) {
    result.errors.push(e.message || String(e));
  }
  return result;
}

export default scrapeAifunding;

/**
 * Deep enrichment: visit a company page and extract a clean one-sentence description
 * plus lead investors / funding details for the most recent round.
 * Used for high-quality Telegram posts (daily new rounds + backfills).
 */
export async function enrichFromCompanyPage(slug: string): Promise<{
  description?: string;
  leadInvestors?: string;
  roundSourceUrl?: string;
}> {
  try {
    const res = await fetch(`https://aifunding.me/companies/${slug}`, {
      headers: { "User-Agent": "ai-funding-daily-bot/0.1" },
    });
    if (!res.ok) return {};

    const html = await res.text();
    const $ = cheerio.load(html);

    let description = "";
    let leadInvestors = "Investors not disclosed";

    // 1. Best description: from Organization JSON-LD (clean, authoritative)
    $("script[type=\"application/ld+json\"]").each((_, s) => {
      try {
        const data = JSON.parse($(s).html() || "{}");
        if (data["@type"] === "Organization" && data.description && !description) {
          description = data.description.trim();
        }
      } catch {}
    });

    // Fallback description from visible Overview text
    if (!description) {
      const overview = $("body").text().match(/Overview\s+([^\n]{80,280})/i);
      if (overview) description = overview[1].trim();
    }

    // 2. Investors from Funding History section (text blob after "Funding History")
    const bodyText = $("body").text().replace(/\s+/g, " ");
    const fh = bodyText.match(/Funding History[\s\S]{0,600}?((?:Lead|Investors?)[:\s][^S]+|Investors not disclosed)/i);
    if (fh && fh[1]) {
      let inv = fh[1]
        .replace(/Source.*/i, "")
        .replace(/Valuation.*/i, "")
        .replace(/Cumulative.*/i, "")
        .trim();

      if (inv && !/not disclosed/i.test(inv)) {
        // Clean up common patterns
        inv = inv.replace(/^investors include\s*/i, "").replace(/,\s*and\s+/i, " + ");
        leadInvestors = inv;
      }
    }

    // 3. Try to find a direct source link in the Funding History area
    let roundSourceUrl: string | undefined;
    const sourceLink = $("a[href*='http']").filter((_, a) => /businessinsider|techcrunch|forbes|venturebeat|bloomberg/i.test($(a).attr("href") || "")).first();
    if (sourceLink.length) roundSourceUrl = sourceLink.attr("href");

    return {
      description: description ? description.slice(0, 280) : undefined,
      leadInvestors: leadInvestors !== "Investors not disclosed" ? leadInvestors : undefined,
      roundSourceUrl,
    };
  } catch (e) {
    return {};
  }
}
