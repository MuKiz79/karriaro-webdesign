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

const MOBILE_OVERRIDES_LINK = `    <link rel="stylesheet" href="/css/mobile-overrides.css?v=108">`;

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
<script>
(function () {
    var bar = document.querySelector('[data-m-sticky-cta]');
    var hero = document.querySelector('.hero-with-photo') || document.querySelector('.hero, [class*="hero"]');
    if (!bar) return;
    if (!hero || !('IntersectionObserver' in window)) {
        bar.classList.add('is-visible');
        return;
    }
    var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
            bar.classList.toggle('is-visible', !e.isIntersecting);
        });
    }, { threshold: 0.05 });
    io.observe(hero);
})();
</script>
`;

// ────────────────────────────────────────────────────────────────
// Transformationen
// ────────────────────────────────────────────────────────────────

function stripAutoRedirect(html) {
    // Greift jeden inline-<script>-Block, der "m.karriaro-webdesign.de" enthält.
    // Achtung: Script-Body kann "<" enthalten (z.B. "<=900"), daher [\s\S]*?
    // statt [^<]* — wir verlassen uns auf non-greedy + den eindeutigen Marker.
    const pattern = /<script>[\s\S]*?m\.karriaro-webdesign\.de[\s\S]*?<\/script>\s*/g;
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

function injectStickyCta(html) {
    if (html.includes('data-m-sticky-cta')) return html;
    const closeTag = '</' + 'body>';
    const closeBodyIdx = html.lastIndexOf(closeTag);
    if (closeBodyIdx === -1) {
        console.warn('  ⚠ kein body-close — Sticky-CTA nicht injiziert');
        return html;
    }
    return html.slice(0, closeBodyIdx) + STICKY_CTA_BAR + html.slice(closeBodyIdx);
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
    // Sprint 106 — Webdesign-Manufaktur + Unikat-Statement (User-Wahl Senior-Marketing)
    return html.replace(
        /<h1 class="hero-headline">[\s\S]*?<\/h1>/,
        '<h1 class="hero-headline">' +
        '<span class="hero-h1-line m-hero-stagger" style="--m-delay:120ms">Webdesign-Manufaktur.</span>' +
        '<span class="hero-h1-line m-hero-accent m-hero-stagger" style="--m-delay:240ms">Jede Seite handcodiert ein Unikat.</span>' +
        '</h1>'
    );
}

function rewriteHeroSubhead(html) {
    // Sprint 107 — Hero-Subhead mit KI-Aera-Statement, explizite <br> fuer
    // kontrollierten 3-Zeilen-Wrap auf iPhone-Width.
    return html.replace(
        /<p class="subhead"[^>]*>[\s\S]*?<\/p>/,
        '<p class="subhead m-hero-stagger" style="--m-delay:380ms">' +
        'Optimiert für die KI-Ära.<br>' +
        'SEO + GEO + Schema.org.<br>' +
        'Damit Sie auch zukünftig gefunden werden.' +
        '</p>'
    );
}

function rewriteHeroCta(html) {
    // Sprint 107 — Hero gestrafft: 3 Power-USPs prominent, Single-CTA klein am Hero-Ende.
    // Performance-Check raus. Auto-Margin pusht Button an Hero-Boden (kein Siegel mehr).
    return html.replace(
        /<a href="#kontakt" class="btn" data-kr-magnetic>Erstgespräch buchen — Antwort in 24 h<\/a>/,
        '<ul class="m-hero-trust-list m-hero-stagger" style="--m-delay:640ms">' +
            '<li>' +
                '<span class="m-hero-trust-num">100+</span>' +
                '<span class="m-hero-trust-body">' +
                    '<strong>Einzigartige Branchen-Funktionen</strong>' +
                    '<small>Wertermittlung · BAFA-Rechner · Symptom-Checker · Style-Galerie · …</small>' +
                '</span>' +
            '</li>' +
            '<li>' +
                '<span class="m-hero-trust-num">[K]</span>' +
                '<span class="m-hero-trust-body">' +
                    '<strong>Lead-Cockpit Lighthouse</strong>' +
                    '<small>Sie sehen wer Ihre Seite besucht. KI leitet daraus Ihre Strategie ab.</small>' +
                '</span>' +
            '</li>' +
            '<li>' +
                '<span class="m-hero-trust-num">⤳</span>' +
                '<span class="m-hero-trust-body">' +
                    '<strong>Automation-Workflows mit KI</strong>' +
                    '<small>Emails, Follow-ups, Anfragen-Routing — laufen von selbst.</small>' +
                '</span>' +
            '</li>' +
        '</ul>' +
        '<div class="m-hero-cta-bottom m-hero-stagger" style="--m-delay:880ms">' +
            '<a href="#kontakt" class="btn m-hero-primary" data-kr-magnetic>Erstgespräch buchen</a>' +
        '</div>'
    );
}

function injectHeroEyebrowStagger(html) {
    // Sprint 95 — Eyebrow startet als Erstes (Delay 0ms)
    return html.replace(
        /<p class="hero-folio-eyebrow">/,
        '<p class="hero-folio-eyebrow m-hero-stagger" style="--m-delay:0ms">'
    );
}

function compactHeroEyebrow(html) {
    // Sprint 104 — Eyebrow auf 1 Zeile fuer iPhone 14 (390px): "Frühjahr 2026" → "2026",
    // "Webdesign-Manufaktur" → "Manufaktur". Resultat: "Nº 01 · MANUFAKTUR · 2026"
    // Sprint 106 — Targetiert nur Spans innerhalb hero-folio-eyebrow (nicht site-weit),
    // damit "Webdesign-Manufaktur." in H1 nicht versehentlich gekürzt wird.
    return html.replace(
        /<p class="hero-folio-eyebrow[^"]*"[^>]*>[\s\S]*?<\/p>/,
        (match) => match
            .replace(/Frühjahr\s+2026/gi, '2026')
            .replace(/>Webdesign-Manufaktur</gi, '>Manufaktur<')
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
<script>
(function () {
    var domainEl = document.querySelector('[data-m-hero-demo-domain]');
    var webpEl   = document.querySelector('[data-m-hero-demo-webp]');
    var imgEl    = document.querySelector('[data-m-hero-demo-img]');
    var canvas   = document.querySelector('[data-m-hero-demo-canvas]');
    var card     = document.querySelector('[data-m-hero-demo-click]');
    if (!card || !canvas) return;

    var rotation = [
        { slug: 'immobilien-stadtmakler', domain: 'stadtmakler-stuttgart.de' },
        { slug: 'praxis-weber',           domain: 'praxis-weber.de' },
        { slug: 'friseur-mueller',        domain: 'salon-mueller.de' }
    ];
    var idx = 0;

    var rmq = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');
    var reducedMotion = rmq && rmq.matches;

    if (!reducedMotion) {
        setInterval(function () {
            idx = (idx + 1) % rotation.length;
            var next = rotation[idx];
            canvas.style.opacity = '0';
            setTimeout(function () {
                if (domainEl) domainEl.textContent = next.domain;
                if (webpEl)   webpEl.srcset = '/images/mockups-opt/' + next.slug + '-mockup-480.webp';
                if (imgEl)    imgEl.src    = '/images/mockups-opt/' + next.slug + '-mockup-800.jpg';
                canvas.style.opacity = '1';
            }, 280);
        }, 4000);
    }

    card.addEventListener('click', function () {
        var demos = document.querySelector('#demos');
        if (demos) demos.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
})();
</script>
`;

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

// Sprint 103 — Editorial-Sektionen weiter gestrafft:
// Tools-Section: subheader + footnote raus, 7 Items mit space-evenly statt flex-start.
// Siegel-Section unverändert.
const EDITORIAL_SECTIONS_HTML = `
<!-- Sprint 103 — Editorial-Magazin-Sektionen unter Hero -->
<section class="m-mag-tools" aria-label="Branchen-Funktionen">
    <p class="m-mag-eyebrow">№ 02 · Branchen-Funktionen</p>
    <h2 class="m-mag-tools-title">Werkzeuge die verkaufen.</h2>
    <ol class="m-mag-tools-list">
        <li><span class="m-mag-tool-num">01</span><span class="m-mag-tool-name">Wertermittlung</span></li>
        <li><span class="m-mag-tool-num">02</span><span class="m-mag-tool-name">BAFA-Förderrechner</span></li>
        <li><span class="m-mag-tool-num">03</span><span class="m-mag-tool-name">Symptom-Checker</span></li>
        <li><span class="m-mag-tool-num">04</span><span class="m-mag-tool-name">Style-Galerie</span></li>
        <li><span class="m-mag-tool-num">05</span><span class="m-mag-tool-name">Frachtquote</span></li>
        <li><span class="m-mag-tool-num">06</span><span class="m-mag-tool-name">Coaching-Check</span></li>
        <li><span class="m-mag-tool-num">07</span><span class="m-mag-tool-name">Reservierung</span></li>
    </ol>
</section>

<section class="m-mag-siegel" aria-label="Manufaktursiegel">
    <div class="m-siegel-emblem">
        <span class="m-siegel-mark">[K]</span>
        <span class="m-siegel-year">№ 01 · 2026</span>
    </div>
    <p class="m-siegel-eyebrow">Unser Manufaktursiegel</p>
    <h2 class="m-siegel-title">Wenn Ihr Name draufsteht,<br>steht unserer dahinter.</h2>
    <p class="m-siegel-body">Goldschmiede schlagen seit dem 14. Jahrhundert ihr Siegel in jedes Stück — der juristische Beweis: dieser Meister steht für dieses Stück. Wir schlagen unseres in jeden Code.</p>
    <a class="m-siegel-link" href="/gruender.html#siegel">Die ganze Geschichte →</a>
</section>
`;

function injectEditorialSections(html) {
    if (html.includes('m-mag-tools-title')) return html;
    // Anker: vor Demo-Swiper-Section (= zwischen Hero und Demo-Swiper).
    // Falls Demo-Swiper noch nicht injiziert, vor <section id="audit"> als Fallback.
    const swiperAnchor = /<section class="m-demo-swiper-mobile"/;
    if (swiperAnchor.test(html)) {
        return html.replace(swiperAnchor, EDITORIAL_SECTIONS_HTML + '\n<section class="m-demo-swiper-mobile"');
    }
    const auditAnchor = /<section id="audit"/;
    if (auditAnchor.test(html)) {
        return html.replace(auditAnchor, EDITORIAL_SECTIONS_HTML + '\n    <section id="audit"');
    }
    console.warn('  ⚠ kein Anker für Editorial-Sektionen gefunden');
    return html;
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

<script>
(function () {
    var tiles = document.querySelectorAll('[data-m-persona-target]');
    if (!tiles.length) return;
    tiles.forEach(function (t) {
        t.addEventListener('click', function () {
            var idx = parseInt(t.getAttribute('data-m-persona-target'), 10);
            if (isNaN(idx)) return;
            var slide = document.querySelector('[data-m-demo-slide="' + idx + '"]');
            if (!slide) return;
            // Scroll zum Demo-Slide (horizontal im Rail)
            slide.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'center' });
            // Sheet-Modal direkt öffnen via Card-Click-Trigger
            var card = slide.querySelector('[data-m-demo-open]');
            if (card) {
                setTimeout(function () { card.click(); }, 320);
            }
        });
    });
})();
</script>
`;
}

function injectPersonaSection(html) {
    if (html.includes('m-mag-personas-grid')) return html;
    // Anker: vor Demo-Swiper-Section (= zwischen Tools und Demo).
    const swiperAnchor = /<section class="m-demo-swiper-mobile"/;
    if (swiperAnchor.test(html)) {
        return html.replace(swiperAnchor, buildPersonaSectionHtml() + '\n<section class="m-demo-swiper-mobile"');
    }
    console.warn('  ⚠ kein Anker für Persona-Section gefunden');
    return html;
}

const SCROLL_ANIMATIONS_SCRIPT = `
<!-- Sprint 95: Editorial-Scroll-Animations (Counter-Up + Pull-Quote-Line-Draw) -->
<script>
(function () {
    if (!('IntersectionObserver' in window)) return;

    // Counter-Up beim Scroll-In
    var counters = document.querySelectorAll('.m-hero-counter');
    if (counters.length) {
        var ioCounter = new IntersectionObserver(function (entries) {
            entries.forEach(function (e) {
                if (!e.isIntersecting) return;
                var el = e.target;
                var target = parseInt(el.getAttribute('data-target'), 10) || 0;
                var dur = 1200, start = performance.now();
                function tick(now) {
                    var p = Math.min(1, (now - start) / dur);
                    var eased = 1 - Math.pow(1 - p, 3);
                    el.textContent = Math.round(target * eased).toLocaleString('de-DE');
                    if (p < 1) requestAnimationFrame(tick);
                }
                requestAnimationFrame(tick);
                ioCounter.unobserve(el);
            });
        }, { threshold: 0.5 });
        counters.forEach(function (c) { ioCounter.observe(c); });
    }

    // Pull-Quote-Linie draw-in on scroll
    var quotes = document.querySelectorAll('blockquote, .pull-quote');
    if (quotes.length) {
        var ioQuote = new IntersectionObserver(function (entries) {
            entries.forEach(function (e) {
                if (e.isIntersecting) {
                    e.target.classList.add('m-in-view');
                    ioQuote.unobserve(e.target);
                }
            });
        }, { threshold: 0.2 });
        quotes.forEach(function (q) { ioQuote.observe(q); });
    }

    // Sprint 100 — Magazin-Sektionen Stagger-Reveal
    var magSections = document.querySelectorAll('.m-mag-specs, .m-mag-tools, .m-mag-proof, .m-mag-siegel');
    if (magSections.length) {
        var ioMag = new IntersectionObserver(function (entries) {
            entries.forEach(function (e) {
                if (e.isIntersecting) {
                    e.target.classList.add('m-in-view');
                    ioMag.unobserve(e.target);
                }
            });
        }, { threshold: 0.15 });
        magSections.forEach(function (s) { ioMag.observe(s); });
    }
})();
</script>
`;

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
const DEMO_SWIPER_SLIDES = [
    { slug: 'immobilien-stadtmakler', eyebrow: 'Immobilien · Premium', title: 'Stadtmakler Stuttgart', domain: 'stadtmakler-stuttgart.de', href: '/portfolio/immobilien-makler.html', personaContext: 'Wertermittlung & Marktdaten direkt im Eigenauftritt — nicht bei ImmoScout.' },
    { slug: 'coaching-lehmann', eyebrow: 'Coaching · Essential', title: 'Lehmann Beratung', domain: 'lehmann-beratung.de', href: '/portfolio/coaching-lehmann.html', personaContext: 'Vita, Methodik, Buchungs-Button der konvertiert.' },
    { slug: 'praxis-weber', eyebrow: 'Praxis · Professional', title: 'Dr. Weber', domain: 'praxis-weber.de', href: '/portfolio/praxis-weber.html', personaContext: 'Online-Buchung, Symptom-Check, 24/7-Sprechzeiten.' },
    { slug: 'friseur-mueller', eyebrow: 'Beauty · Essential', title: 'Salon Müller', domain: 'salon-mueller.de', href: '/portfolio/friseur-salon.html', personaContext: 'Online-Buchung, Style-Galerie, weniger No-Shows.' },
    { slug: 'dachdecker-meister', eyebrow: 'Handwerk · Professional', title: 'Dachdecker-Meister', domain: 'dachdecker-meisterbetrieb.de', href: '/portfolio/dachdecker-meisterbetrieb.html', personaContext: 'BAFA-Förderrechner zeigt sofort die Förderhöhe — vor-qualifizierte Anfragen.' },
    { slug: 'gastro-hirsch', eyebrow: 'Gastronomie · Professional', title: 'Hirsch', domain: 'gasthof-hirsch.de', href: '/portfolio/restaurant-template.html', personaContext: 'Tisch-Buchung, KI-Wein-Empfehlung, Saison-Menü.' },
    { slug: 'logistik-schwaben', eyebrow: 'Spedition · Premium', title: 'Schwaben Logistik', domain: 'schwaben-logistik.de', href: '/portfolio/spedition-schwaben.html', personaContext: 'PLZ + Gewicht → Frachtquote in 3 Sekunden. Keine Rückrufe nötig.' },
];

function buildBrowserChromeHtml(domain) {
    // macOS-Safari-Style Chrome — 3 Dots links, URL-Bar zentriert mit Lock-Icon.
    return `
            <div class="m-bf-chrome">
                <div class="m-bf-dots">
                    <span class="m-bf-dot m-bf-dot--red"></span>
                    <span class="m-bf-dot m-bf-dot--yellow"></span>
                    <span class="m-bf-dot m-bf-dot--green"></span>
                </div>
                <div class="m-bf-url">
                    <svg class="m-bf-lock" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>
                    <span class="m-bf-domain">${domain}</span>
                </div>
            </div>`;
}

function buildDemoSwiperHtml() {
    const slides = DEMO_SWIPER_SLIDES.map((slide, i) => {
        const { slug, eyebrow, title, domain, href, personaContext } = slide;
        const eager = i === 0;
        return `
        <article class="m-demo-swiper-slide" data-m-demo-slide="${i}">
            <button type="button" class="m-demo-swiper-card" data-m-demo-open data-m-demo-href="${href}" data-m-demo-title="${title}" data-m-demo-domain="${domain}" aria-label="${title} Live-Demo öffnen">
                <div class="m-bf">${buildBrowserChromeHtml(domain)}
                    <div class="m-bf-canvas">
                        <picture>
                            <source type="image/webp" media="(max-width: 480px)" srcset="/images/mockups-opt/${slug}-mockup-480.webp">
                            <source type="image/webp" srcset="/images/mockups-opt/${slug}-mockup-800.webp">
                            <img class="m-bf-img" src="/images/mockups-opt/${slug}-mockup-800.jpg" alt="${title} — Karriaro-Demo" loading="${eager ? 'eager' : 'lazy'}" decoding="async" fetchpriority="${eager ? 'high' : 'low'}" width="800" height="500">
                        </picture>
                    </div>
                </div>
            </button>
            <div class="m-demo-swiper-meta">
                <span class="m-demo-swiper-eyebrow">${eyebrow}</span>
                <span class="m-demo-swiper-cta" aria-hidden="true">Live ansehen →</span>
            </div>
            <h3 class="m-demo-swiper-title">${title}</h3>
            <p class="m-demo-swiper-persona-context">${personaContext}</p>
        </article>`;
    }).join('');

    return `
<!-- Mobile Demo-Swiper (Sprint 103 — Picture+webp, Persona-Context, IO-Registry) -->
<section class="m-demo-swiper-mobile" id="demos" aria-label="Branchen-Demos">
    <p class="m-demo-swiper-section-eyebrow">№ 04 · Sieben Branchen · Live</p>
    <h2 class="m-demo-swiper-section-title">Eine Manufaktur,<br>sieben echte Demos.</h2>
    <p class="m-demo-swiper-section-hint" aria-hidden="true">← swipen ·  tippen für Live-Vorschau</p>
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

<script>
(function () {
    var rail = document.querySelector('[data-m-demo-rail]');
    var dotsBox = document.querySelector('[data-m-demo-dots]');
    var sheet = document.querySelector('[data-m-demo-sheet]');
    var sheetFrame = document.querySelector('[data-m-demo-sheet-frame]');
    var sheetLoader = document.querySelector('[data-m-demo-sheet-loader]');
    var sheetTitle = document.querySelector('[data-m-demo-sheet-title]');
    var sheetEyebrow = document.querySelector('[data-m-demo-sheet-eyebrow]');
    var sheetTab = document.querySelector('[data-m-demo-sheet-tab]');
    if (!rail || !dotsBox || !sheet) return;
    var slides = rail.querySelectorAll('.m-demo-swiper-slide');
    if (!slides.length) return;

    // Dot-Indicator aufbauen
    slides.forEach(function (_, i) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'm-demo-swiper-dot' + (i === 0 ? ' is-active' : '');
        b.setAttribute('aria-label', 'Demo ' + (i + 1) + ' von ' + slides.length);
        b.addEventListener('click', function () { slides[i].scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' }); });
        dotsBox.appendChild(b);
    });
    var dotEls = dotsBox.querySelectorAll('.m-demo-swiper-dot');

    // Active-Dot folgt natürlichem Swipe (kein Auto-Rotation, User-controlled)
    if ('IntersectionObserver' in window) {
        var io = new IntersectionObserver(function (entries) {
            entries.forEach(function (e) {
                if (e.isIntersecting && e.intersectionRatio > 0.6) {
                    var i = Array.prototype.indexOf.call(slides, e.target);
                    if (i >= 0) dotEls.forEach(function (d, j) { d.classList.toggle('is-active', j === i); });
                }
            });
        }, { root: rail, threshold: [0.6] });
        slides.forEach(function (s) { io.observe(s); });
    }

    // Sheet-Modal Open/Close
    var lastFocus = null;
    function openSheet(href, title, domain) {
        lastFocus = document.activeElement;
        if (sheetTitle) sheetTitle.textContent = title;
        if (sheetEyebrow) sheetEyebrow.textContent = domain;
        if (sheetTab) sheetTab.setAttribute('href', href);
        if (sheetLoader) sheetLoader.classList.remove('is-hidden');
        if (sheetFrame) {
            sheetFrame.setAttribute('src', href);
            sheetFrame.style.opacity = '0';
        }
        sheet.classList.add('is-open');
        sheet.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
    }
    function closeSheet() {
        sheet.classList.remove('is-open');
        sheet.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
        if (sheetFrame) {
            sheetFrame.setAttribute('src', 'about:blank');
            sheetFrame.style.opacity = '0';
        }
        if (lastFocus && typeof lastFocus.focus === 'function') lastFocus.focus();
    }
    if (sheetFrame) {
        sheetFrame.addEventListener('load', function () {
            if (sheetFrame.getAttribute('src') === 'about:blank') return;
            if (sheetLoader) sheetLoader.classList.add('is-hidden');
            sheetFrame.style.transition = 'opacity 240ms ease';
            sheetFrame.style.opacity = '1';
        });
    }
    document.querySelectorAll('[data-m-demo-open]').forEach(function (el) {
        el.addEventListener('click', function (e) {
            e.preventDefault();
            openSheet(el.getAttribute('data-m-demo-href'), el.getAttribute('data-m-demo-title'), el.getAttribute('data-m-demo-domain'));
        });
    });
    document.querySelectorAll('[data-m-demo-sheet-close]').forEach(function (el) {
        el.addEventListener('click', closeSheet);
    });
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && sheet.classList.contains('is-open')) closeSheet();
    });
})();
</script>
`;
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
    if (isSelling(relPath)) {
        html = injectStickyCta(html);
    }
    if (isIndex(relPath)) {
        // Sprint 92/95/96 — Hero-Headline + Eyebrow-Stagger
        html = rewriteHeroHeadline(html);
        html = injectHeroEyebrowStagger(html);
        // Sprint 104 — Eyebrow auf 1 Zeile (Frühjahr 2026 → 2026, Webdesign-Manufaktur → Manufaktur)
        html = compactHeroEyebrow(html);
        // Sprint 98 — Hero ist Apple-Pure (Headline + Sub + CTA), keine Sub-Inserts mehr
        html = rewriteHeroSubhead(html);  // no-op
        html = rewriteHeroCta(html);
        // Sprint 107 — Siegel-Visual + Stats raus aus Hero (User-Wunsch: Hero gestrafft)
        // injectHeroSiegelVisual bleibt im Code als Dead-Code fuer ggf. spaeteren Re-Use
        // Sprint 103 — Reihenfolge: Tools → Personas → Demo-Swiper
        // Demo-Swiper muss zuerst injected werden, damit Personas davor landen können.
        html = injectDemoSwiper(html);
        html = injectPersonaSection(html);
        html = injectEditorialSections(html);
    }
    // Sprint 95 — Scroll-Animations für ALLE Pages (Counter + Pull-Quotes)
    html = injectScrollAnimations(html);
    html = addGeneratorMarker(html, relPath);

    mkdirSync(dirname(outFile), { recursive: true });
    writeFileSync(outFile, html, 'utf8');

    return {
        relPath,
        sellingCta: isSelling(relPath),
        bytes: html.length,
    };
}

function cleanOldMobileOutput() {
    // Loescht src/m/**/*.html. Lässt manifest.json, sw.js, icons/* unberührt
    // (PWA-Files aus Sprint 89 — bleiben für den Fall dass jemand /m/ direkt aufruft).
    function walk(dir) {
        if (!existsSync(dir)) return;
        for (const entry of readdirSync(dir)) {
            const p = join(dir, entry);
            const s = statSync(p);
            if (s.isDirectory()) {
                walk(p);
            } else if (entry.endsWith('.html')) {
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
    console.log(`  ✓ ${results.filter(r => r.sellingCta).length} mit Sticky-CTA-Bar`);
}

main();
