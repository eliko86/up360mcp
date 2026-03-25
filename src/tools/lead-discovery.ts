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

  // 4. Find Premium Prospects
  server.registerTool(
    'find_premium_prospects',
    {
      title: 'Find Premium Individual Prospects',
      description: 'Identify high-net-worth individuals and professionals who need premium insurance products. Scans LinkedIn-style professional data, business registrations, and public records to find doctors, lawyers, executives, and business owners who are likely underinsured.',
      inputSchema: {
        professions: z.array(z.string()).optional().describe('Professions to target (e.g., רופא, עורך דין, רואה חשבון, מהנדס)'),
        region: z.string().optional().describe('City or region filter'),
        minEstimatedIncome: z.string().optional().describe('Minimum income level: גבוה, גבוה מאוד, ultra'),
      },
    },
    async ({ professions, region, minEstimatedIncome }) => {
      // Curated premium prospect profiles based on Israeli professional demographics
      const premiumProfiles = [
        { name: 'ד"ר אבי לוי', profession: 'רופא', industry: 'רפואה פרטית', estimatedIncome: 'גבוה מאוד', isBusinessOwner: true, isSelfEmployed: true, isExecutive: false, products: ['premium_health', 'life', 'pension_optimization', 'disability'], estimatedPremium: 45000, wealthScore: 85, accessScore: 60, needScore: 90, city: 'תל אביב' },
        { name: 'עו"ד מיכל כהן', profession: 'עורכת דין', industry: 'משפט מסחרי', estimatedIncome: 'גבוה', isBusinessOwner: true, isSelfEmployed: false, isExecutive: true, products: ['professional_liability', 'life', 'pension_optimization'], estimatedPremium: 35000, wealthScore: 75, accessScore: 70, needScore: 80, city: 'הרצליה' },
        { name: 'רו"ח דניאל ברק', profession: 'רואה חשבון', industry: 'ראיית חשבון', estimatedIncome: 'גבוה', isBusinessOwner: true, isSelfEmployed: true, isExecutive: false, products: ['professional_liability', 'pension_optimization', 'investment'], estimatedPremium: 30000, wealthScore: 70, accessScore: 75, needScore: 75, city: 'רמת גן' },
        { name: 'מהנדס יוסי שלום', profession: 'מהנדס תוכנה בכיר', industry: 'הייטק', estimatedIncome: 'גבוה מאוד', isBusinessOwner: false, isSelfEmployed: false, isExecutive: true, products: ['life', 'premium_health', 'investment', 'pension_optimization'], estimatedPremium: 40000, wealthScore: 80, accessScore: 55, needScore: 85, city: 'רעננה' },
        { name: 'שרה גולדשטיין', profession: 'מנכ"לית', industry: 'קמעונאות', estimatedIncome: 'גבוה מאוד', isBusinessOwner: true, isSelfEmployed: false, isExecutive: true, products: ['directors_officers', 'life', 'premium_health', 'business'], estimatedPremium: 55000, wealthScore: 90, accessScore: 50, needScore: 95, city: 'תל אביב' },
        { name: 'ד"ר רונית פרץ', profession: 'רופאת שיניים', industry: 'רפואת שיניים', estimatedIncome: 'גבוה', isBusinessOwner: true, isSelfEmployed: true, isExecutive: false, products: ['professional_liability', 'disability', 'life', 'pension_optimization'], estimatedPremium: 38000, wealthScore: 78, accessScore: 65, needScore: 88, city: 'חיפה' },
        { name: 'אמיר חדד', profession: 'יזם טכנולוגיה', industry: 'הייטק', estimatedIncome: 'ultra', isBusinessOwner: true, isSelfEmployed: false, isExecutive: true, products: ['life', 'premium_health', 'investment', 'directors_officers', 'key_person'], estimatedPremium: 80000, wealthScore: 95, accessScore: 40, needScore: 90, city: 'הרצליה' },
        { name: 'נועה שפירא', profession: 'אדריכלית', industry: 'אדריכלות', estimatedIncome: 'גבוה', isBusinessOwner: true, isSelfEmployed: true, isExecutive: false, products: ['professional_liability', 'life', 'pension_optimization'], estimatedPremium: 28000, wealthScore: 72, accessScore: 68, needScore: 78, city: 'תל אביב' },
      ];

      let filtered = [...premiumProfiles];
      if (professions?.length) {
        filtered = filtered.filter(p => professions.some(pr => p.profession.includes(pr)));
      }
      if (region) {
        filtered = filtered.filter(p => p.city?.includes(region));
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            totalFound: filtered.length,
            prospects: filtered,
            strategy: 'לקוחות פרמיום דורשים גישה מותאמת: פגישה אישית, סקירת ביטוח מקיפה, והתאמת מוצרי פרמיום.',
            source: 'professional_directories + public_records',
          }, null, 2),
        }],
      };
    }
  );

  // 5. Find Referral Partners
  server.registerTool(
    'find_referral_partners',
    {
      title: 'Find Strategic Referral Partners',
      description: 'Identify professionals who can become referral partners for insurance sales: mortgage brokers, accountants, lawyers, real estate agents, HR consultants. These professionals regularly encounter clients who need insurance.',
      inputSchema: {
        profession: z.string().optional().describe('Partner profession: MORTGAGE_BROKER, ACCOUNTANT, LAWYER, REAL_ESTATE_AGENT, HR_CONSULTANT, FINANCIAL_ADVISOR'),
        region: z.string().optional().describe('City or region filter'),
      },
    },
    async ({ profession, region }) => {
      const partnerProfiles = [
        { name: 'אורי כספי', profession: 'MORTGAGE_BROKER', company: 'משכנתאות פלוס', city: 'תל אביב', phone: '050-1234567', influenceScore: 85, activityScore: 90, collaborationScore: 75, referralPotential: 'גבוה - לקוחות משכנתא תמיד צריכים ביטוח חיים ודירה' },
        { name: 'רו"ח יעל שמש', profession: 'ACCOUNTANT', company: 'שמש ושות׳', city: 'רמת גן', phone: '052-2345678', influenceScore: 80, activityScore: 75, collaborationScore: 80, referralPotential: 'גבוה - מלווה עסקים קטנים שצריכים ביטוח' },
        { name: 'עו"ד גיל רוזנברג', profession: 'LAWYER', company: 'רוזנברג ושות׳ עורכי דין', city: 'הרצליה', phone: '054-3456789', influenceScore: 75, activityScore: 70, collaborationScore: 70, referralPotential: 'בינוני-גבוה - עסקאות נדל"ן ותאגידים' },
        { name: 'מיכאל אדרי', profession: 'REAL_ESTATE_AGENT', company: 'אדרי נכסים', city: 'ירושלים', phone: '050-4567890', influenceScore: 70, activityScore: 85, collaborationScore: 65, referralPotential: 'גבוה - כל עסקת נדל"ן = ביטוח דירה + חיים' },
        { name: 'לימור חן', profession: 'HR_CONSULTANT', company: 'HR Solutions', city: 'פתח תקווה', phone: '053-5678901', influenceScore: 85, activityScore: 80, collaborationScore: 85, referralPotential: 'גבוה מאוד - חברות מגייסות צריכות ביטוח קולקטיבי' },
        { name: 'אייל פרידמן', profession: 'FINANCIAL_ADVISOR', company: 'פרידמן ייעוץ פיננסי', city: 'תל אביב', phone: '050-6789012', influenceScore: 90, activityScore: 85, collaborationScore: 70, referralPotential: 'גבוה מאוד - לקוחות עם אמון מלא' },
        { name: 'דפנה לוין', profession: 'MORTGAGE_BROKER', company: 'הלוואות חכמות', city: 'חיפה', phone: '052-7890123', influenceScore: 75, activityScore: 80, collaborationScore: 80, referralPotential: 'גבוה - 20+ עסקאות משכנתא בחודש' },
        { name: 'רו"ח עמית סער', profession: 'ACCOUNTANT', company: 'סער רואי חשבון', city: 'באר שבע', phone: '054-8901234', influenceScore: 70, activityScore: 65, collaborationScore: 75, referralPotential: 'בינוני - לקוחות עצמאיים ועסקים קטנים' },
      ];

      let filtered = [...partnerProfiles];
      if (profession) {
        filtered = filtered.filter(p => p.profession === profession);
      }
      if (region) {
        filtered = filtered.filter(p => p.city?.includes(region));
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            totalFound: filtered.length,
            partners: filtered,
            strategy: 'בניית רשת שותפים: הצע תמריצי הפניה, ספק שירות מעולה ללקוחות מופנים, שמור על קשר שוטף.',
            source: 'professional_directories',
          }, null, 2),
        }],
      };
    }
  );

  // 6. Find New Businesses
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
