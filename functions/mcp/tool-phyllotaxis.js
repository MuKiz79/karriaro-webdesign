/**
 * MCP-Tool karriaro_phyllotaxis_signature
 * Deterministisches Phyllotaxis-SVG basierend auf Name-Hash.
 * Goldener Winkel = (3 - √5) × π ≈ 137,5°.
 */

const crypto = require('crypto');
const { withSignature, header } = require('./branding.js');

const DEFINITION = {
    name: 'karriaro_phyllotaxis_signature',
    description:
        'Generiert ein einzigartiges Phyllotaxis-Siegel (Goldener-Winkel-SVG) ' +
        'für einen Namen. Deterministisch — gleicher Name liefert immer ' +
        'gleiches Siegel. Variation in Punkt-Anzahl (11-17), Farbe und ' +
        'Rotations-Phase. Karriaro-Manufaktur-Pattern als persönliches Zeichen.',
    inputSchema: {
        type: 'object',
        properties: {
            name: {
                type: 'string',
                description: 'Name als Seed (z.B. "Andreas Müller" oder "Praxis Weber")'
            }
        },
        required: ['name']
    }
};

const PALETTE = ['#8A7B5C', '#1A2E40', '#5C1F1F', '#4A5D4F'];

function hashSeed(name) {
    var h = crypto.createHash('sha256').update(String(name || '').toLowerCase().trim()).digest();
    return {
        points: 11 + (h[0] % 7),         // 11-17
        color:  PALETTE[h[1] % PALETTE.length],
        phase:  (h[2] / 255) * Math.PI * 2,
        radiusScale: 0.85 + (h[3] / 255) * 0.4   // 0.85-1.25
    };
}

function buildSvg(name) {
    var seed = hashSeed(name);
    var goldenAngle = (3 - Math.sqrt(5)) * Math.PI;
    var dots = '';
    for (var n = 1; n <= seed.points; n++) {
        var r = Math.sqrt(n) * 8 * seed.radiusScale;
        var theta = n * goldenAngle + seed.phase;
        var x = (45 + r * Math.cos(theta)).toFixed(2);
        var y = (45 + r * Math.sin(theta)).toFixed(2);
        dots += '<circle cx="' + x + '" cy="' + y + '" r="1.5" fill="' + seed.color + '"/>';
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 90 90" width="120" height="120" role="img" aria-label="Phyllotaxis-Siegel für ' + escapeXml(name) + '">' +
        '<title>Karriaro-Phyllotaxis-Siegel · ' + escapeXml(name) + '</title>' +
        '<path d="M 5 18 L 5 5 L 18 5" stroke="' + seed.color + '" stroke-width="1.5" fill="none"/>' +
        '<path d="M 72 5 L 85 5 L 85 18" stroke="' + seed.color + '" stroke-width="1.5" fill="none"/>' +
        '<path d="M 5 72 L 5 85 L 18 85" stroke="' + seed.color + '" stroke-width="1.5" fill="none"/>' +
        '<path d="M 72 85 L 85 85 L 85 72" stroke="' + seed.color + '" stroke-width="1.5" fill="none"/>' +
        dots +
        '</svg>';
}

function escapeXml(s) {
    return String(s || '').replace(/[<>&"']/g, function (c) {
        return { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c];
    });
}

async function execute(args) {
    var name = args && args.name;
    if (!name || typeof name !== 'string') {
        throw new Error('Parameter "name" erforderlich (z.B. "Andreas Müller").');
    }
    var seed = hashSeed(name);
    var svg = buildSvg(name);
    var text = [
        header('Karriaro · Phyllotaxis-Siegel'),
        '',
        'Name:           ' + name,
        'Punkte:         ' + seed.points,
        'Farbe:          ' + seed.color,
        'Goldener Winkel: θ = 137,5°',
        '',
        'SVG (inline, 120 × 120):',
        '',
        svg,
        '',
        'Verwendung: Inline-SVG einbetten oder als persönliche Signatur ' +
        'auf Visitenkarte/Briefkopf. Deterministisch — gleicher Name = ' +
        'gleiches Siegel.'
    ].join('\n');
    return withSignature(text);
}

module.exports = { DEFINITION, execute };
