#!/usr/bin/env node
/**
 * Sprint 87 — Mobile-Page-Generator.
 *
 * Generiert die Mobile-Pages aus einer kompakten Definition (page.config).
 * Gemeinsame Bausteine (Head, Nav, Footer, Mobile-Nav-Drawer-Script) werden
 * zentral verwaltet. Output in src/m/.
 *
 * Bewusst KEIN Build-Pipeline-Tool: Skript laeuft einmal, Output ist statisch
 * im Repo, GitHub-Pages deployed src/ direkt.
 *
 * Run: node scripts/build-mobile-pages.mjs
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC_DIR = resolve(__dirname, '..', 'src');

// ────────────────────────────────────────────────────────────────
// Shared HTML-Bausteine
// ────────────────────────────────────────────────────────────────

const FONT_PRELOAD = `<link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@500&family=Cormorant+Garamond:ital@0;1&display=swap" rel="stylesheet">`;

const NAV_HTML = `<nav class="m-nav">
    <div class="m-nav-inner">
        <a href="/m/" class="m-nav-logo"><img src="/images/karriaro-logo-nav.svg?v=2" alt="Karriaro" height="36"></a>
        <button class="m-nav-toggle" aria-label="Menü öffnen" data-m-nav-toggle>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="20" y2="17"/></svg>
        </button>
    </div>
</nav>
<div class="m-nav-backdrop" data-m-nav-backdrop></div>
<aside class="m-nav-drawer" data-m-nav-drawer>
    <button class="m-nav-drawer-close" aria-label="Menü schließen" data-m-nav-close>×</button>
    <a href="/m/">Startseite</a>
    <a href="/m/preise.html">Preise</a>
    <a href="/m/gruender.html">Gründer</a>
    <a href="/m/audit.html">Audit</a>
    <a href="/m/portfolio/immobilien-makler.html">Portfolio</a>
    <a href="/m/warum-handcoded.html">Warum Handcode</a>
    <a href="/m/blog.html">Blog</a>
    <a href="/m/impressum.html">Impressum</a>
</aside>`;

const FOOTER_HTML = (desktopUrl) => `<footer class="m-footer">
    <div class="m-footer-brand">Karriaro Webdesign</div>
    <div class="m-footer-tag">Wenn Ihr Name draufsteht, steht unserer dahinter.</div>
    <nav class="m-footer-links">
        <a href="/m/">Startseite</a>
        <a href="/m/preise.html">Preise</a>
        <a href="/m/gruender.html">Gründer</a>
        <a href="/m/audit.html">Audit</a>
        <a href="/m/impressum.html">Impressum</a>
        <a href="/m/datenschutz.html">Datenschutz</a>
        <a href="/m/agb.html">AGB</a>
        <a href="/m/barrierefreiheit.html">Barrierefreiheit</a>
    </nav>
    <a href="${desktopUrl}" class="m-footer-desktop" onclick="sessionStorage.setItem('kr-keep-desktop','1')">Desktop-Version anzeigen →</a>
    <div class="m-footer-meta">&copy; 2026 Karriaro Webdesign · Spitalstr. 7, 77761 Schiltach · kontakt@karriaro.de</div>
</footer>

<script>(function(){var t=document.querySelector('[data-m-nav-toggle]'),d=document.querySelector('[data-m-nav-drawer]'),b=document.querySelector('[data-m-nav-backdrop]'),c=document.querySelector('[data-m-nav-close]');function o(){d.classList.add('is-open');b.classList.add('is-open');t.setAttribute('aria-expanded','true')}function s(){d.classList.remove('is-open');b.classList.remove('is-open');t.setAttribute('aria-expanded','false')}t&&t.addEventListener('click',o);c&&c.addEventListener('click',s);b&&b.addEventListener('click',s)})();</script>`;

const wrap = ({ title, description, desktopUrl, body, lang = 'de' }) => `<!DOCTYPE html>
<html lang="${lang}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
    <title>${title}</title>
    <meta name="description" content="${description}">
    <link rel="canonical" href="${desktopUrl}">
    <link rel="icon" type="image/svg+xml" href="/images/favicon.svg">
    ${FONT_PRELOAD}
    <link rel="stylesheet" href="/css/mobile.css">
</head>
<body>

<a href="#main" class="skip-to-main">Zum Hauptinhalt springen</a>

${NAV_HTML}

<main id="main">
${body}
</main>

${FOOTER_HTML(desktopUrl)}

</body>
</html>
`;

// ────────────────────────────────────────────────────────────────
// Page-Definitionen
// ────────────────────────────────────────────────────────────────

const pages = [];

// === Gründer ===
pages.push({
    path: 'm/gruender.html',
    title: 'Gründer — Karriaro Webdesign',
    description: 'Warum es Karriaro gibt. 15 Jahre Enterprise-IT, jetzt für KMU.',
    desktopUrl: 'https://karriaro-webdesign.de/gruender.html',
    body: `
<section class="m-hero">
    <span class="m-eyebrow">Gründer · Muammer Kızılaslan</span>
    <h1 class="m-h1">Warum es <em>Karriaro</em> gibt.</h1>
    <p class="m-lead">Karriaro entstand aus 15 Jahren Enterprise-IT. Wir haben gesehen, wie Konzerne ihre Websites bauen: dreistellige Teams, sechsstellige Budgets, Schema.org von Anfang an, BFSG-Audit vor Live-Gang, Lighthouse 95+ als Mindestmaß.</p>
    <p class="m-text">Und wir haben gesehen, was kleine Unternehmen bekommen: einen WordPress-Baukasten vom Cousin, ein Wix-Template aus 2019, eine Agentur-Seite für 5.000 € mit drei Slidern und null Substanz.</p>
    <p class="m-text">Die Lücke ist nicht das Geld. Es ist der Standard. Karriaro ist der Beweis, dass es sich rechnet, wenn man als Manufaktur statt als Fließband arbeitet.</p>
</section>

<section class="m-section m-section--soft">
    <div class="m-wrap">
        <span class="m-eyebrow">Drei Prinzipien</span>
        <h2 class="m-h2">Was uns trägt.</h2>
        <article class="m-card">
            <span class="m-card-eyebrow">01 · Substanz</span>
            <h3 class="m-card-title">Was die Site tut &gt; wie sie aussieht</h3>
            <p class="m-text">Werkzeuge, Audits, Schema.org — das misst Google, das macht den Unterschied.</p>
        </article>
        <article class="m-card">
            <span class="m-card-eyebrow">02 · Eigentum</span>
            <h3 class="m-card-title">Code &amp; Domain gehören Ihnen</h3>
            <p class="m-text">Kein Vendor Lock-in, kein Abo, kein Plugin-Risiko. Sie sind nie abhängig.</p>
        </article>
        <article class="m-card">
            <span class="m-card-eyebrow">03 · Persönlich</span>
            <h3 class="m-card-title">Direkt mit uns sprechen</h3>
            <p class="m-text">Keine Hotline, kein Ticket-System — Mail, Anruf, Antwort in 24 Stunden.</p>
        </article>
    </div>
</section>

<section class="m-section">
    <div class="m-wrap">
        <span class="m-eyebrow">Warum Manufaktur</span>
        <h2 class="m-h2">Karriaro ist eine <em>Manufaktur.</em></h2>
        <p class="m-text">Eine Agentur muss 4 Vertriebsleute, 2 Account-Manager und 3 Projektleiter durchfüttern. Davon fließt nicht viel in den Code. Was Sie zahlen, fließt in Ihre Website. Punkt.</p>
        <p class="m-text">Das schränkt die Kapazität ein — pro Quartal nehmen wir höchstens fünf Pilot-Plätze. Aber jede dieser Websites bekommt die Sorgfalt, die Konzerne für ihre Top-Marken aufwenden. Das ist unser Versprechen.</p>
        <div class="m-btn-stack">
            <a href="/m/audit.html" class="m-btn m-btn-primary">Audit starten</a>
            <a href="/m/preise.html" class="m-btn m-btn-ghost">Preise ansehen</a>
        </div>
    </div>
</section>

<section class="m-section m-section--soft">
    <div class="m-wrap">
        <span class="m-eyebrow">Was Karriaro nicht ist</span>
        <h2 class="m-h2">Klar gesagt.</h2>
        <p class="m-text">Karriaro ist keine Werbeagentur. Wir entwerfen keine Logos, drehen keine Imagefilme, schalten keine Google-Ads. Wir bauen Websites — die schnellsten, sichersten und schlausten, die ein KMU für 990 € bekommen kann.</p>
        <p class="m-text">Wenn Sie ein Branding-Refresh wollen, sind Sie woanders besser. Wenn Sie eine Website wollen, die Anfragen bringt, Abmahnungen verhindert und in Google steht — dann sprechen Sie mit uns.</p>
        <a href="https://muammerkizilaslan.com" class="m-btn m-btn-ghost" target="_blank" rel="noopener">Profil-Seite des Gründers ansehen →</a>
    </div>
</section>
`
});

// === Audit ===
pages.push({
    path: 'm/audit.html',
    title: 'Audit — Karriaro Webdesign',
    description: '5-Sekunden-Mini-Audit für Ihre Website. BFSG, SEO, Performance, Branchen-Standards.',
    desktopUrl: 'https://karriaro-webdesign.de/audit.html',
    body: `
<section class="m-hero">
    <span class="m-eyebrow">Mini-Audit · kostenfrei</span>
    <h1 class="m-h1">Wie steht Ihre <em>Site</em> da?</h1>
    <p class="m-lead">5 Sekunden, kein Login, kein Mailing-Spam. Wir prüfen BFSG-Konformität, Tech-Aktualität, SEO-Setup und Branchen-Standards.</p>
</section>

<section class="m-section">
    <div class="m-wrap">
        <form class="m-form" action="https://europe-west1-apex-executive.cloudfunctions.net/quickAudit" method="POST" id="audit-form">
            <label>Website-URL
                <input type="url" name="url" placeholder="https://ihre-website.de" required>
            </label>
            <input type="text" name="hp" tabindex="-1" autocomplete="off" style="position:absolute; left:-9999px;" aria-hidden="true">
            <button type="submit" class="m-btn m-btn-primary">Audit starten</button>
        </form>
        <div class="m-badges" style="margin-top: 16px;">
            <span class="m-badge">Keine E-Mail nötig</span>
            <span class="m-badge">5 Sekunden</span>
            <span class="m-badge">DSGVO-konform</span>
        </div>
        <p class="m-text m-text-soft" style="margin-top: 24px; font-size: 13px;">Möchten Sie das vollständige Audit per E-Mail als PDF? <a href="https://karriaro-webdesign.de/audit.html" style="color: var(--m-color-indigo);">Hier weiter →</a></p>
    </div>
</section>

<section class="m-section m-section--soft">
    <div class="m-wrap">
        <span class="m-eyebrow">Was wird geprüft</span>
        <h2 class="m-h2">Vier Dimensionen.</h2>
        <article class="m-card">
            <span class="m-card-eyebrow">BFSG-Konformität</span>
            <h3 class="m-card-title">Barrierefreiheits-Heuristik</h3>
            <p class="m-text">Color-Contrast, Form-Labels, Alt-Texte, ARIA — Schwachstellen vor dem Stichtag.</p>
        </article>
        <article class="m-card">
            <span class="m-card-eyebrow">Tech-Stack</span>
            <h3 class="m-card-title">Aktualität + EOL-Status</h3>
            <p class="m-text">WordPress 5.x von 2018? TYPO3 8 EOL? Wir zeigen es ehrlich.</p>
        </article>
        <article class="m-card">
            <span class="m-card-eyebrow">SEO + GEO</span>
            <h3 class="m-card-title">Schema.org &amp; KI-Lesbarkeit</h3>
            <p class="m-text">Wer von ChatGPT zitiert werden will, braucht FAQPage + BreadcrumbList.</p>
        </article>
        <article class="m-card">
            <span class="m-card-eyebrow">Branchen-Standards</span>
            <h3 class="m-card-title">23 Branchen-Patterns</h3>
            <p class="m-text">Hat ein Restaurant eine Speisekarte? Ein Arzt eine Sprechstunde? Friseur Termin-Tool?</p>
        </article>
    </div>
</section>
`
});

// === Website-Check (vereinfacht) ===
pages.push({
    path: 'm/website-check.html',
    title: 'Website-Check — Karriaro Webdesign',
    description: 'Tiefen-Audit Ihrer Website. BFSG, Performance, Security, Schema.org.',
    desktopUrl: 'https://karriaro-webdesign.de/website-check.html',
    body: `
<section class="m-hero">
    <span class="m-eyebrow">Website-Check · Komplett</span>
    <h1 class="m-h1">Volles Audit <em>per Mail.</em></h1>
    <p class="m-lead">Performance, Security, BFSG-Vollcheck, SEO/GEO-Audit, Branchen-Konformität. Als PDF mit 14-Tage-Roadmap.</p>
</section>

<section class="m-section">
    <div class="m-wrap">
        <form class="m-form" action="https://europe-west1-apex-executive.cloudfunctions.net/requestAudit" method="POST">
            <label>Website-URL <input type="url" name="url" placeholder="https://ihre-website.de" required></label>
            <label>Name (optional) <input type="text" name="name" placeholder="Frau/Herr Mustermann"></label>
            <label>E-Mail <input type="email" name="email" placeholder="ihre@firma.de" required></label>
            <input type="text" name="company" tabindex="-1" autocomplete="off" style="position:absolute; left:-9999px;" aria-hidden="true">
            <label class="m-form-checkbox">
                <input type="checkbox" name="consent" required>
                <span>Ich willige in die Verarbeitung gemäß <a href="/m/datenschutz.html">Datenschutz</a> ein.</span>
            </label>
            <button type="submit" class="m-btn m-btn-primary">Komplettaudit anfordern</button>
        </form>
        <p class="m-text m-text-soft" style="margin-top: 24px; font-size: 13px;">Lieferung binnen 24 Stunden als PDF + Link. Daten werden nach 90 Tagen gelöscht.</p>
    </div>
</section>
`
});

// === Warum Handcoded ===
pages.push({
    path: 'm/warum-handcoded.html',
    title: 'Warum Handcode — Karriaro Webdesign',
    description: 'Warum wir HTML/CSS schreiben statt WordPress klicken. Vier Argumente.',
    desktopUrl: 'https://karriaro-webdesign.de/warum-handcoded.html',
    body: `
<section class="m-hero">
    <span class="m-eyebrow">Warum Handcode</span>
    <h1 class="m-h1">HTML, nicht <em>Plugins.</em></h1>
    <p class="m-lead">Wir schreiben jede Seite per Hand. Kein WordPress, kein Theme-Builder, keine 14 Plugins, die sich gegenseitig brechen.</p>
</section>

<section class="m-section">
    <div class="m-wrap">
        <article class="m-card">
            <span class="m-card-eyebrow">01 · Performance</span>
            <h3 class="m-card-title">Lighthouse 95+ ist Standard</h3>
            <p class="m-text">DACH-Median WordPress 2,80 s LCP. Karriaro &lt; 0,5 s. Mathematisch schneller als 95 % der Sites — weil nichts Überflüssiges geladen wird.</p>
        </article>
        <article class="m-card">
            <span class="m-card-eyebrow">02 · Security</span>
            <h3 class="m-card-title">Keine 14 Plugins, die patchbar sind</h3>
            <p class="m-text">Statisches HTML hat keine SQL-Injection, kein Admin-Login zum Brute-Forcen. Die Angriffsfläche ist drastisch kleiner.</p>
        </article>
        <article class="m-card">
            <span class="m-card-eyebrow">03 · BFSG-Konformität</span>
            <h3 class="m-card-title">Eingebaut, nicht nachgerüstet</h3>
            <p class="m-text">ARIA-Labels, Skip-Links, Color-Contrast — von Anfang an. Keine Accessibility-Plugins, die 80 % machen und 20 % brechen.</p>
        </article>
        <article class="m-card">
            <span class="m-card-eyebrow">04 · Eigentum</span>
            <h3 class="m-card-title">Sie können den Code lesen</h3>
            <p class="m-text">200–500 KB HTML/CSS/JS, einsehbar im Browser. Kein Datenbank-Dump nötig zum Migrieren. Quellcode-Übergabe inklusive.</p>
        </article>
        <a href="/m/audit.html" class="m-btn m-btn-primary" style="margin-top: 24px;">Audit starten</a>
    </div>
</section>
`
});

// === Impressum (Inhalte aus Desktop) ===
pages.push({
    path: 'm/impressum.html',
    title: 'Impressum — Karriaro Webdesign',
    description: 'Verantwortliche Stelle nach § 5 TMG.',
    desktopUrl: 'https://karriaro-webdesign.de/impressum.html',
    body: `
<section class="m-hero">
    <h1 class="m-h1">Impressum</h1>
</section>

<section class="m-section">
    <div class="m-wrap">
        <h2 class="m-h2">Angaben gemäß § 5 TMG</h2>
        <p class="m-text"><strong>Karriaro Webdesign</strong><br>Inhaber: Muammer Kızılaslan<br>Spitalstraße 7<br>77761 Schiltach</p>

        <h2 class="m-h2">Kontakt</h2>
        <p class="m-text">Telefon: <a href="tel:+491742796784">+49 174 2796784</a><br>E-Mail: <a href="mailto:kontakt@karriaro.de">kontakt@karriaro.de</a></p>

        <h2 class="m-h2">Umsatzsteuer-ID</h2>
        <p class="m-text">Gemäß § 27 a Umsatzsteuergesetz: auf Anfrage.</p>

        <h2 class="m-h2">Verantwortlich für den Inhalt nach § 55 Abs. 2 RStV</h2>
        <p class="m-text">Muammer Kızılaslan, Anschrift wie oben.</p>

        <h2 class="m-h2">Haftungsausschluss</h2>
        <p class="m-text m-text-soft">Trotz sorgfältiger inhaltlicher Kontrolle übernehmen wir keine Haftung für die Inhalte externer Links. Für den Inhalt der verlinkten Seiten sind ausschließlich deren Betreiber verantwortlich.</p>
    </div>
</section>
`
});

// === Datenschutz ===
pages.push({
    path: 'm/datenschutz.html',
    title: 'Datenschutz — Karriaro Webdesign',
    description: 'Datenschutzerklärung gemäß DSGVO.',
    desktopUrl: 'https://karriaro-webdesign.de/datenschutz.html',
    body: `
<section class="m-hero">
    <h1 class="m-h1">Datenschutz</h1>
</section>

<section class="m-section">
    <div class="m-wrap">
        <h2 class="m-h2">Verantwortliche Stelle</h2>
        <p class="m-text">Muammer Kızılaslan · Karriaro Webdesign · Spitalstraße 7 · 77761 Schiltach<br>kontakt@karriaro.de · +49 174 2796784</p>

        <h2 class="m-h2">Datenschutz auf einen Blick</h2>
        <p class="m-text">Beim Besuch dieser Website werden automatisch technische Informationen erfasst (Server-Logfiles). Bei Kontaktformular-Nutzung werden die übermittelten Daten gespeichert. Anonyme Reichweitenmessung läuft serverseitig ohne Cookies — Details siehe Desktop-Version.</p>

        <h2 class="m-h2">Mini-Audit / Komplettaudit</h2>
        <p class="m-text">Wenn Sie eine URL in das Audit-Werkzeug eingeben, ruft unsere Cloud-Function diese serverseitig auf und wertet den HTML-Inhalt aus. Statistische Daten (Score, Branche, anonymer Tages-Hash Ihrer IP) werden 90 Tage gespeichert. Beim Komplettaudit zusätzlich Name + E-Mail-Adresse, ebenfalls 90 Tage.</p>

        <h2 class="m-h2">Auftragsverarbeiter</h2>
        <p class="m-text m-text-soft">GitHub Pages (Hosting USA), Formspree (Kontaktformular USA), Google Ireland (Cloud-Functions Belgien), Anthropic (Sprachmodell USA), Hetzner (Lighthouse-Tracking DE), unser SMTP-Provider. Verträge nach Art. 28 DSGVO bestehen oder werden geschlossen.</p>

        <h2 class="m-h2">Ihre Rechte</h2>
        <p class="m-text">Auskunft, Berichtigung, Löschung, Widerspruch — formlos per Mail an kontakt@karriaro.de.</p>

        <p class="m-text m-text-soft" style="margin-top: 32px; font-size: 13px;">Stand: Mai 2026. Vollständige Datenschutzerklärung auf <a href="https://karriaro-webdesign.de/datenschutz.html">karriaro-webdesign.de/datenschutz.html</a>.</p>
    </div>
</section>
`
});

// === AGB ===
pages.push({
    path: 'm/agb.html',
    title: 'AGB — Karriaro Webdesign',
    description: 'Allgemeine Geschäftsbedingungen.',
    desktopUrl: 'https://karriaro-webdesign.de/agb.html',
    body: `
<section class="m-hero">
    <h1 class="m-h1">AGB</h1>
</section>

<section class="m-section">
    <div class="m-wrap">
        <h2 class="m-h2">§1 Geltungsbereich</h2>
        <p class="m-text">Diese AGB gelten für alle Webdesign-Leistungen von Karriaro Webdesign gegenüber Unternehmen iSd § 14 BGB.</p>

        <h2 class="m-h2">§2 Vertragsschluss</h2>
        <p class="m-text">Der Vertrag kommt durch schriftliche Auftragsbestätigung zustande. Angebote sind 30 Tage gültig.</p>

        <h2 class="m-h2">§3 Leistungsumfang</h2>
        <p class="m-text">Konzeption, Design, Code, Hosting-Setup, Übergabe. Inhalte (Texte, Bilder) liefert der Kunde, sofern nicht anders vereinbart.</p>

        <h2 class="m-h2">§4 Preise &amp; Zahlung</h2>
        <p class="m-text">Pakete laut Website. Zahlung 50 % bei Beauftragung, 50 % bei Übergabe. Wartung monatlich im Voraus.</p>

        <h2 class="m-h2">§5 Lieferfristen</h2>
        <p class="m-text">Essential 7, Professional 10, Premium 14 Werktage nach Briefing. Verzögerungen durch fehlende Kundenlieferungen verlängern die Frist entsprechend.</p>

        <h2 class="m-h2">§6 Eigentum &amp; Nutzungsrechte</h2>
        <p class="m-text">Mit vollständiger Zahlung gehen alle Nutzungsrechte am Quellcode auf den Kunden über. Schriften und Bilder unterliegen ihren jeweiligen Lizenzen.</p>

        <h2 class="m-h2">§7 Haftung</h2>
        <p class="m-text">Haftung für leichte Fahrlässigkeit ausgeschlossen, außer bei wesentlichen Vertragspflichten. Gesamthaftung auf Vertragswert begrenzt.</p>

        <p class="m-text m-text-soft" style="margin-top: 32px; font-size: 13px;">Vollständige AGB auf <a href="https://karriaro-webdesign.de/agb.html">karriaro-webdesign.de/agb.html</a>. Stand: Mai 2026.</p>
    </div>
</section>
`
});

// === Barrierefreiheit ===
pages.push({
    path: 'm/barrierefreiheit.html',
    title: 'Barrierefreiheit — Karriaro Webdesign',
    description: 'Erklärung zur Barrierefreiheit nach BFSG.',
    desktopUrl: 'https://karriaro-webdesign.de/barrierefreiheit.html',
    body: `
<section class="m-hero">
    <h1 class="m-h1">Barrierefreiheit</h1>
    <p class="m-lead">Wir achten WCAG 2.1 AA und das BFSG (in Kraft seit 28.6.2025).</p>
</section>

<section class="m-section">
    <div class="m-wrap">
        <h2 class="m-h2">Stand der Konformität</h2>
        <p class="m-text">Diese Mobile-Version (m.karriaro-webdesign.de) erfüllt WCAG 2.1 AA weitgehend. Sie wurde mit Mobile-First-Prinzipien gebaut: 48 × 48 px Tap-Targets, semantisches HTML, Skip-Link, sichtbare Focus-States, Reduced-Motion-Honor.</p>

        <h2 class="m-h2">Bekannte Einschränkungen</h2>
        <ul class="m-card-list">
            <li>Live-Werkzeuge (Audit-Form) sind Demo-Charakter — kein Live-Backend-Polling</li>
            <li>Color-Contrasts auf Indigo + Gold sind AA-konform, AAA noch nicht erreicht</li>
        </ul>

        <h2 class="m-h2">Feedback &amp; Kontakt</h2>
        <p class="m-text">Probleme bei der Nutzung dieser Mobile-Version? <a href="mailto:kontakt@karriaro.de?subject=Barrierefreiheit Mobile">kontakt@karriaro.de</a> oder Telefon +49 174 2796784.</p>

        <h2 class="m-h2">Durchsetzungsverfahren</h2>
        <p class="m-text m-text-soft">Sollte unsere Antwort nicht zufriedenstellend sein, können Sie sich an die Schlichtungsstelle nach dem Behindertengleichstellungsgesetz wenden: <a href="https://www.schlichtungsstelle-bgg.de">schlichtungsstelle-bgg.de</a></p>
    </div>
</section>
`
});

// ────────────────────────────────────────────────────────────────
// 8 Portfolio-Demo-Pages (kompakt)
// ────────────────────────────────────────────────────────────────

const portfolio = [
    { slug: 'immobilien-makler', branche: 'Immobilien', persona: 'Andreas Müller', personaRole: 'Geschäftsführer · IVD + HypZert',
      img: '/images/immobilien/andreas-team.jpg',
      h1Pre: 'Wir verkaufen keine Häuser.', h1Em: 'Wir verkaufen Übergänge.',
      tool: 'Wertermittlung + Hypothekenrechner mit Tilgungsplan',
      desc: 'Verkäufer geben PLZ, Fläche, Baujahr ein → Live-Marktwert-Spanne. Käufer rechnen Annuität mit Restschuld nach 5/10/15 Jahren.' },
    { slug: 'dachdecker-meisterbetrieb', branche: 'Dachdecker', persona: 'Thomas Berger', personaRole: 'Dachdeckermeister · 3. Generation',
      img: '/images/dachdecker/persona.jpg',
      h1Pre: 'Ihr Dach ist 30 Jahre alt.', h1Em: 'Es kann noch 30 weitere halten.',
      tool: 'BAFA-Förderrechner (Stand 2026)',
      desc: 'Live-Berechnung: 15 % BAFA + 5 % iSFP-Bonus, KfW-261-Konditionen ab 2,8 % p.a. mit Tilgungszuschuss 5–20 %.' },
    { slug: 'friseur-salon', branche: 'Friseur', persona: 'Laura Müller', personaRole: 'Friseurmeisterin · Atelier-Salon',
      img: '/images/friseur/persona.jpg',
      h1Pre: 'Nicht jeder Stil passt zu jedem.', h1Em: 'Wir wissen welcher.',
      tool: 'Style-Empfehlung mit Foto-Galerie',
      desc: 'Gesichtsform + Anlass → 12 Style-Vorschläge mit Live-Foto-Vorschau aus dem Atelier-Portfolio.' },
    { slug: 'restaurant-template', branche: 'Restaurant', persona: 'Andreas Bauer', personaRole: 'Küchenchef · Slow Food',
      img: '/images/restaurant/persona.jpg',
      h1Pre: 'Speisekarten <em>als Tagebuch.</em>', h1Em: 'Jede Saison neu.',
      tool: 'AI-Sommelier-Pairing',
      desc: 'Gast wählt Hauptgericht, das System empfiehlt drei Weine aus der Karte mit Begründung — strukturierte Pairing-Hilfe.' },
    { slug: 'praxis-weber', branche: 'Praxis', persona: 'Dr. Sarah Weber', personaRole: 'Allgemeinmedizin · KV-Vertragsärztin',
      img: '/images/praxis/persona.jpg',
      h1Pre: 'Termin in 5 Minuten.', h1Em: 'Vor-Anamnese inklusive.',
      tool: 'KI-Symptom-Vor-Anamnese',
      desc: 'Patient wählt bis zu 3 Symptome → strukturierter Vorschlag für Termin-Typ. Keine Diagnose — Notruf 112, Bereitschaft 116117.' },
    { slug: 'spedition-schwaben', branche: 'Spedition', persona: 'Robert Schwaben', personaRole: 'Geschäftsführer · 3. Generation',
      img: '/images/spedition/persona.jpg',
      h1Pre: '320 Mitarbeiter.', h1Em: 'Ein Versprechen.',
      tool: 'Frachtquote-Rechner mit ETA',
      desc: 'Von-PLZ zu Bis-PLZ + Gewicht → Live-Quote inkl. ETA und Fahrzeugklasse (Sprinter, Wechselbrücke, 7,5-Tonner, Sattelzug).' },
    { slug: 'meisterbetrieb-mueller', branche: 'Sanitär', persona: 'Stefan Müller', personaRole: 'Sanitär-Meister · SHK-Innung',
      img: '/images/sanitaer/persona.jpg',
      h1Pre: 'Notdienst 24/7.', h1Em: 'Innungsbetrieb.',
      tool: 'Notdienst-Verfügbarkeits-Check',
      desc: 'PLZ + Notfall-Typ → Anrückzeit-Schätzung. Rohrbruch/Leck sofort, andere Notfälle in unter 90 Minuten.' },
    { slug: 'coaching-lehmann', branche: 'Coaching', persona: 'Sarah Lehmann', personaRole: 'Premium Business-Coach · Frankfurt',
      img: '/images/coaching/persona.jpg',
      h1Pre: 'Klarheit ist eine Entscheidung.', h1Em: 'Nicht in 90 Tagen — in einem Gespräch.',
      tool: 'Klarheits-Score-Diagnose',
      desc: '5 Fragen → Coaching-Format-Empfehlung (6-Wochen-Intensiv, 90-Tage-Programm, Strategie-Sparring, Sounding-Board).' },
];

for (const p of portfolio) {
    pages.push({
        path: `m/portfolio/${p.slug}.html`,
        title: `${p.branche}-Demo — Karriaro Webdesign`,
        description: `Branchen-Demo: ${p.branche}. Live-Werkzeug: ${p.tool}.`,
        desktopUrl: `https://karriaro-webdesign.de/portfolio/${p.slug}.html`,
        body: `
<section class="m-hero">
    <span class="m-eyebrow">N° · Karriaro · ${p.branche.toUpperCase()} · 2026</span>
    <h1 class="m-h1">${p.h1Pre} <em>${p.h1Em}</em></h1>
    <img src="${p.img}" alt="${p.persona}, ${p.personaRole}" class="m-hero-img" loading="lazy" width="540" height="675">
    <p class="m-hero-caption">${p.persona} <span class="sep">·</span> ${p.personaRole}</p>
    <div class="m-btn-stack">
        <a href="https://karriaro-webdesign.de/portfolio/${p.slug}.html" class="m-btn m-btn-primary">Volle Demo ansehen</a>
        <a href="/m/audit.html" class="m-btn m-btn-ghost">Eigene Site auditieren</a>
    </div>
</section>

<section class="m-section m-section--soft">
    <div class="m-wrap">
        <span class="m-eyebrow">Live-Werkzeug</span>
        <h2 class="m-h2">${p.tool}</h2>
        <p class="m-text">${p.desc}</p>
        <a href="https://karriaro-webdesign.de/portfolio/${p.slug}.html#tool" class="m-btn m-btn-primary">Werkzeug ausprobieren</a>
    </div>
</section>

<section class="m-section">
    <div class="m-wrap">
        <span class="m-eyebrow">Was ist drin</span>
        <h2 class="m-h2">Diese Demo zeigt.</h2>
        <article class="m-card">
            <span class="m-card-eyebrow">Hero + Mockup</span>
            <h3 class="m-card-title">Brand-Hero mit Foto</h3>
            <p class="m-text">Editorial-Hero mit Geschaeftsfuehrer-Portrait und Stadt-Karte. Sofort sichtbar wer dahinter steht.</p>
        </article>
        <article class="m-card">
            <span class="m-card-eyebrow">Werkzeug</span>
            <h3 class="m-card-title">${p.tool}</h3>
            <p class="m-text">${p.desc}</p>
        </article>
        <article class="m-card">
            <span class="m-card-eyebrow">Trust + Compliance</span>
            <h3 class="m-card-title">BFSG, DSGVO, Schema.org</h3>
            <p class="m-text">Schema.org-Markup, BreadcrumbList, FAQPage — die KI-Suche-Lesbarkeit, die Google-AIO und Perplexity tatsaechlich indexieren.</p>
        </article>
    </div>
</section>

<section class="m-section m-section--soft">
    <div class="m-wrap">
        <span class="m-eyebrow">Ihre Version</span>
        <h2 class="m-h2">So eine Demo bekommen Sie.</h2>
        <p class="m-text">Eine ${p.branche.toLowerCase()}-Site wie diese: ab 2.990 € einmalig, Lieferzeit 14 Tage. Individuell auf Ihr Unternehmen zugeschnitten.</p>
        <a href="/m/preise.html" class="m-btn m-btn-primary">Preise &amp; Pakete</a>
    </div>
</section>
`
    });
}

// ────────────────────────────────────────────────────────────────
// 14 Stadt-Landing-Pages
// ────────────────────────────────────────────────────────────────

const cities = [
    { slug: 'berlin', name: 'Berlin', region: 'Hauptstadt-Region' },
    { slug: 'hamburg', name: 'Hamburg', region: 'Norddeutschland' },
    { slug: 'muenchen', name: 'München', region: 'Bayern' },
    { slug: 'koeln', name: 'Köln', region: 'Rheinland' },
    { slug: 'frankfurt', name: 'Frankfurt', region: 'Rhein-Main' },
    { slug: 'stuttgart', name: 'Stuttgart', region: 'Baden-Württemberg' },
    { slug: 'duesseldorf', name: 'Düsseldorf', region: 'Rheinland' },
    { slug: 'leipzig', name: 'Leipzig', region: 'Sachsen' },
    { slug: 'dortmund', name: 'Dortmund', region: 'Ruhrgebiet' },
    { slug: 'essen', name: 'Essen', region: 'Ruhrgebiet' },
    { slug: 'bremen', name: 'Bremen', region: 'Norddeutschland' },
    { slug: 'dresden', name: 'Dresden', region: 'Sachsen' },
    { slug: 'hannover', name: 'Hannover', region: 'Niedersachsen' },
    { slug: 'nuernberg', name: 'Nürnberg', region: 'Franken' },
];

for (const c of cities) {
    pages.push({
        path: `m/webdesign-${c.slug}.html`,
        title: `Webdesign ${c.name} — Karriaro Webdesign-Manufaktur`,
        description: `Handcodierte Websites für Unternehmen in ${c.name} und Umgebung (${c.region}). BFSG-konform, ab 1.290 €.`,
        desktopUrl: `https://karriaro-webdesign.de/webdesign-${c.slug}.html`,
        body: `
<section class="m-hero">
    <span class="m-eyebrow">Webdesign · ${c.name}</span>
    <h1 class="m-h1">Webdesign in <em>${c.name}.</em></h1>
    <p class="m-lead">Handcodierte Websites für KMU in ${c.name} und ${c.region}. BFSG-konform ab Tag eins, Quellcode gehört Ihnen, Lieferung in 7–14 Tagen.</p>
    <div class="m-btn-stack">
        <a href="/m/audit.html" class="m-btn m-btn-primary">Site auditieren lassen</a>
        <a href="/m/preise.html" class="m-btn m-btn-ghost">Preise ansehen</a>
    </div>
</section>

<section class="m-section m-section--soft">
    <div class="m-wrap">
        <span class="m-eyebrow">Warum lokal denken</span>
        <h2 class="m-h2">${c.name} <em>versteht uns.</em></h2>
        <article class="m-card">
            <span class="m-card-eyebrow">Schema.org · LocalBusiness</span>
            <h3 class="m-card-title">Google-Maps-Optimierung inkl.</h3>
            <p class="m-text">Local-Business-Schema mit Adress-Daten, Öffnungszeiten, Bewertungen — die Strukturen, die Google für die "${c.name}"-Suche braucht.</p>
        </article>
        <article class="m-card">
            <span class="m-card-eyebrow">Hosting</span>
            <h3 class="m-card-title">In Deutschland, BFSG-konform</h3>
            <p class="m-text">Server in DE/EU, kein US-Cloud-Transfer ohne EU-US-DPF-Vertrag. DSGVO-sicher für ${c.name}er KMUs.</p>
        </article>
        <article class="m-card">
            <span class="m-card-eyebrow">Persönlich</span>
            <h3 class="m-card-title">Mail, Anruf, Antwort in 24 h</h3>
            <p class="m-text">Kein Account-Manager-Karussell. Sie sprechen mit den Menschen, die Ihre Site bauen.</p>
        </article>
    </div>
</section>

<section class="m-section">
    <div class="m-wrap">
        <span class="m-eyebrow">Pakete für ${c.name}</span>
        <h2 class="m-h2">Drei Stufen.</h2>
        <article class="m-card">
            <span class="m-card-eyebrow">Essential</span>
            <h3 class="m-card-title">1.290 €</h3>
            <p class="m-text">Eine Seite, BFSG-konform, mobil-optimiert. Lieferung in 7 Tagen.</p>
        </article>
        <article class="m-card">
            <span class="m-card-eyebrow">Professional</span>
            <h3 class="m-card-title">1.990 €</h3>
            <p class="m-text">4–6 Seiten plus Branchen-Werkzeug-Light. Lieferung in 10 Tagen.</p>
        </article>
        <article class="m-card">
            <span class="m-card-eyebrow">Premium</span>
            <h3 class="m-card-title">2.990 €</h3>
            <p class="m-text">Volle Manufaktur mit Werkzeugen, Stadt-Landings, Editorial-Polish. 14 Tage.</p>
        </article>
        <a href="/m/preise.html" class="m-btn m-btn-primary">Alle Pakete im Detail</a>
    </div>
</section>

<section class="m-section m-section--soft">
    <div class="m-wrap">
        <span class="m-eyebrow">Schnellanfrage</span>
        <h2 class="m-h2">Sprechen Sie uns an.</h2>
        <p class="m-text">Antwort binnen 24 Stunden. Kein Account-Manager-Spam, keine Discovery-Call-Einladung in 3 Wochen.</p>
        <a href="mailto:kontakt@karriaro.de?subject=Anfrage%20Webdesign%20${encodeURIComponent(c.name)}" class="m-btn m-btn-primary">Mail an Karriaro</a>
        <a href="tel:+491742796784" class="m-btn m-btn-ghost" style="margin-top: 12px;">Anrufen: 0174 2796784</a>
    </div>
</section>
`
    });
}

// === Blog Index ===
pages.push({
    path: 'm/blog.html',
    title: 'Blog — Karriaro Webdesign',
    description: 'Artikel über Webdesign, BFSG, Performance, Handcode.',
    desktopUrl: 'https://karriaro-webdesign.de/blog.html',
    body: `
<section class="m-hero">
    <span class="m-eyebrow">Blog · Karriaro</span>
    <h1 class="m-h1">Notizen <em>aus der Werkstatt.</em></h1>
</section>

<section class="m-section">
    <div class="m-wrap">
        <article class="m-card">
            <span class="m-card-eyebrow">Performance</span>
            <h2 class="m-card-title"><a href="/m/blog/core-web-vitals-erklaert.html" style="color: inherit; text-decoration: none;">Core Web Vitals, erklärt</a></h2>
            <p class="m-text">LCP, INP, CLS — was bedeuten die drei Buchstaben für ihre Site? Und warum 95+ in Lighthouse Mobile machbar ist.</p>
            <a href="/m/blog/core-web-vitals-erklaert.html" class="m-btn m-btn-ghost">Lesen →</a>
        </article>

        <article class="m-card">
            <span class="m-card-eyebrow">DSGVO</span>
            <h2 class="m-card-title"><a href="/m/blog/dsgvo-website-checkliste.html" style="color: inherit; text-decoration: none;">DSGVO-Website-Checkliste 2026</a></h2>
            <p class="m-text">Was muss auf jeder Unternehmens-Site stehen, damit Abmahn-Anwälte einen Bogen drum machen.</p>
            <a href="/m/blog/dsgvo-website-checkliste.html" class="m-btn m-btn-ghost">Lesen →</a>
        </article>

        <article class="m-card">
            <span class="m-card-eyebrow">Architektur</span>
            <h2 class="m-card-title"><a href="/m/blog/wordpress-vs-handcode.html" style="color: inherit; text-decoration: none;">WordPress vs. Handcode</a></h2>
            <p class="m-text">Warum 14 Plugins eine Sicherheitslücke sind und was Sie stattdessen tun.</p>
            <a href="/m/blog/wordpress-vs-handcode.html" class="m-btn m-btn-ghost">Lesen →</a>
        </article>
    </div>
</section>
`
});

// Blog-Artikel — kompakter Mobile-Render der Hauptaussagen
pages.push({
    path: 'm/blog/core-web-vitals-erklaert.html',
    title: 'Core Web Vitals, erklärt — Karriaro',
    description: 'LCP, INP, CLS. Was die drei Buchstaben für Ihre Site bedeuten.',
    desktopUrl: 'https://karriaro-webdesign.de/blog/core-web-vitals-erklaert.html',
    body: `
<section class="m-hero">
    <span class="m-eyebrow">Performance · 5 Min</span>
    <h1 class="m-h1">Core Web Vitals, <em>erklärt.</em></h1>
</section>

<section class="m-section">
    <div class="m-wrap">
        <p class="m-lead">Google misst Ihre Site mit drei Kennzahlen. Wenn die schlecht sind, sinkt das Ranking — und Besucher springen ab.</p>

        <h2 class="m-h2">LCP (Largest Contentful Paint)</h2>
        <p class="m-text">Wann ist das größte Element sichtbar? Ziel: &lt; 2,5 s. WordPress mit Page-Builder schafft oft 4–5 s. Handcoded HTML mit kritischem CSS schafft &lt; 0,5 s.</p>

        <h2 class="m-h2">INP (Interaction to Next Paint)</h2>
        <p class="m-text">Wie lange braucht der Browser, um nach einem Klick zu reagieren? Ziel: &lt; 200 ms. Schwere JS-Bundles zerstören das.</p>

        <h2 class="m-h2">CLS (Cumulative Layout Shift)</h2>
        <p class="m-text">Springt das Layout, während die Seite lädt? Ziel: &lt; 0,1. Verhindern durch width/height auf Bildern und reservierten Platz für Werbung.</p>

        <h2 class="m-h2">Warum das wichtig ist</h2>
        <p class="m-text">Google nutzt Core Web Vitals als Ranking-Signal seit 2021. Schlechte Werte = schlechteres Ranking = weniger organischer Traffic = weniger Anfragen.</p>

        <a href="/m/audit.html" class="m-btn m-btn-primary" style="margin-top: 24px;">Eigene Site auditieren</a>
    </div>
</section>
`
});

pages.push({
    path: 'm/blog/dsgvo-website-checkliste.html',
    title: 'DSGVO-Website-Checkliste 2026 — Karriaro',
    description: 'Was muss auf jeder Unternehmens-Site stehen.',
    desktopUrl: 'https://karriaro-webdesign.de/blog/dsgvo-website-checkliste.html',
    body: `
<section class="m-hero">
    <span class="m-eyebrow">DSGVO · 6 Min</span>
    <h1 class="m-h1">DSGVO-Checkliste <em>2026.</em></h1>
</section>

<section class="m-section">
    <div class="m-wrap">
        <h2 class="m-h2">Pflicht-Inhalte</h2>
        <ul class="m-card-list">
            <li>Impressum nach § 5 TMG vollständig</li>
            <li>Datenschutzerklärung mit allen Verarbeitungen</li>
            <li>Cookie-Banner nur wenn Cookies gesetzt werden</li>
            <li>SSL/TLS-Verschlüsselung pflicht</li>
            <li>Auftragsverarbeiter-Verträge (Art. 28 DSGVO)</li>
        </ul>

        <h2 class="m-h2">TDDDG 2024</h2>
        <p class="m-text">Seit 14.05.2024 löst das TDDDG das alte TTDSG ab. § 25 TDDDG verlangt Einwilligung für Zugriff auf den Endgeräte-Speicher (Cookies, LocalStorage). Reine Server-Logs sind ausgenommen.</p>

        <h2 class="m-h2">EU-US Data Privacy Framework</h2>
        <p class="m-text">Seit 10.07.2023 ersetzt das DPF die Standardvertragsklauseln für viele US-Anbieter (Google, Anthropic, AWS, GitHub). Nennen Sie es im Datenschutz.</p>

        <h2 class="m-h2">Sanktionen</h2>
        <p class="m-text">Art. 83 DSGVO: bis 4 % Jahresumsatz oder 20 Mio. € für schwere Verstöße. Leichtere bis 2 % oder 10 Mio. €. Abmahn-Anwälte arbeiten oft auf Provisionsbasis.</p>

        <a href="/m/audit.html" class="m-btn m-btn-primary" style="margin-top: 24px;">Site DSGVO-prüfen</a>
    </div>
</section>
`
});

pages.push({
    path: 'm/blog/wordpress-vs-handcode.html',
    title: 'WordPress vs. Handcode — Karriaro',
    description: 'Warum 14 Plugins eine Sicherheitslücke sind.',
    desktopUrl: 'https://karriaro-webdesign.de/blog/wordpress-vs-handcode.html',
    body: `
<section class="m-hero">
    <span class="m-eyebrow">Architektur · 4 Min</span>
    <h1 class="m-h1">WordPress vs. <em>Handcode.</em></h1>
</section>

<section class="m-section">
    <div class="m-wrap">
        <p class="m-lead">WordPress hat einen Marktanteil von 43 %. Trotzdem ist es für viele KMU-Sites die falsche Wahl.</p>

        <h2 class="m-h2">Performance</h2>
        <p class="m-text">DACH-Median WordPress LCP: 2,80 s. Handcoded: &lt; 0,5 s. Faktor 6× schneller — weil kein PHP-Rendering, keine Datenbank-Abfragen, kein Plugin-JS.</p>

        <h2 class="m-h2">Security</h2>
        <p class="m-text">WordPress-Sites sind 90 % aller gehackten CMS-Sites (Sucuri 2024). Grund: 14 Plugins × Update-Frequenz × Admin-Login = große Angriffsfläche. Handcoded statisches HTML hat keine Datenbank, keinen Admin.</p>

        <h2 class="m-h2">Kosten Total Cost of Ownership</h2>
        <p class="m-text">WordPress: 0 € Lizenz, ABER ~50 €/Monat Hosting (mit Plugin-Load), 50 €/Jahr Premium-Plugins, 200 €/Jahr Wartung, 500–2000 €/Jahr für Updates und Bugfixes. Handcoded: 99 €/Monat all-inclusive.</p>

        <h2 class="m-h2">Wann WordPress sinnvoll ist</h2>
        <p class="m-text">Bei sehr aktiven Blogs (mehrere Artikel/Woche), bei Multi-Author-Setups, bei E-Commerce mit WooCommerce. Für eine 4–6-seitige Marketing-Site eines KMU: Overkill.</p>

        <a href="/m/preise.html" class="m-btn m-btn-primary" style="margin-top: 24px;">Karriaro-Pakete ansehen</a>
    </div>
</section>
`
});

// === 404 ===
pages.push({
    path: 'm/404.html',
    title: '404 — Karriaro Webdesign',
    description: 'Seite nicht gefunden.',
    desktopUrl: 'https://karriaro-webdesign.de/404.html',
    body: `
<section class="m-hero" style="text-align: center;">
    <span class="m-eyebrow">404</span>
    <h1 class="m-h1">Diese Seite gibt es <em>nicht.</em></h1>
    <p class="m-lead">Vielleicht ein Tippfehler in der URL, vielleicht haben wir umstrukturiert.</p>
    <div class="m-btn-stack">
        <a href="/m/" class="m-btn m-btn-primary">Zur Startseite</a>
        <a href="/m/preise.html" class="m-btn m-btn-ghost">Preise ansehen</a>
    </div>
</section>
`
});

// === Success (Kontaktformular-Bestätigung) ===
pages.push({
    path: 'm/success.html',
    title: 'Danke — Karriaro Webdesign',
    description: 'Ihre Nachricht wurde übermittelt.',
    desktopUrl: 'https://karriaro-webdesign.de/success.html',
    body: `
<section class="m-hero" style="text-align: center;">
    <span class="m-eyebrow">Eingegangen</span>
    <h1 class="m-h1">Danke. <em>Wir melden uns.</em></h1>
    <p class="m-lead">Ihre Nachricht ist bei uns angekommen. Antwort binnen 24 Stunden — kein Account-Manager-Karussell, keine Discovery-Call-Einladung in 3 Wochen.</p>
    <div class="m-btn-stack">
        <a href="/m/" class="m-btn m-btn-primary">Zur Startseite</a>
        <a href="/m/portfolio/immobilien-makler.html" class="m-btn m-btn-ghost">Portfolio ansehen</a>
    </div>
</section>
`
});

// ────────────────────────────────────────────────────────────────
// Schreiben
// ────────────────────────────────────────────────────────────────

let written = 0;
for (const page of pages) {
    const outPath = join(SRC_DIR, page.path);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, wrap(page));
    written++;
    console.log(`✓ ${page.path}`);
}
console.log(`\nFertig: ${written} Mobile-Pages geschrieben unter src/m/`);
