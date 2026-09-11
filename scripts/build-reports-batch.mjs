#!/usr/bin/env node
// Build-Reports-Batch: rendert Branchen-Reports aus ECHTEN Scan-Daten nach
// src/audit/<slug>/ und baut danach Hub, sitemap.xml- und llms.txt-Block neu.
//
// Aufruf:
//   node scripts/build-reports-batch.mjs --probe stuttgart,karlsruhe
//   node scripts/build-reports-batch.mjs --probe stuttgart,karlsruhe --dry-run
//   node scripts/build-reports-batch.mjs --spec reports.batch.json
//
// --probe <verzeichnisse>  Probe-Läufe unter lead-intelligence/probe/data/<name>/
//                          (05-scored.json + 02-psi/<domain>.json für das Messdatum).
//                          Je Branche entsteht ein Report pro Stadt, wenn die Stadt
//                          allein die Mindestzahl des Generators erreicht. Erreicht
//                          KEINE Stadt sie, werden die Städte zusammengefasst — nur
//                          wenn jede Stadt beiträgt und die Summe reicht; der Report
//                          weist die Aufteilung dann offen aus.
// --spec <datei>           JSON-Array [{ branche, stadt, leads, messdatum }] mit
//                          Scanner-Exporten. Ohne echte Datei kein Report: den
//                          früheren Rückfall auf eine erfundene Demo-Stichprobe gibt
//                          es nicht mehr.
// --dry-run                nur planen, prüfen und berichten — nichts schreiben.
// --no-hub                 Hub/Sitemap/llms nicht neu bauen.
// --veroeffentlicht <tag>  Veröffentlichungsdatum (YYYY-MM-DD) für NEUE Reports;
//                          ohne Angabe gilt heute. Ein Neubau behält das Datum aus
//                          report.json, nur eine neue Messung rückt aktualisiertAm vor.
//
// Veröffentlicht werden ausschließlich Kennzahlen je Branche: keine Namen,
// keine Domains, keine Werte einzelner Websites (auch nicht im report.json).
// Jede Nachbearbeitung der Builder-Ausgabe ist an einen exakten Anker gebunden
// und bricht den Build ab, wenn der Anker fehlt — eine Änderung am Builder fällt
// damit auf, statt still eine halb bearbeitete Seite zu erzeugen.
import { fileURLToPath } from 'node:url';
import { dirname, resolve, basename } from 'node:path';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';

import { generateReport, anonymizeId, REPORT_GENERATOR_CONSTANTS } from '../lead-intelligence/src/reports/branchen-stadt-generator.js';
import { buildReportHtml } from '../lead-intelligence/src/reports/static-html-builder.js';
import { buildAllSchemas, schemaScriptTag, buildLlmsIndexEntry } from '../lead-intelligence/src/reports/llmo-layer.js';
import { histogramChart, ACCENT_BY_BRANCH } from '../lead-intelligence/src/reports/svg-charts.js';
import { assertVoiceClean, stripTags } from '../lead-intelligence/src/reports/voice-linter.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const probeRoot = resolve(repoRoot, 'lead-intelligence', 'probe', 'data');
const SITE = 'https://karriaro-webdesign.de';
const { MIN_N, BRANCH_SLUG } = REPORT_GENERATOR_CONSTANTS;

// Stand der Probe-Pipeline (probe/phases/01-places.mjs): höchstens 20 Treffer je
// Branchensuche, mindestens 8 Google-Bewertungen. Ändert sich dort etwas, MUSS
// es hier nachgezogen werden — der Wert erscheint wörtlich in der Methode.
const PROBE_TREFFER_JE_SUCHE = 20;
const PROBE_MIN_BEWERTUNGEN = 8;

// ────────────────────────────────────────────────────────────────
// Eingabe: Probe-Läufe
// ────────────────────────────────────────────────────────────────

function datumDe(iso) {
    const [j, m, t] = String(iso).slice(0, 10).split('-');
    return `${t}.${m}.${j}`;
}

/**
 * Lädt einen Probe-Lauf. Das Messdatum kommt aus lighthouseFetchTime der
 * einzelnen PSI-Datensätze — nicht aus run-meta, dessen startedAt beim ersten
 * Lauf eingefroren wird und bei einem späteren PSI-Neulauf falsch wäre.
 */
export function ladeProbeLauf(name) {
    const dir = resolve(probeRoot, name);
    const scoredPfad = resolve(dir, '05-scored.json');
    if (!existsSync(scoredPfad)) throw new Error(`Probe-Lauf ohne 05-scored.json: ${dir}`);
    const scored = JSON.parse(readFileSync(scoredPfad, 'utf8'));
    if (!Array.isArray(scored.leads) || !scored.city) throw new Error(`05-scored.json ohne leads/city: ${scoredPfad}`);

    let ohneMesszeit = 0;
    const leads = scored.leads.map(l => {
        const psiPfad = resolve(dir, '02-psi', `${l.domain}.json`);
        let messzeit = null;
        if (existsSync(psiPfad)) {
            try { messzeit = JSON.parse(readFileSync(psiPfad, 'utf8')).lighthouseFetchTime || null; }
            catch (err) { console.warn(`! PSI-Datensatz unlesbar (${l.domain}): ${err.message}`); }
        }
        if (!messzeit) ohneMesszeit++;
        return { ...l, _messzeit: messzeit };
    });
    if (ohneMesszeit) console.warn(`! ${name}: ${ohneMesszeit} Leads ohne lighthouseFetchTime — sie fließen nicht in Reports ein.`);
    return { verzeichnis: name, stadtName: scored.city, leads };
}

/** Nur die Felder, die der Generator liest. Name, Adresse, Telefon bleiben draußen. */
export function zuGeneratorLead(l) {
    const ws = (l && l.ws) || {};
    const zahl = v => (typeof v === 'number' && Number.isFinite(v) ? v : null);
    // Die Tech-Erkennung schreibt für „kein System gefunden" einen Platzhaltertext
    // („Nicht erkannt (…)"). Das ist keine Messung eines Systems, sondern ihr Fehlen —
    // als null weitergeben, dann zählt der Generator es als unbekannt (Schlüssel „—").
    const cms = typeof l.cms === 'string' && l.cms.trim() && !/^nicht erkannt/i.test(l.cms.trim()) ? l.cms.trim() : null;
    return {
        domain: l.domain,               // nur für den Hash im Generator, nie veröffentlicht
        leadScore: zahl(l.leadScore),
        cms,
        isBaukasten: !!l.isBaukasten,
        reviews: l.reviews || 0,
        ws: {
            perf: zahl(ws.perf),
            seo: zahl(ws.seo),
            a11y: zahl(ws.a11y),
            // nicht gemessen bleibt undefined — der Generator zählt nur === false als fehlend
            isHttps: typeof ws.isHttps === 'boolean' ? ws.isHttps : undefined,
            viewport: typeof ws.viewport === 'boolean' ? ws.viewport : undefined
        }
    };
}

function istAuswertbar(l) {
    return typeof l?.ws?.perf === 'number' && !!l._messzeit && !!l.domain;
}

/**
 * Plant die Reports je Branche. Rückgabe: { plaene, protokoll }.
 * Regel: Stadt allein ≥ MIN_N → eigener Report. Sonst Zusammenfassung aller
 * Läufe, wenn jeder Lauf beiträgt und die Summe ≥ MIN_N ist.
 */
export function planeReports(laeufe, { minN = MIN_N } = {}) {
    const plaene = [];
    const protokoll = [];
    for (const key of Object.keys(BRANCH_SLUG)) {
        const jeStadt = laeufe.map(lauf => ({
            lauf,
            leads: lauf.leads.filter(l => l?.branch?.key === key && istAuswertbar(l))
        }));
        const einzeln = jeStadt.filter(x => x.leads.length >= minN);
        const aufteilung = jeStadt.map(x => `${x.lauf.stadtName} ${x.leads.length}`).join(', ');
        if (einzeln.length) {
            for (const x of einzeln) plaene.push({ key, staedte: [x], zusammengefasst: false });
            protokoll.push({ key, ergebnis: 'einzeln', aufteilung });
            continue;
        }
        const summe = jeStadt.reduce((s, x) => s + x.leads.length, 0);
        const alleTragenBei = jeStadt.every(x => x.leads.length > 0);
        if (laeufe.length > 1 && alleTragenBei && summe >= minN) {
            plaene.push({ key, staedte: jeStadt, zusammengefasst: true });
            protokoll.push({ key, ergebnis: 'zusammengefasst', aufteilung, summe });
        } else {
            protokoll.push({ key, ergebnis: 'kein Report', aufteilung, summe, grund: `n=${summe} < ${minN} oder nicht jede Stadt trägt bei` });
        }
    }
    return { plaene, protokoll };
}

// ────────────────────────────────────────────────────────────────
// Report-Objekt aufbereiten (vor dem Rendern)
// ────────────────────────────────────────────────────────────────

function neuerTestText(t) {
    // Der Generator nennt Seiten ohne erkanntes CMS „Static/Custom". Nicht erkannt
    // heißt aber nicht handgeschrieben — die Beschriftung sagt nur, was gemessen ist.
    const istWp = /WordPress/.test(t.label || '');
    const a = istWp ? 'WordPress' : 'Baukasten';
    const b = istWp ? 'ohne erkanntes CMS' : 'übrige Websites';
    const medA = t.groupA?.median, medB = t.groupB?.median;
    const diff = Math.round((medB - medA) * 10) / 10;
    const verdict = t.p < 0.05
        ? (diff > 0
            ? `Websites ${istWp ? 'ohne erkanntes CMS' : 'ohne Baukasten'} liegen im Median ${diff} Performance-Punkte über ${a} (p=${t.p}).`
            : `${a}-Websites liegen im Median ${Math.abs(diff)} Performance-Punkte über ${istWp ? 'Websites ohne erkanntes CMS' : 'den übrigen'} (p=${t.p}).`)
        : `Kein belastbarer Unterschied (p=${t.p}, n=${t.groupA?.n} gegen n=${t.groupB?.n}).`;
    return {
        ...t,
        label: `${a} gegen ${b} (PageSpeed Performance)`,
        groupA: { ...t.groupA, label: a },
        groupB: { ...t.groupB, label: b.charAt(0).toUpperCase() + b.slice(1) },
        verdict
    };
}

export function bereiteReportAuf(report, plan, { messVon, messBis }) {
    report.techStack = Object.fromEntries(Object.entries(report.techStack || {})
        .map(([k, v]) => [k === '—' ? 'kein CMS erkannt' : k, v]));
    report.tests = (report.tests || []).map(neuerTestText);

    // Der wörtliche Suchbegriff bleibt draußen: „KFZ Werkstatt" verletzt den
    // Marken-Linter, und die Methode braucht nur Branche + Stadt als Suchlogik.
    report.methodology = {
        ...report.methodology,
        source: 'Google Places (Suche nach Branche und Stadt) und PageSpeed Insights (Lighthouse, mobile Messung, eine Messung je Website)',
        filter: `Die ersten bis zu ${PROBE_TREFFER_JE_SUCHE} Treffer je Stadt mit eigener Website, mindestens ${PROBE_MIN_BEWERTUNGEN} Google-Bewertungen und Status „geöffnet“; große Unternehmen, Ketten, Kammern und Webdesign-Anbieter ausgeschlossen; Websites ohne auswertbare PageSpeed-Messung entfallen`,
        instrumentation: 'Messstrecke von Karriaro Webdesign (CMS-Erkennung per Heuristik)',
        anonymization: 'nur Kennzahlen je Branche'
    };
    report.stichprobe = {
        staedte: plan.staedte.map(x => ({ name: x.lauf.stadtName, n: x.leads.length })),
        zusammengefasst: !!plan.zusammengefasst,
        messVon, messBis
    };
    // Kennung für den Rücklink: identifiziert die Report-AUSGABE, keinen Betrieb.
    report.refKennung = anonymizeId(`${report.slug}|${messBis}`, report.brancheKey);
    return report;
}

/** Was öffentlich als report.json liegt: ohne anonymisierte Einzelzeilen, ohne Lead-Score. */
export function oeffentlicherDatensatz(report) {
    const { leads, ...rest } = report;
    const { leadScore, ...stats } = report.stats || {};
    return { ...rest, stats };
}

// ────────────────────────────────────────────────────────────────
// Nachbearbeitung der Builder-Ausgabe
// ────────────────────────────────────────────────────────────────

function escapeRegExp(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function escapeHtml(s) {
    return String(s ?? '').replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Ersetzt genau `erwartet` Treffer — sonst Abbruch mit Ankername. Ersatz immer als Funktion. */
export function ersetzeGenau(text, muster, ersatz, name, erwartet = 1) {
    const re = typeof muster === 'string'
        ? new RegExp(escapeRegExp(muster), 'g')
        : new RegExp(muster.source, muster.flags.includes('g') ? muster.flags : muster.flags + 'g');
    const treffer = (text.match(re) || []).length;
    if (treffer !== erwartet) {
        throw new Error(`Nachbearbeitung „${name}": ${treffer} Treffer statt ${erwartet} — Builder-Ausgabe geändert, Anker prüfen.`);
    }
    return text.replace(re, typeof ersatz === 'function' ? ersatz : () => ersatz);
}

/** /audit/<slug>/ → /audit/<slug>: Firebase (trailingSlash:false) leitet die Form mit Schrägstrich per 301 um. */
export function ohneSchraegstrich(text) {
    return String(text)
        .replace(/\/audit\/([a-z0-9-]+)\/(?=["'<\s)\]]|$)/gm, (m, slug) => `/audit/${slug}`)
        .replace(/\/audit\/(?=["'<\s)\]]|$)/gm, () => '/audit');
}

function perfBins(report) {
    const bins = [];
    for (let lo = 0; lo < 100; lo += 10) {
        const count = report.leads.filter(l => l.perfBucket && Number(l.perfBucket.split('-')[0]) === lo).length;
        bins.push({ lo, hi: lo + 9, count });
    }
    return bins;
}

function orteAls(report) {
    return report.stichprobe.staedte.map(s => ({
        '@type': 'Place', name: s.name,
        address: { '@type': 'PostalAddress', addressLocality: s.name, addressCountry: 'DE' }
    }));
}

function messText(report) {
    const { messVon, messBis } = report.stichprobe;
    return messVon === messBis ? `am ${datumDe(messBis)}` : `vom ${datumDe(messVon)} bis ${datumDe(messBis)}`;
}

function korrigierteSchemas(report) {
    const pct = s => Math.round((s || 0) * 100);
    const url = `${SITE}/audit/${report.slug}`;
    const s = buildAllSchemas(report);
    const orte = orteAls(report);
    const zeitraum = report.stichprobe.messVon === report.stichprobe.messBis
        ? report.stichprobe.messBis
        : `${report.stichprobe.messVon}/${report.stichprobe.messBis}`;

    const dataset = {
        ...s.dataset,
        description: `Aggregierte Kennzahlen zu ${report.n} Websites (${report.brancheName}) in ${report.stadtName}, gemessen ${messText(report)}: ` +
            `PageSpeed Insights (Performance, SEO, Barrierefreiheit), CMS-Erkennung, TLS und mobiler Viewport. ` +
            `Auswahl über die Google-Places-Suche, mindestens ${PROBE_MIN_BEWERTUNGEN} Google-Bewertungen, eigene Website. ` +
            `Median PageSpeed Performance ${report.stats.perf.median}, Baukasten-Anteil ${pct(report.baukasten.share)} %. Keine Namen oder Einzelwerte.`,
        url,
        keywords: ['Website', 'PageSpeed', 'Lighthouse', 'CMS', report.brancheName, ...report.stichprobe.staedte.map(x => x.name)],
        temporalCoverage: zeitraum,
        spatialCoverage: orte.length === 1 ? orte[0] : orte,
        distribution: [{ '@type': 'DataDownload', encodingFormat: 'text/html', contentUrl: url }]
    };
    const article = {
        ...s.article, url, mainEntityOfPage: url, about: orte.length === 1 ? orte[0] : orte,
        description: `${report.brancheName} in ${report.stadtName}: Wie stehen die Websites da? ${report.n} Websites, gemessen ${messText(report)}: ` +
            `Median PageSpeed Performance ${report.stats.perf.median}, ${pct(report.baukasten.share)} % Baukasten-Anteil, ${pct(report.ssl.missingShare)} % ohne TLS.`
    };

    const fragen = faqFragen(report);
    const faq = {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: fragen.map(({ q, a }) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } }))
    };
    return { original: s, dataset, article, faq, fragen };
}

function faqFragen(report) {
    const pct = s => Math.round((s || 0) * 100);
    const eintraege = Object.entries(report.techStack || {}).filter(([k]) => k !== 'Sonstige');
    const erkannt = eintraege.filter(([k]) => k !== 'kein CMS erkannt').sort((a, b) => b[1].count - a[1].count);
    const ohne = report.techStack?.['kein CMS erkannt'];
    const quelle = `Quelle: Karriaro Web-Index, ${report.brancheName} in ${report.stadtName}, gemessen ${messText(report)}, n=${report.n}.`;
    return [
        {
            q: `${report.brancheName} in ${report.stadtName}: Wie schnell laden die Websites?`,
            a: `Im Median erreichen die ${report.n} gemessenen Websites einen PageSpeed-Performance-Wert von ${report.stats.perf.median} ` +
                `(mittlere Hälfte ${report.stats.perf.p25} bis ${report.stats.perf.p75}, mobile Messung). ` +
                `SEO-Median ${report.stats.seo.median}, Barrierefreiheit-Median ${report.stats.a11y.median}. ${quelle}`
        },
        {
            q: `${report.brancheName} in ${report.stadtName}: Mit welchen Systemen sind die Websites gebaut?`,
            a: (erkannt.length
                ? `Häufigstes erkanntes System ist ${erkannt[0][0]} mit ${pct(erkannt[0][1].share)} % (${erkannt[0][1].count} von ${report.n}). `
                : 'Bei keiner Website wurde ein System eindeutig erkannt. ') +
                (ohne ? `Bei ${ohne.count} Websites wurde kein System erkannt. ` : '') +
                `Baukasten-Anteil: ${pct(report.baukasten.share)} %. ${quelle}`
        },
        {
            q: `${report.brancheName} in ${report.stadtName}: Wie viele Websites laufen ohne TLS oder ohne mobilen Viewport?`,
            a: `${report.ssl.missingCount} von ${report.n} Websites (${pct(report.ssl.missingShare)} %) wurden ohne TLS-Verschlüsselung ausgeliefert, ` +
                `${report.mobile.missingCount} von ${report.n} (${pct(report.mobile.missingShare)} %) ohne mobilen Viewport. ${quelle}`
        }
    ];
}

export function nachbearbeiteReportHtml(html, report) {
    const pct = s => Math.round((s || 0) * 100);
    const accent = ACCENT_BY_BRANCH[report.brancheKey] || '#1a1a1a';
    const slugEnc = encodeURIComponent(report.slug);
    const sch = korrigierteSchemas(report);
    let h = html;

    // 1) Tabelle mit Zeilen je Website raus — keine Einzelbefunde.
    h = ersetzeGenau(h, /\n  <section class="kr-section">\n    <p class="kr-eyebrow">№ 05 · STICHPROBE<\/p>[\s\S]*?<\/section>\n/, '\n', 'Stichproben-Tabelle');

    // 2) Lead-Score ist eine interne Vertriebszahl — ersetzt durch die Verteilung der PageSpeed-Werte.
    const perfChart = histogramChart(perfBins(report), { accent, label: 'PageSpeed Performance, Verteilung', width: 360, height: 240 });
    h = ersetzeGenau(h, /<div class="kr-card"><svg[^>]*aria-label="Histogramm Lead-Score-Verteilung[^"]*"[\s\S]*?<\/svg><\/div>/, `<div class="kr-card">${perfChart}</div>`, 'Lead-Score-Histogramm');

    // 3) Strukturierte Daten: Messdatum, Orte, keine ungemessenen Themen, FAQ = sichtbare FAQ.
    h = ersetzeGenau(h, schemaScriptTag(sch.original.dataset), schemaScriptTag(sch.dataset), 'JSON-LD Dataset');
    h = ersetzeGenau(h, schemaScriptTag(sch.original.article), schemaScriptTag(sch.article), 'JSON-LD Article');
    h = ersetzeGenau(h, schemaScriptTag(sch.original.faq), schemaScriptTag(sch.faq), 'JSON-LD FAQ');

    // 3b) Meta-Beschreibung: grammatisch (Branche vorangestellt statt „Wie steht <Plural> …").
    h = ersetzeGenau(h, `Wie steht ${escapeHtml(report.brancheName)} in ${escapeHtml(report.stadtName)} digital da? Audit von`,
        `${escapeHtml(report.brancheName)} in ${escapeHtml(report.stadtName)}: Wie stehen die Websites da? Messung von`, 'Meta-Beschreibung', 2);

    // 4) Randnotizen: tatsächliche Mindestzahl an Bewertungen, keine unbelegte Wertung.
    h = ersetzeGenau(h, `Stichprobe: ${report.n} Sites mit ≥ 5 öffentlichen Bewertungen.`,
        `Stichprobe: ${report.n} Websites, je mindestens ${PROBE_MIN_BEWERTUNGEN} Google-Bewertungen.`, 'Randnotiz Stichprobe');
    h = ersetzeGenau(h, `Baukasten-Anteil: ${pct(report.baukasten.share)} % — Performance-relevant.`,
        `Baukasten-Anteil: ${pct(report.baukasten.share)} %.`, 'Randnotiz Baukasten');

    // 5) Kopfleiste: Messdatum statt Monat, Aufteilung auf die Städte.
    const aufteilung = report.stichprobe.staedte.map(s => `<strong>${s.n}</strong> ${escapeHtml(s.name)}`).join(' · ');
    h = ersetzeGenau(h, `<span>Erhebung <strong>${escapeHtml(report.erhebungMonth)}</strong></span>`,
        `<span>Gemessen <strong>${escapeHtml(messText(report).replace(/^am /, ''))}</strong></span>` +
        (report.stichprobe.staedte.length > 1 ? `\n      <span>${aufteilung}</span>` : ''), 'Kopfleiste Erhebung');

    // 6) Sichtbare Fragen (dieselben wie im JSON-LD) vor der Methode.
    const faqHtml = `<section class="kr-section">
    <p class="kr-eyebrow">№ 00 · FRAGEN</p>
    <h2 class="kr-h2">Drei Fragen, aus den Daten <em>beantwortet</em>.</h2>
    <dl class="kr-tests">${sch.fragen.map(f => `<div style="border-left:2px solid var(--accent);padding:.4rem 0 .4rem 1.1rem"><dt class="kr-test-label">${escapeHtml(f.q)}</dt><dd style="margin-top:.3em">${escapeHtml(f.a)}</dd></div>`).join('')}</dl>
  </section>

  <section class="kr-section">
    <p class="kr-eyebrow">№ 06 · METHODE</p>`;
    h = ersetzeGenau(h, `<section class="kr-section">\n    <p class="kr-eyebrow">№ 06 · METHODE</p>`, faqHtml, 'Fragen vor Methode');

    // 7) Methode: Anonymisierung, Mindestzahl, Messdatum, Grenzen.
    h = ersetzeGenau(h, /<p style="margin-top:\.6em"><strong>Anonymisierung\.<\/strong>[\s\S]*?<\/p>/,
        `<p style="margin-top:.6em"><strong>Veröffentlichung.</strong> Nur Kennzahlen je Branche. Namen, Adressen, Domains und Werte einzelner Websites erscheinen weder auf dieser Seite noch im Datensatz.</p>`, 'Methode Anonymisierung');
    const staedteText = report.stichprobe.staedte.map(s => `${s.n} aus ${escapeHtml(s.name)}`).join(', ');
    const mindest = report.stichprobe.zusammengefasst
        ? `${MIN_N} Websites je Report; darunter wird kein Report veröffentlicht. In keiner der Städte allein erreicht diese Branche die Zahl, deshalb fasst dieser Report ${escapeHtml(report.stadtName)} zusammen (${staedteText}).`
        : `${MIN_N} Websites je Branche und Stadt; darunter wird kein Report veröffentlicht.`;
    h = ersetzeGenau(h, /<p style="margin-top:\.6em"><strong>Mindest-Stichprobe\.<\/strong>[\s\S]*?<\/p>/,
        `<p style="margin-top:.6em"><strong>Mindest-Stichprobe.</strong> ${mindest}</p>`, 'Methode Mindest-Stichprobe');
    h = ersetzeGenau(h, /<p style="margin-top:\.6em"><strong>Lizenz\.<\/strong>/,
        `<p style="margin-top:.6em"><strong>Messdatum.</strong> Alle Werte wurden ${escapeHtml(messText(report))} gemessen und seither nicht aktualisiert. Websites können sich inzwischen verändert haben.</p>
      <p style="margin-top:.6em"><strong>Grenzen.</strong> PageSpeed-Werte schwanken zwischen zwei Messungen; jede Website wurde einmal gemessen. Die Auswahl folgt der Google-Suche und bildet nicht alle Betriebe der Branche ab. Die statistischen Tests sind Einzeltests ohne Korrektur für mehrere Vergleiche; ein p-Wert knapp unter 0,05 ist ein Hinweis, kein Beleg. Wo ein Wert nicht gemessen werden konnte, zählt er nicht als Mangel.</p>
      <p style="margin-top:.6em"><strong>Lizenz.</strong>`, 'Methode Messdatum/Grenzen');

    // 8) Handlungsaufruf: zur eigenen Prüfung, mit Report und Kennung der Ausgabe.
    const ziel = `/website-pruefen?report=${slugEnc}&amp;ref=${encodeURIComponent(report.refKennung)}`;
    h = ersetzeGenau(h, /<section class="kr-cta">[\s\S]*?<\/section>/, `<section class="kr-cta">
    <h2 class="kr-cta-h">Wo steht Ihre eigene Website?<br><em>Prüfen Sie sie an denselben Kennzahlen.</em></h2>
    <p class="kr-cta-sub">Sie geben die Adresse Ihrer Website ein und sehen, wo sie bei Performance, SEO und Barrierefreiheit steht. Den ausführlichen Bericht erhalten Sie per E-Mail — kostenfrei und unverbindlich.</p>
    <a class="kr-btn" href="${ziel}">Eigene Website prüfen</a>
  </section>`, 'Handlungsaufruf');

    // 9) Abschnittsnummern lückenlos (Tabelle entfällt, Tests nur bei genug Daten).
    let nr = 1;
    h = h.replace(/<p class="kr-eyebrow">№ \d\d · /g, () => `<p class="kr-eyebrow">№ ${String(++nr).padStart(2, '0')} · `);

    // 10) URLs ohne Schrägstrich am Ende (sonst zeigt canonical auf eine Umleitung).
    h = ohneSchraegstrich(h);
    return h;
}

// ────────────────────────────────────────────────────────────────
// Veröffentlichungs-Prüfung (Wirkung, nicht Anwesenheit)
// ────────────────────────────────────────────────────────────────

const VERBOTEN = [
    [/Bu(ß|ss)geld/i, 'Bußgeld-Aussage'],
    [/(?<![\p{L}\d])BFSG(?![\p{L}\d])/u, 'BFSG-Bezug (nicht gemessen)'],
    [/Abmahn/i, 'Abmahn-Aussage'],
    [/rechtswidrig|Rechtsfolge|Pflichtverstoß/i, 'Rechtsfolge-Aussage'],
    [/Lead-?Score/i, 'interne Vertriebszahl'],
    [/K(ö|oe)ln/i, 'Ortsbezug Köln'],
    [/(?<![\p{L}\d])(24|48)\s?(h|Stunden)(?![\p{L}\d])/u, 'Tempo-Zusage'],
    [/garantier/i, 'Garantie-Aussage'],
    [/class="kr-table"/, 'Tabelle mit Einzelzeilen'],
    [/[A-Z]-\d{3}<\/td>/, 'Kennung einzelner Website']
];

/**
 * Prüft das fertige HTML und den öffentlichen Datensatz. Wirft bei jedem Befund.
 * `geheim` = Domains/Namen der eingeflossenen Betriebe — keiner darf auftauchen.
 */
export function pruefeVeroeffentlichung({ html, datensatz, geheim = [], kontext = 'report' }) {
    const befunde = [];
    const json = datensatz ? JSON.stringify(datensatz) : '';
    for (const [re, label] of VERBOTEN) {
        if (re.test(html)) befunde.push(`${label} im HTML`);
        if (json && re.test(json)) befunde.push(`${label} im Datensatz`);
    }
    const klein = (html + '\n' + json).toLowerCase();
    for (const g of geheim) {
        const w = String(g || '').toLowerCase().trim();
        // Domains/URLs immer; Namen erst ab 12 Zeichen mit Leerzeichen — kurze Namen
        // wie „Physiotherapie" sind zugleich Branchenwörter und kein Leck.
        const istAdresse = /\./.test(w) && !/\s/.test(w);
        if ((istAdresse && w.length >= 4) || (w.length >= 12 && /\s/.test(w))) {
            if (klein.includes(istAdresse ? w.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '') : w)) {
                befunde.push(`eingeflossener Betrieb sichtbar: ${w.slice(0, 3)}…`);
            }
        }
    }
    // Umlaute als ae/oe/ue im Lesetext (auch in SVG-Titeln und JSON-LD). Links davor kein
    // Bindestrich/Schrägstrich, damit Pfade wie /website-pruefen nicht als Text zählen.
    const lesetext = html.replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ') + '\n' + json;
    const ascii = lesetext.match(/(?<![\p{L}\d/-])(?:moeglich\p{L}*|fuer|ueber\p{L}*|koenn\p{L}*|pruef\p{L}*|waehl\p{L}*|aender\p{L}*|groess\p{L}*|zurueck|oeffn\p{L}*|haeufig\p{L}*|Massnahmen)(?![\p{L}\d])/iu);
    if (ascii) befunde.push(`Umlaut als ASCII im Lesetext: „${ascii[0]}"`);
    if (datensatz && (datensatz.leads || datensatz.stats?.leadScore)) befunde.push('Datensatz enthält Einzelzeilen oder Lead-Score');
    if (/\/audit\/(?:[a-z0-9-]+\/)?(?=["'<\s])/.test(html)) befunde.push('URL mit Schrägstrich am Ende (301)');
    try { assertVoiceClean(stripTags(html), { context: kontext }); }
    catch (err) { befunde.push(err.message); }
    if (befunde.length) {
        const err = new Error(`Veröffentlichungs-Prüfung (${kontext}) — ${befunde.length} Befund(e):\n  ${befunde.join('\n  ')}`);
        err.code = 'PUBLISH_CHECK';
        err.befunde = befunde;
        throw err;
    }
}

// ────────────────────────────────────────────────────────────────
// Report bauen + schreiben
// ────────────────────────────────────────────────────────────────

const ISO_TAG = /^\d{4}-\d{2}-\d{2}$/;

function ladeBestehendenDatensatz(slug) {
    const pfad = resolve(repoRoot, 'src', 'audit', slug, 'report.json');
    if (!existsSync(pfad)) return null;
    try { return JSON.parse(readFileSync(pfad, 'utf8')); } catch { return null; }
}

/**
 * Setzt veroeffentlichtAm/aktualisiertAm. Der Messtag ist KEIN Veröffentlichungsdatum:
 * als datePublished und sitemap-lastmod datierte er Seiten Wochen vor ihr Erscheinen zurück.
 * Ein Neubau behält das erste Veröffentlichungsdatum; nur eine neue Messung rückt
 * aktualisiertAm auf heute.
 */
export function datiereReport(report, {
    vorgabe = null,
    heute = new Date().toISOString().slice(0, 10),
    alt = ladeBestehendenDatensatz(report.slug)
} = {}) {
    const altesDatum = ISO_TAG.test(alt?.veroeffentlichtAm || '') ? alt.veroeffentlichtAm : null;
    report.veroeffentlichtAm = vorgabe || altesDatum || heute;
    let aktualisiert = report.veroeffentlichtAm;
    if (altesDatum) {
        const gleicheMessung = alt?.stichprobe?.messBis === report.stichprobe?.messBis;
        aktualisiert = gleicheMessung ? (ISO_TAG.test(alt.aktualisiertAm || '') ? alt.aktualisiertAm : altesDatum) : heute;
    }
    report.aktualisiertAm = aktualisiert;
    return report;
}

export function baueReport(plan, { veroeffentlichtAm = null } = {}) {
    const quellLeads = plan.staedte.flatMap(x => x.leads);
    const zeiten = quellLeads.map(l => l._messzeit).filter(Boolean).sort();
    const messVon = zeiten[0].slice(0, 10);
    const messBis = zeiten[zeiten.length - 1].slice(0, 10);
    const stadtName = plan.staedte.map(x => x.lauf.stadtName).join(' und ');

    const report = generateReport(quellLeads.map(zuGeneratorLead), {
        brancheKey: plan.key,
        stadtName,
        erhebungTs: Date.parse(`${messBis}T12:00:00Z`)
    });
    bereiteReportAuf(report, plan, { messVon, messBis });
    // Vor buildReportHtml: das JSON-LD im HTML trägt das Datum.
    datiereReport(report, { vorgabe: veroeffentlichtAm });
    const html = nachbearbeiteReportHtml(buildReportHtml(report), report);
    const datensatz = oeffentlicherDatensatz(report);
    const geheim = quellLeads.flatMap(l => [l.domain, l.name, l.websiteUri]);
    pruefeVeroeffentlichung({ html, datensatz, geheim, kontext: `report ${report.slug}` });
    const llms = ohneSchraegstrich(buildLlmsIndexEntry(datensatz));
    return { report, datensatz, html, llms };
}

export function schreibeReport({ report, datensatz, html, llms }) {
    const outDir = resolve(repoRoot, 'src', 'audit', report.slug);
    mkdirSync(outDir, { recursive: true });
    writeFileSync(resolve(outDir, 'index.html'), html, 'utf8');
    writeFileSync(resolve(outDir, 'report.json'), JSON.stringify(datensatz, null, 2), 'utf8');
    writeFileSync(resolve(outDir, 'llms-index-snippet.md'), llms, 'utf8');
    return outDir;
}

function ladeSpecLeads(spec) {
    if (!spec.leads) throw new Error(`Spec ohne leads-Datei: ${spec.branche}/${spec.stadt}`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(spec.messdatum || '')) throw new Error(`Spec ohne messdatum (YYYY-MM-DD): ${spec.branche}/${spec.stadt}`);
    const path = resolve(process.cwd(), spec.leads);
    if (!existsSync(path)) throw new Error(`leads-Datei fehlt: ${path}`);
    const raw = JSON.parse(readFileSync(path, 'utf8'));
    const arr = Array.isArray(raw) ? raw : Array.isArray(raw.leads) ? raw.leads : null;
    if (!arr) throw new Error(`leads-Datei muss Array oder { leads: [...] } enthalten: ${path}`);
    const lauf = { verzeichnis: basename(path), stadtName: spec.stadt, leads: [] };
    lauf.leads = arr
        .filter(l => (l?.branch?.key || spec.branche) === spec.branche)
        .map(l => ({ ...l, branch: l.branch || { key: spec.branche }, _messzeit: `${spec.messdatum}T12:00:00Z` }))
        .filter(istAuswertbar);
    return { key: spec.branche, staedte: [{ lauf, leads: lauf.leads }], zusammengefasst: false };
}

// ────────────────────────────────────────────────────────────────
// CLI
// ────────────────────────────────────────────────────────────────

function parseArgs(argv) {
    const out = { rebuildHub: true, dryRun: false };
    for (let i = 2; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--spec') out.spec = argv[++i];
        else if (a === '--probe') out.probe = argv[++i];
        else if (a === '--no-hub') out.rebuildHub = false;
        else if (a === '--veroeffentlicht') {
            out.veroeffentlicht = argv[++i];
            if (!ISO_TAG.test(out.veroeffentlicht || '')) throw new Error('--veroeffentlicht erwartet ein Datum im Format YYYY-MM-DD');
        }
        else if (a === '--dry-run') out.dryRun = true;
        else if (a === '--help' || a === '-h') out.help = true;
    }
    return out;
}

function printHelp() {
    console.log(`Usage:
  node scripts/build-reports-batch.mjs --probe stuttgart,karlsruhe [--dry-run] [--no-hub]
  node scripts/build-reports-batch.mjs --spec <spec.json> [--dry-run] [--no-hub]

Spec-Format: [{ "branche": "dentist", "stadt": "München", "leads": "exports/x.json", "messdatum": "2026-08-15" }]`);
}

async function main() {
    const args = parseArgs(process.argv);
    if (args.help || (!args.spec && !args.probe)) { printHelp(); process.exit(args.help ? 0 : 1); }

    let plaene;
    if (args.probe) {
        const laeufe = args.probe.split(',').map(s => s.trim()).filter(Boolean).map(ladeProbeLauf);
        const plan = planeReports(laeufe);
        plaene = plan.plaene;
        console.log(`▶ Planung (Mindestzahl ${MIN_N} je Report):`);
        for (const p of plan.protokoll) {
            console.log(`  ${p.key.padEnd(20)} ${p.ergebnis.padEnd(16)} ${p.aufteilung}${p.grund ? '  — ' + p.grund : ''}`);
        }
    } else {
        const specs = JSON.parse(readFileSync(resolve(process.cwd(), args.spec), 'utf8'));
        if (!Array.isArray(specs) || !specs.length) throw new Error('Spec muss ein nicht-leeres JSON-Array sein');
        plaene = specs.map(ladeSpecLeads);
    }

    console.log(`\n▶ ${plaene.length} Reports${args.dryRun ? ' (Trockenlauf, nichts wird geschrieben)' : ''}\n`);
    let ok = 0, fail = 0;
    for (const plan of plaene) {
        try {
            const erg = baueReport(plan, { veroeffentlichtAm: args.veroeffentlicht });
            if (!args.dryRun) schreibeReport(erg);
            const r = erg.report;
            console.log(`✓ ${r.slug.padEnd(40)} n=${String(r.n).padStart(3)}  ${(erg.html.length / 1024).toFixed(1).padStart(5)} KB  Kennung ${r.refKennung}  gemessen ${r.stichprobe.messBis}`);
            ok++;
        } catch (err) {
            console.error(`✗ ${plan.key}: ${err.message}`);
            fail++;
        }
    }
    console.log(`\n▶ Ergebnis: ${ok} OK, ${fail} Fehler\n`);

    if (args.rebuildHub && !args.dryRun) {
        const { baueIndizes } = await import('./build-reports-index.mjs');
        baueIndizes();
    }
    if (fail) process.exit(1);
}

const direktAufruf = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (direktAufruf) {
    main().catch(err => { console.error('✗', err.message); process.exit(1); });
}
