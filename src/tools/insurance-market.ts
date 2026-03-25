/**
 * Insurance Market tools - products, rate comparison, regulatory, pension performance.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getInsuranceProducts, compareRates } from '../scrapers/insurance-companies';
import { getRegulatoryUpdates } from '../scrapers/hon-gov';
import { getPensionFundPerformance } from '../scrapers/gemelnet';

export function registerInsuranceMarketTools(server: McpServer): void {

  // 1. Get Insurance Products
  server.registerTool(
    'get_insurance_products',
    {
      title: 'Get Insurance Products',
      description: 'Get detailed insurance product information from Israeli insurance companies (מגדל, מנורה, הפניקס, הראל, איילון, הכשרה, שומרה). Includes features, premiums, and coverage details for health, life, pension, car, property, business, travel, nursing, and disability insurance.',
      inputSchema: {
        company: z.string().optional().describe('Insurance company name (e.g., מגדל, הראל, הפניקס, מנורה)'),
        productType: z.enum(['health', 'life', 'pension', 'hishtalmut', 'disability', 'car', 'property', 'business', 'travel', 'nursing']).optional().describe('Filter by product type'),
      },
    },
    async ({ company, productType }) => {
      const result = await getInsuranceProducts(company, productType);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            totalProducts: result.products.length,
            products: result.products,
            companies: [...new Set(result.products.map(p => p.company))],
            types: [...new Set(result.products.map(p => p.type))],
            warnings: result.warnings,
            source: 'Israeli Insurance Company Data + hon.gov.il',
          }, null, 2),
        }],
      };
    }
  );

  // 2. Compare Insurance Rates
  server.registerTool(
    'compare_insurance_rates',
    {
      title: 'Compare Insurance Rates',
      description: 'Compare insurance rates across Israeli insurance companies for a specific policy type. Adjusts estimates based on age and coverage amount. Great for showing clients which company offers the best value.',
      inputSchema: {
        policyType: z.enum(['health', 'life', 'pension', 'hishtalmut', 'disability', 'car', 'property', 'business', 'travel', 'nursing']).describe('Type of insurance policy to compare'),
        age: z.number().optional().describe('Client age (affects health, life, disability, nursing premiums)'),
        coverageAmount: z.number().optional().describe('Desired coverage amount in ILS'),
      },
    },
    async ({ policyType, age, coverageAmount }) => {
      const result = await compareRates(policyType, age, coverageAmount);

      const policyTypeHebrew: Record<string, string> = {
        health: 'ביטוח בריאות', life: 'ביטוח חיים', pension: 'קרן פנסיה',
        hishtalmut: 'קרן השתלמות', disability: 'אובדן כושר עבודה', car: 'ביטוח רכב',
        property: 'ביטוח דירה', business: 'ביטוח עסקי', travel: 'ביטוח נסיעות', nursing: 'ביטוח סיעודי',
      };

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            policyType: policyTypeHebrew[policyType] || policyType,
            clientAge: age,
            comparisons: result.comparisons,
            cheapest: result.comparisons.find(c => c.monthlyPremium),
            recommendation: result.comparisons.length > 0
              ? `נמצאו ${result.comparisons.length} מוצרים להשוואה. המחיר הנמוך ביותר: ${result.comparisons[0]?.company} ב-₪${result.comparisons[0]?.monthlyPremium || 'N/A'}/חודש.`
              : 'לא נמצאו מוצרים להשוואה.',
            warnings: result.warnings,
            source: 'Israeli Insurance Market Data',
          }, null, 2),
        }],
      };
    }
  );

  // 3. Get Regulatory Updates
  server.registerTool(
    'get_regulatory_updates',
    {
      title: 'Get Regulatory Updates',
      description: 'Fetch recent circulars and regulatory updates from the Israeli Capital Markets Authority (רשות שוק ההון - hon.gov.il). Stay compliant and find opportunities from new regulations.',
      inputSchema: {
        category: z.enum(['insurance', 'pension', 'provident', 'capital', 'all']).optional().default('all').describe('Regulatory category'),
        daysBack: z.number().optional().default(90).describe('How many days back to search'),
        keywords: z.array(z.string()).optional().describe('Filter by keywords (Hebrew)'),
      },
    },
    async ({ category, daysBack, keywords }) => {
      const result = await getRegulatoryUpdates(category, daysBack, keywords);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            totalUpdates: result.updates.length,
            updates: result.updates,
            warnings: result.warnings,
            source: 'רשות שוק ההון - hon.gov.il',
          }, null, 2),
        }],
      };
    }
  );

  // 4. Get Pension Fund Performance
  server.registerTool(
    'get_pension_fund_performance',
    {
      title: 'Get Pension Fund Performance',
      description: 'Get performance data for Israeli pension funds, provident funds (gemel), hishtalmut funds, and manager insurance. Compare returns, management fees, and asset sizes across companies.',
      inputSchema: {
        fundType: z.enum(['pension', 'provident', 'hishtalmut', 'managers']).optional().describe('Type of fund'),
        period: z.enum(['1y', '3y', '5y']).optional().default('1y').describe('Return period to sort by'),
        minReturn: z.number().optional().describe('Minimum return percentage to filter'),
      },
    },
    async ({ fundType, period, minReturn }) => {
      const result = await getPensionFundPerformance(fundType, period, minReturn);

      const fundTypeHebrew: Record<string, string> = {
        pension: 'קרנות פנסיה', provident: 'קופות גמל',
        hishtalmut: 'קרנות השתלמות', managers: 'ביטוחי מנהלים',
      };

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            fundType: fundType ? fundTypeHebrew[fundType] : 'כל הקרנות',
            totalFunds: result.funds.length,
            funds: result.funds,
            topPerformer: result.funds[0],
            lowestFee: [...result.funds].sort((a, b) => (a.managementFee || 99) - (b.managementFee || 99))[0],
            warnings: result.warnings,
            source: 'Gemelnet / hon.gov.il',
          }, null, 2),
        }],
      };
    }
  );
}
