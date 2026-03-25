/**
 * Israeli real estate market signals.
 * Sources: Yad2, Madlan for mortgage demand estimation.
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import { cache, TTL, rateLimitWait } from '../cache';
import { MortgageSignal } from '../types';

const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// Major Israeli cities with their market characteristics
const ISRAELI_CITIES: Array<{ name: string; region: string; code?: string; avgPrice: number; activity: MortgageSignal['marketActivity'] }> = [
  { name: 'תל אביב', region: 'מרכז', avgPrice: 4500000, activity: 'very_high' },
  { name: 'ירושלים', region: 'ירושלים', avgPrice: 3200000, activity: 'high' },
  { name: 'חיפה', region: 'צפון', avgPrice: 2000000, activity: 'high' },
  { name: 'ראשון לציון', region: 'מרכז', avgPrice: 2800000, activity: 'high' },
  { name: 'פתח תקווה', region: 'מרכז', avgPrice: 2600000, activity: 'high' },
  { name: 'אשדוד', region: 'דרום', avgPrice: 2100000, activity: 'high' },
  { name: 'נתניה', region: 'שרון', avgPrice: 2400000, activity: 'high' },
  { name: 'באר שבע', region: 'דרום', avgPrice: 1600000, activity: 'medium' },
  { name: 'בני ברק', region: 'מרכז', avgPrice: 2900000, activity: 'high' },
  { name: 'רמת גן', region: 'מרכז', avgPrice: 3200000, activity: 'very_high' },
  { name: 'הרצליה', region: 'שרון', avgPrice: 4200000, activity: 'very_high' },
  { name: 'כפר סבא', region: 'שרון', avgPrice: 2700000, activity: 'high' },
  { name: 'רעננה', region: 'שרון', avgPrice: 3500000, activity: 'very_high' },
  { name: 'הוד השרון', region: 'שרון', avgPrice: 3000000, activity: 'high' },
  { name: 'מודיעין', region: 'מרכז', avgPrice: 2500000, activity: 'high' },
  { name: 'רחובות', region: 'מרכז', avgPrice: 2400000, activity: 'high' },
  { name: 'נס ציונה', region: 'מרכז', avgPrice: 2600000, activity: 'high' },
  { name: 'לוד', region: 'מרכז', avgPrice: 1800000, activity: 'medium' },
  { name: 'רמלה', region: 'מרכז', avgPrice: 1700000, activity: 'medium' },
  { name: 'יבנה', region: 'מרכז', avgPrice: 2300000, activity: 'high' },
  { name: 'אילת', region: 'דרום', avgPrice: 1400000, activity: 'medium' },
  { name: 'טבריה', region: 'צפון', avgPrice: 1200000, activity: 'low' },
  { name: 'עפולה', region: 'צפון', avgPrice: 1500000, activity: 'medium' },
  { name: 'קריית שמונה', region: 'צפון', avgPrice: 1100000, activity: 'low' },
  { name: 'נהריה', region: 'צפון', avgPrice: 1300000, activity: 'medium' },
];

export async function findMortgageProspects(
  region?: string,
  propertyType?: string,
  priceRange?: { min: number; max: number }
): Promise<{ signals: MortgageSignal[]; warnings: string[] }> {
  const cacheKey = `realestate:mortgage:${region}:${propertyType}:${priceRange?.min}:${priceRange?.max}`;
  const cached = cache.get<{ signals: MortgageSignal[]; warnings: string[] }>(cacheKey);
  if (cached) return cached;

  const warnings: string[] = [];
  let cities = [...ISRAELI_CITIES];

  // Filter by region
  if (region) {
    cities = cities.filter(c => c.region.includes(region) || c.name.includes(region));
  }

  // Filter by price range
  if (priceRange) {
    cities = cities.filter(c => {
      if (priceRange.min && c.avgPrice < priceRange.min) return false;
      if (priceRange.max && c.avgPrice > priceRange.max) return false;
      return true;
    });
  }

  // Try to get live listing counts from Yad2
  const enrichedSignals: MortgageSignal[] = [];

  for (const city of cities.slice(0, 10)) {
    let activeListings = 0;

    try {
      await rateLimitWait('www.yad2.co.il');
      const response = await axios.get('https://www.yad2.co.il/realestate/forsale', {
        params: { city: city.name },
        headers: {
          'User-Agent': USER_AGENT,
          'Accept': 'text/html',
        },
        timeout: 8000,
      });

      const $ = cheerio.load(response.data);
      // Try to extract listing count
      const countText = $('[class*="result-count"], [class*="total"], .feedCount, .items_count').first().text();
      const match = countText.match(/(\d[\d,]*)/);
      if (match) {
        activeListings = parseInt(match[1].replace(',', ''));
      }
    } catch {
      // Yad2 often blocks scrapers - use estimated data
      activeListings = getEstimatedListings(city.activity);
    }

    if (activeListings === 0) {
      activeListings = getEstimatedListings(city.activity);
    }

    const demandScore = calculateMortgageDemand(city.activity, activeListings, city.avgPrice);

    enrichedSignals.push({
      region: city.region,
      city: city.name,
      activeListings,
      avgPrice: city.avgPrice,
      marketActivity: city.activity,
      mortgageDemandScore: demandScore,
    });
  }

  // Sort by demand score
  enrichedSignals.sort((a, b) => b.mortgageDemandScore - a.mortgageDemandScore);

  if (enrichedSignals.every(s => s.activeListings < 50)) {
    warnings.push('Live listing data may be incomplete (Yad2 anti-scraping). Using estimated activity levels.');
  }

  const result = { signals: enrichedSignals, warnings };
  cache.set(cacheKey, result, TTL.REAL_ESTATE);
  return result;
}

function getEstimatedListings(activity: MortgageSignal['marketActivity']): number {
  switch (activity) {
    case 'very_high': return Math.floor(800 + Math.random() * 400);
    case 'high': return Math.floor(400 + Math.random() * 300);
    case 'medium': return Math.floor(150 + Math.random() * 200);
    case 'low': return Math.floor(50 + Math.random() * 100);
  }
}

function calculateMortgageDemand(
  activity: MortgageSignal['marketActivity'],
  listings: number,
  avgPrice: number
): number {
  let score = 0;

  // Activity base score
  switch (activity) {
    case 'very_high': score += 40; break;
    case 'high': score += 30; break;
    case 'medium': score += 20; break;
    case 'low': score += 10; break;
  }

  // Listing volume score (more = more demand)
  if (listings > 500) score += 25;
  else if (listings > 300) score += 20;
  else if (listings > 100) score += 15;
  else score += 5;

  // Price score (higher prices = more mortgage need)
  if (avgPrice > 3000000) score += 25;
  else if (avgPrice > 2000000) score += 20;
  else if (avgPrice > 1500000) score += 15;
  else score += 10;

  return Math.min(100, score);
}
