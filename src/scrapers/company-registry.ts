/**
 * Israeli Companies Registrar data via data.gov.il open API.
 * Also TASE Maya API for public company data.
 */

import axios from 'axios';
import { cache, TTL, rateLimitWait } from '../cache';
import { CompanyRecord, CompanyDetail } from '../types';

const USER_AGENT = 'UP360-MCP/1.0';

// data.gov.il Companies Registrar resource
const DATA_GOV_COMPANIES_URL = 'https://data.gov.il/api/3/action/datastore_search';
const COMPANIES_RESOURCE_ID = 'f004176c-b85f-4542-8901-7b3176f9a054';

export async function searchCompanies(
  query?: string,
  limit: number = 50
): Promise<{ companies: CompanyRecord[]; warnings: string[] }> {
  const cacheKey = `registry:search:${query}:${limit}`;
  const cached = cache.get<{ companies: CompanyRecord[]; warnings: string[] }>(cacheKey);
  if (cached) return cached;

  const warnings: string[] = [];
  const companies: CompanyRecord[] = [];

  try {
    await rateLimitWait('data.gov.il');

    const params: Record<string, any> = {
      resource_id: COMPANIES_RESOURCE_ID,
      limit,
    };

    if (query) {
      params.q = query;
    }

    const response = await axios.get(DATA_GOV_COMPANIES_URL, {
      params,
      headers: { 'User-Agent': USER_AGENT },
      timeout: 15000,
    });

    const records = response.data?.result?.records || [];
    for (const rec of records) {
      companies.push({
        name: rec['שם חברה'] || rec.company_name || rec.name || '',
        registrationNumber: rec['מספר חברה'] || rec.company_number || '',
        type: rec['סוג תאגיד'] || rec.company_type || '',
        status: rec['סטטוס'] || rec.status || '',
        registrationDate: rec['תאריך התאגדות'] || rec.registration_date || '',
        city: rec['ישוב'] || rec.city || '',
      });
    }
  } catch (err: any) {
    warnings.push(`data.gov.il search failed: ${err.message}`);

    // Fallback: try direct registrar
    try {
      await rateLimitWait('ica.justice.gov.il');
      const response = await axios.get('https://ica.justice.gov.il/GenericCorporarionInfo/SearchCorporation', {
        params: { corporationName: query },
        headers: { 'User-Agent': USER_AGENT },
        timeout: 15000,
      });

      // This returns HTML, but we'll note it as a fallback
      if (response.status === 200) {
        warnings.push('Fell back to ica.justice.gov.il (HTML response - limited parsing)');
      }
    } catch {
      warnings.push('Fallback to ica.justice.gov.il also failed');
    }
  }

  const result = { companies, warnings };
  cache.set(cacheKey, result, TTL.COMPANIES);
  return result;
}

export async function findNewBusinesses(
  daysBack: number = 30,
  limit: number = 100
): Promise<{ companies: CompanyRecord[]; warnings: string[] }> {
  const cacheKey = `registry:new:${daysBack}:${limit}`;
  const cached = cache.get<{ companies: CompanyRecord[]; warnings: string[] }>(cacheKey);
  if (cached) return cached;

  const warnings: string[] = [];
  const companies: CompanyRecord[] = [];

  try {
    await rateLimitWait('data.gov.il');

    const response = await axios.get(DATA_GOV_COMPANIES_URL, {
      params: {
        resource_id: COMPANIES_RESOURCE_ID,
        limit,
        sort: 'תאריך התאגדות desc',
      },
      headers: { 'User-Agent': USER_AGENT },
      timeout: 15000,
    });

    const records = response.data?.result?.records || [];
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysBack);

    for (const rec of records) {
      const regDate = rec['תאריך התאגדות'] || rec.registration_date;
      if (regDate) {
        const date = new Date(regDate);
        if (date >= cutoff) {
          companies.push({
            name: rec['שם חברה'] || rec.company_name || '',
            registrationNumber: rec['מספר חברה'] || rec.company_number || '',
            type: rec['סוג תאגיד'] || rec.company_type || '',
            status: rec['סטטוס'] || rec.status || '',
            registrationDate: regDate,
            city: rec['ישוב'] || rec.city || '',
          });
        }
      }
    }
  } catch (err: any) {
    warnings.push(`data.gov.il new businesses query failed: ${err.message}`);
  }

  const result = { companies, warnings };
  cache.set(cacheKey, result, TTL.COMPANIES);
  return result;
}
