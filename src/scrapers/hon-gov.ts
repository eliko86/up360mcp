/**
 * Israeli Capital Markets Authority (רשות שוק ההון) scraper.
 * Fetches regulatory circulars and updates from hon.gov.il
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import { cache, TTL, rateLimitWait } from '../cache';
import { RegulatoryUpdate } from '../types';

const BASE_URL = 'https://www.hon.gov.il';
const USER_AGENT = 'UP360-MCP/1.0';

// Categories for regulatory updates
const CATEGORIES: Record<string, string> = {
  'insurance': 'ביטוח',
  'pension': 'פנסיה',
  'provident': 'גמל',
  'capital': 'שוק הון',
  'all': '',
};

export async function getRegulatoryUpdates(
  category?: string,
  daysBack: number = 90,
  keywords?: string[]
): Promise<{ updates: RegulatoryUpdate[]; warnings: string[] }> {
  const cacheKey = `hon:updates:${category}:${daysBack}:${(keywords || []).join(',')}`;
  const cached = cache.get<{ updates: RegulatoryUpdate[]; warnings: string[] }>(cacheKey);
  if (cached) return cached;

  const updates: RegulatoryUpdate[] = [];
  const warnings: string[] = [];

  try {
    await rateLimitWait('www.hon.gov.il');

    // Try circulars list page
    const response = await axios.get(`${BASE_URL}/Information/HozrimList/`, {
      headers: { 'User-Agent': USER_AGENT },
      timeout: 15000,
    });

    const $ = cheerio.load(response.data);

    // Parse circular table rows
    $('table tr, .circular-item, .list-item, [class*="circular"]').each((_, el) => {
      const cells = $(el).find('td, .cell, span');
      if (cells.length < 2) return;

      const number = cells.eq(0).text().trim();
      const title = cells.eq(1).text().trim() || $(el).find('a').first().text().trim();
      const dateText = cells.eq(2)?.text().trim() || '';
      const link = $(el).find('a').attr('href') || '';
      const categoryText = cells.eq(3)?.text().trim() || '';

      if (!title || title.length < 5) return;

      // Filter by category
      if (category && category !== 'all') {
        const categoryHebrew = CATEGORIES[category] || category;
        if (!categoryText.includes(categoryHebrew) && !title.includes(categoryHebrew)) return;
      }

      // Filter by keywords
      if (keywords?.length) {
        const text = `${title} ${categoryText}`;
        if (!keywords.some(kw => text.includes(kw))) return;
      }

      updates.push({
        circularNumber: number,
        title,
        date: dateText,
        category: categoryText || (category ? CATEGORIES[category] : 'כללי'),
        pdfUrl: link.startsWith('http') ? link : (link ? `${BASE_URL}${link}` : undefined),
      });
    });

  } catch (err: any) {
    warnings.push(`hon.gov.il scrape failed: ${err.message}`);

    // Provide known recent regulatory context
    updates.push(
      { circularNumber: 'info', title: 'רשות שוק ההון - עדכונים אחרונים', date: '', category: 'מידע', summary: 'לא הצלחנו לגשת לאתר רשות שוק ההון. ניתן לבדוק ישירות ב-hon.gov.il' },
    );
  }

  const result = { updates: updates.slice(0, 50), warnings };
  cache.set(cacheKey, result, TTL.REGULATORY);
  return result;
}
