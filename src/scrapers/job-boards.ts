/**
 * Israeli job board scraper for hiring signals.
 * Sources: AllJobs, Drushim
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import { cache, TTL, rateLimitWait } from '../cache';
import { HiringSignal } from '../types';

const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// AllJobs area codes
const ALLJOBS_AREAS: Record<string, string> = {
  'מרכז': '1',
  'תל אביב': '2',
  'חיפה': '3',
  'צפון': '3',
  'דרום': '4',
  'ירושלים': '5',
  'שרון': '7',
  'center': '1',
  'tel_aviv': '2',
  'haifa': '3',
  'north': '3',
  'south': '4',
  'jerusalem': '5',
  'sharon': '7',
};

// Insurance-relevant job keywords
const INSURANCE_JOB_KEYWORDS = [
  'ביטוח', 'פנסיה', 'פיננסים', 'אקטואר', 'חיתום', 'תביעות',
  'HR', 'משאבי אנוש', 'רווחה', 'כספים', 'CFO', 'CEO',
];

async function scrapeAllJobs(
  keyword: string,
  areaCode?: string
): Promise<{ companies: Map<string, { count: number; roles: string[] }>; warning?: string }> {
  const companies = new Map<string, { count: number; roles: string[] }>();

  try {
    await rateLimitWait('www.alljobs.co.il');
    const params: Record<string, string> = { page: '1', position: keyword };
    if (areaCode) params.area = areaCode;

    const url = `https://www.alljobs.co.il/SearchResultsGuest.aspx`;
    const response = await axios.get(url, {
      params,
      headers: { 'User-Agent': USER_AGENT },
      timeout: 15000,
    });

    const $ = cheerio.load(response.data);

    // Parse job listings
    $('[class*="job-content"], [class*="card-content"], .open-board-list li, .job-item').each((_, el) => {
      const companyName = $(el).find('[class*="company"], .T14, .company-name').first().text().trim();
      const role = $(el).find('[class*="title"], .H06, .job-title, h2, h3').first().text().trim();

      if (companyName && companyName.length > 1) {
        const existing = companies.get(companyName) || { count: 0, roles: [] };
        existing.count++;
        if (role && !existing.roles.includes(role)) existing.roles.push(role);
        companies.set(companyName, existing);
      }
    });

    return { companies };
  } catch (err: any) {
    return { companies, warning: `AllJobs scrape failed for "${keyword}": ${err.message}` };
  }
}

async function scrapeDrushim(
  keyword: string
): Promise<{ companies: Map<string, { count: number; roles: string[] }>; warning?: string }> {
  const companies = new Map<string, { count: number; roles: string[] }>();

  try {
    await rateLimitWait('www.drushim.co.il');
    const url = `https://www.drushim.co.il/jobs/search/${encodeURIComponent(keyword)}/`;
    const response = await axios.get(url, {
      headers: { 'User-Agent': USER_AGENT },
      timeout: 15000,
    });

    const $ = cheerio.load(response.data);

    $('[class*="job-item"], .job-card, .search-result-item, li[class*="result"]').each((_, el) => {
      const companyName = $(el).find('[class*="company"], .employer-name, [class*="employer"]').first().text().trim();
      const role = $(el).find('[class*="title"], .position-name, h2, h3').first().text().trim();

      if (companyName && companyName.length > 1) {
        const existing = companies.get(companyName) || { count: 0, roles: [] };
        existing.count++;
        if (role && !existing.roles.includes(role)) existing.roles.push(role);
        companies.set(companyName, existing);
      }
    });

    return { companies };
  } catch (err: any) {
    return { companies, warning: `Drushim scrape failed for "${keyword}": ${err.message}` };
  }
}

export async function scanHiringSignals(
  sector?: string,
  region?: string,
  minPositions: number = 3,
  keywords?: string[]
): Promise<{ signals: HiringSignal[]; warnings: string[] }> {
  const cacheKey = `hiring:${sector}:${region}:${minPositions}:${(keywords || []).join(',')}`;
  const cached = cache.get<{ signals: HiringSignal[]; warnings: string[] }>(cacheKey);
  if (cached) return cached;

  const warnings: string[] = [];
  const companyMap = new Map<string, { count: number; roles: string[]; sources: Set<string> }>();
  const searchKeywords = keywords?.length ? keywords : (sector ? [sector] : INSURANCE_JOB_KEYWORDS.slice(0, 5));
  const areaCode = region ? ALLJOBS_AREAS[region] : undefined;

  for (const keyword of searchKeywords) {
    // AllJobs
    const allJobsResult = await scrapeAllJobs(keyword, areaCode);
    if (allJobsResult.warning) warnings.push(allJobsResult.warning);
    for (const [name, data] of allJobsResult.companies) {
      const existing = companyMap.get(name) || { count: 0, roles: [], sources: new Set() };
      existing.count += data.count;
      existing.roles.push(...data.roles.filter(r => !existing.roles.includes(r)));
      existing.sources.add('AllJobs');
      companyMap.set(name, existing);
    }

    // Drushim
    const drushimResult = await scrapeDrushim(keyword);
    if (drushimResult.warning) warnings.push(drushimResult.warning);
    for (const [name, data] of drushimResult.companies) {
      const existing = companyMap.get(name) || { count: 0, roles: [], sources: new Set() };
      existing.count += data.count;
      existing.roles.push(...data.roles.filter(r => !existing.roles.includes(r)));
      existing.sources.add('Drushim');
      companyMap.set(name, existing);
    }
  }

  const signals: HiringSignal[] = [];
  for (const [name, data] of companyMap) {
    if (data.count >= minPositions) {
      signals.push({
        companyName: name,
        openPositions: data.count,
        roles: data.roles.slice(0, 10),
        region: region || undefined,
        growthScore: Math.min(100, data.count * 8 + (data.sources.size > 1 ? 15 : 0)),
        source: [...data.sources].join(', '),
      });
    }
  }

  signals.sort((a, b) => b.openPositions - a.openPositions);

  const result = { signals: signals.slice(0, 50), warnings };
  cache.set(cacheKey, result, TTL.JOBS);
  return result;
}
