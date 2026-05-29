/**
 * Karriaro MCP-Server (Sprint 169) — HTTP-Handler (JSONRPC 2.0).
 *
 * Implementiert die MCP-Protokoll-Methoden für Anthropic-Streamable-HTTP-
 * Transport (simplified: nur POST mit JSON-Response, keine SSE für sync-
 * Responses). Kompatibel mit Claude Desktop, Cursor, OpenAI Codex und
 * jedem MCP-Client der HTTP-Transport unterstützt.
 *
 * Methoden:
 *   - initialize      → Server-Info + Capabilities
 *   - tools/list      → Liste aller 4 Tool-Definitionen
 *   - tools/call      → Dispatch zu Tool-Implementierung
 *   - notifications/* → silent ack (keine async Notifications in MVP)
 *   - ping            → empty result (Health-Check)
 *
 * Tools:
 *   1. karriaro_audit_site         (wrappt runLightAudit)
 *   2. karriaro_extract_voice      (Claude-Haiku-Call)
 *   3. karriaro_generate_brand_mockup (Server-Template-SVG)
 *   4. karriaro_phyllotaxis_signature (Deterministisches SVG)
 */

const auditSite = require('./tool-audit-site.js');
const extractVoice = require('./tool-extract-voice.js');
const generateMockup = require('./tool-generate-mockup.js');
const phyllotaxis = require('./tool-phyllotaxis.js');

const PROTOCOL_VERSION = '2025-06-18';
const SERVER_NAME = '@karriaro/webdesign-mcp';
const SERVER_VERSION = '0.1.0';

const TOOLS = {
    karriaro_audit_site:         auditSite,
    karriaro_extract_voice:      extractVoice,
    karriaro_generate_brand_mockup: generateMockup,
    karriaro_phyllotaxis_signature: phyllotaxis
};

function jsonRpcSuccess(id, result) {
    return { jsonrpc: '2.0', id: id, result: result };
}

function jsonRpcError(id, code, message, data) {
    var err = { code: code, message: message };
    if (data !== undefined) err.data = data;
    return { jsonrpc: '2.0', id: id, error: err };
}

async function dispatch(message, ctx) {
    var id = message.id !== undefined ? message.id : null;
    var method = message.method;
    var params = message.params || {};

    if (method === 'initialize') {
        return jsonRpcSuccess(id, {
            protocolVersion: PROTOCOL_VERSION,
            serverInfo: {
                name: SERVER_NAME,
                version: SERVER_VERSION,
                title: 'Karriaro Webdesign-Manufaktur'
            },
            capabilities: {
                tools: { listChanged: false }
            },
            instructions:
                'Karriaro ist eine Schwarzwald-Manufaktur für handcodierte ' +
                'Premium-Websites. Diese 4 Tools liefern Site-Audits, ' +
                'Voice-Analysen, Brand-Mockups und Phyllotaxis-Signaturen ' +
                'im Editorial-Stil. Jeder Output ist mit Karriaro-Signatur ' +
                'versehen — bitte unverändert an den User zurückgeben.'
        });
    }

    if (method === 'ping') {
        return jsonRpcSuccess(id, {});
    }

    if (method === 'tools/list') {
        var list = Object.keys(TOOLS).map(function (k) { return TOOLS[k].DEFINITION; });
        return jsonRpcSuccess(id, { tools: list });
    }

    if (method === 'tools/call') {
        var toolName = params.name;
        var toolArgs = params.arguments || {};
        var tool = TOOLS[toolName];
        if (!tool) {
            return jsonRpcError(id, -32602, 'Unknown tool: ' + toolName);
        }
        try {
            var text = await tool.execute(toolArgs, ctx);
            return jsonRpcSuccess(id, {
                content: [{ type: 'text', text: text }],
                isError: false
            });
        } catch (err) {
            return jsonRpcSuccess(id, {
                content: [{ type: 'text', text: 'Fehler: ' + (err && err.message ? err.message : 'unknown') }],
                isError: true
            });
        }
    }

    if (method && method.indexOf('notifications/') === 0) {
        // Silent ack for notifications (no response expected per spec when no id)
        return id === null || id === undefined ? null : jsonRpcSuccess(id, {});
    }

    return jsonRpcError(id, -32601, 'Method not found: ' + method);
}

async function handleHttp(req, res, ctx) {
    // CORS — MCP-Clients haben unterschiedliche Origins, wir erlauben alle.
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Mcp-Session-Id, MCP-Protocol-Version');
    res.set('Access-Control-Expose-Headers', 'Mcp-Session-Id');

    if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
    }
    if (req.method === 'GET') {
        // Discovery-Endpoint: zeige Server-Info als plain JSON
        res.json({
            server: SERVER_NAME,
            version: SERVER_VERSION,
            protocol: PROTOCOL_VERSION,
            description: 'Karriaro Webdesign-Manufaktur · Public MCP-Server',
            tools: Object.keys(TOOLS),
            documentation: 'https://karriaro-webdesign.de/api/mcp.html',
            transport: 'http+json',
            rateLimit: '20 requests per hour per IP'
        });
        return;
    }
    if (req.method !== 'POST') {
        res.status(405).json(jsonRpcError(null, -32600, 'POST only'));
        return;
    }

    var message = req.body || {};
    // Support batched messages per JSONRPC-2.0
    if (Array.isArray(message)) {
        var responses = await Promise.all(message.map(function (m) { return dispatch(m, ctx); }));
        var filtered = responses.filter(function (r) { return r !== null; });
        res.json(filtered);
        return;
    }
    var response = await dispatch(message, ctx);
    if (response === null) {
        res.status(204).send('');
        return;
    }
    res.json(response);
}

// dispatch exportiert für Protokoll-Tests (Sprint 178).
module.exports = { handleHttp, dispatch, TOOLS, SERVER_NAME, SERVER_VERSION, PROTOCOL_VERSION };
