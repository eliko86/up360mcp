/**
 * Business Intelligence tools - Israeli company search, hiring signals, news.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { searchCompanies, findNewBusinesses } from '../scrapers/company-registry';
import { searchPublicCompanies, getPublicCompanyDetails } from '../scrapers/maya-tase';
import { scanHiringSignals } from '../scrapers/job-boards';
import { fetchNewsSignals } from '../scrapers/news-rss';

export function registerBusinessIntelligenceTools(server: McpServer): void {

  // 1. Search Israeli Companies
  server.registerTool(
    'search_israeli_companies',
    {
      title: 'Search Israeli Companies',
      description: 'Search Israeli company registry (data.gov.il) and TASE for public companies. Find companies by name, sector, or region. Returns registration details, sector, and public market data when available.',
      inputSchema: {
        query: z.string().optional().describe('Company name or keyword to search (Hebrew or English)'),
        sector: z.string().optional().describe('Business sector filter (e.g., טכנולוגיה, בריאות, פיננסים)'),
        region: z.string().optional().describe('City or region filter (e.g., תל אביב, חיפה)'),
        publicOnly: z.boolean().optional().default(false).describe('Only return publicly traded companies (TASE)'),
        limit: z.number().optional().default(30).describe('Max results to return'),
      },
    },
    async ({ query, sector, publicOnly, limit }) => {
      const warnings: string[] = [];
      let companies: any[] = [];

      // Search TASE for public companies
      if (publicOnly || sector) {
        const taseResult = await searchPublicCompanies(query, sector);
        companies.push(...taseResult.companies);
        warnings.push(...taseResult.warnings);
      }

      // Search company registry for all companies
      if (!publicOnly && query) {
        const registryResult = await searchCompanies(query, limit);
        companies.push(...registryResult.companies);
        warnings.push(...registryResult.warnings);
      }

      // Deduplicate by name
      const seen = new Set<string>();
      companies = companies.filter(c => {
        const key = c.name?.trim();
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            totalFound: companies.length,
            companies: companies.slice(0, limit),
            warnings,
            source: 'data.gov.il + TASE Maya API',
          }, null, 2),
        }],
      };
    }
  );

  // 2. Get Company Details
  server.registerTool(
    'get_company_details',
    {
      title: 'Get Company Details',
      description: 'Get detailed information about a specific Israeli company. For public companies (TASE), includes financials and market data. For private companies, returns registration details.',
      inputSchema: {
        companyName: z.string().optional().describe('Company name to look up'),
        taseId: z.number().optional().describe('TASE company ID for public company details'),
        registrationNumber: z.string().optional().describe('Company registration number'),
      },
    },
    async ({ companyName, taseId }) => {
      const warnings: string[] = [];
      let detail = null;

      // If TASE ID provided, get public company details
      if (taseId) {
        const result = await getPublicCompanyDetails(taseId);
        detail = result.detail;
        warnings.push(...result.warnings);
      }

      // Also search by name
      if (companyName && !detail) {
        const registryResult = await searchCompanies(companyName, 5);
        warnings.push(...registryResult.warnings);

        if (registryResult.companies.length > 0) {
          detail = registryResult.companies[0];
        }

        // Also check TASE
        const taseResult = await searchPublicCompanies(companyName);
        if (taseResult.companies.length > 0 && taseResult.companies[0].taseId) {
          const publicDetail = await getPublicCompanyDetails(taseResult.companies[0].taseId);
          if (publicDetail.detail) {
            detail = { ...detail, ...publicDetail.detail };
          }
          warnings.push(...publicDetail.warnings);
        }
        warnings.push(...taseResult.warnings);
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            found: !!detail,
            company: detail,
            warnings,
            source: 'data.gov.il + TASE Maya API',
          }, null, 2),
        }],
      };
    }
  );

  // 3. Scan Hiring Signals
  server.registerTool(
    'scan_hiring_signals',
    {
      title: 'Scan Hiring Signals',
      description: 'Scan Israeli job boards (AllJobs, Drushim) for companies with multiple open positions - indicates growth and potential insurance needs. Companies hiring aggressively often need group insurance, pension setup, and employee benefits.',
      inputSchema: {
        sector: z.string().optional().describe('Sector to focus on (e.g., הייטק, ביטוח, בריאות, פיננסים)'),
        region: z.string().optional().describe('Region filter (e.g., מרכז, תל אביב, צפון, דרום)'),
        minPositions: z.number().optional().default(3).describe('Minimum open positions to qualify as a signal'),
        keywords: z.array(z.string()).optional().describe('Custom search keywords'),
      },
    },
    async ({ sector, region, minPositions, keywords }) => {
      const result = await scanHiringSignals(sector, region, minPositions, keywords);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            totalSignals: result.signals.length,
            signals: result.signals,
            interpretation: result.signals.length > 0
              ? `נמצאו ${result.signals.length} חברות עם ${minPositions}+ משרות פתוחות. חברות מגייסות = הזדמנות לביטוח קולקטיבי, פנסיה לעובדים חדשים, וביטוח מנהלים.`
              : 'לא נמצאו אותות גיוס משמעותיים בפרמטרים שנבחרו.',
            warnings: result.warnings,
            source: 'AllJobs + Drushim',
          }, null, 2),
        }],
      };
    }
  );

  // 4. Scan News Signals
  server.registerTool(
    'scan_news_signals',
    {
      title: 'Scan Israeli Business News',
      description: 'Scan Globes, Calcalist, and TheMarker RSS feeds for business signals relevant to insurance - funding rounds, M&A, company expansions, regulatory changes, and real estate activity.',
      inputSchema: {
        keywords: z.array(z.string()).optional().describe('Keywords to filter news (Hebrew). Defaults to insurance-related terms.'),
        sources: z.array(z.string()).optional().describe('News sources to search (גלובס, כלכליסט, דה מרקר) or categories (finance, business, realestate)'),
        daysBack: z.number().optional().default(7).describe('How many days back to search'),
      },
    },
    async ({ keywords, sources, daysBack }) => {
      const result = await fetchNewsSignals(keywords, sources, daysBack);

      // Categorize signals
      const byType: Record<string, number> = {};
      for (const s of result.signals) {
        byType[s.signalType] = (byType[s.signalType] || 0) + 1;
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            totalSignals: result.signals.length,
            byType,
            signals: result.signals,
            warnings: result.warnings,
            source: 'Globes + Calcalist + TheMarker RSS',
          }, null, 2),
        }],
      };
    }
  );
}
