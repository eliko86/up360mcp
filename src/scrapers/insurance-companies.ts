/**
 * Israeli insurance company product data.
 * 7 major companies with comprehensive product knowledge.
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import { cache, TTL, rateLimitWait } from '../cache';
import { InsuranceProduct, RateComparison } from '../types';

const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36';

// Comprehensive Israeli insurance product database
// Based on publicly available data from company websites and hon.gov.il
const INSURANCE_PRODUCTS: InsuranceProduct[] = [
  // === HEALTH INSURANCE ===
  { company: 'מגדל', productName: 'מגדל בריאות זהב', type: 'health', description: 'ביטוח בריאות פרטי מקיף עם כיסוי ניתוחים, השתלות, תרופות מיוחדות', features: ['ניתוחים בארץ ובחו"ל', 'תרופות מיוחדות ללא הגבלה', 'רופאים מומחים', 'בדיקות אבחנתיות', 'שני חדר פרטי'], monthlyPremium: { min: 150, max: 600, typical: 280 }, waitingPeriod: '3 חודשים', maxAge: 75 },
  { company: 'מנורה מבטחים', productName: 'מנורה בריאות פלוס', type: 'health', description: 'כיסוי בריאותי רחב עם אפשרות לניתוחים פרטיים', features: ['ניתוחים פרטיים', 'תרופות חדשניות', 'התייעצות מומחים', 'MRI/CT ללא המתנה', 'רפואה משלימה'], monthlyPremium: { min: 130, max: 550, typical: 250 }, waitingPeriod: '3 חודשים', maxAge: 75 },
  { company: 'הפניקס', productName: 'הפניקס בריאות מושלמת', type: 'health', description: 'ביטוח בריאות מלא עם מגוון רחב של כיסויים', features: ['ניתוחים ללא תור', 'תרופות שאינן בסל', 'השתלות', 'בדיקות גנטיות', 'שיקום'], monthlyPremium: { min: 140, max: 580, typical: 270 }, waitingPeriod: '3 חודשים', maxAge: 70 },
  { company: 'הראל', productName: 'הראל 360 בריאות', type: 'health', description: 'מעטפת בריאותית מקיפה 360 מעלות', features: ['ניתוחים פרטיים', 'אונקולוגיה מלאה', 'תרופות ביולוגיות', 'טלרפואה 24/7', 'second opinion'], monthlyPremium: { min: 160, max: 620, typical: 300 }, waitingPeriod: '3 חודשים', maxAge: 75 },
  { company: 'איילון', productName: 'איילון בריאות', type: 'health', description: 'ביטוח בריאות עם דגש על שירות ונגישות', features: ['ניתוחים', 'תרופות', 'התייעצויות', 'בדיקות אבחנתיות'], monthlyPremium: { min: 120, max: 500, typical: 230 }, waitingPeriod: '6 חודשים', maxAge: 70 },
  { company: 'הכשרה', productName: 'הכשרה בריאות', type: 'health', description: 'ביטוח בריאות בתנאים תחרותיים', features: ['ניתוחים', 'תרופות מיוחדות', 'בדיקות', 'רפואה משלימה'], monthlyPremium: { min: 110, max: 480, typical: 220 }, waitingPeriod: '3 חודשים', maxAge: 70 },
  { company: 'שומרה', productName: 'שומרה בריאות', type: 'health', description: 'ביטוח בריאות עם יחס אישי', features: ['ניתוחים', 'תרופות', 'מומחים', 'בדיקות'], monthlyPremium: { min: 100, max: 450, typical: 200 }, waitingPeriod: '6 חודשים', maxAge: 65 },

  // === LIFE INSURANCE ===
  { company: 'מגדל', productName: 'מגדל חיים', type: 'life', description: 'ביטוח חיים עם כיסוי מוות מכל סיבה', features: ['כיסוי מוות מכל סיבה', 'אפשרות להוסיף נכות', 'פרמיה קבועה', 'עד גיל 67'], monthlyPremium: { min: 50, max: 400, typical: 120 } },
  { company: 'הראל', productName: 'הראל חיים ריסק', type: 'life', description: 'ביטוח חיים טהור במחיר תחרותי', features: ['כיסוי מוות', 'אובדן כושר עבודה', 'פטור מפרמיה', 'גמישות בסכום כיסוי'], monthlyPremium: { min: 40, max: 350, typical: 100 } },
  { company: 'הפניקס', productName: 'הפניקס ביטוח חיים', type: 'life', description: 'ביטוח חיים מקיף עם נספחים', features: ['כיסוי מוות', 'נכות מתאונה', 'מחלות קשות', 'פרמיה משתנה/קבועה'], monthlyPremium: { min: 45, max: 380, typical: 110 } },

  // === PENSION ===
  { company: 'מגדל', productName: 'מגדל מקפת', type: 'pension', description: 'קרן פנסיה מקיפה חדשה', features: ['דמי ניהול תחרותיים', 'תשואות גבוהות', 'כיסוי אובדן כושר', 'כיסוי שאירים', 'מסלולי השקעה מגוונים'], monthlyPremium: { min: 0, max: 0 } },
  { company: 'מנורה מבטחים', productName: 'מנורה מבטחים פנסיה', type: 'pension', description: 'קרן פנסיה מובילה עם מגוון מסלולים', features: ['דמי ניהול נמוכים', 'ניהול השקעות מקצועי', 'גמישות במסלולים', 'שירות אישי'], monthlyPremium: { min: 0, max: 0 } },
  { company: 'הראל', productName: 'הראל פנסיה', type: 'pension', description: 'קרן פנסיה עם היסטוריה של תשואות יציבות', features: ['דמי ניהול 0.22%', 'תשואה 5 שנים: 7.2%', 'מסלול ברירת מחדל מאוזן', 'אפשרות מסלול הלכתי'], monthlyPremium: { min: 0, max: 0 } },
  { company: 'הפניקס', productName: 'הפניקס פנסיה', type: 'pension', description: 'קרן פנסיה עם ביצועים מוכחים', features: ['דמי ניהול 0.25%', 'תשואה 5 שנים: 6.8%', 'ניהול סיכונים מתקדם'], monthlyPremium: { min: 0, max: 0 } },

  // === HISHTALMUT ===
  { company: 'מגדל', productName: 'מגדל קרן השתלמות', type: 'hishtalmut', description: 'קרן השתלמות לשכירים ועצמאים', features: ['דמי ניהול 0.74%', 'תשואה 5 שנים: 6.5%', 'הפקדה עד תקרה מוטבת', 'מסלולים מגוונים'], monthlyPremium: { min: 0, max: 0 } },
  { company: 'הראל', productName: 'הראל השתלמות', type: 'hishtalmut', description: 'קרן השתלמות עם תשואות מובילות', features: ['דמי ניהול 0.68%', 'תשואה 5 שנים: 7.1%', 'מסלול מניות חו"ל'], monthlyPremium: { min: 0, max: 0 } },
  { company: 'הפניקס', productName: 'הפניקס השתלמות', type: 'hishtalmut', description: 'חיסכון חכם לטווח בינוני', features: ['דמי ניהול 0.72%', 'תשואה 5 שנים: 6.9%', 'גמישות בהפקדות'], monthlyPremium: { min: 0, max: 0 } },

  // === DISABILITY / LOSS OF WORK CAPACITY ===
  { company: 'מגדל', productName: 'מגדל אובדן כושר עבודה', type: 'disability', description: 'הגנה על ההכנסה במקרה של אובדן כושר עבודה', features: ['כיסוי עד 75% מהשכר', 'הגדרה עיסוקית/כללית', 'תקופת המתנה 3 חודשים', 'כיסוי עד גיל 67'], monthlyPremium: { min: 80, max: 500, typical: 200 } },
  { company: 'הראל', productName: 'הראל אובדן כושר', type: 'disability', description: 'ביטוח אובדן כושר עבודה מקיף', features: ['הגדרה עיסוקית', 'כיסוי עד 75%', 'פיצוי חודשי', 'אפשרות כיסוי חלקי'], monthlyPremium: { min: 70, max: 450, typical: 180 } },

  // === CAR INSURANCE ===
  { company: 'הראל', productName: 'הראל ביטוח רכב מקיף', type: 'car', description: 'ביטוח רכב מקיף עם כיסוי מלא', features: ['גניבה', 'תאונה', 'נזקי טבע', 'שירות דרך', 'רכב חלופי'], monthlyPremium: { min: 200, max: 800, typical: 400 } },
  { company: 'איילון', productName: 'איילון ביטוח רכב', type: 'car', description: 'ביטוח רכב במחירים תחרותיים', features: ['מקיף וצד ג', 'שירות דרך 24/7', 'מוסך הסדר'], monthlyPremium: { min: 180, max: 750, typical: 370 } },
  { company: 'שומרה', productName: 'שומרה רכב', type: 'car', description: 'ביטוח רכב עם שירות אישי', features: ['מקיף', 'צד ג רכוש', 'שירותי דרך'], monthlyPremium: { min: 170, max: 700, typical: 350 } },

  // === HOME / PROPERTY ===
  { company: 'מגדל', productName: 'מגדל ביטוח דירה', type: 'property', description: 'ביטוח מבנה ותכולה', features: ['מבנה', 'תכולה', 'צד ג', 'נזקי טבע', 'פריצה'], monthlyPremium: { min: 50, max: 300, typical: 120 } },
  { company: 'הראל', productName: 'הראל ביטוח דירה', type: 'property', description: 'ביטוח דירה מקיף', features: ['מבנה ותכולה', 'רעידת אדמה', 'נזקי צנרת', 'אחריות כלפי צד ג'], monthlyPremium: { min: 45, max: 280, typical: 110 } },
  { company: 'הפניקס', productName: 'הפניקס ביטוח דירה', type: 'property', description: 'מעטפת ביטוח לנכס', features: ['מבנה', 'תכולה', 'צד ג', 'שמשות', 'צנרת'], monthlyPremium: { min: 50, max: 290, typical: 115 } },

  // === BUSINESS ===
  { company: 'הראל', productName: 'הראל ביטוח עסק', type: 'business', description: 'ביטוח עסקי מקיף', features: ['רכוש עסקי', 'אחריות מקצועית', 'אחריות מעבידים', 'אובדן רווחים', 'סייבר'], monthlyPremium: { min: 300, max: 5000, typical: 1200 } },
  { company: 'הפניקס', productName: 'הפניקס עסק מוגן', type: 'business', description: 'מעטפת ביטוחית לעסקים', features: ['רכוש ותכולה', 'אחריות צד ג', 'עובדים', 'הפסקת עסקים'], monthlyPremium: { min: 250, max: 4500, typical: 1000 } },
  { company: 'מגדל', productName: 'מגדל ביטוח עסקים', type: 'business', description: 'ביטוח לכל סוגי העסקים', features: ['חבילות מותאמות', 'אחריות מקצועית', 'רכוש', 'עובדים', 'קבלנים'], monthlyPremium: { min: 280, max: 4800, typical: 1100 } },

  // === TRAVEL ===
  { company: 'הראל', productName: 'הראל ביטוח נסיעות', type: 'travel', description: 'ביטוח נסיעות לחו"ל', features: ['כיסוי רפואי $1M', 'ביטול טיסה', 'כבודה', 'ספורט אתגרי'], monthlyPremium: { min: 30, max: 200 } },
  { company: 'הפניקס', productName: 'הפניקס נסיעות', type: 'travel', description: 'ביטוח נסיעות מקיף', features: ['רפואי $500K-$5M', 'ביטולים', 'מזוודות', 'תאונות'], monthlyPremium: { min: 25, max: 180 } },

  // === NURSING / LONG TERM CARE ===
  { company: 'מגדל', productName: 'מגדל ביטוח סיעודי', type: 'nursing', description: 'ביטוח סיעודי לטווח ארוך', features: ['פיצוי חודשי', 'כיסוי מגיל 65', 'ללא תקופת אכשרה', 'עד 60 חודשי פיצוי'], monthlyPremium: { min: 100, max: 500, typical: 250 } },
  { company: 'הראל', productName: 'הראל סיעודי', type: 'nursing', description: 'כיסוי סיעודי עם תנאים גמישים', features: ['פיצוי חודשי', 'בחירת מוסד/בית', 'כיסוי 5 שנים'], monthlyPremium: { min: 90, max: 450, typical: 230 } },
];

export async function getInsuranceProducts(
  company?: string,
  productType?: string
): Promise<{ products: InsuranceProduct[]; warnings: string[] }> {
  const cacheKey = `insurance:products:${company}:${productType}`;
  const cached = cache.get<{ products: InsuranceProduct[]; warnings: string[] }>(cacheKey);
  if (cached) return cached;

  let products = [...INSURANCE_PRODUCTS];

  if (company) {
    products = products.filter(p => p.company.includes(company));
  }
  if (productType) {
    products = products.filter(p => p.type === productType);
  }

  const warnings: string[] = [];

  // Try to enrich with live data from company websites
  if (company && products.length > 0) {
    try {
      const enriched = await scrapeCompanyProducts(company);
      if (enriched.length > 0) {
        // Merge any new products found
        for (const ep of enriched) {
          const exists = products.find(p => p.productName === ep.productName);
          if (!exists) {
            products.push(ep);
          }
        }
      }
    } catch (err: any) {
      warnings.push(`Live enrichment for ${company} failed: ${err.message}`);
    }
  }

  const result = { products, warnings };
  cache.set(cacheKey, result, TTL.INSURANCE);
  return result;
}

async function scrapeCompanyProducts(company: string): Promise<InsuranceProduct[]> {
  const urls: Record<string, string> = {
    'מגדל': 'https://www.migdal.co.il/He/privateCustomers/insurance/Pages/default.aspx',
    'הראל': 'https://www.harel-group.co.il/personal/Pages/default.aspx',
    'הפניקס': 'https://www.fnx.co.il/products',
    'מנורה מבטחים': 'https://www.menoramivt.co.il/product/',
    'מנורה': 'https://www.menoramivt.co.il/product/',
  };

  const url = urls[company];
  if (!url) return [];

  try {
    await rateLimitWait(new URL(url).hostname);
    const response = await axios.get(url, {
      headers: { 'User-Agent': USER_AGENT },
      timeout: 10000,
    });
    // Parse product listings from the page
    // This is a best-effort extraction
    const $ = cheerio.load(response.data);
    const products: InsuranceProduct[] = [];

    $('a[href*="product"], a[href*="insurance"], .product-card, .product-item').each((_, el) => {
      const name = $(el).text().trim();
      const href = $(el).attr('href') || '';
      if (name.length > 3 && name.length < 80) {
        products.push({
          company,
          productName: name,
          type: 'general',
          description: '',
          features: [],
          url: href.startsWith('http') ? href : `${new URL(url).origin}${href}`,
        });
      }
    });

    return products.slice(0, 20);
  } catch {
    return [];
  }
}

export async function compareRates(
  policyType: string,
  age?: number,
  coverageAmount?: number
): Promise<{ comparisons: RateComparison[]; warnings: string[] }> {
  const cacheKey = `insurance:compare:${policyType}:${age}:${coverageAmount}`;
  const cached = cache.get<{ comparisons: RateComparison[]; warnings: string[] }>(cacheKey);
  if (cached) return cached;

  const products = INSURANCE_PRODUCTS.filter(p => p.type === policyType);
  const warnings: string[] = [];

  const comparisons: RateComparison[] = products.map(p => {
    let premium = p.monthlyPremium?.typical;

    // Adjust for age if health/life/disability
    if (age && premium && ['health', 'life', 'disability', 'nursing'].includes(policyType)) {
      if (age < 30) premium *= 0.7;
      else if (age < 40) premium *= 0.85;
      else if (age < 50) premium *= 1.0;
      else if (age < 60) premium *= 1.4;
      else premium *= 1.8;

      if (p.maxAge && age > p.maxAge) {
        return {
          company: p.company,
          productName: p.productName,
          coverageLevel: 'לא זמין',
          notes: `גיל מקסימלי ${p.maxAge}`,
        };
      }
    }

    return {
      company: p.company,
      productName: p.productName,
      monthlyPremium: premium ? Math.round(premium) : undefined,
      coverageLevel: coverageAmount ? `עד ₪${coverageAmount.toLocaleString()}` : 'סטנדרטי',
      notes: p.features.slice(0, 3).join(', '),
    };
  });

  // Sort by premium ascending
  comparisons.sort((a, b) => (a.monthlyPremium || Infinity) - (b.monthlyPremium || Infinity));

  const result = { comparisons, warnings };
  cache.set(cacheKey, result, TTL.INSURANCE);
  return result;
}
