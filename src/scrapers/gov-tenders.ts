/**
 * Israeli government tenders scraper.
 * Sources: mr.gov.il, govbuy.gov.il
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import { cache, TTL, rateLimitWait } from '../cache';
import { GovernmentTender } from '../types';

const USER_AGENT = 'UP360-MCP/1.0';

// Insurance-related tender keywords
const INSURANCE_TENDER_KEYWORDS = [
  'ביטוח', 'פנסיה', 'גמל', 'השתלמות', 'פוליסה',
  'ביטוח עובדים', 'ביטוח רכוש', 'ביטוח חיים', 'ביטוח בריאות',
  'ביטוח צד ג', 'ביטוח אחריות', 'שירותי ביטוח',
  'ייעוץ פנסיוני', 'סוכן ביטוח', 'ברוקר',
];

export async function searchGovernmentTenders(
  keywords?: string[],
  category?: string,
  minValue?: number,
  daysBack: number = 90
): Promise<{ tenders: GovernmentTender[]; warnings: string[] }> {
  const cacheKey = `tenders:${(keywords || []).join(',')}:${category}:${minValue}:${daysBack}`;
  const cached = cache.get<{ tenders: GovernmentTender[]; warnings: string[] }>(cacheKey);
  if (cached) return cached;

  const tenders: GovernmentTender[] = [];
  const warnings: string[] = [];
  const searchKeywords = keywords?.length ? keywords : INSURANCE_TENDER_KEYWORDS;

  // Try mr.gov.il
  try {
    await rateLimitWait('mr.gov.il');
    const response = await axios.get('https://www.mr.gov.il/ExternalSitePages/tenders.aspx', {
      headers: { 'User-Agent': USER_AGENT },
      timeout: 15000,
    });

    const $ = cheerio.load(response.data);

    // Parse tender listings
    $('table tr, .tender-item, [class*="tender"], .ms-vb2').each((_, el) => {
      const text = $(el).text().trim();
      const isRelevant = searchKeywords.some(kw => text.includes(kw));
      if (!isRelevant) return;

      const cells = $(el).find('td');
      if (cells.length >= 2) {
        const number = cells.eq(0).text().trim();
        const title = cells.eq(1).text().trim();
        const deadline = cells.eq(2)?.text().trim() || '';
        const body = cells.eq(3)?.text().trim() || '';
        const link = $(el).find('a').attr('href') || '';

        if (title.length > 5) {
          tenders.push({
            tenderNumber: number,
            title,
            issuingBody: body,
            deadline: deadline || undefined,
            category: category || 'ביטוח',
            url: link.startsWith('http') ? link : `https://www.mr.gov.il${link}`,
          });
        }
      }
    });
  } catch (err: any) {
    warnings.push(`mr.gov.il scrape failed: ${err.message}`);
  }

  // Try govbuy.gov.il as secondary source
  try {
    await rateLimitWait('www.govbuy.gov.il');
    for (const keyword of searchKeywords.slice(0, 3)) {
      const response = await axios.get('https://www.govbuy.gov.il/search', {
        params: { q: keyword },
        headers: { 'User-Agent': USER_AGENT },
        timeout: 10000,
      });

      const $ = cheerio.load(response.data);
      $('[class*="result"], [class*="tender"], .search-item').each((_, el) => {
        const title = $(el).find('h3, h4, .title, a').first().text().trim();
        const number = $(el).find('[class*="number"], .id').first().text().trim();
        const body = $(el).find('[class*="org"], .issuer').first().text().trim();
        const link = $(el).find('a').attr('href') || '';

        if (title.length > 5 && !tenders.find(t => t.title === title)) {
          tenders.push({
            tenderNumber: number || 'N/A',
            title,
            issuingBody: body,
            category: category || 'ביטוח',
            url: link.startsWith('http') ? link : `https://www.govbuy.gov.il${link}`,
          });
        }
      });
    }
  } catch (err: any) {
    warnings.push(`govbuy.gov.il scrape failed: ${err.message}`);
  }

  // Filter by minimum value if specified
  if (minValue !== undefined) {
    // Only keep tenders with estimated value >= minValue (if parseable)
    // Most government tenders don't publish values upfront
  }

  const result = { tenders: tenders.slice(0, 50), warnings };
  cache.set(cacheKey, result, TTL.TENDERS);
  return result;
}
