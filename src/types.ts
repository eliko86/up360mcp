/**
 * Shared types for UP360 MCP scrapers and tools.
 */

export interface CompanyRecord {
  name: string;
  registrationNumber?: string;
  type?: string;
  status?: string;
  registrationDate?: string;
  city?: string;
  sector?: string;
  isPublic?: boolean;
  taseId?: number;
  marketCap?: number;
  employeeEstimate?: number;
}

export interface CompanyDetail extends CompanyRecord {
  description?: string;
  address?: string;
  directors?: string[];
  financials?: {
    revenue?: number;
    profit?: number;
    equity?: number;
    year?: number;
  };
  recentNews?: NewsSignal[];
  openPositions?: number;
}

export interface NewsSignal {
  title: string;
  source: string;
  publishDate: string;
  url: string;
  relevantCompanies: string[];
  signalType: 'funding' | 'ma' | 'expansion' | 'ipo' | 'regulation' | 'hiring' | 'awards' | 'general';
  snippet?: string;
}

export interface HiringSignal {
  companyName: string;
  openPositions: number;
  roles: string[];
  region?: string;
  growthScore: number;
  source: string;
  url?: string;
}

export interface InsuranceProduct {
  company: string;
  productName: string;
  type: string;
  description: string;
  features: string[];
  monthlyPremium?: { min: number; max: number; typical?: number };
  waitingPeriod?: string;
  maxAge?: number;
  url?: string;
}

export interface RateComparison {
  company: string;
  productName: string;
  monthlyPremium?: number;
  coverageLevel: string;
  rating?: number;
  notes: string;
}

export interface RegulatoryUpdate {
  circularNumber: string;
  title: string;
  date: string;
  category: string;
  pdfUrl?: string;
  summary?: string;
}

export interface PensionFund {
  fundName: string;
  company: string;
  fundType: string;
  return1Y?: number;
  return3Y?: number;
  return5Y?: number;
  managementFee?: number;
  assets?: number;
}

export interface GovernmentTender {
  tenderNumber: string;
  title: string;
  issuingBody: string;
  deadline?: string;
  estimatedValue?: number;
  category: string;
  url: string;
}

export interface MortgageSignal {
  region: string;
  city: string;
  activeListings: number;
  avgPrice?: number;
  marketActivity: 'low' | 'medium' | 'high' | 'very_high';
  mortgageDemandScore: number;
}

export interface FacebookGroup {
  groupName: string;
  url: string;
  memberCount?: number;
  topicRelevance: number;
  suggestedKeywords: string[];
  category: string;
}

export interface ContactInfo {
  name?: string;
  phone?: string;
  possibleLinkedIn?: string;
  possibleCompany?: string;
  possibleRole?: string;
  sources: string[];
}

export interface AreaDemographics {
  city: string;
  population?: number;
  medianAge?: number;
  avgIncomeIndex?: number;
  businesses?: number;
  growthRate?: number;
  insuranceMarketScore: number;
}

export interface ToolResult {
  data: any;
  warnings: string[];
  cachedAt?: string;
  source: string;
}
