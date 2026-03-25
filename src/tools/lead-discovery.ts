/**
 * Lead Discovery tools - Facebook groups, government tenders, mortgage prospects, new businesses.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { searchGovernmentTenders } from '../scrapers/gov-tenders';
import { findMortgageProspects } from '../scrapers/real-estate';
import { findNewBusinesses } from '../scrapers/company-registry';
import { FacebookGroup } from '../types';

// Curated Israeli insurance/finance Facebook groups directory
const FACEBOOK_GROUPS: FacebookGroup[] = [
  { groupName: 'סוכני ביטוח ישראל', url: 'https://www.facebook.com/groups/israelinsuranceagents', memberCount: 15000, topicRelevance: 95, suggestedKeywords: ['ביטוח', 'סוכן', 'פוליסה', 'חידוש'], category: 'insurance_professionals' },
  { groupName: 'ביטוח פנסיוני - שאלות ותשובות', url: 'https://www.facebook.com/groups/pensioninsurance', memberCount: 28000, topicRelevance: 90, suggestedKeywords: ['פנסיה', 'קרן', 'חיסכון', 'פרישה'], category: 'pension' },
  { groupName: 'משכנתאות ישראל - ייעוץ וטיפים', url: 'https://www.facebook.com/groups/israelimortgage', memberCount: 45000, topicRelevance: 85, suggestedKeywords: ['משכנתא', 'דירה', 'ריבית', 'מחזור', 'ביטוח משכנתא'], category: 'mortgage' },
  { groupName: 'נדל"ן להשקעה ישראל', url: 'https://www.facebook.com/groups/israelrealestateinvest', memberCount: 62000, topicRelevance: 75, suggestedKeywords: ['השקעה', 'נדלן', 'דירה', 'תשואה', 'ביטוח נכס'], category: 'real_estate' },
  { groupName: 'יזמות ועסקים קטנים', url: 'https://www.facebook.com/groups/israelsmallbusiness', memberCount: 85000, topicRelevance: 70, suggestedKeywords: ['עסק', 'ביטוח עסקי', 'עצמאי', 'חברה', 'אחריות'], category: 'business' },
  { groupName: 'ביטוח רכב - השוואות ומבצעים', url: 'https://www.facebook.com/groups/israelcarinsurance', memberCount: 35000, topicRelevance: 90, suggestedKeywords: ['ביטוח רכב', 'מקיף', 'צד ג', 'תביעה', 'חידוש'], category: 'car_insurance' },
  { groupName: 'ביטוח בריאות פרטי', url: 'https://www.facebook.com/groups/israelhealth', memberCount: 22000, topicRelevance: 90, suggestedKeywords: ['בריאות', 'ניתוח', 'תרופות', 'כיסוי', 'ביטוח משלים'], category: 'health_insurance' },
  { groupName: 'חיסכון והשקעות לכל כיס', url: 'https://www.facebook.com/groups/israelsavings', memberCount: 120000, topicRelevance: 65, suggestedKeywords: ['חיסכון', 'השקעה', 'קרן השתלמות', 'גמל', 'פנסיה'], category: 'savings' },
  { groupName: 'הורים ופיננסים', url: 'https://www.facebook.com/groups/parentsfinance', memberCount: 55000, topicRelevance: 70, suggestedKeywords: ['ביטוח ילדים', 'חיסכון ילדים', 'ביטוח בריאות', 'חינוך'], category: 'family' },
  { groupName: 'עצמאים בישראל', url: 'https://www.facebook.com/groups/israelfreelancers', memberCount: 95000, topicRelevance: 80, suggestedKeywords: ['עצמאי', 'פנסיה', 'ביטוח לאומי', 'קרן השתלמות', 'ביטוח אובדן כושר'], category: 'freelancers' },
  { groupName: 'רופאים ורפואה בישראל', url: 'https://www.facebook.com/groups/israeldoctors', memberCount: 18000, topicRelevance: 75, suggestedKeywords: ['רופא', 'ביטוח מקצועי', 'אחריות רפואית', 'פנסיה רופאים'], category: 'premium_professionals' },
  { groupName: 'עורכי דין ישראל', url: 'https://www.facebook.com/groups/israellawyers', memberCount: 25000, topicRelevance: 75, suggestedKeywords: ['עורך דין', 'ביטוח מקצועי', 'אחריות', 'פנסיה'], category: 'premium_professionals' },
];

export function registerLeadDiscoveryTools(server: McpServer): void {

  // 1. Search Facebook Groups (Curated Directory)
  server.registerTool(
    'search_facebook_groups',
    {
      title: 'Search Israeli Insurance Facebook Groups',
      description: 'Browse a curated directory of Israeli Facebook groups relevant to insurance, finance, mortgage, and business. Returns group metadata, suggested keywords for lead generation, and relevance scores. Note: this is a reference directory, not live scraping.',
      inputSchema: {
        category: z.string().optional().describe('Category filter: insurance_professionals, pension, mortgage, real_estate, business, car_insurance, health_insurance, savings, family, freelancers, premium_professionals'),
        keywords: z.array(z.string()).optional().describe('Keywords to match against group names and suggested keywords'),
        minRelevance: z.number().optional().default(0).describe('Minimum relevance score (0-100)'),
      },
    },
    async ({ category, keywords, minRelevance }) => {
      let groups = [...FACEBOOK_GROUPS];

      if (category) {
        groups = groups.filter(g => g.category === category);
      }
      if (keywords?.length) {
        groups = groups.filter(g =>
          keywords.some(kw =>
            g.groupName.includes(kw) ||
            g.suggestedKeywords.some(sk => sk.includes(kw))
          )
        );
      }
      if (minRelevance) {
        groups = groups.filter(g => g.topicRelevance >= minRelevance);
      }

      groups.sort((a, b) => b.topicRelevance - a.topicRelevance);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            totalGroups: groups.length,
            totalPotentialReach: groups.reduce((sum, g) => sum + (g.memberCount || 0), 0),
            groups,
            tips: [
              'פרסם תוכן בעל ערך (טיפים, השוואות) - לא מכירתי',
              'ענה על שאלות בקבוצות כמומחה ביטוח',
              'שתף עדכוני רגולציה ומידע שוק',
              'הצע ייעוץ חינם ראשוני דרך הקבוצות',
            ],
            dataSource: 'curated_directory',
            warnings: ['This is a curated directory of known groups - not live scraping. URLs are representative.'],
          }, null, 2),
        }],
      };
    }
  );

  // 2. Search Government Tenders
  server.registerTool(
    'search_government_tenders',
    {
      title: 'Search Government Insurance Tenders',
      description: 'Search Israeli government tenders (mr.gov.il, govbuy.gov.il) for insurance-related procurement opportunities. Government bodies regularly tender for employee insurance, property insurance, and pension services.',
      inputSchema: {
        keywords: z.array(z.string()).optional().describe('Search keywords (Hebrew). Defaults to insurance-related terms.'),
        category: z.string().optional().describe('Category filter (e.g., ביטוח, פנסיה, שירותים פיננסיים)'),
        minValue: z.number().optional().describe('Minimum tender value in ILS'),
        daysBack: z.number().optional().default(90).describe('How many days back to search'),
      },
    },
    async ({ keywords, category, minValue, daysBack }) => {
      const result = await searchGovernmentTenders(keywords, category, minValue, daysBack);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            totalTenders: result.tenders.length,
            tenders: result.tenders,
            interpretation: result.tenders.length > 0
              ? `נמצאו ${result.tenders.length} מכרזים רלוונטיים. מכרזים ממשלתיים הם הזדמנות לעסקאות גדולות בביטוח קולקטיבי ורכוש.`
              : 'לא נמצאו מכרזים רלוונטיים בתקופה הנבחרת.',
            warnings: result.warnings,
            source: 'mr.gov.il + govbuy.gov.il',
          }, null, 2),
        }],
      };
    }
  );

  // 3. Find Mortgage Prospects
  server.registerTool(
    'find_mortgage_prospects',
    {
      title: 'Find Mortgage & Real Estate Prospects',
      description: 'Identify high-activity real estate areas in Israel where mortgage demand is highest. People buying properties need: mortgage life insurance, home insurance, and often review all their insurance. Returns market activity scores by city.',
      inputSchema: {
        region: z.string().optional().describe('Region filter (מרכז, צפון, דרום, שרון, ירושלים)'),
        propertyType: z.string().optional().describe('Property type (דירה, בית, פנטהאוז)'),
        priceRange: z.object({
          min: z.number().describe('Minimum price in ILS'),
          max: z.number().describe('Maximum price in ILS'),
        }).optional().describe('Price range filter'),
      },
    },
    async ({ region, propertyType, priceRange }) => {
      const result = await findMortgageProspects(region, propertyType, priceRange);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            totalAreas: result.signals.length,
            signals: result.signals,
            hottest: result.signals.slice(0, 3),
            strategy: 'אזורים עם ביקוש גבוה למשכנתאות = הזדמנות ל: ביטוח חיים למשכנתא, ביטוח דירה, סקירת ביטוח מלאה ללקוחות חדשים',
            warnings: result.warnings,
            source: 'Yad2 + Israeli Real Estate Market Data',
          }, null, 2),
        }],
      };
    }
  );

  // 4. Find New Businesses
  server.registerTool(
    'find_new_businesses',
    {
      title: 'Find Newly Registered Businesses',
      description: 'Discover recently registered Israeli businesses that need insurance setup. New businesses typically need: business liability, property, employee benefits, directors & officers, and professional indemnity insurance.',
      inputSchema: {
        daysBack: z.number().optional().default(30).describe('How many days back to search for new registrations'),
        sector: z.string().optional().describe('Business sector filter'),
        region: z.string().optional().describe('City or region filter'),
        limit: z.number().optional().default(50).describe('Max results'),
      },
    },
    async ({ daysBack, sector, region, limit }) => {
      const result = await findNewBusinesses(daysBack, limit);

      let companies = result.companies;
      if (sector) {
        companies = companies.filter(c => c.type?.includes(sector) || c.sector?.includes(sector));
      }
      if (region) {
        companies = companies.filter(c => c.city?.includes(region));
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            totalFound: companies.length,
            companies,
            opportunity: companies.length > 0
              ? `נמצאו ${companies.length} עסקים חדשים ב-${daysBack} הימים האחרונים. עסקים חדשים צריכים: ביטוח עסקי, אחריות מקצועית, ביטוח עובדים, פנסיה.`
              : 'לא נמצאו עסקים חדשים בפרמטרים שנבחרו.',
            suggestedApproach: [
              'שלח מייל/וואטסאפ עם הצעה לסקירת ביטוח חינם',
              'הצע חבילת ביטוח עסק חדש (אחריות + רכוש + עובדים)',
              'תזמן פגישה לתכנון פנסיוני לעובדים',
            ],
            warnings: result.warnings,
            source: 'data.gov.il - Israeli Companies Registrar',
          }, null, 2),
        }],
      };
    }
  );
}
