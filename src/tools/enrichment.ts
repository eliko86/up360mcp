/**
 * Enrichment tools - contact lookup, company enrichment, area demographics.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { cache, TTL, rateLimitWait } from '../cache';
import { getAreaDemographics } from '../scrapers/cbs-demographics';
import { searchCompanies } from '../scrapers/company-registry';
import { searchPublicCompanies } from '../scrapers/maya-tase';
import { scanHiringSignals } from '../scrapers/job-boards';
import { fetchNewsSignals } from '../scrapers/news-rss';
import { ContactInfo } from '../types';

const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36';

export function registerEnrichmentTools(server: McpServer): void {

  // 1. Enrich Contact
  server.registerTool(
    'enrich_contact',
    {
      title: 'Enrich Contact Information',
      description: 'Enrich a contact with publicly available information. Attempts to find LinkedIn profile, company association, and role based on name and/or phone number. Best-effort lookup from public directories.',
      inputSchema: {
        name: z.string().optional().describe('Person name (Hebrew or English)'),
        phone: z.string().optional().describe('Phone number'),
        email: z.string().optional().describe('Email address'),
      },
    },
    async ({ name, phone, email }) => {
      const cacheKey = `enrich:contact:${name}:${phone}:${email}`;
      const cached = cache.get<ContactInfo>(cacheKey);
      if (cached) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ contact: cached, cached: true, source: 'cache' }, null, 2) }],
        };
      }

      const contact: ContactInfo = {
        name: name || undefined,
        phone: phone || undefined,
        sources: [],
      };
      const warnings: string[] = [];

      // Try 144.co.il for reverse phone lookup
      if (phone) {
        try {
          await rateLimitWait('www.144.co.il');
          const cleanPhone = phone.replace(/[-\s()]/g, '');
          const response = await axios.get(`https://www.144.co.il/search/?q=${encodeURIComponent(cleanPhone)}`, {
            headers: { 'User-Agent': USER_AGENT },
            timeout: 10000,
          });

          const $ = cheerio.load(response.data);
          const resultName = $('[class*="name"], .result-name, h3').first().text().trim();
          const resultAddress = $('[class*="address"], .result-address').first().text().trim();

          if (resultName && resultName.length > 2) {
            contact.name = contact.name || resultName;
            contact.sources.push('144.co.il');
          }
        } catch (err: any) {
          warnings.push(`144.co.il lookup failed: ${err.message}`);
        }
      }

      // Try to find LinkedIn profile via name
      if (name) {
        try {
          await rateLimitWait('www.google.com');
          const searchQuery = `site:linkedin.com/in "${name}" Israel`;
          const response = await axios.get('https://www.google.com/search', {
            params: { q: searchQuery, num: 3, hl: 'en' },
            headers: { 'User-Agent': USER_AGENT },
            timeout: 10000,
          });

          const $ = cheerio.load(response.data);
          $('a[href*="linkedin.com/in/"]').each((_, el) => {
            const href = $(el).attr('href') || '';
            const linkedInUrl = href.match(/(https?:\/\/\w+\.linkedin\.com\/in\/[a-zA-Z0-9-]+)/);
            if (linkedInUrl && !contact.possibleLinkedIn) {
              contact.possibleLinkedIn = linkedInUrl[1];
              contact.sources.push('Google/LinkedIn');
            }
          });

          // Try to extract company/role from Google snippets
          $('[class*="snippet"], .st, .VwiC3b').each((_, el) => {
            const text = $(el).text();
            // Look for company patterns like "at Company" or "- Company"
            const companyMatch = text.match(/(?:at|ב|-)[\s]+([A-Za-zא-ת][A-Za-zא-ת\s]{2,30}?)(?:\s[-|·]|\s*$)/);
            if (companyMatch && !contact.possibleCompany) {
              contact.possibleCompany = companyMatch[1].trim();
            }
            // Look for role patterns
            const roleMatch = text.match(/(CEO|CTO|CFO|COO|VP|Director|Manager|מנכ"ל|סמנכ"ל|מנהל|יועץ|סוכן)/i);
            if (roleMatch && !contact.possibleRole) {
              contact.possibleRole = roleMatch[1];
            }
          });
        } catch (err: any) {
          warnings.push(`Google/LinkedIn lookup failed: ${err.message}`);
        }
      }

      // Extract domain from email for company clue
      if (email) {
        const domain = email.split('@')[1];
        if (domain && !['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'walla.co.il', 'bezeqint.net'].includes(domain)) {
          contact.possibleCompany = contact.possibleCompany || domain.replace(/\.(co\.il|com|co|net|org)$/, '');
          contact.sources.push('email_domain');
        }
      }

      cache.set(cacheKey, contact, TTL.COMPANIES);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            contact,
            enrichmentLevel: contact.sources.length > 2 ? 'high' : contact.sources.length > 0 ? 'medium' : 'low',
            warnings,
            source: contact.sources.join(', ') || 'none',
          }, null, 2),
        }],
      };
    }
  );

  // 2. Enrich Company
  server.registerTool(
    'enrich_company',
    {
      title: 'Enrich Company Information',
      description: 'Full company enrichment by aggregating data from multiple sources: company registry, TASE (if public), job board signals (employee estimate), and recent news mentions. Returns a comprehensive company profile.',
      inputSchema: {
        companyName: z.string().describe('Company name (Hebrew or English)'),
        registrationNumber: z.string().optional().describe('Company registration number if known'),
      },
    },
    async ({ companyName, registrationNumber }) => {
      const cacheKey = `enrich:company:${companyName}:${registrationNumber}`;
      const cached = cache.get(cacheKey);
      if (cached) {
        return { content: [{ type: 'text', text: JSON.stringify(cached, null, 2) }] };
      }

      const warnings: string[] = [];
      const enriched: any = { name: companyName, sources: [] };

      // 1. Company Registry
      const registry = await searchCompanies(registrationNumber || companyName, 5);
      if (registry.companies.length > 0) {
        const match = registry.companies[0];
        Object.assign(enriched, {
          registrationNumber: match.registrationNumber,
          type: match.type,
          status: match.status,
          registrationDate: match.registrationDate,
          city: match.city,
        });
        enriched.sources.push('data.gov.il');
      }
      warnings.push(...registry.warnings);

      // 2. TASE (if public)
      const tase = await searchPublicCompanies(companyName);
      if (tase.companies.length > 0) {
        const match = tase.companies[0];
        Object.assign(enriched, {
          isPublic: true,
          taseId: match.taseId,
          sector: match.sector,
          marketCap: match.marketCap,
        });
        enriched.sources.push('TASE');
      }
      warnings.push(...tase.warnings);

      // 3. Job board signals for employee estimate
      const hiring = await scanHiringSignals(undefined, undefined, 1, [companyName]);
      const signal = hiring.signals.find(s => s.companyName.includes(companyName) || companyName.includes(s.companyName));
      if (signal) {
        enriched.openPositions = signal.openPositions;
        enriched.estimatedEmployees = signal.openPositions * 15; // rough heuristic
        enriched.isHiring = true;
        enriched.sources.push('JobBoards');
      }
      warnings.push(...hiring.warnings);

      // 4. Recent news
      const news = await fetchNewsSignals([companyName], undefined, 30);
      if (news.signals.length > 0) {
        enriched.recentNews = news.signals.slice(0, 5);
        enriched.sources.push('News');
      }
      warnings.push(...news.warnings);

      const result = {
        company: enriched,
        enrichmentLevel: enriched.sources.length >= 3 ? 'comprehensive' : enriched.sources.length >= 2 ? 'good' : enriched.sources.length >= 1 ? 'basic' : 'minimal',
        insuranceOpportunities: generateOpportunities(enriched),
        warnings,
      };

      cache.set(cacheKey, result, TTL.COMPANIES);

      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  // 3. Get Area Demographics
  server.registerTool(
    'get_area_demographics',
    {
      title: 'Get Area Demographics & Market Sizing',
      description: 'Get demographics data for Israeli cities and regions. Includes population, median age, income level, business density, and an insurance market opportunity score. Essential for targeting and territory planning.',
      inputSchema: {
        city: z.string().optional().describe('City name (Hebrew, e.g., תל אביב, חיפה, יבנה)'),
        region: z.string().optional().describe('Region (מרכז, צפון, דרום, שרון, ירושלים)'),
      },
    },
    async ({ city, region }) => {
      const result = await getAreaDemographics(city, region);

      const totalPop = result.demographics.reduce((sum, d) => sum + (d.population || 0), 0);
      const totalBiz = result.demographics.reduce((sum, d) => sum + (d.businesses || 0), 0);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            totalAreas: result.demographics.length,
            totalPopulation: totalPop,
            totalBusinesses: totalBiz,
            demographics: result.demographics,
            topMarkets: result.demographics.slice(0, 5),
            warnings: result.warnings,
            source: 'CBS (Central Bureau of Statistics) / data.gov.il',
          }, null, 2),
        }],
      };
    }
  );
}

function generateOpportunities(company: any): string[] {
  const opportunities: string[] = [];

  if (company.isHiring || company.openPositions > 0) {
    opportunities.push('חברה מגייסת - הזדמנות לביטוח קולקטיבי ופנסיה לעובדים חדשים');
  }
  if (company.isPublic) {
    opportunities.push('חברה ציבורית - צורך בביטוח דירקטורים ונושאי משרה (D&O)');
  }
  if (company.registrationDate) {
    const regDate = new Date(company.registrationDate);
    const monthsOld = (Date.now() - regDate.getTime()) / (1000 * 60 * 60 * 24 * 30);
    if (monthsOld < 12) {
      opportunities.push('עסק חדש - צורך בביטוח עסקי בסיסי (אחריות, רכוש, עובדים)');
    }
  }
  if (company.estimatedEmployees && company.estimatedEmployees > 10) {
    opportunities.push(`~${company.estimatedEmployees} עובדים משוערים - פוטנציאל לביטוח קולקטיבי משמעותי`);
  }
  if (company.recentNews?.some((n: any) => n.signalType === 'funding')) {
    opportunities.push('גיוס הון אחרון - החברה צומחת, צריכה לעדכן כיסויים ביטוחיים');
  }
  if (company.recentNews?.some((n: any) => n.signalType === 'expansion')) {
    opportunities.push('התרחבות - צורך בביטוח למשרדים/סניפים חדשים');
  }

  if (opportunities.length === 0) {
    opportunities.push('בדוק: ביטוח אחריות מקצועית, ביטוח רכוש, ביטוח עובדים');
  }

  return opportunities;
}
