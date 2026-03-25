/**
 * Israeli business news RSS scraper.
 * Sources: Globes, Calcalist, TheMarker
 */

import Parser from 'rss-parser';
import { cache, TTL, rateLimitWait } from '../cache';
import { NewsSignal } from '../types';

const parser = new Parser({
  timeout: 10000,
  headers: { 'User-Agent': 'UP360-MCP/1.0' },
});

const RSS_FEEDS = [
  // Globes
  { url: 'https://www.globes.co.il/webservice/rss/rssfeeder.asmx/FeederV2?iID=585', source: 'גלובס - פיננסים', category: 'finance' },
  { url: 'https://www.globes.co.il/webservice/rss/rssfeeder.asmx/FeederV2?iID=2', source: 'גלובס - עסקים', category: 'business' },
  { url: 'https://www.globes.co.il/webservice/rss/rssfeeder.asmx/FeederV2?iID=4', source: 'גלובס - נדל"ן', category: 'realestate' },
  // Calcalist
  { url: 'https://www.calcalist.co.il/GeneralRSS/0,16335,L-8,00.xml', source: 'כלכליסט - ראשי', category: 'general' },
  { url: 'https://www.calcalist.co.il/GeneralRSS/0,16335,L-22,00.xml', source: 'כלכליסט - נדל"ן', category: 'realestate' },
  { url: 'https://www.calcalist.co.il/GeneralRSS/0,16335,L-12,00.xml', source: 'כלכליסט - פיננסים', category: 'finance' },
  // TheMarker
  { url: 'https://www.themarker.com/cmlink/1.145', source: 'דה מרקר', category: 'general' },
];

// Hebrew signal keywords
const SIGNAL_KEYWORDS: Record<string, string[]> = {
  funding: ['גיוס', 'השקעה', 'הון', 'סבב גיוס', 'משקיעים', 'קרן הון', 'venture'],
  ma: ['מיזוג', 'רכישה', 'עסקת', 'M&A', 'רכש', 'איחוד'],
  expansion: ['התרחבות', 'סניף חדש', 'משרד חדש', 'פתיחת', 'הרחבת', 'כניסה לשוק'],
  ipo: ['הנפקה', 'בורסה', 'IPO', 'הנפקת', 'מניות'],
  regulation: ['רגולציה', 'רשות שוק ההון', 'חוזר', 'תקנות', 'פיקוח', 'רישוי'],
  hiring: ['גיוס עובדים', 'משרות', 'דרושים', 'עובדים חדשים', 'גדילה'],
  awards: ['פרס', 'דירוג', 'הצטיינות', 'מצטיין'],
};

// Insurance-relevant keywords
const INSURANCE_KEYWORDS = [
  'ביטוח', 'פנסיה', 'גמל', 'השתלמות', 'פוליסה', 'תביעה', 'פיצוי',
  'מגדל', 'מנורה', 'פניקס', 'הראל', 'איילון', 'הכשרה', 'שומרה',
  'סוכן ביטוח', 'ברוקר', 'אקטואר', 'חיתום',
  'נדל"ן', 'משכנתא', 'דירה', 'נכס', 'שכירות',
  'עסק', 'חברה', 'סטארטאפ', 'יזמות',
];

function classifySignal(title: string, content: string): NewsSignal['signalType'] {
  const text = `${title} ${content}`.toLowerCase();
  for (const [type, keywords] of Object.entries(SIGNAL_KEYWORDS)) {
    if (keywords.some(kw => text.includes(kw))) {
      return type as NewsSignal['signalType'];
    }
  }
  return 'general';
}

function extractCompanyNames(text: string): string[] {
  const companies: string[] = [];
  // Match known Israeli insurance companies
  const knownCompanies = ['מגדל', 'מנורה מבטחים', 'מנורה', 'הפניקס', 'הראל', 'איילון', 'הכשרה', 'שומרה', 'כלל ביטוח', 'מגדל ביטוח'];
  for (const company of knownCompanies) {
    if (text.includes(company)) companies.push(company);
  }
  // Match quoted company names "חברת X"
  const quotedMatch = text.match(/["״]([^"״]+)["״]/g);
  if (quotedMatch) {
    companies.push(...quotedMatch.map(m => m.replace(/["״]/g, '')).filter(n => n.length > 2 && n.length < 30));
  }
  return [...new Set(companies)];
}

export async function fetchNewsSignals(
  keywords?: string[],
  sources?: string[],
  daysBack: number = 7
): Promise<{ signals: NewsSignal[]; warnings: string[] }> {
  const cacheKey = `news:${(keywords || []).join(',')}:${(sources || []).join(',')}:${daysBack}`;
  const cached = cache.get<{ signals: NewsSignal[]; warnings: string[] }>(cacheKey);
  if (cached) return cached;

  const signals: NewsSignal[] = [];
  const warnings: string[] = [];
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysBack);

  const feedsToFetch = sources?.length
    ? RSS_FEEDS.filter(f => sources.some(s => f.source.includes(s) || f.category === s))
    : RSS_FEEDS;

  const searchKeywords = keywords?.length ? keywords : INSURANCE_KEYWORDS;

  for (const feed of feedsToFetch) {
    try {
      await rateLimitWait(new URL(feed.url).hostname);
      const result = await parser.parseURL(feed.url);

      for (const item of result.items || []) {
        const pubDate = item.pubDate ? new Date(item.pubDate) : new Date();
        if (pubDate < cutoffDate) continue;

        const title = item.title || '';
        const content = item.contentSnippet || item.content || '';
        const fullText = `${title} ${content}`;

        const isRelevant = searchKeywords.some(kw => fullText.includes(kw));
        if (!isRelevant) continue;

        signals.push({
          title,
          source: feed.source,
          publishDate: pubDate.toISOString(),
          url: item.link || '',
          relevantCompanies: extractCompanyNames(fullText),
          signalType: classifySignal(title, content),
          snippet: content.slice(0, 200),
        });
      }
    } catch (err: any) {
      warnings.push(`Failed to fetch ${feed.source}: ${err.message}`);
    }
  }

  // Sort by date, newest first
  signals.sort((a, b) => new Date(b.publishDate).getTime() - new Date(a.publishDate).getTime());

  const result = { signals, warnings };
  cache.set(cacheKey, result, TTL.NEWS);
  return result;
}
