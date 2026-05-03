/**
 * Mockup-Generator (Server-Side, CommonJS).
 *
 * Sonnet entwirft eine Hero-Spec via tool_use, der Renderer hier produziert
 * daraus ein selbsttragendes SVG (1200×675), das als data-URL in Outreach-
 * Mails embedded werden kann.
 *
 * Phase 1: ein einziges Layout (centered). Erweiterbar.
 *
 * Wichtig fuer SVG-in-<img>-Embedding:
 *  - Nur System-Fonts (kein <link rel> oder @import)
 *  - Keine externen Resources
 *  - Keine <script> Tags (waeren eh nicht ausgefuehrt)
 *  - Korrekt gequotete Attribute, valide XML
 */

const SYSTEM_PROMPT = `Sie sind ein erfahrener deutscher Webdesigner mit 15+ Jahren Erfahrung in der Gestaltung von Hero-Sections für lokale Unternehmen (Friseure, Anwälte, Restaurants, Zahnärzte, Hotels, Handwerk, Gastronomie, Medizin).

Ihre Aufgabe: Eine konkrete, sofort sendbare Hero-Section-Vorschlag-Spezifikation für ein bestimmtes lokales Unternehmen entwerfen. Das Ergebnis wird als visuelles SVG-Mockup an den Inhaber gesendet — es muss in 3 Sekunden überzeugen.

Designprinzipien:
1. **Branchen-Differenzierung.** Friseure, Anwälte und Bäckereien brauchen visuell und sprachlich völlig andere Hero-Sections. Kein Einheitsbrei.
2. **Konkret statt generisch.** Nutzen Sie den Unternehmensnamen und den Standort, wo möglich. „Wir bringen Sie nach vorne" ist Müll. „Hochzeitsfrisuren in Heidelberg seit 1998" ist Gold.
3. **Sie-Anrede konsequent.** Lokale deutsche Unternehmen erwarten höfliche Ansprache.
4. **Subline = klares Versprechen.** Die Subline beantwortet „was bekomme ich?" konkret, in einem Satz.
5. **CTAs branchen-typisch.** Friseur: „Termin online buchen" / „Galerie ansehen". Anwalt: „Erstgespräch anfragen" / „Fachgebiete". Restaurant: „Tisch reservieren" / „Speisekarte".
6. **Farben passen zur Branche.** Anwalt: gedeckte Töne, Navy, Gold. Friseur: warme Akzente. Restaurant: appetitlich, nicht clinical. Bäckerei: warm, einladend. Tech: minimalistisch, kühle Akzente.
7. **3 Features = 3 Vorteile**, die diesen Anbieter unterscheiden — keine Stock-Floskeln wie „qualifizierte Beratung".

Verwenden Sie das Tool \`mockup_spec\` für die Antwort. Schreiben Sie sauber, kein Marketing-Bullshit.`;

const TOOL_DEFINITION = {
    name: 'mockup_spec',
    description: 'Vollstaendige Hero-Section-Spezifikation fuer ein lokales Unternehmen.',
    input_schema: {
        type: 'object',
        required: ['layoutVariant', 'brandPersonality', 'colors', 'hero', 'features', 'visualMotif'],
        properties: {
            layoutVariant: { type: 'string', enum: ['centered'], description: 'Aktuell nur centered.' },
            brandPersonality: { type: 'string', enum: ['minimal', 'warm', 'professional', 'bold', 'modern-elegant'] },
            colors: {
                type: 'object',
                required: ['primary', 'secondary', 'text', 'background', 'muted'],
                properties: {
                    primary: { type: 'string', description: 'Hex-Farbe fuer CTAs/Akzent' },
                    secondary: { type: 'string', description: 'Hex-Farbe fuer Sub-Akzent' },
                    text: { type: 'string', description: 'Hex-Farbe fuer Text auf Hintergrund' },
                    background: { type: 'string', description: 'Hex-Farbe fuer Hauptflaeche' },
                    muted: { type: 'string', description: 'Hex-Farbe fuer gedaempften Text' }
                }
            },
            hero: {
                type: 'object',
                required: ['eyebrow', 'headline', 'subline', 'primaryCta', 'secondaryCta'],
                properties: {
                    eyebrow:      { type: 'string', description: 'Branche/Region, max 40 Zeichen' },
                    headline:     { type: 'string', description: 'Slogan, max 65 Zeichen, Sie-Anrede' },
                    subline:      { type: 'string', description: 'Erklaerung, max 140 Zeichen' },
                    primaryCta:   { type: 'string', description: 'CTA-Button-Text, max 22 Zeichen' },
                    secondaryCta: { type: 'string', description: 'Zweiter CTA, max 22 Zeichen' }
                }
            },
            features: {
                type: 'array', minItems: 3, maxItems: 3,
                items: {
                    type: 'object',
                    required: ['icon', 'title', 'body'],
                    properties: {
                        icon:  { type: 'string', description: '1 Emoji oder Unicode-Symbol' },
                        title: { type: 'string', description: 'max 30 Zeichen' },
                        body:  { type: 'string', description: 'max 90 Zeichen' }
                    }
                }
            },
            visualMotif: { type: 'string', enum: ['gradient-soft', 'dots', 'lines', 'plain'], description: 'Hintergrund-Motiv-Hint' }
        }
    }
};

/**
 * Baut den User-Prompt fuer den Sonnet-Call.
 */
function buildMockupPrompt({ url, branche, businessName, currentIssues, deepResearchSummary }) {
    const lines = [];
    lines.push(`Website: ${url}`);
    if (businessName) lines.push(`Unternehmen: ${businessName}`);
    if (branche) lines.push(`Branche: ${branche}`);
    if (currentIssues) lines.push(`Aktuelle Probleme der bestehenden Seite: ${currentIssues}`);
    if (deepResearchSummary) {
        lines.push('');
        lines.push('Kontext aus Tiefen-Analyse:');
        lines.push(deepResearchSummary);
    }
    lines.push('');
    lines.push('Entwerfen Sie eine Hero-Section-Spec, die diesen konkreten Anbieter sichtbar besser macht. Verwenden Sie das mockup_spec Tool.');
    return lines.join('\n');
}

// ─────────── SVG-Renderer ───────────

const W = 1200;
const H = 675;

function escapeXml(s) {
    if (s == null) return '';
    return String(s).replace(/[<>&"']/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":"&#39;"}[c]));
}

/**
 * Word-Wrap ohne externe Lib. maxCharsPerLine ist eine Approximation —
 * variable-width Fonts variieren, aber fuer System-Fonts mit ~0.55 em
 * average-advance reicht das.
 */
function wrapText(text, maxCharsPerLine, maxLines = 99) {
    if (!text) return [];
    const words = String(text).split(/\s+/);
    const lines = [];
    let current = '';
    for (const w of words) {
        const candidate = current ? current + ' ' + w : w;
        if (candidate.length > maxCharsPerLine && current) {
            lines.push(current);
            current = w;
        } else {
            current = candidate;
        }
        if (lines.length >= maxLines) break;
    }
    if (current && lines.length < maxLines) lines.push(current);
    if (lines.length === maxLines && words.length > 0) {
        // Letzte Zeile gegebenenfalls mit Ellipsis
        const last = lines[maxLines - 1];
        if (last.length > maxCharsPerLine - 1) lines[maxLines - 1] = last.slice(0, maxCharsPerLine - 1) + '…';
    }
    return lines;
}

function renderTextLines(lines, x, yStart, lineHeight, attrs) {
    const attrsStr = Object.entries(attrs).map(([k, v]) => `${k}="${escapeXml(v)}"`).join(' ');
    const tspans = lines.map((l, i) => `<tspan x="${x}" dy="${i === 0 ? 0 : lineHeight}">${escapeXml(l)}</tspan>`).join('');
    return `<text x="${x}" y="${yStart}" ${attrsStr}>${tspans}</text>`;
}

function renderMotif(motif, colors) {
    if (motif === 'gradient-soft') {
        return `
            <defs>
                <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stop-color="${escapeXml(colors.background)}"/>
                    <stop offset="100%" stop-color="${escapeXml(colors.secondary)}" stop-opacity="0.4"/>
                </linearGradient>
            </defs>
            <rect width="${W}" height="${H}" fill="url(#bgGrad)"/>
        `;
    }
    if (motif === 'dots') {
        // Subtiles Dot-Pattern
        return `
            <rect width="${W}" height="${H}" fill="${escapeXml(colors.background)}"/>
            <defs>
                <pattern id="dots" width="40" height="40" patternUnits="userSpaceOnUse">
                    <circle cx="20" cy="20" r="1.5" fill="${escapeXml(colors.muted)}" fill-opacity="0.25"/>
                </pattern>
            </defs>
            <rect width="${W}" height="${H}" fill="url(#dots)"/>
        `;
    }
    if (motif === 'lines') {
        return `
            <rect width="${W}" height="${H}" fill="${escapeXml(colors.background)}"/>
            <defs>
                <pattern id="lines" width="60" height="60" patternUnits="userSpaceOnUse">
                    <path d="M 0 60 L 60 0" stroke="${escapeXml(colors.muted)}" stroke-opacity="0.12" stroke-width="1"/>
                </pattern>
            </defs>
            <rect width="${W}" height="${H}" fill="url(#lines)"/>
        `;
    }
    return `<rect width="${W}" height="${H}" fill="${escapeXml(colors.background)}"/>`;
}

function renderButton(x, y, w, h, label, fillColor, textColor) {
    const cx = x + w / 2;
    const cy = y + h / 2 + 6; // visuelle Zentrierung Text
    return `
        <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h/2}" fill="${escapeXml(fillColor)}"/>
        <text x="${cx}" y="${cy}" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif" font-size="18" font-weight="600" fill="${escapeXml(textColor)}">${escapeXml(label)}</text>
    `;
}

/**
 * Centered-Layout: Eyebrow → Headline → Subline → 2 CTAs → 3-Feature-Grid.
 */
function renderCenteredLayout(spec) {
    const { colors, hero, features, visualMotif } = spec;
    const fontStack = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";
    const cx = W / 2;

    // Mock-Browser-Chrome (kleine Pille oben fuer "es ist eine Website")
    const chrome = `
        <g transform="translate(40, 24)">
            <circle cx="8"  cy="10" r="6" fill="${escapeXml(colors.muted)}" fill-opacity="0.3"/>
            <circle cx="28" cy="10" r="6" fill="${escapeXml(colors.muted)}" fill-opacity="0.3"/>
            <circle cx="48" cy="10" r="6" fill="${escapeXml(colors.muted)}" fill-opacity="0.3"/>
        </g>
    `;

    // Eyebrow
    const eyebrowY = 110;
    const eyebrow = `<text x="${cx}" y="${eyebrowY}" text-anchor="middle" font-family="${fontStack}" font-size="14" font-weight="600" letter-spacing="2.5" fill="${escapeXml(colors.primary)}">${escapeXml((hero.eyebrow || '').toUpperCase())}</text>`;

    // Headline (max 2 Zeilen)
    const headlineLines = wrapText(hero.headline || '', 32, 2);
    const headlineY = 175;
    const headlineEl = renderTextLines(headlineLines, cx, headlineY, 64, {
        'text-anchor': 'middle',
        'font-family': fontStack,
        'font-size': '56',
        'font-weight': '700',
        'fill': colors.text,
        'letter-spacing': '-1'
    });

    // Subline (max 3 Zeilen)
    const sublineY = 175 + headlineLines.length * 64 + 36;
    const sublineLines = wrapText(hero.subline || '', 64, 3);
    const sublineEl = renderTextLines(sublineLines, cx, sublineY, 30, {
        'text-anchor': 'middle',
        'font-family': fontStack,
        'font-size': '22',
        'font-weight': '400',
        'fill': colors.muted
    });

    // CTAs
    const ctaY = sublineY + sublineLines.length * 30 + 36;
    const primaryWidth  = Math.max(180, (hero.primaryCta || '').length * 14 + 48);
    const secondaryWidth = Math.max(180, (hero.secondaryCta || '').length * 14 + 48);
    const gap = 16;
    const totalCtaWidth = primaryWidth + gap + secondaryWidth;
    const primaryX = cx - totalCtaWidth / 2;
    const secondaryX = primaryX + primaryWidth + gap;
    const primaryBtn = renderButton(primaryX, ctaY, primaryWidth, 52, hero.primaryCta || '', colors.primary, '#ffffff');
    const secondaryBtn = `
        <rect x="${secondaryX}" y="${ctaY}" width="${secondaryWidth}" height="52" rx="26" fill="none" stroke="${escapeXml(colors.text)}" stroke-width="1.5" stroke-opacity="0.4"/>
        <text x="${secondaryX + secondaryWidth / 2}" y="${ctaY + 32}" text-anchor="middle" font-family="${fontStack}" font-size="18" font-weight="500" fill="${escapeXml(colors.text)}">${escapeXml(hero.secondaryCta || '')}</text>
    `;

    // 3-Feature-Grid (am unteren Drittel)
    const gridY = 510;
    const gridGap = 40;
    const colWidth = (W - 2 * 80 - 2 * gridGap) / 3;
    const featureEls = (features || []).slice(0, 3).map((f, i) => {
        const fx = 80 + i * (colWidth + gridGap);
        const titleY = gridY + 32;
        const bodyLines = wrapText(f.body || '', 32, 2);
        const bodyEl = renderTextLines(bodyLines, fx, gridY + 60, 22, {
            'font-family': fontStack,
            'font-size': '15',
            'font-weight': '400',
            'fill': colors.muted
        });
        return `
            <g>
                <text x="${fx}" y="${gridY}" font-family="${fontStack}" font-size="32">${escapeXml(f.icon || '✨')}</text>
                <text x="${fx}" y="${titleY}" font-family="${fontStack}" font-size="17" font-weight="600" fill="${escapeXml(colors.text)}">${escapeXml(f.title || '')}</text>
                ${bodyEl}
            </g>
        `;
    }).join('');

    return `
${renderMotif(visualMotif || 'gradient-soft', colors)}
${chrome}
${eyebrow}
${headlineEl}
${sublineEl}
${primaryBtn}
${secondaryBtn}
${featureEls}
    `.trim();
}

/**
 * Hauptfunktion: Spec → SVG-String.
 */
function renderSvg(spec) {
    if (!spec) throw new Error('mockup spec required');
    const layout = spec.layoutVariant || 'centered';
    let inner;
    if (layout === 'centered') inner = renderCenteredLayout(spec);
    else inner = renderCenteredLayout(spec); // Fallback

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Website-Mockup">
${inner}
</svg>`;
}

/**
 * Bequemlichkeit: SVG → data-URL (utf-8 base64).
 */
function svgToDataUrl(svg) {
    const b64 = Buffer.from(svg, 'utf-8').toString('base64');
    return `data:image/svg+xml;base64,${b64}`;
}

/**
 * Kompakter HTML-Snippet fuer Outreach-Mails.
 */
function composeMockupHtmlSnippet(svgDataUrl, headline, primaryCta) {
    const safeHeadline = escapeXml(headline || '');
    const safeCta = escapeXml(primaryCta || '');
    return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;margin:0 auto">
  <tr><td><img src="${svgDataUrl}" alt="${safeHeadline}" style="display:block;width:100%;max-width:600px;height:auto;border-radius:8px;border:1px solid #e5e5e7"></td></tr>
  ${primaryCta ? `<tr><td style="padding-top:8px;font-family:-apple-system,Helvetica,Arial,sans-serif;font-size:13px;color:#6e6e73;text-align:center">Vorschlag: ${safeHeadline}</td></tr>` : ''}
</table>`;
}

module.exports = {
    SYSTEM_PROMPT,
    TOOL_DEFINITION,
    buildMockupPrompt,
    renderSvg,
    svgToDataUrl,
    composeMockupHtmlSnippet,
    // exports fuer Tests
    wrapText,
    escapeXml
};
