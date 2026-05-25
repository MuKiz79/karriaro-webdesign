#!/usr/bin/env node
/**
 * Karriaro Webdesign-MCP-Server — stdio-Variante.
 *
 * Proxiert MCP-Tool-Calls vom lokalen Client (Claude Desktop, Cursor,
 * OpenAI Codex) zum public HTTP-Endpoint der Karriaro Webdesign-Manufaktur.
 *
 * Vier Tools:
 *   1. karriaro_audit_site         — Site-Audit (Substanz, BFSG, SEO)
 *   2. karriaro_extract_voice      — Brand-Voice-Analyse via Claude
 *   3. karriaro_generate_brand_mockup — Hero-Mockup-SVG für Branche
 *   4. karriaro_phyllotaxis_signature — Persönliches Goldener-Winkel-Siegel
 *
 * Vorteile gegenüber direkter HTTP-MCP-Konfiguration:
 *   - läuft lokal, kein Vertrauen in HTTP-Server-Auth-Setup nötig
 *   - leicht testbar (stdio)
 *   - Air-Gap-tauglich (falls Endpoint später hinter Tunnel)
 *
 * Installation:
 *   npm install -g @karriaro/webdesign-mcp
 *
 * Claude-Desktop-Config (claude_desktop_config.json):
 *   {
 *     "mcpServers": {
 *       "karriaro": {
 *         "command": "karriaro-mcp"
 *       }
 *     }
 *   }
 *
 * Optional: ENDPOINT-URL via Environment-Variable überschreiben
 *   KARRIARO_MCP_ENDPOINT=https://staging.example/mcpHandler karriaro-mcp
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
    CallToolRequestSchema,
    ListToolsRequestSchema
} from '@modelcontextprotocol/sdk/types.js';

const ENDPOINT = process.env.KARRIARO_MCP_ENDPOINT
    || 'https://europe-west1-apex-executive.cloudfunctions.net/mcpHandler';

const PACKAGE_VERSION = '0.1.0';

async function rpc(method, params) {
    const id = Math.floor(Math.random() * 1e9);
    const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id, method, params })
    });
    if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }
    const data = await res.json();
    if (data.error) {
        throw new Error(`MCP-Error ${data.error.code}: ${data.error.message}`);
    }
    return data.result;
}

const server = new Server(
    {
        name: '@karriaro/webdesign-mcp',
        version: PACKAGE_VERSION
    },
    {
        capabilities: { tools: {} }
    }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
    const result = await rpc('tools/list', {});
    return { tools: result.tools };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const result = await rpc('tools/call', {
        name: request.params.name,
        arguments: request.params.arguments || {}
    });
    return result;
});

async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    // stdio-Server hört silent — keine console-Logs (würden stdio-Protokoll stören)
}

main().catch((err) => {
    process.stderr.write(`karriaro-mcp fatal: ${err.message}\n`);
    process.exit(1);
});
