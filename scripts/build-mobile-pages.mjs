#!/usr/bin/env node
/**
 * Sprint 91 — Mobile-Build-Generator (komplett neu, ersetzt Sprint-87-Version).
 *
 * Liest Desktop-Pages in src/*.html / src/portfolio/*.html / src/blog/*.html
 * und erzeugt mobile-taugliche Spiegelungen in src/m/.
 *
 * Transformationen pro Page:
 *  1. Auto-Redirect-Snippet entfernen (sonst loopt /m/ auf sich selbst)
 *  2. <link rel="stylesheet" href="/css/mobile-overrides.css"> als LETZTES
 *     Stylesheet im <head> einfügen (überschreibt selektiv Desktop-CSS)
 *  3. Bei verkaufenden Pages (index/preise/audit, alle portfolio/, alle city-pages):
 *     Sticky-CTA-Bar direkt vor closing body-Tag injizieren
 *
 * Desktop-Pages bleiben absolut unberührt. Single Source of Truth.
 *
 * Run: npm run build:mobile
 *
 * KEIN cheerio/jsdom — reine String-Operationen, dependency-free.
 */

import {
    readFileSync, writeFileSync, mkdirSync, readdirSync, statSync,
    existsSync, unlinkSync
} from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SRC = join(ROOT, 'src');
const OUT = join(SRC, 'm');

// ────────────────────────────────────────────────────────────────
// Welche Pages sind verkaufend? → bekommen Sticky-CTA-Bar
// ────────────────────────────────────────────────────────────────
const SELLING_TOP = new Set([
    'index.html',
    'preise.html',
    'audit.html',
    'website-check.html',
]);

function isSelling(relPath) {
    if (SELLING_TOP.has(relPath)) return true;
    if (relPath.startsWith('portfolio/')) return true;
    if (relPath.startsWith('webdesign-')) return true;
    return false;
}

// ────────────────────────────────────────────────────────────────
// Skip-List: Pages, die NICHT gemirrort werden
// ────────────────────────────────────────────────────────────────
const SKIP = new Set([
    '404.html',
]);

// ────────────────────────────────────────────────────────────────
// HTML-Snippets
// ────────────────────────────────────────────────────────────────

const MOBILE_OVERRIDES_LINK = `    <link rel="stylesheet" href="/css/mobile-overrides.css?v=156">
    <script>(function(){if(/[?&]screenshot=1/.test(location.search))document.documentElement.classList.add('screenshot-mode');})();</script>`;

// Sprint 134 — PWA-Foundation + Apple-Mobile-Web-App-Meta.
// Wird vor </head> auf JEDER Mobile-Page injiziert (auch Sub-Pages).
const PWA_HEAD_BLOCK = `    <link rel="manifest" href="/manifest.json">
    <link rel="apple-touch-icon" sizes="180x180" href="/icons/apple-touch-icon.png">
    <link rel="icon" type="image/png" sizes="192x192" href="/icons/icon-192.png">
    <meta name="theme-color" content="#1A2E40" media="(prefers-color-scheme: light)">
    <meta name="theme-color" content="#0a0c0f" media="(prefers-color-scheme: dark)">
    <meta name="color-scheme" content="light dark">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
    <meta name="apple-mobile-web-app-title" content="Karriaro">
    <meta name="format-detection" content="telephone=no">
    <script>(function(){if('serviceWorker' in navigator){window.addEventListener('load',function(){navigator.serviceWorker.register('/sw.js').catch(function(){});});}})();</script>`;

function injectPwaHead(html) {
    if (html.includes('rel="manifest"')) return html;
    const closeHeadIdx = html.lastIndexOf('</head>');
    if (closeHeadIdx === -1) return html;
    return html.slice(0, closeHeadIdx) + PWA_HEAD_BLOCK + '\n' + html.slice(closeHeadIdx);
}

// Sprint 135 — Mobile-OG-Image (1200×630 Editorial-Spread, Cream+Indigo)
// ersetzt das generic og-image.jpg auf den Mobile-Pages.
function rewriteOgImage(html) {
    return html
        .replace(/og-image\.jpg/g, 'og-image-mobile.jpg');
}

// Sprint 128 — Sticky-CTA-IO + Demo-Sheet + Persona-Click + Scroll-Anim
// wurden aus den Inline-Snippets in src/js/m-interactions.js extrahiert.
// Eine externe <script>-Referenz wird via M_INTERACTIONS_SCRIPT am
// </body>-Ende eingehaengt.
const STICKY_CTA_BAR = `
<!-- Mobile-Sticky-CTA-Bar (Sprint 100 — Anrufen + WhatsApp, erscheint bei Scroll) -->
<div class="m-sticky-cta-bar" data-m-sticky-cta>
    <a href="tel:+491742796784" class="m-sticky-cta m-sticky-cta--phone">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
        Anrufen
    </a>
    <a href="https://wa.me/491742796784?text=Hallo%20Karriaro%2C%20ich%20interessiere%20mich%20f%C3%BCr%20eine%20handcodierte%20Website%20f%C3%BCr%20mein%20Unternehmen.%20K%C3%B6nnen%20wir%20kurz%20sprechen%3F" target="_blank" rel="noopener" class="m-sticky-cta m-sticky-cta--whatsapp">
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.6 6.31C16.16 4.86 14.16 4 12.07 4 7.88 4 4.5 7.42 4.5 11.66c0 1.36.36 2.7 1.04 3.87L4.4 19.7l4.27-1.12c1.13.6 2.4.93 3.7.93h.01c4.18 0 7.58-3.42 7.58-7.66 0-2.05-.81-3.97-2.36-5.54zm-5.53 11.79h-.01c-1.16 0-2.3-.31-3.3-.91l-.24-.14-2.52.66.67-2.46-.15-.25c-.65-1.04-1-2.25-1-3.5 0-3.62 2.94-6.55 6.56-6.55 1.75 0 3.4.68 4.64 1.92 1.23 1.23 1.93 2.86 1.92 4.62-.01 3.61-2.94 6.61-6.58 6.61z"/></svg>
        WhatsApp
    </a>
</div>
`;

// Sprint 133 — Pin-Spy als Magazine-Page-Counter (top-right, Mobile-only).
// Zeigt aktuelle Section-Nummer + Label. JS in m-interactions.js (mPinSpy)
// aktualisiert [data-spy-current] beim Scroll via IntersectionObserver.
const PIN_SPY_HTML = `
<!-- Sprint 133 — Magazine-Page-Counter / Section-Reading-Indicator -->
<aside class="m-pin-spy" data-m-pin-spy aria-hidden="true">
    <span class="m-pin-spy-num" data-m-pin-spy-num>01</span>
    <span class="m-pin-spy-sep">/</span>
    <span class="m-pin-spy-total">06</span>
    <span class="m-pin-spy-dot" aria-hidden="true">·</span>
    <span class="m-pin-spy-label" data-m-pin-spy-label>COVER</span>
</aside>
`;

function injectPinSpy(html) {
    if (html.includes('data-m-pin-spy')) return html;
    const closeTag = '</' + 'body>';
    const closeBodyIdx = html.lastIndexOf(closeTag);
    if (closeBodyIdx === -1) return html;
    return html.slice(0, closeBodyIdx) + PIN_SPY_HTML + html.slice(closeBodyIdx);
}

// Sprint 128 — externe Mobile-Interaktions-JS-Referenz (am </body>-Ende einhaengen).
// Sprint 143 — Cache-Bust v=134 → v=143 (Senior-Review C-1/C-4/C-5/C-7/C-8/C-9:
// Sticky-CTA-Bar entfernt, :focus-visible global, iframe-Fail-Timeout 8s,
// Hamburger Focus-Trap+Escape, Pin-Spy responsive top, Critical-CSS inline).
const M_INTERACTIONS_SCRIPT = `\n<script src="/js/m-interactions.js?v=156" defer></script>\n`;

function injectMInteractionsScript(html) {
    if (html.includes('m-interactions.js')) return html;
    const closeTag = '</' + 'body>';
    const closeBodyIdx = html.lastIndexOf(closeTag);
    if (closeBodyIdx === -1) {
        console.warn('  ⚠ kein body-close — m-interactions.js nicht injiziert');
        return html;
    }
    return html.slice(0, closeBodyIdx) + M_INTERACTIONS_SCRIPT + html.slice(closeBodyIdx);
}

// ────────────────────────────────────────────────────────────────
// Transformationen
// ────────────────────────────────────────────────────────────────

function stripAutoRedirect(html) {
    // Greift jeden inline-<script>-Block, der "m.karriaro-webdesign.de" enthält.
    // Sprint 140 — Negative-Lookahead gegen </script>, damit der Regex NICHT
    // über andere benachbarte <script>-Tags hinweg matcht (vorheriger lazy-
    // Pattern hat zB. den Embed-Hero-Script + <style>-Block mit-konsumiert).
    const pattern = /<script>(?:(?!<\/script>)[\s\S])*?m\.karriaro-webdesign\.de(?:(?!<\/script>)[\s\S])*?<\/script>\s*/g;
    return html.replace(pattern, '');
}

function injectMobileCss(html) {
    if (html.includes('mobile-overrides.css')) return html;
    const closeHeadIdx = html.lastIndexOf('</head>');
    if (closeHeadIdx === -1) {
        console.warn('  ⚠ kein </head> — Mobile-CSS nicht injiziert');
        return html;
    }
    return html.slice(0, closeHeadIdx) + MOBILE_OVERRIDES_LINK + '\n' + html.slice(closeHeadIdx);
}

// Sprint 143 (Senior-Review C-9) — Critical-CSS inline im <head>.
// CLAUDE.md fordert das fuer LCP <= 1.8s. Block deckt above-the-fold:
// body-Reset, fixed Nav, Hero-Skelett, Typografie-Defaults, Pin-Spy +
// Sticky-CTA als display:none-Initialstate (FOUC-Schutz). Spaeter laden
// tokens.css + mobile-overrides.css die finalen Werte; gleiche Selektor-
// Specificity → File-Reihenfolge entscheidet, externe CSS gewinnt.
const CRITICAL_CSS = `
<style id="m-critical-css">
/* Sprint 143/148.2 — Critical-CSS Mobile-Hauptseite (LCP-Optimierung).
 * 148.2 (Hero-FOUC-Fix): Desktop-only Hero-Sub-Elemente (Mockup-Block,
 * Marginalia, Hero-Portrait, Mockup-Features) MUESSEN inline versteckt
 * sein, sonst rendert das Hero erst gross (mit Mockup-Foto) bis die
 * externe mobile-overrides.css ihren display:none-Override liefert
 * (User-Befund "Hero senkrecht ueber zwei Seiten fuer eine Sekunde"). */
*,*::before,*::after{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#F8F4ED;color:#14202B;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
main{display:block}
nav{position:fixed;top:0;left:0;right:0;z-index:60;background:rgba(251,251,253,0.92);-webkit-backdrop-filter:saturate(180%) blur(20px);backdrop-filter:saturate(180%) blur(20px);height:64px;display:flex;align-items:center;border-bottom:1px solid rgba(0,0,0,0.04)}
.hero-with-photo{padding:88px 24px 48px;min-height:100svh;background:#F8F4ED}
.hero-inner{max-width:560px;margin:0 auto}
.hero-folio-eyebrow{font-family:"JetBrains Mono",ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#525E6B;margin:0 0 20px;display:flex;flex-wrap:wrap;gap:0 6px;line-height:1.6}
.hero-folio-eyebrow .dot{opacity:0.5}
.hero-headline{font-family:Fraunces,Georgia,"Times New Roman",serif;font-size:clamp(34px,9vw,52px);font-weight:600;line-height:1.05;letter-spacing:-0.01em;margin:0 0 24px;color:#14202B}
.hero-headline .hero-h1-line{display:block}
/* Desktop-only Hero-Elemente sofort verstecken (vor mobile-overrides.css-Load) */
.hero-with-photo .hero-mockup-block,.hero-with-photo .mockup-features,.hero-with-photo .mockup-features-list,.hero-with-photo .marginalia,.hero-with-photo .hero-marginalia,.hero-with-photo .hero-portrait,.hero-with-photo picture{display:none!important}
.m-pin-spy{display:none}
.m-sticky-cta-bar{display:none}
.kr-cta-float{display:none}
</style>
`;

function injectCriticalCss(html) {
    if (html.includes('id="m-critical-css"')) return html;
    // Sprint 148.3 — Critical-CSS muss SO FRUEH WIE MOEGLICH ins <head>,
    // direkt nach <meta name="viewport">. Vorher war's am Ende des
    // <head> (nach 2850 Zeilen Sprint-39-Inline-Style + externer mobile-
    // overrides.css), und Safari Streaming-HTML-Parse rendert progressiv
    // mit den Sprint-39-Defaults bevor das Critical-CSS angewandt wird —
    // Hero erscheint kurz "ueber zwei Seiten" mit sichtbarem Mockup-Block.
    const viewportMatch = html.match(/<meta\s+name="viewport"[^>]*>/i);
    if (viewportMatch) {
        const idx = html.indexOf(viewportMatch[0]) + viewportMatch[0].length;
        return html.slice(0, idx) + '\n' + CRITICAL_CSS + html.slice(idx);
    }
    // Fallback: vor </head> (alter Stand)
    const closeHeadIdx = html.lastIndexOf('</head>');
    if (closeHeadIdx === -1) {
        console.warn('  ⚠ kein </head> — Critical-CSS nicht injiziert');
        return html;
    }
    return html.slice(0, closeHeadIdx) + CRITICAL_CSS + html.slice(closeHeadIdx);
}

// Sprint 143 — Sticky-Phone+WhatsApp-Bar entfernt (Senior-Design-Review C-1).
// Begruendung: generisches Conversion-Pattern bricht Editorial-Stille der
// Manufaktur-Marke (Aesop/Hermes/Monocle-DNA). Founder-Letter im #kontakt
// + Float-CTA "Erstgespraech" sind die brand-konformen Kontakt-Pfade.
// Falls reaktivierbar gewuenscht: STICKY_CTA_BAR-Template + dieser Stub
// bleiben erhalten, aber Caller in der Pipeline (Z. ~791) ueberspringt.
function injectStickyCta(html) {
    return html;
}

function addGeneratorMarker(html, relPath) {
    const marker = `<!-- AUTO-GENERATED by scripts/build-mobile-pages.mjs (Sprint 92) — Quelle: src/${relPath} — NICHT manuell bearbeiten -->\n`;
    return html.replace(/<html([^>]*)>/, (m) => `${m}\n${marker}`);
}

// ────────────────────────────────────────────────────────────────
// Sprint 92 — index-spezifische Transforms
// ────────────────────────────────────────────────────────────────

function isIndex(relPath) {
    return relPath === 'index.html';
}

function rewriteHeroHeadline(html) {
    // Sprint 110 — Boutique-Print-Disziplin: H1 zwei kurze Zeilen mit je
    // einem Punkt, kein Compound-Bindestrich-Bruch. Italic-Sub bleibt.
    // Sprint 130 — Stagger 3-Beats statt 6-Steps: Beat 1 (0ms) Identity (Webdesign+Manufaktur),
    // Beat 2 (280ms) Promise (Italic-Sub), Beat 3 (560ms) Proof+Action (siehe rewriteHeroCta).
    return html.replace(
        /<h1 class="hero-headline">[\s\S]*?<\/h1>/,
        '<h1 class="hero-headline">' +
        '<span class="hero-h1-line m-hero-stagger" style="--m-delay:0ms">Webdesign.</span>' +
        '<span class="hero-h1-line m-hero-stagger" style="--m-delay:0ms">Manufaktur.</span>' +
        '<span class="hero-h1-line m-hero-accent m-hero-stagger" style="--m-delay:280ms">Jede Seite handcodiert ein Unikat.</span>' +
        '</h1>'
    );
}

function rewriteHeroDemoTease(html) {
    // Sprint 148.10 — Demo-Brücke zwischen H1 und Trust-Liste.
    // Tappable Anchor zu Section 02 (#demos), Editorial-Voice.
    // Stagger Beat 1.5 (140ms) zwischen H1-Identity (0ms) und
    // Italic-Promise (280ms), damit Brücke vor dem Trust-Block landet.
    return html.replace(
        /<\/h1>/,
        '</h1>' +
        '<a href="#demos" class="m-hero-demos-tease m-hero-stagger" ' +
            'style="--m-delay:140ms" data-track-event="HERO_DEMO_TEASE">' +
            '<span class="m-hero-demos-tease-text">' +
                'Acht Branchen, acht Manufaktur-Demos. ' +
                '<em>Eine Wischgeste entfernt.</em>' +
            '</span>' +
            '<span class="m-hero-demos-tease-arrow" aria-hidden="true">↓</span>' +
        '</a>'
    );
}

function rewriteHeroSubhead(html) {
    // Sprint 110 — Boutique-Voice: 1 dichter Satz statt 3 Slack-TLDR-Statements.
    // Sprint 130 — Stagger auf Beat 2 (280ms, Promise-Beat). Subhead ist auf
    // Mobile per CSS hidden — Delay nur als Fallback falls Override wegfällt.
    return html.replace(
        /<p class="subhead"[^>]*>[\s\S]*?<\/p>/,
        '<p class="subhead m-hero-stagger" style="--m-delay:280ms">' +
        'Handcodiert, BFSG-konform, für die KI-Ära gemacht.' +
        '</p>'
    );
}

function rewriteHeroCta(html) {
    // Sprint 129 — 4 → 3 Trust-Items. Sprint 130 — Stagger zu Beat 3 (560ms)
    // verdichtet. Marginalia (Pentagram-Print-Annotation) + Siegel-Embossing
    // (Paula-Scher-Brand-Signature) als Final-Beat.
    return html.replace(
        /<a href="#kontakt" class="btn" data-kr-magnetic>Erstgespräch buchen — Antwort in 24 h<\/a>/,
        '<aside class="m-hero-marginalia m-hero-stagger" style="--m-delay:560ms" aria-hidden="true">' +
            '<span class="m-hero-marginalia-item">₁ Handcodiert</span>' +
            '<span class="m-hero-marginalia-dot">·</span>' +
            '<span class="m-hero-marginalia-item">₂ Schwarzwald-Atelier</span>' +
            '<span class="m-hero-marginalia-dot">·</span>' +
            '<span class="m-hero-marginalia-item">₃ № 01 · 2026</span>' +
        '</aside>' +
        '<ul class="m-hero-trust-list m-hero-stagger" style="--m-delay:560ms">' +
            '<li>' +
                '<span class="m-hero-trust-num">100+</span>' +
                '<span class="m-hero-trust-body">' +
                    '<strong>Branchen-Funktionen</strong>' +
                    '<small>Wertermittlung, BAFA-Rechner, Symptom-Checker und 90+ weitere.</small>' +
                '</span>' +
            '</li>' +
            '<li>' +
                '<span class="m-hero-trust-num">[K]</span>' +
                '<span class="m-hero-trust-body">' +
                    '<strong>Lead-Cockpit Lighthouse</strong>' +
                    '<small>Sie sehen jeden Besucher, KI übersetzt das in nächste Schritte.</small>' +
                '</span>' +
            '</li>' +
            '<li>' +
                '<span class="m-hero-trust-num">⤳</span>' +
                '<span class="m-hero-trust-body">' +
                    '<strong>KI-Automation</strong>' +
                    '<small>Mails, Follow-ups, Anfragen-Routing.</small>' +
                '</span>' +
            '</li>' +
        '</ul>' +
        '<div class="m-hero-cta-bottom m-hero-stagger" style="--m-delay:560ms">' +
            '<a href="#kontakt" class="btn m-hero-primary" data-kr-magnetic>Erstgespräch buchen</a>' +
        '</div>' +
        // Sprint 130 — Manufaktur-Siegel-Embossing 32 px (Phyllotaxis-SVG verkleinert,
        // dezent als Brand-Signature unter CTA. Paula-Scher-Hebel: Siegel im Hero-Polish,
        // nicht als eigene Section in der Magazine-Choreographie verloren.).
        '<div class="m-hero-siegel-emboss m-hero-stagger" style="--m-delay:560ms" aria-hidden="true">' +
            '<svg viewBox="0 0 90 90" width="32" height="32">' +
                '<path d="M 5 18 L 5 5 L 18 5" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linejoin="miter"/>' +
                '<path d="M 72 5 L 85 5 L 85 18" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linejoin="miter"/>' +
                '<path d="M 5 72 L 5 85 L 18 85" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linejoin="miter"/>' +
                '<path d="M 72 85 L 85 85 L 85 72" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linejoin="miter"/>' +
                buildPhyllotaxisDotsForSiegel() +
            '</svg>' +
        '</div>'
    );
}

// Sprint 130 — Phyllotaxis-Dots für Hero-Siegel-Embossing (currentColor statt Gold
// fix, damit es im Embossing-Kontext gold-soft scheint).
function buildPhyllotaxisDotsForSiegel() {
    const goldenAngle = (3 - Math.sqrt(5)) * Math.PI;
    let dots = '';
    for (let n = 1; n <= 13; n++) {
        const r = Math.sqrt(n) * 8;
        const theta = n * goldenAngle;
        const x = (45 + r * Math.cos(theta)).toFixed(2);
        const y = (45 + r * Math.sin(theta)).toFixed(2);
        dots += `<circle cx="${x}" cy="${y}" r="1.5" fill="currentColor"/>`;
    }
    return dots;
}

function injectHeroEyebrowStagger(html) {
    // Sprint 95 — Eyebrow startet als Erstes (Delay 0ms)
    return html.replace(
        /<p class="hero-folio-eyebrow">/,
        '<p class="hero-folio-eyebrow m-hero-stagger" style="--m-delay:0ms">'
    );
}

function compactHeroEyebrow(html) {
    // Sprint 110 — Boutique-Voice-Disziplin: Wort-Doppelung MANUFAKTUR raus.
    // Resultat sichtbar (CSS blendet Span 3 "Karriaro" aus):
    //   "Nº 01 · FÜR JEDE PROFESSION · EIN ATELIER"
    // Targetiert nur Spans innerhalb hero-folio-eyebrow (nicht site-weit).
    return html.replace(
        /<p class="hero-folio-eyebrow[^"]*"[^>]*>[\s\S]*?<\/p>/,
        (match) => match
            .replace(/>Webdesign-Manufaktur</gi, '>Für jede Profession<')
            .replace(/>Frühjahr\s+2026</gi, '>Ein Atelier<')
    );
}

function rewriteFolioMarker(html) {
    // Sprint 129 — Hero-Folio-Marker zu Magazine-Cover-Notation:
    //   "S. 01 · Manufaktur" → "№ 01 · 2026 · EDITORIAL"
    // Cover-Position des Magazine-Spreads, einheitlich zur Eyebrow-Numbering der
    // Folge-Sections (Demos № 02, Personas № 03, Tools № 04, Siegel № 05, Kontakt № 06).
    // Desktop bleibt unverändert (Mobile-only-Rewrite).
    return html.replace(
        /(<div class="hero-folio-marker"[^>]*>)[\s\S]*?(<\/div>)/,
        '$1\n            <span class="folio-page">№ 01</span>\n            <span class="folio-section">2026 · Editorial</span>\n        $2'
    );
}

// ────────────────────────────────────────────────────────────────
// Sprint 104 — Hero-Demo-Card (Apple iPhone-Page-Pattern)
// Browser-Chrome + Mockup, Auto-Rotation alle 4s zwischen 3 Branchen.
// Tap = scroll to demo-swiper-section.
// ────────────────────────────────────────────────────────────────

const HERO_DEMO_SPOT_HTML = `
<!-- Sprint 104 — Hero-Demo-Card-Spot (iPhone-Page-Pattern, auto-margin pusht an Hero-Boden) -->
<div class="m-hero-demo-spot" data-m-hero-demo-spot aria-label="Mini-Demo Branchen-Vorschau">
    <button type="button" class="m-hero-demo-card" data-m-hero-demo-click aria-label="Live-Demos ansehen">
        <div class="m-hero-bf">
            <div class="m-hero-bf-chrome">
                <div class="m-bf-dots">
                    <span class="m-bf-dot m-bf-dot--red"></span>
                    <span class="m-bf-dot m-bf-dot--yellow"></span>
                    <span class="m-bf-dot m-bf-dot--green"></span>
                </div>
                <div class="m-bf-url">
                    <span class="m-bf-domain" data-m-hero-demo-domain>stadtmakler-stuttgart.de</span>
                </div>
            </div>
            <div class="m-bf-canvas" data-m-hero-demo-canvas>
                <picture>
                    <source type="image/webp" srcset="/images/mockups-opt/immobilien-stadtmakler-mockup-480.webp" data-m-hero-demo-webp>
                    <img src="/images/mockups-opt/immobilien-stadtmakler-mockup-800.jpg" data-m-hero-demo-img alt="Demo-Mockup" loading="eager" decoding="async" fetchpriority="high" width="800" height="500">
                </picture>
            </div>
        </div>
        <span class="m-hero-demo-hint" aria-hidden="true">Tippen für Live-Vorschau</span>
    </button>
</div>
`;
// Sprint 128 — Hero-Demo-Spot-JS extrahiert nach src/js/m-interactions.js (mHeroDemoSpot)

function injectHeroDemoSpot(html) {
    if (html.includes('m-hero-demo-card')) return html;
    // Anker: nach Trust-List schließendem </ul> (rewriteHeroCta hat sie schon injiziert)
    // Class kann mehrere Werte haben: "m-hero-trust-list m-hero-stagger" — daher [^"]*
    const trustListEnd = /(<ul class="m-hero-trust-list[^"]*"[\s\S]*?<\/ul>)/;
    if (!trustListEnd.test(html)) {
        console.warn('  ⚠ m-hero-trust-list nicht gefunden — Hero-Demo-Spot nicht injiziert');
        return html;
    }
    return html.replace(trustListEnd, '$1' + HERO_DEMO_SPOT_HTML);
}

// ────────────────────────────────────────────────────────────────
// Sprint 105 — Manufaktursiegel-Hero-Visual (Apple Watch-Page-Pattern)
// Ersetzt Sprint-104 Auto-Rotation-Demo-Card. Statisches Brand-Anker
// am Hero-Boden + Performance-Stats-Strip darunter.
// ────────────────────────────────────────────────────────────────

const HERO_SIEGEL_HTML = `
<!-- Sprint 105 — Manufaktursiegel-Visual am Hero-Boden (Brand-Anker + Performance-Stats) -->
<div class="m-hero-siegel-visual" data-m-hero-siegel aria-label="Karriaro Manufaktursiegel">
    <div class="m-hero-siegel-frame">
        <span class="m-hero-siegel-corner m-hero-siegel-corner--tl" aria-hidden="true">⌐</span>
        <span class="m-hero-siegel-corner m-hero-siegel-corner--tr" aria-hidden="true">¬</span>
        <span class="m-hero-siegel-mark">[K]</span>
        <span class="m-hero-siegel-corner m-hero-siegel-corner--bl" aria-hidden="true">⌊</span>
        <span class="m-hero-siegel-corner m-hero-siegel-corner--br" aria-hidden="true">⌋</span>
    </div>
    <p class="m-hero-siegel-stats">
        <span><strong>0,3 s</strong> Ladezeit</span>
        <span class="m-hero-siegel-dot" aria-hidden="true">·</span>
        <span><strong>BFSG</strong> + DSGVO</span>
        <span class="m-hero-siegel-dot" aria-hidden="true">·</span>
        <span>Schneller als <strong>95%</strong></span>
    </p>
</div>
`;

function injectHeroSiegelVisual(html) {
    if (html.includes('m-hero-siegel-visual')) return html;
    const trustListEnd = /(<ul class="m-hero-trust-list[^"]*"[\s\S]*?<\/ul>)/;
    if (!trustListEnd.test(html)) {
        console.warn('  ⚠ m-hero-trust-list nicht gefunden — Hero-Siegel-Visual nicht injiziert');
        return html;
    }
    return html.replace(trustListEnd, '$1' + HERO_SIEGEL_HTML);
}

// Sprint 115 — Phyllotaxis-Punkte als statisches SVG (Goldener Winkel 137,5°).
// 13 Punkte, pre-computed im Node-Build damit kein Runtime-JS nötig ist.
// Quelle: marketing/social/siegel-story-carousel-1080x1350.html Slide 7.
function buildPhyllotaxisDots() {
    const goldenAngle = (3 - Math.sqrt(5)) * Math.PI;
    let dots = '';
    for (let n = 1; n <= 13; n++) {
        const r = Math.sqrt(n) * 8;
        const theta = n * goldenAngle;
        const x = (45 + r * Math.cos(theta)).toFixed(2);
        const y = (45 + r * Math.sin(theta)).toFixed(2);
        dots += `<circle cx="${x}" cy="${y}" r="1.5" fill="#8A7B5C"/>`;
    }
    return dots;
}

const PHYLLOTAXIS_SVG = `<svg class="m-siegel-svg" viewBox="0 0 90 90" aria-hidden="true">
<path d="M 5 18 L 5 5 L 18 5" stroke="#8A7B5C" stroke-width="1.5" fill="none" stroke-linejoin="miter"/>
<path d="M 72 5 L 85 5 L 85 18" stroke="#8A7B5C" stroke-width="1.5" fill="none" stroke-linejoin="miter"/>
<path d="M 5 72 L 5 85 L 18 85" stroke="#8A7B5C" stroke-width="1.5" fill="none" stroke-linejoin="miter"/>
<path d="M 72 85 L 85 85 L 85 72" stroke="#8A7B5C" stroke-width="1.5" fill="none" stroke-linejoin="miter"/>
${buildPhyllotaxisDots()}
</svg>`;

// Sprint 129 — Editorial-Sektionen gesplittet (Tools + Siegel als getrennte
// Inject-Funktionen, weil sie in der neuen IA an unterschiedlicher Stelle
// stehen) + Apple-Acquisitions-Hebel: 7+93 → 5 Top-Werkzeuge mit Mini-Case
// (Quantität wirkt billig, Qualität wirkt premium).
const TOOLS_SECTION_HTML = `
<!-- Sprint 129 — Tools-Annotation (№ 04) -->
<section class="m-mag-tools" aria-label="Branchen-Funktionen">
    <p class="m-mag-eyebrow">№ 04 · Branchen-Annotationen</p>
    <h2 class="m-mag-tools-title">Werkzeuge die verkaufen.</h2>
    <ol class="m-mag-tools-list">
        <li>
            <span class="m-mag-tool-num">01</span>
            <span class="m-mag-tool-name">Wertermittlung</span>
            <span class="m-mag-tool-case">Verkäufer kommt mit Adresse, Karriaro liefert Marktwert in 30 Sekunden — kein ImmoScout-Umweg.</span>
        </li>
        <li>
            <span class="m-mag-tool-num">02</span>
            <span class="m-mag-tool-name">BAFA-Förderrechner</span>
            <span class="m-mag-tool-case">Bauherr gibt Dachfläche ein, Karriaro nennt Förderhöhe sofort — vor-qualifiziert die Anfrage.</span>
        </li>
        <li>
            <span class="m-mag-tool-num">03</span>
            <span class="m-mag-tool-name">Symptom-Checker</span>
            <span class="m-mag-tool-case">Patient beschreibt Beschwerden, Karriaro routet zur passenden Sprechstunde — entlastet die Telefon-Hotline.</span>
        </li>
        <li>
            <span class="m-mag-tool-num">04</span>
            <span class="m-mag-tool-name">Frachtquote</span>
            <span class="m-mag-tool-case">PLZ + Gewicht ergibt Preis in 3 Sekunden — Schwaben-Logistik vergibt 40 % mehr Aufträge ohne Rückruf.</span>
        </li>
        <li>
            <span class="m-mag-tool-num">05</span>
            <span class="m-mag-tool-name">Foto-zu-Festpreis</span>
            <span class="m-mag-tool-case">Hausbesitzer schickt Bad-Foto, Karriaro nennt Festpreis — Müller Sanitär spart 6 Erstgespräche pro Tag.</span>
        </li>
    </ol>
</section>
`;

const SIEGEL_SECTION_HTML = `
<!-- Sprint 129 — Manufaktur-Siegel (№ 05) als Brand-Signature vor Kontakt -->
<section class="m-mag-siegel" aria-label="Manufaktursiegel">
    <div class="m-siegel-emblem">
        ${PHYLLOTAXIS_SVG}
        <span class="m-siegel-year">№ 05 · 2026</span>
    </div>
    <p class="m-siegel-eyebrow">Unser Manufaktursiegel</p>
    <h2 class="m-siegel-title">Wenn Ihr Name draufsteht,<br>steht unserer dahinter.</h2>
    <p class="m-siegel-body">Goldschmiede schlagen seit dem 14. Jahrhundert ihr Siegel in jedes Stück — der juristische Beweis: dieser Meister steht für dieses Stück. Wir schlagen unseres in jeden Code.</p>
    <a class="m-siegel-link" href="/gruender.html#siegel">Die ganze Geschichte →</a>
</section>
`;

function injectToolsSection(html) {
    if (html.includes('m-mag-tools-title')) return html;
    const auditAnchor = /<section id="audit"/;
    if (auditAnchor.test(html)) {
        return html.replace(auditAnchor, TOOLS_SECTION_HTML + '\n    <section id="audit"');
    }
    console.warn('  ⚠ kein Anker für Tools-Section gefunden');
    return html;
}

function injectSiegelSection(html) {
    if (html.includes('m-mag-siegel')) return html;
    const auditAnchor = /<section id="audit"/;
    if (auditAnchor.test(html)) {
        return html.replace(auditAnchor, SIEGEL_SECTION_HTML + '\n    <section id="audit"');
    }
    console.warn('  ⚠ kein Anker für Siegel-Section gefunden');
    return html;
}

// Sprint 129 — Kontakt-Section bekommt Eyebrow "№ 06 · Kontakt" als Magazine-
// Pacing-Schluss. Mobile-only via .m-mag-eyebrow--kontakt (Desktop hidden).
function injectKontaktNumbering(html) {
    if (html.includes('m-mag-eyebrow--kontakt')) return html;
    return html.replace(
        /(<section id="kontakt"[^>]*>\s*<div class="wrap"[^>]*>)/,
        '$1\n            <p class="m-mag-eyebrow m-mag-eyebrow--kontakt">№ 06 · Kontakt</p>'
    );
}

// ────────────────────────────────────────────────────────────────
// Sprint 103 — Persona-Section (NEU)
// 2×4 Tile-Grid zwischen Tools und Demo-Swiper. Tap = scroll to Demo + open Sheet.
// ────────────────────────────────────────────────────────────────

const PERSONA_ICON_HOUSE = '<svg class="m-persona-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M9 20v-6h6v6"/></svg>';
const PERSONA_ICON_STETHO = '<svg class="m-persona-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3v6a4 4 0 0 0 8 0V3"/><path d="M10 13v3a4 4 0 0 0 8 0v-2"/><circle cx="18" cy="11" r="2"/></svg>';
const PERSONA_ICON_SCISSORS = '<svg class="m-persona-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4L8.12 15.88M14.47 14.48L20 20M8.12 8.12L12 12"/></svg>';
const PERSONA_ICON_HARDHAT = '<svg class="m-persona-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 18h18"/><path d="M5 18v-3a7 7 0 0 1 14 0v3"/><path d="M10 11V5h4v6"/></svg>';
const PERSONA_ICON_CHAT = '<svg class="m-persona-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
const PERSONA_ICON_FORK = '<svg class="m-persona-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3v18M6 11h2M6 7h2M18 3v18M14 3v6a4 4 0 0 0 4 4"/></svg>';
const PERSONA_ICON_TRUCK = '<svg class="m-persona-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="1" y="6" width="14" height="10" rx="1"/><path d="M15 9h4l3 3v4h-7z"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="18" r="2"/></svg>';
const PERSONA_ICON_PLUS = '<svg class="m-persona-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></svg>';
const PERSONA_ICON_WRENCH = '<svg class="m-persona-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>';

// Reihenfolge im Grid (2×4) — Top-Conversion-Personas zuerst.
// data-demo-target = Index in DEMO_SWIPER_SLIDES (für Tap → Scroll + Sheet-Open).
const PERSONAS = [
    { slug: 'immobilien', icon: PERSONA_ICON_HOUSE,    name: 'Immobilien',   headline: 'Eigener Marktauftritt',   body: 'Wertermittlung & Marktdaten direkt — nicht bei ImmoScout.',     demoTarget: 0 },
    { slug: 'praxis',     icon: PERSONA_ICON_STETHO,   name: 'Praxis',       headline: 'Termine ohne Hotline',    body: 'Online-Buchung, Symptom-Check, 24/7-Sprechzeiten.',             demoTarget: 2 },
    { slug: 'friseur',    icon: PERSONA_ICON_SCISSORS, name: 'Friseur',      headline: 'Termine die füllen',      body: 'Online-Buchung, Style-Galerie, weniger No-Shows.',              demoTarget: 3 },
    { slug: 'dachdecker', icon: PERSONA_ICON_HARDHAT,  name: 'Dachdecker',   headline: 'Förderung & Angebot',     body: 'BAFA-Rechner zeigt sofort die Förderhöhe.',                     demoTarget: 4 },
    { slug: 'coaching',   icon: PERSONA_ICON_CHAT,     name: 'Coaching',     headline: 'Erstgespräch direkt',     body: 'Vita, Methodik, Buchungs-Button der konvertiert.',              demoTarget: 1 },
    { slug: 'gastro',     icon: PERSONA_ICON_FORK,     name: 'Gastronomie',  headline: 'Wie OpenTable',           body: 'Tisch-Buchung, KI-Wein-Empfehlung, Saison-Menü.',               demoTarget: 5 },
    { slug: 'logistik',   icon: PERSONA_ICON_TRUCK,    name: 'Logistik',     headline: 'Frachtquote sofort',      body: 'PLZ + Gewicht → Preis in 3 Sekunden.',                          demoTarget: 6 },
    { slug: 'sanitaer',   icon: PERSONA_ICON_WRENCH,   name: 'Sanitär',      headline: 'Notdienst & Festpreis',   body: '3D-Bad-Konfigurator, Foto-Schaden → Festpreis-Antwort.',        demoTarget: 7 },
];

function buildPersonaSectionHtml() {
    const tiles = PERSONAS.map((p) => `
        <button type="button" class="m-persona-tile" data-m-persona-target="${p.demoTarget}" aria-label="${p.name}: ${p.headline} — Demo öffnen">
            ${p.icon}
            <span class="m-persona-name">${p.name}</span>
            <span class="m-persona-headline">${p.headline}</span>
            <span class="m-persona-body">${p.body}</span>
        </button>`).join('');

    const wideTile = `
        <a class="m-persona-tile m-persona-tile--wide" href="https://wa.me/491742796784?text=Hallo%20Karriaro%2C%20meine%20Branche%20steht%20nicht%20in%20der%20Liste%20%E2%80%94%20k%C3%B6nnen%20wir%20kurz%20sprechen%3F" target="_blank" rel="noopener" aria-label="Andere Branche — WhatsApp öffnen">
            ${PERSONA_ICON_PLUS}
            <span class="m-persona-name">Ihre Branche fehlt?</span>
            <span class="m-persona-headline">Wir bauen für alle Mittelständler.</span>
            <span class="m-persona-body">Sprechen Sie uns an — Antwort per WhatsApp.</span>
        </a>`;

    return `
<!-- Sprint 103 — Persona-Tile-Grid (zwischen Tools und Demo-Swiper) -->
<section class="m-mag-personas" id="branchen" aria-label="Branchenpassung">
    <p class="m-mag-eyebrow">№ 03 · Branchenpassung</p>
    <h2 class="m-mag-personas-title">Für welche Branche bauen wir?</h2>
    <div class="m-mag-personas-grid">${tiles}
        ${wideTile}
    </div>
</section>
`;
// Sprint 128 — Persona-Tile-Click-Handler extrahiert nach src/js/m-interactions.js (mPersonaTiles)
}

function injectPersonaSection(html) {
    if (html.includes('m-mag-personas-grid')) return html;
    // Sprint 129 — Anker auf audit umgestellt; in Reverse-Inject-Order landet
    // Persona zwischen Demos und Tools.
    const auditAnchor = /<section id="audit"/;
    if (auditAnchor.test(html)) {
        return html.replace(auditAnchor, buildPersonaSectionHtml() + '\n    <section id="audit"');
    }
    console.warn('  ⚠ kein Anker für Persona-Section gefunden');
    return html;
}

// Sprint 128 — Scroll-Animations-Script extrahiert nach src/js/m-interactions.js (mScrollAnimations)
const SCROLL_ANIMATIONS_SCRIPT = '';

function injectScrollAnimations(html) {
    if (html.includes('m-in-view') && html.includes('m-hero-counter')) {
        // Bereits drin (idempotent)
    }
    if (html.includes('Sprint 95: Editorial-Scroll-Animations')) return html;
    const closeTag = '</' + 'body>';
    const closeBodyIdx = html.lastIndexOf(closeTag);
    if (closeBodyIdx === -1) return html;
    return html.slice(0, closeBodyIdx) + SCROLL_ANIMATIONS_SCRIPT + html.slice(closeBodyIdx);
}

// Sprint 103 — Demo-Slides mit Persona-Bezug (personaContext-Headline unter Mockup).
// Reihenfolge wie Desktop-Branche-Switcher (src/index.html:3113-3120):
// Immobilien → Coaching → Praxis → Friseur → Dachdecker → Gastronomie → Logistik
// Pro Branche: slug, eyebrow, title, domain (URL-Bar), href (Demo), personaContext (1-Zeile-Pain-Point).
// Sprint 128 — Editorial-Poster-Felder (headline/italicSub/brandColor/signet/signetClass)
// gelöscht, da Sprint 126/127 Live-Hero-Capture statt Editorial-Poster rendert.
const DEMO_SWIPER_SLIDES = [
    { slug: 'immobilien-stadtmakler', eyebrow: 'Immobilien · Premium',     title: 'Stadtmakler Stuttgart', domain: 'stadtmakler-stuttgart.de',     href: '/portfolio/immobilien-makler.html',         personaContext: 'Wertermittlung & Marktdaten direkt im Eigenauftritt — nicht bei ImmoScout.' },
    { slug: 'coaching-lehmann',       eyebrow: 'Coaching · Essential',     title: 'Lehmann Beratung',      domain: 'lehmann-beratung.de',          href: '/portfolio/coaching-lehmann.html',          personaContext: 'Vita, Methodik, Buchungs-Button der konvertiert.' },
    { slug: 'praxis-weber',           eyebrow: 'Praxis · Professional',    title: 'Dr. Weber',             domain: 'praxis-weber.de',              href: '/portfolio/praxis-weber.html',              personaContext: 'Online-Buchung, Symptom-Check, 24/7-Sprechzeiten.' },
    { slug: 'friseur-mueller',        eyebrow: 'Beauty · Essential',       title: 'Salon Müller',          domain: 'salon-mueller.de',             href: '/portfolio/friseur-salon.html',             personaContext: 'Online-Buchung, Style-Galerie, weniger No-Shows.' },
    { slug: 'dachdecker-meister',     eyebrow: 'Handwerk · Professional',  title: 'Dachdecker-Meister',    domain: 'dachdecker-meisterbetrieb.de', href: '/portfolio/dachdecker-meisterbetrieb.html', personaContext: 'BAFA-Förderrechner zeigt sofort die Förderhöhe — vor-qualifizierte Anfragen.' },
    { slug: 'gastro-hirsch',          eyebrow: 'Gastronomie · Professional', title: 'Hirsch',              domain: 'gasthof-hirsch.de',            href: '/portfolio/restaurant-template.html',       personaContext: 'Tisch-Buchung, KI-Wein-Empfehlung, Saison-Menü.' },
    { slug: 'logistik-schwaben',      eyebrow: 'Spedition · Premium',      title: 'Schwaben Logistik',     domain: 'schwaben-logistik.de',         href: '/portfolio/spedition-schwaben.html',        personaContext: 'PLZ + Gewicht → Frachtquote in 3 Sekunden. Keine Rückrufe nötig.' },
    { slug: 'handwerk-mueller',       eyebrow: 'Sanitär · Professional',   title: 'Müller Meisterbetrieb', domain: 'sanitaer-mueller.de',          href: '/portfolio/meisterbetrieb-mueller.html',    personaContext: '3D-Bad-Konfigurator, Notdienst-Live-Status, Foto-Schaden → Festpreis.' },
];

// Sprint 126 — Image-Dims pro Mockup für intrinsic <img width="W" height="H">.
// Jedes Portfolio hat natürliche Hero-Höhe (Coaching > Stadtmakler etc.) —
// Browser kennt aspect vor Image-Load → kein Layout-Shift, korrekte Card-Höhe.
const MOCKUP_DIMS_CACHE = new Map();
function readMockupDims(slug) {
    if (MOCKUP_DIMS_CACHE.has(slug)) return MOCKUP_DIMS_CACHE.get(slug);
    const path = join(SRC, 'images', 'mockups-opt', `${slug}-mockup-800.jpg`);
    if (!existsSync(path)) {
        const fallback = { w: 800, h: 1800 };
        MOCKUP_DIMS_CACHE.set(slug, fallback);
        return fallback;
    }
    try {
        const out = execSync(`sips -g pixelWidth -g pixelHeight "${path}"`, { encoding: 'utf8' });
        const dims = {
            w: parseInt(out.match(/pixelWidth: (\d+)/)?.[1] || '800', 10),
            h: parseInt(out.match(/pixelHeight: (\d+)/)?.[1] || '1800', 10),
        };
        MOCKUP_DIMS_CACHE.set(slug, dims);
        return dims;
    } catch {
        const fallback = { w: 800, h: 1800 };
        MOCKUP_DIMS_CACHE.set(slug, fallback);
        return fallback;
    }
}

// Sprint 131 — Brand-Color pro Portfolio-Vitrine (Hermès-Tier-Pattern,
// Evans-Hankey-Hebel: Photo = Subject, Brand-Color = Bühne).
// Aus den Portfolio-Hero-CSS-Variablen --accent extrahiert + Karriaro-Voice
// abgestimmt (jeder Ton dunkel genug für hellen Photo-Float, ausreichend
// Kontrast zu Inter-Sans-Bold/Fraunces-Serif unten).
const BRAND_COLOR_MAP = {
    'immobilien-stadtmakler': '#1A2E40', // Manufaktur-Indigo
    'coaching-lehmann':       '#2C2C2C', // Charcoal
    'praxis-weber':           '#6A8266', // Sage
    'friseur-mueller':        '#B07B5E', // Taupe-Copper
    'dachdecker-meister':     '#4A5D4F', // Forest
    'gastro-hirsch':          '#5C1F1F', // Burgundy
    'logistik-schwaben':      '#0E1F33', // Deep-Blue
    'handwerk-mueller':       '#B47045', // Copper
};

function buildDemoSwiperHtml() {
    // Sprint 126: Natürliche Hero-Höhe via Playwright-Capture.
    // Sprint 127: aspect-ratio 1/2 fixed (fit-one-screen), object-fit:contain.
    // Sprint 131: Brand-Color pro Card-Background statt Cream-Soft uniform.
    //   Photo schwebt mit floating-shadow auf brand-color-vitrine.
    const slides = DEMO_SWIPER_SLIDES.map((slide, i) => {
        const { slug, title, domain, href, eyebrow, personaContext } = slide;
        const eager = i === 0;
        const dims = readMockupDims(slug);
        const brandColor = BRAND_COLOR_MAP[slug] || 'var(--color-cream-soft, #f5f3ee)';
        const eagerFrame = i <= 1; // Sprint 140 — Stadtmakler + Lehmann eager-load iframe
        // Sprint 148 — Premium-Vitrine (Sprint 145 polieren, nicht entkernen).
        // Card schwebt auf Brand-Color-Bühne (Sprint-131-Pattern reaktiviert).
        // Editorial-Caption (Eyebrow/Title/Sub/CTA) wandert UNTER die Card,
        // kein Dunkel-Overlay mehr. Folio-Badge raus (siehe Plan Hebel 3).
        // Sprint 148.6 — Desktop-Hero-Preview in macOS-Safari-Mockup.
        // Card als MacBook-Browser-Fenster (16:10 horizontal), iframe rendert
        // in 1280×800 Desktop-Viewport → Portfolio-Page zeigt zweispaltiges
        // Desktop-Hero-Layout (Text-Block links + Mockup/Avatar rechts).
        // CSS transform-scale verkleinert visuell auf Card-Stage-Breite.
        // macOS-Chrome-Header oben mit drei Window-Buttons + URL-Bar (Domain).
        // Portfolio-Pages haben neuen ?embed=desktop-Mode (nur Nav/Footer
        // hide, Hero-Layout unverändert).
        return `
        <article class="m-demo-swiper-slide" data-m-demo-slide="${i}">
            <button type="button" class="m-demo-swiper-card m-poster" data-m-demo-open data-m-demo-href="${href}" data-m-demo-title="${title}" data-m-demo-domain="${domain}" aria-label="${title} Live-Demo öffnen">
                <div class="m-poster-chrome" aria-hidden="true">
                    <span class="m-poster-chrome-buttons">
                        <span class="m-poster-chrome-btn m-poster-chrome-btn--close"></span>
                        <span class="m-poster-chrome-btn m-poster-chrome-btn--min"></span>
                        <span class="m-poster-chrome-btn m-poster-chrome-btn--max"></span>
                    </span>
                    <span class="m-poster-chrome-url">${domain}</span>
                </div>
                <div class="m-poster-stage" data-m-poster-stage>
                    <iframe class="m-poster-frame" data-m-poster-src="${href}?embed=desktop" title="${title} Desktop-Hero-Vorschau" width="1280" height="1024" loading="lazy" sandbox="allow-same-origin allow-scripts" tabindex="-1" aria-hidden="true"${eagerFrame ? ' data-m-poster-eager' : ''}></iframe>
                </div>
            </button>
            <div class="m-demo-swiper-meta">
                <span class="m-demo-swiper-eyebrow">${eyebrow}</span>
                <h3 class="m-demo-swiper-title">${title}</h3>
                <p class="m-demo-swiper-persona-context">${personaContext}</p>
                <span class="m-demo-swiper-cta" aria-hidden="true">Live ansehen →</span>
            </div>
        </article>`;
    }).join('');

    return `
<!-- Mobile Demo-Swiper (Sprint 129 — Editorial-Page № 02, show-don't-tell) -->
<section class="m-demo-swiper-mobile" id="demos" aria-label="Branchen-Demos">
    <p class="m-demo-swiper-section-eyebrow">№ 02 · Acht Branchen · Live</p>
    <h2 class="m-demo-swiper-section-title">Eine Manufaktur,<br>acht echte Demos.</h2>
    <p class="m-demo-swiper-section-hint" aria-hidden="true">↓ scrollen ·  tippen zum Öffnen</p>
    <div class="m-demo-swiper-rail" data-m-demo-rail>${slides}
    </div>
    <div class="m-demo-swiper-dots" data-m-demo-dots aria-hidden="true"></div>
</section>

<!-- Live-Demo Sheet-Modal -->
<div class="m-demo-sheet" data-m-demo-sheet aria-hidden="true" role="dialog" aria-modal="true" aria-labelledby="m-demo-sheet-title">
    <div class="m-demo-sheet-backdrop" data-m-demo-sheet-close></div>
    <div class="m-demo-sheet-panel">
        <div class="m-demo-sheet-handle" aria-hidden="true"></div>
        <header class="m-demo-sheet-head">
            <div class="m-demo-sheet-head-text">
                <p class="m-demo-sheet-eyebrow" data-m-demo-sheet-eyebrow>Live-Demo</p>
                <h3 class="m-demo-sheet-title" id="m-demo-sheet-title" data-m-demo-sheet-title>Demo</h3>
            </div>
            <button type="button" class="m-demo-sheet-close" data-m-demo-sheet-close aria-label="Schließen">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
        </header>
        <div class="m-demo-sheet-body">
            <div class="m-demo-sheet-loader" data-m-demo-sheet-loader>
                <div class="m-demo-sheet-spinner" aria-hidden="true"></div>
                <p>Demo wird geladen…</p>
            </div>
            <iframe class="m-demo-sheet-frame" data-m-demo-sheet-frame title="Live-Demo" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>
        </div>
        <footer class="m-demo-sheet-foot">
            <a class="m-demo-sheet-open-tab" data-m-demo-sheet-tab href="#" target="_blank" rel="noopener">In neuem Tab öffnen ↗</a>
        </footer>
    </div>
</div>
`;
// Sprint 128 — Demo-Swiper Dots + Sheet-Modal-Logik extrahiert nach src/js/m-interactions.js (mDemoSwiper)
}

function injectDemoSwiper(html) {
    if (html.includes('m-demo-swiper-mobile')) return html;
    // Sprint 96 — Anker ist <section id="audit" (zwischen Hero und Audit-Sektion).
    // Vorher: <div id="arbeiten"> — das lag INNERHALB hero-with-photo und brach das Layout.
    // Jetzt: nach Hero-Schluss, vor Audit-Schluss. Saubere standalone-Section.
    const anchor = /<section id="audit"/;
    if (!anchor.test(html)) {
        console.warn('  ⚠ <section id="audit" nicht gefunden — Demo-Swiper nicht injiziert');
        return html;
    }
    return html.replace(anchor, buildDemoSwiperHtml() + '\n    <section id="audit"');
}

// ────────────────────────────────────────────────────────────────
// Page-Discovery
// ────────────────────────────────────────────────────────────────

function collectPages() {
    const pages = [];

    for (const entry of readdirSync(SRC)) {
        if (!entry.endsWith('.html')) continue;
        if (SKIP.has(entry)) continue;
        pages.push(entry);
    }

    const portfolioDir = join(SRC, 'portfolio');
    if (existsSync(portfolioDir)) {
        for (const entry of readdirSync(portfolioDir)) {
            if (!entry.endsWith('.html')) continue;
            pages.push(`portfolio/${entry}`);
        }
    }

    const blogDir = join(SRC, 'blog');
    if (existsSync(blogDir)) {
        for (const entry of readdirSync(blogDir)) {
            if (!entry.endsWith('.html')) continue;
            pages.push(`blog/${entry}`);
        }
    }

    return pages.sort();
}

// ────────────────────────────────────────────────────────────────
// Main
// ────────────────────────────────────────────────────────────────

function buildPage(relPath) {
    const srcFile = join(SRC, relPath);
    const outFile = join(OUT, relPath);

    let html = readFileSync(srcFile, 'utf8');

    html = stripAutoRedirect(html);
    html = injectMobileCss(html);
    // Sprint 143 — Critical-CSS inline (Senior-Review C-9, LCP-Optimierung).
    html = injectCriticalCss(html);
    // Sprint 134 — PWA-Foundation (Manifest + Apple-Meta + SW-Registration)
    // auf JEDER Mobile-Page, nicht nur Index. Macht Sub-Pages installable.
    html = injectPwaHead(html);
    // Sprint 135 — Mobile-OG-Image (Editorial-Spread) statt Desktop-generic.
    html = rewriteOgImage(html);
    if (isSelling(relPath)) {
        html = injectStickyCta(html);
    }
    if (isIndex(relPath)) {
        // Sprint 92/95/96 — Hero-Headline + Eyebrow-Stagger
        html = rewriteHeroHeadline(html);
        html = injectHeroEyebrowStagger(html);
        // Sprint 104 — Eyebrow auf 1 Zeile (Frühjahr 2026 → 2026, Webdesign-Manufaktur → Manufaktur)
        html = compactHeroEyebrow(html);
        // Sprint 148.10 — Demo-Tease zwischen H1 und Trust-Liste (Brücke zu Section 02)
        html = rewriteHeroDemoTease(html);
        // Sprint 98 — Hero ist Apple-Pure (Headline + Sub + CTA), keine Sub-Inserts mehr
        html = rewriteHeroSubhead(html);  // no-op
        html = rewriteHeroCta(html);
        // Sprint 129 — Folio-Marker zu "№ 01 · 2026 · EDITORIAL" (Cover-Position)
        html = rewriteFolioMarker(html);
        // Sprint 129 — Information-Architecture: Hero → Demos → Personas → Tools → Siegel → Audit → Kontakt
        // Alle 4 Inject-Funktionen nutzen audit-anchor und prependen DIREKT
        // vor dem aktuellen Anker-Position. Reihenfolge = Render-Reihenfolge.
        html = injectDemoSwiper(html);
        html = injectPersonaSection(html);
        html = injectToolsSection(html);
        html = injectSiegelSection(html);
        // Sprint 129 — Kontakt-Numbering (№ 06)
        html = injectKontaktNumbering(html);
        // Sprint 133 — Pin-Spy (Magazine-Page-Counter)
        html = injectPinSpy(html);
    }
    // Sprint 95 — Scroll-Animations für ALLE Pages (Counter + Pull-Quotes)
    // Sprint 128 — Logik nach src/js/m-interactions.js extrahiert. Funktion behalten
    // als kompatibler No-Op, falls fruehere Pages den Marker erwarten.
    html = injectScrollAnimations(html);
    // Sprint 128 — Mobile-Interaktions-JS-Bundle am </body>-Ende laden.
    html = injectMInteractionsScript(html);
    html = addGeneratorMarker(html, relPath);

    mkdirSync(dirname(outFile), { recursive: true });
    writeFileSync(outFile, html, 'utf8');

    return {
        relPath,
        sellingCta: isSelling(relPath),
        bytes: html.length,
    };
}

// Sprint 134 — hand-written HTML files in src/m/ die NICHT vom Build
// generiert werden und beim Cleanup erhalten bleiben müssen.
// Sprint 135 — case-study.html (Award-Submission-Page) hinzugefügt.
const PRESERVED_HTML = new Set(['offline.html', 'case-study.html']);

function cleanOldMobileOutput() {
    // Loescht src/m/**/*.html. Laesst manifest.json, sw.js, icons/* + hand-
    // geschriebene HTML (PRESERVED_HTML) unberuehrt.
    function walk(dir) {
        if (!existsSync(dir)) return;
        for (const entry of readdirSync(dir)) {
            const p = join(dir, entry);
            const s = statSync(p);
            if (s.isDirectory()) {
                walk(p);
            } else if (entry.endsWith('.html') && !PRESERVED_HTML.has(entry)) {
                unlinkSync(p);
            }
        }
    }
    walk(OUT);
}

function main() {
    console.log('Sprint 91 Mobile-Build-Generator');
    console.log('  Source: src/*.html, src/portfolio/*.html, src/blog/*.html');
    console.log('  Output: src/m/...');
    console.log('');

    cleanOldMobileOutput();
    console.log('  → Alte src/m/**/*.html entfernt (PWA-Files + Icons bleiben)\n');

    const pages = collectPages();
    console.log(`  → ${pages.length} Pages zu spiegeln:\n`);

    const results = [];
    for (const p of pages) {
        try {
            const r = buildPage(p);
            results.push(r);
            const cta = r.sellingCta ? '🛒' : '  ';
            console.log(`  ${cta} ${p.padEnd(50)} ${(r.bytes / 1024).toFixed(1)} KB`);
        } catch (err) {
            console.error(`  ✗ ${p} — ${err.message}`);
        }
    }

    console.log('');
    console.log(`  ✓ ${results.length} Mobile-Pages generiert`);
    // Sprint 143 — Sticky-CTA-Bar entfernt (Senior-Review C-1). Counter zeigt
    // jetzt selling-Pages, die *zuvor* die Bar gehabt haetten (= reine
    // Audit-Spur), nicht tatsaechliche Insertion.
    console.log(`  ✓ ${results.filter(r => r.sellingCta).length} selling-Pages (Sticky-CTA-Bar deaktiviert seit Sprint 143)`);
}

main();
