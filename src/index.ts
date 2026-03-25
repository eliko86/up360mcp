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
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
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

const useStdio = process.argv.includes('--stdio');

async function main() {
  if (useStdio) {
    // Stdio transport for Claude CLI integration
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('up360mcp v1.0.0 — Israeli Insurance Intelligence MCP Server (stdio)');
    console.error('15 tools: business-intelligence(4), insurance-market(4), lead-discovery(4), enrichment(3)');
  } else {
    // HTTP transport for Render / remote deployment
    const express = require('express');
    const cors = require('cors');
    const app = express();
    const PORT = parseInt(process.env.PORT || '3000', 10);

    app.use(cors());
    app.use(express.json());

    // Health check
    app.get('/health', (_req: any, res: any) => {
      res.json({ status: 'ok', service: 'up360-mcp', version: '1.0.0', tools: 15 });
    });

    // ============ REST API for direct tool calls (used by UP360 backend) ============
    // List all tools
    app.get('/api/tools', (_req: any, res: any) => {
      const tools = Object.entries((server as any)._registeredTools).map(([name, t]: [string, any]) => ({
        name,
        description: t.description,
      }));
      res.json({ tools });
    });

    // Call a tool by name — args passed as JSON body
    app.post('/api/tools/:name', async (req: any, res: any) => {
      const toolName = req.params.name;
      const tool = (server as any)._registeredTools[toolName];
      if (!tool) {
        return res.status(404).json({ error: `Tool not found: ${toolName}` });
      }
      try {
        const args = req.body || {};
        // Call handler directly — it receives (parsedArgs, extra)
        const result = await tool.handler(args, {} as any);
        // Extract the text content from MCP response format
        const text = result?.content?.[0]?.text;
        const data = text ? JSON.parse(text) : result;
        res.json({ tool: toolName, data, executedAt: new Date().toISOString() });
      } catch (error: any) {
        console.error(`REST tool error: ${toolName}`, error.message);
        res.status(500).json({ error: error.message, tool: toolName });
      }
    });

    // MCP endpoint
    app.post('/mcp', async (req: any, res: any) => {
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined as any });
      res.on('close', () => { transport.close(); });
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    });

    // Handle GET and DELETE for SSE sessions
    app.get('/mcp', async (req: any, res: any) => {
      res.writeHead(405).end(JSON.stringify({ error: 'Method not allowed. Use POST.' }));
    });

    app.delete('/mcp', async (req: any, res: any) => {
      res.writeHead(405).end(JSON.stringify({ error: 'Method not allowed.' }));
    });

    app.listen(PORT, () => {
      console.log(`up360mcp v1.0.0 — HTTP server on port ${PORT}`);
      console.log(`Health: http://localhost:${PORT}/health`);
      console.log(`MCP: http://localhost:${PORT}/mcp`);
    });
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
