/**
 * TASE Maya API scraper for public Israeli company data.
 * https://maya.tase.co.il - publicly accessible JSON API.
 */

import axios from 'axios';
import { cache, TTL, rateLimitWait } from '../cache';
import { CompanyRecord, CompanyDetail } from '../types';

const BASE_URL = 'https://maya.tase.co.il/api';
const USER_AGENT = 'UP360-MCP/1.0';

const axiosInstance = axios.create({
  baseURL: BASE_URL,
  headers: {
    'User-Agent': USER_AGENT,
    'Accept': 'application/json',
  },
  timeout: 15000,
});

export async function searchPublicCompanies(
  query?: string,
  sector?: string
): Promise<{ companies: CompanyRecord[]; warnings: string[] }> {
  const cacheKey = `tase:search:${query}:${sector}`;
  const cached = cache.get<{ companies: CompanyRecord[]; warnings: string[] }>(cacheKey);
  if (cached) return cached;

  const warnings: string[] = [];
  const companies: CompanyRecord[] = [];

  try {
    await rateLimitWait('maya.tase.co.il');

    const response = await axiosInstance.get('/company/allcompanies');
    const allCompanies = response.data || [];

    for (const c of allCompanies) {
      const name = c.CompanyLongName || c.CompanyName || '';
      const companySector = c.SuperBranchName || c.BranchName || '';

      // Filter by query
      if (query && !name.includes(query) && !companySector.includes(query)) continue;
      // Filter by sector
      if (sector && !companySector.includes(sector)) continue;

      companies.push({
        name,
        taseId: c.CompanyId,
        sector: companySector,
        isPublic: true,
        marketCap: c.MarketCap || undefined,
        status: 'רשום בבורסה',
      });
    }
  } catch (err: any) {
    warnings.push(`TASE Maya API failed: ${err.message}`);
  }

  const result = { companies: companies.slice(0, 100), warnings };
  cache.set(cacheKey, result, TTL.COMPANIES);
  return result;
}

export async function getPublicCompanyDetails(
  companyId: number
): Promise<{ detail: CompanyDetail | null; warnings: string[] }> {
  const cacheKey = `tase:detail:${companyId}`;
  const cached = cache.get<{ detail: CompanyDetail | null; warnings: string[] }>(cacheKey);
  if (cached) return cached;

  const warnings: string[] = [];
  let detail: CompanyDetail | null = null;

  try {
    await rateLimitWait('maya.tase.co.il');

    const response = await axiosInstance.get(`/company/details`, {
      params: { companyId },
    });

    const c = response.data;
    if (c) {
      detail = {
        name: c.CompanyLongName || c.CompanyName || '',
        taseId: companyId,
        sector: c.SuperBranchName || c.BranchName || '',
        isPublic: true,
        marketCap: c.MarketCap || undefined,
        description: c.CompanyDescription || '',
        status: 'רשום בבורסה',
        financials: {
          revenue: c.Revenue || undefined,
          profit: c.NetProfit || undefined,
          equity: c.Equity || undefined,
          year: c.FinancialYear || undefined,
        },
      };
    }
  } catch (err: any) {
    warnings.push(`TASE company detail failed: ${err.message}`);
  }

  const result = { detail, warnings };
  cache.set(cacheKey, result, TTL.COMPANIES);
  return result;
}
