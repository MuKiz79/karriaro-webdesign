// Hub-Builder: Editorial-Index unter /audit/.
// Aggregiert Branchen-Reports zu einer Uebersichts-Seite.
// String-Concat statt Template-Literals, weil vite:import-analysis
// sich an Closing-Tags in Backticks verschluckt.
import { ACCENT_BY_BRANCH } from './svg-charts.js';
import { assertVoiceClean, stripTags } from './voice-linter.js';

const CLOSE_P = '<' + '/p>';
const CLOSE_H1 = '<' + '/h1>';
const CLOSE_H2 = '<' + '/h2>';
const CLOSE_A = '<' + '/a>';
const CLOSE_EM = '<' + '/em>';
const CLOSE_BR = '<br>';
const CLOSE_DT = '<' + '/dt>';
const CLOSE_DD = '<' + '/dd>';
const CLOSE_DL = '<' + '/dl>';
const CLOSE_DIV = '<' + '/div>';
const CLOSE_SPAN = '<' + '/span>';
const CLOSE_STRONG = '<' + '/strong>';
const CLOSE_ARTICLE = '<' + '/article>';
const CLOSE_SECTION = '<' + '/section>';
const CLOSE_HEADER = '<' + '/header>';
const CLOSE_FOOTER = '<' + '/footer>';
const CLOSE_MAIN = '<' + '/main>';
const CLOSE_HEAD = '<' + '/head>';
const CLOSE_BODY = '<' + '/body>';
const CLOSE_HTML = '<' + '/html>';
const CLOSE_TITLE = '<' + '/title>';
const CLOSE_STYLE = '<' + '/style>';
const CLOSE_SCRIPT = '<' + '/script>';

function escapeHtml(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/[<>&"']/g, function (c) {
        return { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c];
    });
}

function pct(share) { return Math.round((share || 0) * 100); }

export function reportToHubCard(report, slugFromDir) {
    const slug = slugFromDir || report.slug;
    const isDemo = slug.endsWith('-preview');
    return {
        slug: slug,
        href: '/audit/' + slug + '/',
        brancheName: report.brancheName,
        stadtName: report.stadtName,
        brancheKey: report.brancheKey,
        n: report.n,
        erhebungDate: report.erhebungDate,
        erhebungMonth: report.erhebungMonth,
        medianPerf: (report.stats && report.stats.perf) ? report.stats.perf.median : null,
        baukastenShare: (report.baukasten && report.baukasten.share) || 0,
        sslMissingShare: (report.ssl && report.ssl.missingShare) || 0,
        isDemo: isDemo
    };
}

function renderCard(card) {
    const accent = ACCENT_BY_BRANCH[card.brancheKey] || '#1a1a1a';
    const folioText = card.isDemo ? 'DEMO-VORSCHAU' : 'LIVE. ' + escapeHtml(card.erhebungMonth);
    const styleAttr = '--branch-accent:' + accent;
    const href = escapeHtml(card.href);
    const branche = escapeHtml(card.brancheName);
    const stadt = escapeHtml(card.stadtName);
    const medianPerf = card.medianPerf == null ? '-' : card.medianPerf;
    const parts = [];
    parts.push('<article class="kr-hub-card" style="' + styleAttr + '">');
    parts.push('  <p class="kr-hub-folio">' + folioText + CLOSE_P);
    parts.push('  <h2 class="kr-hub-h"><a href="' + href + '">' + branche + CLOSE_BR + '<em>in ' + stadt + CLOSE_EM + '.' + CLOSE_A + CLOSE_H2);
    parts.push('  <dl class="kr-hub-meta">');
    parts.push('    <div><dt>Sites' + CLOSE_DT + '<dd>' + card.n + CLOSE_DD + CLOSE_DIV);
    parts.push('    <div><dt>Median PSI' + CLOSE_DT + '<dd>' + medianPerf + CLOSE_DD + CLOSE_DIV);
    parts.push('    <div><dt>Baukasten' + CLOSE_DT + '<dd>' + pct(card.baukastenShare) + ' %' + CLOSE_DD + CLOSE_DIV);
    parts.push('    <div><dt>Ohne SSL' + CLOSE_DT + '<dd>' + pct(card.sslMissingShare) + ' %' + CLOSE_DD + CLOSE_DIV);
    parts.push('  ' + CLOSE_DL);
    parts.push('  <a class="kr-hub-cta" href="' + href + '">Den Audit lesen.' + CLOSE_A);
    parts.push(CLOSE_ARTICLE);
    return parts.join('\n');
}

function hubStyles() {
    return ':root{--ink:#1a1a1a;--paper:#fafaf7;--paper-2:#f3f1ea;--muted:#5a5a5a;--rule:#e4e0d5;--max:1100px}' +
        '*{box-sizing:border-box;margin:0;padding:0}' +
        'html{font-size:17px;-webkit-text-size-adjust:100%}' +
        'body{background:var(--paper);color:var(--ink);font-family:Inter,ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;line-height:1.55}' +
        'a{color:var(--ink);text-decoration:underline;text-underline-offset:3px;text-decoration-thickness:1px}' +
        'em,i{font-family:Fraunces,Georgia,serif;font-style:italic}' +
        '.kr-mono{font-family:"JetBrains Mono",ui-monospace,monospace;font-size:.86em;letter-spacing:.02em}' +
        '.kr-wrap{max-width:var(--max);margin:0 auto;padding:0 24px}' +
        '.kr-top{display:flex;justify-content:space-between;align-items:center;padding:1rem 0;border-bottom:1px solid var(--rule)}' +
        '.kr-top a{text-decoration:none;font-family:"JetBrains Mono",ui-monospace,monospace;font-size:.84rem;letter-spacing:.04em}' +
        '.kr-folio{font-family:"JetBrains Mono",ui-monospace,monospace;font-size:.72rem;letter-spacing:.18em;text-transform:uppercase;color:var(--muted)}' +
        '.kr-h1{font-family:Fraunces,Georgia,serif;font-weight:400;font-size:clamp(2.6rem,5.5vw,4.4rem);line-height:1.05;letter-spacing:-.02em;margin:.6em 0 .3em}' +
        '.kr-h1 em{font-style:italic}' +
        '.kr-lede{font-size:clamp(1.05rem,1.6vw,1.25rem);line-height:1.55;color:var(--ink);max-width:42em;margin:0 0 1.2em}' +
        '.kr-bar{border-top:1px solid var(--rule);border-bottom:1px solid var(--rule);padding:.6em 0;margin:1em 0 3rem;display:flex;flex-wrap:wrap;gap:1.4em;font-family:"JetBrains Mono",ui-monospace,monospace;font-size:.78rem;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}' +
        '.kr-bar strong{color:var(--ink);font-weight:600}' +
        '.kr-section{margin:3rem 0}' +
        '.kr-grid{display:grid;grid-template-columns:1fr;gap:1.6rem}' +
        '@media(min-width:760px){.kr-grid{grid-template-columns:1fr 1fr}}' +
        '@media(min-width:1024px){.kr-grid{grid-template-columns:1fr 1fr 1fr}}' +
        '.kr-hub-card{background:#fff;border:1px solid var(--rule);padding:1.6rem 1.4rem;display:flex;flex-direction:column;gap:1rem;border-top:3px solid var(--branch-accent,var(--ink))}' +
        '.kr-hub-folio{font-family:"JetBrains Mono",ui-monospace,monospace;font-size:.7rem;letter-spacing:.14em;text-transform:uppercase;color:var(--branch-accent,var(--ink))}' +
        '.kr-hub-h{font-family:Fraunces,Georgia,serif;font-weight:400;font-size:1.7rem;line-height:1.12;letter-spacing:-.01em}' +
        '.kr-hub-h a{text-decoration:none;color:var(--ink)}' +
        '.kr-hub-h a:hover{color:var(--branch-accent,var(--ink))}' +
        '.kr-hub-h em{font-style:italic;color:var(--branch-accent,var(--ink))}' +
        '.kr-hub-meta{display:grid;grid-template-columns:1fr 1fr;gap:.7rem .8rem;margin:.2rem 0 .4rem}' +
        '.kr-hub-meta div{border-top:1px solid var(--rule);padding-top:.4rem}' +
        '.kr-hub-meta dt{font-family:"JetBrains Mono",ui-monospace,monospace;font-size:.66rem;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)}' +
        '.kr-hub-meta dd{font-family:Fraunces,Georgia,serif;font-size:1.3rem;color:var(--ink);margin-top:.05em}' +
        '.kr-hub-cta{font-family:"JetBrains Mono",ui-monospace,monospace;font-size:.78rem;letter-spacing:.06em;text-transform:uppercase;color:var(--branch-accent,var(--ink));text-decoration:none;border-top:1px solid var(--rule);padding-top:.8rem;margin-top:auto}' +
        '.kr-hub-cta:hover{text-decoration:underline;text-underline-offset:4px}' +
        '.kr-empty{text-align:center;padding:4rem 2rem;background:var(--paper-2);border:1px solid var(--rule);font-family:Fraunces,Georgia,serif;font-style:italic;color:var(--muted)}' +
        '.kr-empty strong{display:block;font-family:"JetBrains Mono",ui-monospace,monospace;font-style:normal;letter-spacing:.1em;text-transform:uppercase;font-size:.78rem;color:var(--ink);margin-bottom:.5em}' +
        '.kr-cta{background:var(--paper-2);padding:3rem 2rem;margin:5rem 0 2rem;text-align:center;border-top:1px solid var(--rule);border-bottom:1px solid var(--rule)}' +
        '.kr-cta h2{font-family:Fraunces,Georgia,serif;font-size:clamp(1.6rem,3vw,2.4rem);font-weight:400;line-height:1.18;margin-bottom:.6em}' +
        '.kr-cta h2 em{font-style:italic}' +
        '.kr-cta p{color:var(--muted);max-width:36em;margin:0 auto 1.4em}' +
        '.kr-btn{display:inline-block;padding:.9em 1.6em;border:1px solid var(--ink);text-decoration:none;font-family:"JetBrains Mono",ui-monospace,monospace;font-size:.82rem;letter-spacing:.08em;text-transform:uppercase;color:var(--ink);background:var(--paper)}' +
        '.kr-btn:hover{background:var(--ink);color:var(--paper)}' +
        '.kr-footer{padding:2rem 0 3rem;border-top:1px solid var(--rule);margin-top:3rem;color:var(--muted);font-size:.86rem;display:flex;justify-content:space-between;flex-wrap:wrap;gap:1rem}' +
        '.kr-footer a{color:var(--muted)}';
}

function fontFace() {
    return '@font-face{font-family:Fraunces;font-style:normal;font-weight:300 700;src:local("Fraunces"),url(/fonts/fraunces-latin.woff2) format("woff2");font-display:swap}' +
        '@font-face{font-family:Fraunces;font-style:italic;font-weight:300 700;src:local("Fraunces Italic"),url(/fonts/fraunces-latin.woff2) format("woff2");font-display:swap}';
}

function liveCollection(cards) {
    const parts = cards.map(function (c) {
        const year = (c.erhebungDate || '').slice(0, 4);
        return {
            '@type': 'Article',
            headline: 'Web-Index ' + c.brancheName + ' ' + c.stadtName + ' ' + year,
            url: 'https://karriaro-webdesign.de' + c.href,
            datePublished: c.erhebungDate
        };
    });
    return {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: 'Karriaro Web-Index. Branchen-Reports.',
        url: 'https://karriaro-webdesign.de/audit/',
        inLanguage: 'de-DE',
        about: 'Datenbasierte Branchen-Audits zum digitalen Status mittelständischer Unternehmen in deutschen Städten.',
        hasPart: parts
    };
}

export function buildHubHtml(allCards, options) {
    options = options || {};
    const showDemos = options.showDemos !== false;
    const cards = allCards
        .filter(function (c) { return showDemos || !c.isDemo; })
        .slice()
        .sort(function (a, b) {
            if (a.isDemo !== b.isDemo) return a.isDemo ? 1 : -1;
            return (b.erhebungDate || '').localeCompare(a.erhebungDate || '');
        });
    const liveCards = cards.filter(function (c) { return !c.isDemo; });
    const totalSites = liveCards.reduce(function (s, c) { return s + (c.n || 0); }, 0);

    const collectionScript = liveCards.length
        ? '<script type="application/ld+json">\n' + JSON.stringify(liveCollection(liveCards), null, 2) + '\n' + CLOSE_SCRIPT
        : '';

    const cardsHtml = cards.length
        ? '<div class="kr-grid">' + cards.map(renderCard).join('\n') + CLOSE_DIV
        : '<div class="kr-empty"><strong>Web-Index startet' + CLOSE_STRONG + 'Der erste Branchen-Audit erscheint hier in Kürze. Schreiben Sie uns, welche Branche und Stadt Sie zuerst sehen möchten.' + CLOSE_DIV;

    const summaryBase = 'Karriaro vermisst den digitalen Status mittelständischer Branchen Stadt für Stadt. ';
    const summary = liveCards.length
        ? summaryBase + 'Aktuell ' + liveCards.length + ' Audits, zusammen ' + totalSites + ' Sites. Datenbasis: Google Places + PageSpeed Insights, anonymisiert nach DSGVO.'
        : summaryBase + 'Datenbasis: Google Places + PageSpeed Insights, anonymisiert nach DSGVO.';

    const currentYear = escapeHtml(new Date().toISOString().slice(0, 4));
    const styleBlock = '<style>' + fontFace() + hubStyles() + CLOSE_STYLE;

    const headParts = [
        '<!doctype html>',
        '<html lang="de">',
        '<head>',
        '<meta charset="utf-8">',
        '<meta name="viewport" content="width=device-width,initial-scale=1">',
        '<link rel="icon" type="image/svg+xml" href="/images/favicon.svg?v=8">',
        '<title>Web-Index. Karriaro Webdesign-Manufaktur.' + CLOSE_TITLE,
        '<meta name="description" content="Datenbasierte Branchen-Audits zum digitalen Status mittelständischer Unternehmen in deutschen Städten. PageSpeed, Tech-Stack, BFSG-Compliance, anonymisiert nach DSGVO.">',
        '<meta name="robots" content="index,follow,max-snippet:-1,max-image-preview:large">',
        '<link rel="canonical" href="https://karriaro-webdesign.de/audit/">',
        '<meta property="og:title" content="Karriaro Web-Index. Branchen-Reports.">',
        '<meta property="og:description" content="Datenbasierte Branchen-Audits zum digitalen Status mittelständischer Unternehmen in deutschen Städten.">',
        '<meta property="og:url" content="https://karriaro-webdesign.de/audit/">',
        '<meta property="og:type" content="website">',
        '<meta property="og:locale" content="de_DE">',
        '<meta name="twitter:card" content="summary_large_image">',
        styleBlock,
        collectionScript,
        CLOSE_HEAD
    ];

    const heroBar = [
        '<span><strong>' + liveCards.length + CLOSE_STRONG + ' Audits' + CLOSE_SPAN,
        '<span><strong>' + totalSites + CLOSE_STRONG + ' Sites vermessen' + CLOSE_SPAN,
        '<span>Quelle <strong>Google Places . PageSpeed Insights' + CLOSE_STRONG + CLOSE_SPAN,
        '<span>Lizenz <strong>CC BY 4.0' + CLOSE_STRONG + CLOSE_SPAN
    ].join('\n      ');

    const bodyParts = [
        '<body>',
        '<header class="kr-top kr-wrap">',
        '  <a href="/" class="kr-mono">Karriaro' + CLOSE_A,
        '  <a href="/audit/" class="kr-mono" aria-current="page">Web-Index' + CLOSE_A,
        CLOSE_HEADER,
        '<main class="kr-wrap">',
        '  <section class="kr-section" style="margin-top:2.5rem">',
        '    <p class="kr-folio">WEB-INDEX. ' + currentYear + CLOSE_P,
        '    <h1 class="kr-h1">Der digitale Status' + CLOSE_BR + '<em>des deutschen Mittelstands' + CLOSE_EM + '.' + CLOSE_H1,
        '    <p class="kr-lede">' + escapeHtml(summary) + CLOSE_P,
        '    <div class="kr-bar">',
        '      ' + heroBar,
        '    ' + CLOSE_DIV,
        '  ' + CLOSE_SECTION,
        '  <section class="kr-section">',
        '    ' + cardsHtml,
        '  ' + CLOSE_SECTION,
        '  <section class="kr-cta">',
        '    <h2>Sie wollen <em>Ihre Branche' + CLOSE_EM + ' als nächstes vermessen sehen?' + CLOSE_H2,
        '    <p>Schreiben Sie uns Branche und Stadt. Der nächste Web-Index entsteht aus Anfragen.' + CLOSE_P,
        '    <a class="kr-btn" href="mailto:kontakt@karriaro.de?subject=Web-Index-Wunsch">Branche vorschlagen' + CLOSE_A,
        '  ' + CLOSE_SECTION,
        CLOSE_MAIN,
        '<footer class="kr-footer kr-wrap">',
        '  <div>(c) ' + currentYear + ' Karriaro Webdesign-Manufaktur' + CLOSE_DIV,
        '  <div><a href="/impressum.html">Impressum' + CLOSE_A + ' . <a href="/datenschutz.html">Datenschutz' + CLOSE_A + CLOSE_DIV,
        CLOSE_FOOTER,
        CLOSE_BODY,
        CLOSE_HTML
    ];

    const html = headParts.join('\n') + '\n' + bodyParts.join('\n');

    if (options.skipVoiceLint !== true) {
        assertVoiceClean(stripTags(html), { context: 'hub /audit/' });
    }
    return html;
}
