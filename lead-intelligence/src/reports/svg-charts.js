/**
 * SVG-Charts für Branchen-Reports.
 *
 * Pure-SVG-Generator: alle Funktionen liefern Inline-SVG-Strings, kein
 * JS-Runtime im Browser nötig. Editorial-monochrom mit einem
 * Akzent-Hex pro Branche (siehe Hermès-Vitrine-Pattern Sprint 131).
 *
 * Format-Konvention: jede Funktion akzeptiert ein Daten-Objekt + ein
 * Style-Objekt { accent, width, height } und gibt einen
 * <svg>...</svg>-String zurück. Keine HTML-Escape-Pflicht für die
 * generierten numerischen Werte; Beschriftungen werden via escapeXml()
 * gesichert.
 */

const DEFAULT_ACCENT = '#1a1a1a';
const INK = '#1a1a1a';
const PAPER = '#fafaf7';
const MUTED = '#888';

function escapeXml(s) {
    return String(s ?? '').replace(/[<>&"']/g, c => (
        { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]
    ));
}

function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }

/**
 * Box-Plot — visualisiert n, min, p25, median, p75, max einer
 * `summarizeNumeric()`-Ausgabe.
 *
 * Skala fix 0..100 (passt für PageSpeed-Scores), kann via options.domain
 * überschrieben werden.
 */
export function boxPlot(stats, options = {}) {
    const { accent = DEFAULT_ACCENT, width = 600, height = 140, label = '', unit = '' } = options;
    const domain = options.domain || [0, 100];
    if (!stats || stats.n == null || stats.n === 0) {
        return emptyChart(width, height, 'Keine Daten');
    }
    const margin = { top: 30, right: 32, bottom: 36, left: 32 };
    const W = width - margin.left - margin.right;
    const H = height - margin.top - margin.bottom;
    const scale = v => margin.left + ((v - domain[0]) / (domain[1] - domain[0])) * W;
    const yMid = margin.top + H / 2;
    const boxTop = yMid - 18, boxBottom = yMid + 18;
    const whiskerTop = yMid - 8, whiskerBottom = yMid + 8;

    const p25x = scale(stats.p25), p75x = scale(stats.p75);
    const minx = scale(stats.min), maxx = scale(stats.max), medx = scale(stats.median);
    const a11yLabel = `Box-Plot ${label}: Median ${stats.median}${unit}, Quartile ${stats.p25}${unit} bis ${stats.p75}${unit}, Spannweite ${stats.min} bis ${stats.max}, n=${stats.n}.`;

    const ticks = [domain[0], domain[1] / 2, domain[1]];

    return `<svg viewBox="0 0 ${width} ${height}" width="100%" style="height:auto" role="img" aria-label="${escapeXml(a11yLabel)}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${width}" height="${height}" fill="${PAPER}"/>
  ${label ? `<text x="${margin.left}" y="20" fill="${INK}" font-family="JetBrains Mono, ui-monospace, monospace" font-size="10" letter-spacing="0.12em" text-transform="uppercase">${escapeXml(label.toUpperCase())}</text>` : ''}
  <line x1="${margin.left}" y1="${yMid}" x2="${width - margin.right}" y2="${yMid}" stroke="${MUTED}" stroke-width="0.5"/>
  <line x1="${minx}" y1="${whiskerTop}" x2="${minx}" y2="${whiskerBottom}" stroke="${INK}" stroke-width="1"/>
  <line x1="${maxx}" y1="${whiskerTop}" x2="${maxx}" y2="${whiskerBottom}" stroke="${INK}" stroke-width="1"/>
  <line x1="${minx}" y1="${yMid}" x2="${p25x}" y2="${yMid}" stroke="${INK}" stroke-width="1"/>
  <line x1="${p75x}" y1="${yMid}" x2="${maxx}" y2="${yMid}" stroke="${INK}" stroke-width="1"/>
  <rect x="${p25x}" y="${boxTop}" width="${Math.max(2, p75x - p25x)}" height="${boxBottom - boxTop}" fill="${accent}" fill-opacity="0.18" stroke="${accent}" stroke-width="1"/>
  <line x1="${medx}" y1="${boxTop}" x2="${medx}" y2="${boxBottom}" stroke="${accent}" stroke-width="2"/>
  ${ticks.map(t => `<g><line x1="${scale(t)}" y1="${height - margin.bottom + 2}" x2="${scale(t)}" y2="${height - margin.bottom + 6}" stroke="${MUTED}"/><text x="${scale(t)}" y="${height - margin.bottom + 18}" fill="${MUTED}" font-family="JetBrains Mono, ui-monospace, monospace" font-size="9" text-anchor="middle">${t}${unit}</text></g>`).join('')}
  <text x="${medx}" y="${boxTop - 6}" fill="${accent}" font-family="Fraunces, Georgia, serif" font-size="14" font-style="italic" text-anchor="middle">Median ${stats.median}${unit}</text>
  <text x="${width - margin.right}" y="20" fill="${MUTED}" font-family="JetBrains Mono, ui-monospace, monospace" font-size="9" text-anchor="end">n = ${stats.n}</text>
</svg>`;
}

/**
 * Histogramm — vertikale Balken, eine pro Bin.
 *
 * @param {Array<{lo:number,hi:number,count:number,pct?:number}>} bins
 *   Format kompatibel zu `learning/score-distribution.js::histogram()`.
 */
export function histogramChart(bins, options = {}) {
    const { accent = DEFAULT_ACCENT, width = 600, height = 220, label = '', unit = '' } = options;
    if (!bins || !bins.length) return emptyChart(width, height, 'Keine Daten');
    const margin = { top: 30, right: 16, bottom: 40, left: 32 };
    const W = width - margin.left - margin.right;
    const H = height - margin.top - margin.bottom;
    const totalCount = bins.reduce((s, b) => s + (b.count || 0), 0);
    const maxCount = Math.max(1, ...bins.map(b => b.count || 0));
    const barW = W / bins.length;
    const a11yLabel = `Histogramm ${label}: ${bins.length} Klassen, ${totalCount} Beobachtungen, Modalklasse ${bins.reduce((m, b) => (b.count > (m?.count || 0) ? b : m), bins[0]).lo}${unit}.`;

    const bars = bins.map((b, i) => {
        const h = ((b.count || 0) / maxCount) * H;
        const x = margin.left + i * barW;
        const y = margin.top + (H - h);
        return `<rect x="${x + 2}" y="${y}" width="${Math.max(1, barW - 4)}" height="${h}" fill="${accent}" fill-opacity="0.65"/>`;
    }).join('');

    const labels = bins.map((b, i) => {
        if (bins.length > 6 && i % 2 !== 0 && i !== bins.length - 1) return '';
        const x = margin.left + i * barW + barW / 2;
        return `<text x="${x}" y="${height - margin.bottom + 16}" fill="${MUTED}" font-family="JetBrains Mono, ui-monospace, monospace" font-size="9" text-anchor="middle">${b.lo}${unit}</text>`;
    }).join('');

    return `<svg viewBox="0 0 ${width} ${height}" width="100%" style="height:auto" role="img" aria-label="${escapeXml(a11yLabel)}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${width}" height="${height}" fill="${PAPER}"/>
  ${label ? `<text x="${margin.left}" y="20" fill="${INK}" font-family="JetBrains Mono, ui-monospace, monospace" font-size="10" letter-spacing="0.12em">${escapeXml(label.toUpperCase())}</text>` : ''}
  <line x1="${margin.left}" y1="${margin.top + H}" x2="${width - margin.right}" y2="${margin.top + H}" stroke="${MUTED}" stroke-width="0.5"/>
  ${bars}
  ${labels}
  <text x="${width - margin.right}" y="20" fill="${MUTED}" font-family="JetBrains Mono, ui-monospace, monospace" font-size="9" text-anchor="end">n = ${totalCount}</text>
</svg>`;
}

/**
 * Donut-Chart für Tech-Stack-Verteilung. Eingabe ist das Format aus
 * `distributeCategorical()`: { Key: { count, share }, ... }.
 */
export function donutChart(distribution, options = {}) {
    const { accent = DEFAULT_ACCENT, width = 320, height = 320, label = '' } = options;
    const entries = Object.entries(distribution || {});
    if (!entries.length) return emptyChart(width, height, 'Keine Daten');
    const total = entries.reduce((s, [, v]) => s + (v.count || 0), 0);
    if (!total) return emptyChart(width, height, 'Keine Daten');
    const cx = width / 2, cy = height / 2 + 8;
    const r = Math.min(width, height) / 2 - 36;
    const innerR = r * 0.62;

    let acc = 0;
    const palette = paletteFromAccent(accent, entries.length);
    const slices = entries.map(([key, v], i) => {
        const start = (acc / total) * Math.PI * 2 - Math.PI / 2;
        acc += v.count;
        const end = (acc / total) * Math.PI * 2 - Math.PI / 2;
        const path = annularSliceD(cx, cy, r, innerR, start, end);
        return `<path d="${path}" fill="${palette[i]}"><title>${escapeXml(key)}: ${(v.share * 100).toFixed(1)} % (n=${v.count})</title></path>`;
    }).join('');

    const top = entries[0];
    const a11yLabel = `Donut-Chart ${label}: ${entries.length} Kategorien, Spitzenreiter ${top[0]} mit ${(top[1].share * 100).toFixed(1)} Prozent.`;

    return `<svg viewBox="0 0 ${width} ${height}" width="100%" style="height:auto" role="img" aria-label="${escapeXml(a11yLabel)}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${width}" height="${height}" fill="${PAPER}"/>
  ${label ? `<text x="${width / 2}" y="22" fill="${INK}" font-family="JetBrains Mono, ui-monospace, monospace" font-size="10" letter-spacing="0.12em" text-anchor="middle">${escapeXml(label.toUpperCase())}</text>` : ''}
  ${slices}
  <text x="${cx}" y="${cy - 4}" fill="${INK}" font-family="Fraunces, Georgia, serif" font-size="28" text-anchor="middle">${top[0].length > 12 ? top[0].slice(0, 11) + '…' : escapeXml(top[0])}</text>
  <text x="${cx}" y="${cy + 18}" fill="${MUTED}" font-family="JetBrains Mono, ui-monospace, monospace" font-size="11" text-anchor="middle">${(top[1].share * 100).toFixed(0)} % der ${total}</text>
</svg>`;
}

function annularSliceD(cx, cy, r, ir, start, end) {
    const x1 = cx + r * Math.cos(start), y1 = cy + r * Math.sin(start);
    const x2 = cx + r * Math.cos(end), y2 = cy + r * Math.sin(end);
    const xi2 = cx + ir * Math.cos(end), yi2 = cy + ir * Math.sin(end);
    const xi1 = cx + ir * Math.cos(start), yi1 = cy + ir * Math.sin(start);
    const large = end - start > Math.PI ? 1 : 0;
    return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} L ${xi2} ${yi2} A ${ir} ${ir} 0 ${large} 0 ${xi1} ${yi1} Z`;
}

function hexToHsl(hex) {
    const m = String(hex).replace('#', '');
    const r = parseInt(m.slice(0, 2), 16) / 255;
    const g = parseInt(m.slice(2, 4), 16) / 255;
    const b = parseInt(m.slice(4, 6), 16) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const l = (max + min) / 2;
    if (max === min) return { h: 0, s: 0, l };
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h;
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
    return { h, s, l };
}

function paletteFromAccent(accent, n) {
    const { h, s } = hexToHsl(accent);
    return Array.from({ length: n }, (_, i) => {
        const l = clamp(0.22 + i * (0.55 / Math.max(1, n - 1)), 0.20, 0.78);
        const sat = clamp(s * (1 - i * 0.06), 0.06, 1);
        return `hsl(${h}, ${(sat * 100).toFixed(0)}%, ${(l * 100).toFixed(0)}%)`;
    });
}

function emptyChart(width, height, text) {
    return `<svg viewBox="0 0 ${width} ${height}" width="100%" style="height:auto" role="img" aria-label="${escapeXml(text)}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${width}" height="${height}" fill="${PAPER}"/>
  <text x="${width / 2}" y="${height / 2}" fill="${MUTED}" font-family="JetBrains Mono, ui-monospace, monospace" font-size="11" text-anchor="middle">${escapeXml(text)}</text>
</svg>`;
}

export const ACCENT_BY_BRANCH = {
    hair_salon: '#7b2d3a',
    dentist: '#1f3a5f',
    restaurant: '#7a4019',
    auto_repair: '#37424d',
    beauty_salon: '#7a3d6a',
    physiotherapist: '#1b5e5e',
    lawyer: '#2a2a2a',
    real_estate_agency: '#2c4a3a',
    hotel: '#4a3e2e',
    plumber: '#28507a',
    electrician: '#5e4a1a',
    veterinary_care: '#2f6b3e',
    gym: '#5e1f1f',
    moving_company: '#3a3a3a',
    car_dealer: '#3a2a45',
    bakery: '#6b3a1f',
    florist: '#4a1f4a',
    cafe: '#5a3a23'
};

export const SVG_CONSTANTS = { DEFAULT_ACCENT, INK, PAPER, MUTED };
