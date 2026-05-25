/**
 * MCP-Tool karriaro_generate_brand_mockup
 * Server-side Template-Render: Hero-Mockup-SVG mit Branchen-Farbpalette,
 * Fraunces-Headline, Folio-Eyebrow, Phyllotaxis-Siegel.
 */

const { header, withSignature } = require('./branding.js');

const DEFINITION = {
    name: 'karriaro_generate_brand_mockup',
    description:
        'Generiert eine Hero-Mockup-SVG (480 × 320 px) im Karriaro-Editorial-' +
        'Stil für eine Branche. Enthält Folio-Eyebrow, Fraunces-Italic-' +
        'Headline mit Praxisname, Branchen-Farbe und Phyllotaxis-Siegel. ' +
        'Inspiration für eigene Site-Konzepte oder Pitch-Visuals.',
    inputSchema: {
        type: 'object',
        properties: {
            branche: {
                type: 'string',
                enum: ['friseur','praxis','anwalt','coaching','immobilien','handwerk','gastro','dachdecker'],
                description: 'Branche aus der Karriaro-Demo-Library'
            },
            name: {
                type: 'string',
                description: 'Praxis-/Kanzleiname (optional, sonst Branchen-Default)'
            }
        },
        required: ['branche']
    }
};

const BRANCHEN = {
    friseur:     { color: '#B07B5E', label: 'Beauty & Friseur',   default: 'Salon Mueller',         folio: '№ 01 · BEAUTY' },
    praxis:      { color: '#6A8266', label: 'Praxis & Medizin',   default: 'Praxis Dr. Weber',       folio: '№ 02 · MEDIZIN' },
    anwalt:      { color: '#1A2E40', label: 'Recht & Beratung',   default: 'Kanzlei Schmidt',        folio: '№ 03 · RECHT' },
    coaching:    { color: '#2C2C2C', label: 'Coaching & Mentor',  default: 'Lehmann Coaching',       folio: '№ 04 · COACHING' },
    immobilien:  { color: '#1A2E40', label: 'Immobilien',         default: 'Stadtmakler Stuttgart',  folio: '№ 05 · IMMOBILIEN' },
    handwerk:    { color: '#B47045', label: 'Handwerk',           default: 'Meisterbetrieb Mueller', folio: '№ 06 · HANDWERK' },
    gastro:      { color: '#5C1F1F', label: 'Gastronomie',        default: 'Restaurant Hirsch',      folio: '№ 07 · GASTRO' },
    dachdecker:  { color: '#4A5D4F', label: 'Dachdecker & Bau',   default: 'Meisterbetrieb Dach',    folio: '№ 08 · DACH' }
};

function escapeXml(s) {
    return String(s || '').replace(/[<>&"']/g, function (c) {
        return { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c];
    });
}

function buildPhyllotaxisDots(color) {
    var goldenAngle = (3 - Math.sqrt(5)) * Math.PI;
    var dots = '';
    for (var n = 1; n <= 13; n++) {
        var r = Math.sqrt(n) * 4;
        var theta = n * goldenAngle;
        var x = (425 + r * Math.cos(theta)).toFixed(2);
        var y = (50 + r * Math.sin(theta)).toFixed(2);
        dots += '<circle cx="' + x + '" cy="' + y + '" r="0.8" fill="' + color + '"/>';
    }
    return dots;
}

function buildMockupSvg(branche, name) {
    var b = BRANCHEN[branche];
    var displayName = name || b.default;
    var bg = '#F5F3EE';
    var ink = '#14202B';
    var graphite = '#5C6470';
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 320" width="480" height="320" role="img" aria-label="' + escapeXml(displayName) + ' Hero-Mockup im Karriaro-Editorial-Stil">' +
        '<title>Karriaro Hero-Mockup · ' + escapeXml(displayName) + '</title>' +
        '<rect width="480" height="320" fill="' + bg + '"/>' +
        // Folio-Eyebrow
        '<text x="40" y="60" font-family="JetBrains Mono, ui-monospace, monospace" font-size="10" letter-spacing="2.2" fill="' + graphite + '">' + escapeXml(b.folio) + '</text>' +
        // Fraunces Headline mit Italic-Akzent
        '<text x="40" y="120" font-family="Fraunces, Georgia, serif" font-size="36" font-weight="500" fill="' + ink + '">' + escapeXml(displayName) + '</text>' +
        '<text x="40" y="160" font-family="Fraunces, Georgia, serif" font-size="22" font-style="italic" fill="' + b.color + '">' + escapeXml(b.label) + '.</text>' +
        // Subhead
        '<text x="40" y="200" font-family="Inter, system-ui, sans-serif" font-size="13" fill="' + graphite + '">Manufaktur — handcodiert, schnell, BFSG-konform.</text>' +
        // Brand-Color-Bar
        '<rect x="40" y="220" width="120" height="3" fill="' + b.color + '"/>' +
        // Hairline-Border-Box (mock content area)
        '<rect x="40" y="240" width="320" height="56" fill="none" stroke="' + ink + '" stroke-width="0.5" opacity="0.18"/>' +
        '<text x="48" y="262" font-family="Inter, system-ui, sans-serif" font-size="11" fill="' + graphite + '">Live-Demo · Lighthouse 99 · DSGVO</text>' +
        '<text x="48" y="282" font-family="Inter, system-ui, sans-serif" font-size="11" fill="' + graphite + '">Erstgespräch — Antwort in 24 h →</text>' +
        // Phyllotaxis-Siegel oben rechts
        '<g opacity="0.85">' + buildPhyllotaxisDots(b.color) + '</g>' +
        '<text x="425" y="80" text-anchor="middle" font-family="JetBrains Mono, ui-monospace, monospace" font-size="7" letter-spacing="1.4" fill="' + graphite + '">θ = 137,5°</text>' +
        '</svg>';
}

async function execute(args) {
    var branche = args && args.branche;
    if (!branche || !BRANCHEN[branche]) {
        throw new Error('Branche unbekannt. Erlaubt: ' + Object.keys(BRANCHEN).join(', '));
    }
    var b = BRANCHEN[branche];
    var name = args.name || b.default;
    var svg = buildMockupSvg(branche, name);
    var text = [
        header('Karriaro · Brand-Mockup'),
        '',
        'Branche:   ' + b.label + ' (' + branche + ')',
        'Name:      ' + name,
        'Farbe:     ' + b.color,
        'Folio:     ' + b.folio,
        '',
        'Inline-SVG (480 × 320):',
        '',
        svg,
        '',
        'Verwendung: als Inspiration für Hero-Layout, Farb-Auswahl ' +
        'und Editorial-Voice. Karriaro fertigt das echte Mockup ' +
        'pro Mandat handcodiert auf Lighthouse 99/100.'
    ].join('\n');
    return withSignature(text);
}

module.exports = { DEFINITION, execute };
