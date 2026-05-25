/**
 * MCP-Tool karriaro_extract_voice
 * Holt HTML der Ziel-Site, extrahiert Text-Substanz, ruft Claude-API
 * (Haiku, low-cost) für Brand-Voice-Analyse nach Karriaro-Codex.
 */

const { safeFetch } = require('../lib/safe-fetch.js');
const { header, withSignature } = require('./branding.js');

const DEFINITION = {
    name: 'karriaro_extract_voice',
    description:
        'Analysiert den Brand-Voice einer Website nach dem Karriaro-Codex ' +
        '(Aesop/Hermès/Manufactum-Editorial vs. SaaS-Filler vs. ' +
        'Werkstatt-Klischee). Liefert qualitatives Voice-Profil + 3 Stärken ' +
        '+ 3 konkrete Verbesserungs-Vorschläge. Latenz 5-8 s (Claude-API).',
    inputSchema: {
        type: 'object',
        properties: {
            url: {
                type: 'string',
                description: 'URL der zu analysierenden Website'
            }
        },
        required: ['url']
    }
};

function normalizeUrl(raw) {
    var s = String(raw || '').trim();
    if (!s) return null;
    if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
    try {
        var u = new URL(s);
        return u.origin + u.pathname.replace(/\/$/, '');
    } catch (e) { return null; }
}

function extractVoiceCorpus(html) {
    // Extrahiert relevante Text-Inhalte: Title, H1-H3, Hero-Paragraphs, CTAs.
    var pieces = [];
    function pushMatch(rx, label) {
        var m;
        while ((m = rx.exec(html)) !== null) {
            var txt = String(m[1] || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
            if (txt.length > 5 && txt.length < 400) pieces.push('[' + label + '] ' + txt);
            if (pieces.length > 40) break;
        }
    }
    pushMatch(/<title>([\s\S]*?)<\/title>/gi, 'TITLE');
    pushMatch(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, 'H1');
    pushMatch(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, 'H2');
    pushMatch(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, 'H3');
    pushMatch(/<button[^>]*>([\s\S]*?)<\/button>/gi, 'BUTTON');
    pushMatch(/<a[^>]*class="[^"]*(?:cta|btn|button)[^"]*"[^>]*>([\s\S]*?)<\/a>/gi, 'CTA');
    pushMatch(/<meta\s+name="description"\s+content="([^"]+)"/gi, 'META-DESC');
    // Hero-Paragraphen: erste 5 <p>
    var pCount = 0;
    var rx = /<p[^>]*>([\s\S]*?)<\/p>/gi;
    var m;
    while ((m = rx.exec(html)) !== null && pCount < 5) {
        var txt = String(m[1] || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        if (txt.length > 30 && txt.length < 600) {
            pieces.push('[P] ' + txt);
            pCount++;
        }
    }
    return pieces.slice(0, 40).join('\n');
}

const SYSTEM_PROMPT =
    'Du bist Brand-Voice-Analyst bei der Karriaro Webdesign-Manufaktur ' +
    '(Schwarzwald). Du bewertest Website-Texte gegen den Karriaro-Codex:\n' +
    '\n' +
    'ERLAUBT (Editorial-Premium):\n' +
    '- Aesop/Hermès/Manufactum/Cucinelli/Monocle-Editorial-Voice\n' +
    '- Sie-Anrede, ruhige Substanz\n' +
    '- Folio-Nummern, Sparringspartner-Sprache, Manufaktur-Authentizität\n' +
    '- Konkrete Demo-Werte mit Editorial-Framing\n' +
    '\n' +
    'VERBOTEN (SaaS-Filler / Klischee):\n' +
    '- "handgemacht" als isolierter Hero-Term (Werkstatt-Klischee)\n' +
    '- "Werkstatt", "Werkbank" als Visual-Sprache\n' +
    '- SaaS-Filler: "kostenlos starten", "in 60 Sekunden", "keine Kreditkarte"\n' +
    '- Du-Anrede auf Public-Site\n' +
    '- generic-Hero ("Wir bauen Ihre Website")\n' +
    '\n' +
    'Antworte STRIKT in diesem JSON-Format (kein Markdown, nur JSON):\n' +
    '{"voiceProfile": "...", "strengths": ["s1","s2","s3"], "improvements": ["i1","i2","i3"]}\n' +
    '\n' +
    'voiceProfile: 1 Satz (max 25 Wörter) der den Voice in einem ' +
    'Aesop/SaaS/Werkstatt/Mischform-Frame einordnet.\n' +
    'strengths: 3 konkrete Stärken (je 1-2 Sätze).\n' +
    'improvements: 3 konkrete Verbesserungen mit Editorial-Voice ' +
    '(je 1-2 Sätze, konkrete Formulierungs-Vorschläge).\n' +
    'Alle Texte: Sie-Anrede, ruhig, kein Marketing-Bla.';

async function callClaude(claudeKey, corpus, domain) {
    var body = {
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 800,
        temperature: 0.3,
        system: SYSTEM_PROMPT,
        messages: [{
            role: 'user',
            content: 'Domain: ' + domain + '\n\nWebsite-Voice-Korpus:\n\n' + corpus
        }]
    };
    var res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': claudeKey,
            'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify(body)
    });
    if (!res.ok) {
        var errText = await res.text();
        throw new Error('Claude-API ' + res.status + ': ' + errText.slice(0, 200));
    }
    var data = await res.json();
    var content = data && data.content && data.content[0] && data.content[0].text;
    if (!content) throw new Error('Claude returned no content');
    // Extract JSON (sometimes Claude wraps in code fence despite system prompt)
    var jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Claude did not return JSON');
    return JSON.parse(jsonMatch[0]);
}

async function execute(args, ctx) {
    var url = normalizeUrl(args && args.url);
    if (!url) throw new Error('Ungültige URL. Erwartet Format wie https://example.de');
    var domain;
    try { domain = new URL(url).hostname.replace(/^www\./, ''); }
    catch (e) { throw new Error('Ungültige URL.'); }

    if (!ctx || !ctx.claudeKey) {
        throw new Error('Voice-Analyse ist gerade nicht verfügbar (Claude-API-Key fehlt).');
    }

    var html;
    try {
        var fetchRes = await safeFetch(url, { timeoutMs: 8000 });
        if (!fetchRes.ok) throw new Error('HTTP ' + fetchRes.status);
        html = await fetchRes.text();
        if (html.length > 500000) html = html.slice(0, 500000);
    } catch (err) {
        return withSignature(header('Karriaro · Voice-Analyse') +
            '\n\nDomain:    ' + domain +
            '\nStatus:    nicht abrufbar' +
            '\n\nWir konnten ' + domain + ' nicht erreichen. ' +
            'Bitte Schreibweise prüfen.');
    }
    var corpus = extractVoiceCorpus(html);
    if (!corpus || corpus.length < 50) {
        return withSignature(header('Karriaro · Voice-Analyse') +
            '\n\nDomain:    ' + domain +
            '\nStatus:    zu wenig Text' +
            '\n\nDie Seite enthält zu wenig analysierbaren Text. ' +
            'Voice-Analyse braucht mindestens Hero-Headline + 2 Absätze Substanz.');
    }

    var profile;
    try {
        profile = await callClaude(ctx.claudeKey, corpus, domain);
    } catch (err) {
        return withSignature(header('Karriaro · Voice-Analyse') +
            '\n\nDomain:    ' + domain +
            '\nStatus:    Analyse vorübergehend nicht möglich' +
            '\n\n' + (err.message || 'Bitte später erneut versuchen.'));
    }

    var lines = [
        header('Karriaro · Voice-Analyse'),
        '',
        'Domain:        ' + domain,
        '',
        'VOICE-PROFIL',
        profile.voiceProfile || '(kein Profil)',
        '',
        'STÄRKEN'
    ];
    (profile.strengths || []).slice(0, 3).forEach(function (s, i) {
        lines.push('  ' + (i + 1) + '. ' + s);
    });
    lines.push('');
    lines.push('VERBESSERUNGEN');
    (profile.improvements || []).slice(0, 3).forEach(function (s, i) {
        lines.push('  ' + (i + 1) + '. ' + s);
    });
    lines.push('');
    lines.push('Bewertet nach Karriaro-Codex (Aesop/Hermès/Manufactum-');
    lines.push('Editorial vs. SaaS-Filler vs. Werkstatt-Klischee).');
    return withSignature(lines.join('\n'));
}

module.exports = { DEFINITION, execute };
