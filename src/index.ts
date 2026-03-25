/**
 * UP360 MCP Server
 * Israeli Insurance Intelligence - Business Data, Insurance Market, Lead Discovery, Enrichment
 *
 * 15 tools across 4 categories:
 * - Business Intelligence: company search, details, hiring signals, news signals
 * - Insurance Market: products, rate comparison, regulatory updates, pension performance
 * - Lead Discovery: Facebook groups, government tenders, mortgage prospects, new businesses
 * - Enrichment: contact lookup, company enrichment, area demographics
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerBusinessIntelligenceTools } from './tools/business-intelligence';
import { registerInsuranceMarketTools } from './tools/insurance-market';
import { registerLeadDiscoveryTools } from './tools/lead-discovery';
import { registerEnrichmentTools } from './tools/enrichment';

const server = new McpServer({
  name: 'up360mcp',
  version: '1.0.0',
});

// Register all tools
registerBusinessIntelligenceTools(server);
registerInsuranceMarketTools(server);
registerLeadDiscoveryTools(server);
registerEnrichmentTools(server);

// Connect via stdio transport for Claude CLI integration
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('up360mcp v1.0.0 — Israeli Insurance Intelligence MCP Server');
  console.error('15 tools: business-intelligence(4), insurance-market(4), lead-discovery(4), enrichment(3)');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
