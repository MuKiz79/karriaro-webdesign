/**
 * Sprint 252 — Branchen×Intent-Landingpages „Webseite für [Branche] erstellen lassen".
 *
 * Erzeugt vollständige, indexierbare Kauf-Intent-Seiten `src/webdesign-fuer-<slug>.html`
 * aus der BRANCHEN-Daten-Map. GETRENNT von den fiktiven Schaufenster-Demos unter
 * src/portfolio/* — die werden hier nur als „Demo" verlinkt (nicht als Referenzkunde,
 * wahrt die build-site-index.mjs-Trennung).
 *
 * Idempotent: jede Seite wird komplett neu generiert (gleiche Eingabe → gleiche Ausgabe).
 * Layout/Schema/Voice zentral hier — eine Änderung propagiert über alle Branchen.
 * build-mobile-pages.mjs entdeckt die neuen Seiten automatisch.
 *
 * Run: node scripts/build-branchen-pages.mjs
 */
import { writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
const BASE = 'https://karriaro-webdesign.de';
const TEL = '+49 174 2796784';
const TEL_HREF = 'tel:+491742796784';

/** Branchen-Daten. Pflicht je Branche: eigener intro-Absatz + eigene FAQ (kein Thin-Content). */
const BRANCHEN = [
  {
    slug: 'friseur',
    name: 'Friseure',
    h1: 'Webseite für Friseure<br>erstellen lassen.',
    title: 'Webseite für Friseure erstellen lassen — handcodiert, Festpreis | Karriaro',
    desc: 'Webseite für Ihren Friseur- oder Beauty-Salon erstellen lassen: handcodiert, mit Online-Terminbuchung gegen No-Shows, ab 1.290 € Festpreis. Erst Entwurf, dann zahlen.',
    keywords: 'Webseite für Friseure erstellen lassen, Friseur Website erstellen, Homepage Friseursalon, Webdesign Friseur, Online Terminbuchung Friseur',
    serviceType: 'Webdesign für Friseur- und Beauty-Salons',
    demoUrl: '/portfolio/friseur-salon',
    demoLabel: 'Friseur-Salon-Demo',
    heroSub: 'Eine Website für Ihren Salon, die rund um die Uhr Termine annimmt — handcodiert, schnell und so gebaut, dass neue Kunden Sie bei Google finden.',
    points: [
      ['Termine statt Telefonklingeln', 'Online-Terminbuchung, die auch nach Feierabend Termine annimmt — gegen No-Shows mit Erinnerung. Weniger Anrufe während des Schnitts, mehr gebuchte Stühle.'],
      ['Ihre Handschrift, nicht ein Template', 'Galerie Ihrer Arbeiten, Ihr Team, Ihre Preise — als handcodiertes Unikat statt austauschbarer Baukasten-Vorlage, die jeder zweite Salon nutzt.'],
      ['Gefunden in „Friseur in der Nähe"', 'Saubere lokale SEO und Schema.org von Anfang an, damit Sie in der Google-Suche und in KI-Antworten auftauchen, wenn jemand in Ihrer Stadt einen Termin sucht.']
    ],
    intro: 'Die meisten Salon-Websites sind Baukästen von der Stange — langsam, austauschbar und ohne echte Terminbuchung. Wir bauen stattdessen handcodiert: eine Seite, die zu Ihrem Salon passt, in Sekunden lädt und Termine annimmt, während Sie schneiden. Sie sehen zuerst einen Entwurf und entscheiden in Ruhe, bevor eine Zahlung fällig wird.',
    faq: [
      ['Können Kunden direkt online einen Termin buchen?', 'Ja. Auf Wunsch bauen wir eine Online-Terminbuchung ein, die Termine rund um die Uhr annimmt und an No-Show-Erinnerungen koppelt. Welche Funktionen sinnvoll sind, klären wir vorab.'],
      ['Was kostet eine Website für einen Friseursalon?', 'Festpreis ab 1.290 € (Essential) einmalig, ohne Abo. Mit Terminbuchung und mehreren Unterseiten meist Professional ab 1.990 €. Der Preis hängt vom Umfang ab, nicht von Ihrem Standort.'],
      ['Ich habe schon eine alte Seite — lohnt sich ein Neubau?', 'Schicken Sie uns Ihre aktuelle Seite. Sie erhalten kostenlos eine ehrliche Einschätzung, was fehlt und was sich lohnt — ohne Verkaufsdruck.'],
      ['Wie lange dauert es, bis mein Salon online ist?', 'Den ersten Entwurf sehen Sie meist in wenigen Tagen, die fertige Seite ist je nach Umfang in 2 bis 4 Wochen online.']
    ]
  },
  {
    slug: 'dachdecker',
    name: 'Dachdecker',
    h1: 'Webseite für Dachdecker<br>erstellen lassen.',
    title: 'Webseite für Dachdecker erstellen lassen — handcodiert, Festpreis | Karriaro',
    desc: 'Webseite für Ihren Dachdecker- oder Handwerksbetrieb erstellen lassen: handcodiert, mit Förder-Rechner und Foto-Anfrage, ab 1.290 € Festpreis. Erst Entwurf, dann zahlen.',
    keywords: 'Webseite für Dachdecker erstellen lassen, Dachdecker Website erstellen, Homepage Handwerksbetrieb, Webdesign Handwerk, Website Dachdeckerei',
    serviceType: 'Webdesign für Dachdecker- und Handwerksbetriebe',
    demoUrl: '/portfolio/dachdecker-meisterbetrieb',
    demoLabel: 'Dachdecker-Meisterbetrieb-Demo',
    heroSub: 'Eine Website für Ihren Betrieb, die Anfragen vorqualifiziert — mit Förder-Rechner und Foto-Upload, handcodiert und schnell, damit Sie die richtigen Aufträge bekommen.',
    points: [
      ['Anfragen, die schon vorqualifiziert sind', 'Ein Förder-Rechner (BAFA/KfW) und eine Foto-Anfrage filtern ernsthafte Interessenten heraus — Sie sparen sich Telefonate über Projekte, die ohnehin nicht passen.'],
      ['Vertrauen ab der ersten Sekunde', 'Referenzen, Meister-Qualifikation und ein klarer Notfall-Weg, sauber präsentiert. Im Handwerk entscheidet der erste Eindruck, wem man das Dach anvertraut.'],
      ['Gefunden, wenn es eilt', 'Lokale SEO und schnelle Ladezeit, damit Sie bei „Dachdecker in der Nähe" und nach dem nächsten Sturm ganz oben stehen — auch in KI-Antworten.']
    ],
    intro: 'Viele Handwerker-Websites sind veraltet, langsam und kosten Aufträge an die Konkurrenz. Wir bauen handcodiert: eine Seite, die Vertrauen schafft und Anfragen vorqualifiziert, statt nur eine Telefonnummer zu zeigen. Sie sehen zuerst einen Entwurf — gefällt er nicht, brechen Sie ab, ohne Zahlung.',
    faq: [
      ['Kann die Seite einen Förder-Rechner oder eine Foto-Anfrage haben?', 'Ja. Auf Wunsch bauen wir Branchen-Werkzeuge wie einen BAFA/KfW-Förder-Hinweis oder eine Foto-Anfrage ein, die Interessenten vorqualifizieren. Was sinnvoll ist, klären wir vorab.'],
      ['Was kostet eine Website für einen Dachdecker- oder Handwerksbetrieb?', 'Festpreis ab 1.290 € (Essential) einmalig, ohne Abo. Mit mehreren Unterseiten und einem Branchen-Werkzeug meist Professional ab 1.990 €.'],
      ['Meine alte Seite ist von 2015 — reicht das nicht?', 'Schicken Sie sie uns. Sie bekommen kostenlos eine ehrliche Einschätzung, ob sich ein Neubau lohnt und was er bringt — ohne Verkaufsdruck.'],
      ['Wie schnell ist meine Seite online?', 'Erster Entwurf meist in wenigen Tagen, fertige Seite je nach Umfang in 2 bis 4 Wochen.']
    ]
  },
  {
    slug: 'immobilienmakler',
    name: 'Immobilienmakler',
    h1: 'Webseite für Immobilien-<br>makler erstellen lassen.',
    title: 'Webseite für Immobilienmakler erstellen lassen — handcodiert | Karriaro',
    desc: 'Webseite für Ihr Maklerbüro erstellen lassen: handcodiert, mit Sofort-Wertermittlung und Live-Filter, ab 1.290 € Festpreis. Erst Entwurf, dann zahlen.',
    keywords: 'Webseite für Immobilienmakler erstellen lassen, Makler Website erstellen, Homepage Immobilienbüro, Webdesign Immobilien, Wertermittlung Website',
    serviceType: 'Webdesign für Immobilienmakler',
    demoUrl: '/portfolio/immobilien-makler',
    demoLabel: 'Immobilienmakler-Demo',
    heroSub: 'Eine Website für Ihr Maklerbüro, die aus Besuchern Eigentümer-Anfragen macht — mit Sofort-Wertermittlung und Live-Filter, handcodiert und auf Vertrauen gebaut.',
    points: [
      ['Aus Besuchern werden Eigentümer-Leads', 'Eine Sofort-Wertermittlung gibt Eigentümern einen ersten Anhaltspunkt — und Ihnen eine qualifizierte Anfrage statt nur eines Seitenaufrufs.'],
      ['Objekte, die sich verkaufen lassen', 'Live-Filter und ein ruhiges, hochwertiges Layout, das Objekte in Szene setzt — Premium-Auftritt statt Portal-Optik.'],
      ['Seriös und auffindbar', 'Saubere Struktur, lokale SEO und Schema.org, damit Eigentümer Sie bei der Suche nach einem Makler in Ihrer Region finden — klassisch und in KI-Antworten.']
    ],
    intro: 'Im Maklergeschäft entscheidet Vertrauen, und das beginnt bei der Website. Portal-Optik und Baukasten wirken austauschbar — wir bauen stattdessen ein handcodiertes Unikat mit Werkzeugen, die Eigentümer-Anfragen erzeugen. Sie sehen zuerst einen Entwurf und entscheiden ohne Risiko, bevor gezahlt wird.',
    faq: [
      ['Kann die Seite eine Wertermittlung oder Objekt-Filter haben?', 'Ja. Auf Wunsch bauen wir Branchen-Werkzeuge wie eine Sofort-Wertermittlung oder Live-Objekt-Filter ein. Den Funktionsumfang stimmen wir vorab mit Ihnen ab.'],
      ['Was kostet eine Website für ein Maklerbüro?', 'Für Makler meist Premium ab 2.990 € einmalig (großzügiger Umfang, Branchen-Werkzeuge, Editorial-Layout). Einfachere Auftritte starten bei 1.290 €. Kein Abo.'],
      ['Wie hebt sich das von Immobilienportalen ab?', 'Ihre eigene Marke statt Portal-Schablone: ein ruhiger, hochwertiger Auftritt, der Eigentümer überzeugt und Anfragen direkt zu Ihnen lenkt — nicht zur Konkurrenz im Portal.'],
      ['Wie lange dauert die Umsetzung?', 'Erster Entwurf meist in wenigen Tagen, fertige Seite je nach Umfang in 2 bis 4 Wochen.']
    ]
  }
];

const STYLE = `* { margin: 0; padding: 0; box-sizing: border-box; }
:root { --c-hero: #fff; --c-alt: #f5f5f7; --c-ink-muted: #424245; }
body { font-family: -apple-system, 'Helvetica Neue', Helvetica, Arial, sans-serif; background: #FBFAF7; color: #14202B; -webkit-font-smoothing: antialiased; }
a { color: inherit; text-decoration: none; }
.wrap { max-width: 980px; margin: 0 auto; padding: 0 24px; }
.wrap-xs { max-width: 500px; margin: 0 auto; padding: 0 24px; }
.muted { color: #86868b; }
nav { position: fixed; top: 0; left: 0; right: 0; z-index: 50; background: rgba(251,251,253,0.92); backdrop-filter: saturate(180%) blur(20px); -webkit-backdrop-filter: saturate(180%) blur(20px); border-bottom: 1px solid rgba(0,0,0,0.04); }
nav .inner { max-width: 980px; margin: 0 auto; padding: 0 24px; display: flex; align-items: center; justify-content: space-between; height: 48px; }
nav a { font-size: 12px; color: #14202B; opacity: 0.8; transition: opacity 0.3s; }
nav a:hover { opacity: 1; }
nav .nav-right { display: flex; align-items: center; gap: 18px; }
nav .nav-tel { font-weight: 600; opacity: 1; }
nav .cta { background: #1A2E40; color: #fff; padding: 6px 16px; border-radius: 20px; font-size: 12px; font-weight: 500; opacity: 1; transition: all 0.35s; }
nav .cta:hover { background: #0F1F2E; }
section { padding: 120px 0; }
@media (max-width: 640px) { section { padding: 84px 0; } }
h1 { font-size: clamp(38px, 5.6vw, 62px); font-weight: 600; letter-spacing: -0.025em; line-height: 1.06; }
h2 { font-size: clamp(26px, 4vw, 38px); font-weight: 600; letter-spacing: -0.02em; line-height: 1.12; }
.subhead { font-size: clamp(17px, 2.2vw, 23px); color: #86868b; line-height: 1.5; max-width: 560px; margin: 24px auto 0; }
.btn { display: inline-block; background: #1A2E40; color: #fff; padding: 14px 32px; border-radius: 28px; font-size: 17px; font-weight: 500; transition: all 0.4s; }
.btn:hover { background: #0F1F2E; }
.btn-ghost { display: inline-block; padding: 14px 28px; border-radius: 28px; font-size: 17px; border: 1px solid rgba(0,0,0,0.18); transition: all 0.3s; }
.btn-ghost:hover { border-color: #1A2E40; }
.price-anchor { display: inline-block; margin-top: 22px; font-size: 15px; color: #424245; }
.price-anchor strong { color: #14202B; }
.link-arrow { color: #1A2E40; font-size: 17px; transition: color 0.3s; }
.link-arrow:hover { text-decoration: underline; }
.grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 36px; }
@media (max-width: 760px) { .grid-3 { grid-template-columns: 1fr; gap: 28px; } }
.feat h3 { font-size: 17px; font-weight: 600; margin-bottom: 8px; }
.feat p { font-size: 14px; color: #86868b; line-height: 1.6; }
.proof-card { display: inline-block; background: #fff; border: 1px solid rgba(0,0,0,0.08); border-radius: 16px; padding: 24px 28px; max-width: 520px; transition: border-color 0.3s, transform 0.3s; }
.proof-card:hover { border-color: #1A2E40; transform: translateY(-2px); }
.proof-card .demo-tag { font-size: 11px; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; color: #86868b; }
.proof-card h3 { font-size: 19px; font-weight: 600; margin: 8px 0 6px; }
.proof-card p { font-size: 14px; color: #86868b; line-height: 1.6; }
.proof-card .arrow { color: #1A2E40; font-size: 14px; margin-top: 10px; display: inline-block; }
.faq-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 36px; text-align: left; max-width: 880px; margin: 52px auto 0; }
@media (max-width: 640px) { .faq-grid { grid-template-columns: 1fr; gap: 28px; } }
.faq-grid h3 { font-size: 17px; font-weight: 600; margin-bottom: 8px; }
.faq-grid p { font-size: 14px; color: #86868b; line-height: 1.6; }
input[type="text"], input[type="email"], textarea { width: 100%; background: #fff; border: 1px solid #d2d2d7; border-radius: 12px; padding: 16px 20px; font-size: 17px; font-family: inherit; color: #14202B; outline: none; transition: border-color 0.3s; }
input:focus, textarea:focus { border-color: #1A2E40; }
textarea { resize: none; }
::placeholder { color: #86868b; }
.submit-btn { width: 100%; background: #1A2E40; color: #fff; border: none; border-radius: 12px; padding: 16px; font-size: 17px; font-family: inherit; font-weight: 500; cursor: pointer; transition: all 0.4s; }
.submit-btn:hover { background: #0F1F2E; }
footer { padding: 40px 0; border-top: 1px solid rgba(0,0,0,0.06); font-size: 12px; color: #86868b; }
footer a { color: #424245; }
footer a:hover { color: #14202B; }
.fade-in { opacity: 0; transform: translateY(20px); transition: opacity 0.8s ease, transform 0.8s ease; }
.fade-in.visible { opacity: 1; transform: translateY(0); }
@media (prefers-color-scheme: dark) {
  :root { --c-hero: #0F1217; --c-alt: #161A20; --c-ink-muted: #B8BCC3; }
  body { background: #0F1217; color: #F5F3EE; }
  .muted, .subhead { color: #9BA3AD; }
  nav { background: rgba(15,18,23,0.92); border-bottom-color: rgba(255,255,255,0.07); }
  nav a { color: #F5F3EE; }
  nav .cta, .btn, .submit-btn { background: #2C4257; color: #fff; }
  nav .cta:hover, .btn:hover, .submit-btn:hover { background: #38536B; }
  .btn-ghost { border-color: rgba(255,255,255,0.2); }
  .link-arrow, .proof-card .arrow { color: #8FB0C9; }
  .proof-card { background: #161A20; border-color: rgba(255,255,255,0.08); }
  .feat p, .proof-card p, .faq-grid p { color: #9BA3AD; }
  .price-anchor { color: #B8BCC3; }
  input[type="text"], input[type="email"], textarea { background: #161A20; border-color: rgba(255,255,255,0.14); color: #F5F3EE; }
  input:focus, textarea:focus { border-color: #6B8AA3; }
  ::placeholder { color: #8B93A0; }
  footer { color: #9BA3AD; border-top-color: rgba(255,255,255,0.08); }
  footer a { color: #B8BCC3; }
  footer a:hover { color: #F5F3EE; }
}`;

const REDIRECT = `(function(){var h=location.hostname;if(h!=="karriaro-webdesign.de"&&h!=="www.karriaro-webdesign.de")return;if(sessionStorage.getItem("kr-keep-desktop")==="1")return;var ua=navigator.userAgent||"";if(/bot|crawl|spider|slurp|mediapartners|googlebot|google-extended|bingpreview|gptbot|oai-searchbot|chatgpt|claudebot|claude-web|anthropic|perplexity|applebot|ccbot|facebookbot|facebookexternalhit|meta-external|bytespider|amazonbot|duckduckbot|yandex|baidu|lighthouse|pagespeed|headless|prerender/i.test(ua))return;var isMobileUA=/iPhone|iPod|Android|Mobile|webOS|BlackBerry|Opera Mini|IEMobile/i.test(ua);var isNarrow=(window.innerWidth||document.documentElement.clientWidth||0)<=900;if(!isMobileUA&&!isNarrow)return;location.replace("https://m.karriaro-webdesign.de"+location.pathname+location.search);})();`;

function faqSchema(b) {
  const items = b.faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } }));
  return JSON.stringify({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: items });
}

function buildPage(b) {
  const url = BASE + '/webdesign-fuer-' + b.slug;
  const points = b.points.map(([t, p]) =>
    `                <div class="feat">\n                    <h3>${t}</h3>\n                    <p>${p}</p>\n                </div>`).join('\n');
  const faqVisible = b.faq.map(([q, a]) =>
    `                <div>\n                    <h3>${q}</h3>\n                    <p>${a}</p>\n                </div>`).join('\n');

  return `<!DOCTYPE html>
<html lang="de">
<head>
    <script>${REDIRECT}</script>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <!-- generated by scripts/build-branchen-pages.mjs — Daten dort pflegen, nicht hier -->
    <title>${b.title}</title>
    <meta name="description" content="${b.desc}">
    <meta name="keywords" content="${b.keywords}">
    <meta name="robots" content="index, follow">
    <link rel="canonical" href="${url}">
    <meta property="og:type" content="website">
    <meta property="og:url" content="${url}">
    <meta property="og:title" content="${b.title}">
    <meta property="og:description" content="${b.desc}">
    <meta property="og:image" content="${BASE}/images/og-image.jpg">
    <meta property="og:locale" content="de_DE">
    <meta name="twitter:card" content="summary_large_image">
    <link rel="icon" type="image/svg+xml" href="/images/favicon.svg?v=2">
    <script type="application/ld+json">
    {
        "@context": "https://schema.org",
        "@type": "WebDesignAgency",
        "@id": "${BASE}/#organization",
        "name": "Karriaro Webdesign",
        "description": "${b.serviceType} — handcodierte Unikate zum Festpreis, ohne Abo.",
        "url": "${url}",
        "email": "kontakt@karriaro.de",
        "telephone": "${TEL}",
        "address": { "@type": "PostalAddress", "streetAddress": "Spitalstr. 7", "addressLocality": "Schiltach", "postalCode": "77761", "addressCountry": "DE" },
        "areaServed": [ { "@type": "Country", "name": "Germany" }, { "@type": "Country", "name": "Austria" }, { "@type": "Country", "name": "Switzerland" } ],
        "serviceType": "${b.serviceType}",
        "priceRange": "€€€",
        "speakable": { "@type": "SpeakableSpecification", "cssSelector": ["h1", ".subhead", "h2"] }
    }
    </script>
    <script type="application/ld+json">
    ${faqSchema(b)}
    </script>
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@graph": [
        { "@type": "Organization", "@id": "${BASE}/#organization", "name": "Karriaro Webdesign", "url": "${BASE}", "logo": "${BASE}/images/favicon.svg", "email": "kontakt@karriaro.de", "telephone": "${TEL}", "address": { "@type": "PostalAddress", "streetAddress": "Spitalstr. 7", "addressLocality": "Schiltach", "postalCode": "77761", "addressCountry": "DE" }, "founder": { "@type": "Person", "name": "Muammer Kızılaslan", "url": "${BASE}/gruender", "sameAs": ["https://muammerkizilaslan.com", "https://www.linkedin.com/in/muammerkizilaslan"] }, "sameAs": ["https://muammerkizilaslan.com", "https://www.linkedin.com/in/muammerkizilaslan"] },
        { "@type": "WebPage", "@id": "${url}#webpage", "url": "${url}", "isPartOf": { "@id": "${BASE}/#organization" }, "publisher": { "@id": "${BASE}/#organization" }, "dateModified": "2026-06-14" }
      ]
    }
    </script>
    <style>${STYLE}</style>
    <script async src="https://lighthouse.karriaro.de/t.js" data-site="karriaro-webdesign"></script>
    <script src="/js/attribution.js?v=199" defer></script>
    <script src="/js/track-goals.js?v=252" defer></script>
</head>
<body>

    <nav>
        <div class="inner">
            <a href="/" style="font-weight: 600; font-size: 14px; opacity: 1;">Karriaro</a>
            <div class="nav-right">
                <a href="${TEL_HREF}" class="nav-tel" data-cta="tel-nav">${TEL}</a>
                <a href="#kontakt" class="cta">Erstgespräch</a>
            </div>
        </div>
    </nav>

    <main>

    <section aria-label="Hero" style="min-height: 84vh; display: flex; align-items: center; padding-top: 48px; background: var(--c-hero);">
        <div style="max-width: 1080px; margin: 0 auto; padding: 0 24px; text-align: center;">
            <h1>${b.h1}</h1>
            <p class="subhead">${b.heroSub}</p>
            <div style="margin-top: 36px; display: flex; gap: 14px; justify-content: center; flex-wrap: wrap;">
                <a href="#kontakt" class="btn" data-cta="hero-primary">Erstgespräch — Antwort in 24 h</a>
                <a href="${TEL_HREF}" class="btn-ghost" data-cta="tel-hero">Anrufen: ${TEL}</a>
            </div>
            <span class="price-anchor"><strong>Festpreis ab 1.290 €</strong>, einmalig — kein Abo. Erst Entwurf, dann zahlen.</span>
        </div>
    </section>

    <section class="fade-in" style="background: var(--c-alt);">
        <div class="wrap" style="text-align: center;">
            <h2>Was Ihre Branche wirklich braucht.</h2>
            <div class="grid-3" style="text-align: left; max-width: 900px; margin: 56px auto 0;">
${points}
            </div>
        </div>
    </section>

    <section class="fade-in">
        <div class="wrap" style="max-width: 720px; text-align: center;">
            <h2>Handcodiert, kein Baukasten.</h2>
            <p class="muted" style="font-size: 17px; line-height: 1.7; margin-top: 28px;">${b.intro}</p>
            <div style="margin-top: 32px;">
                <a href="/webseite-erstellen-lassen" class="link-arrow">So läuft eine Zusammenarbeit ab &amp; was sie kostet &rarr;</a>
            </div>
        </div>
    </section>

    <section class="fade-in" style="background: var(--c-alt);">
        <div class="wrap" style="text-align: center;">
            <h2>So könnte Ihre Seite arbeiten.</h2>
            <p class="subhead" style="margin-bottom: 40px;">Ein Beispiel aus Ihrer Branche — mit eingebauten Werkzeugen, die Anfragen erzeugen.</p>
            <a class="proof-card" href="${b.demoUrl}">
                <span class="demo-tag">Beispiel · Demo</span>
                <h3>${b.demoLabel} ansehen</h3>
                <p>Eine vollständige, handcodierte Demo-Seite für diese Branche — die gezeigten Betriebe sind beispielhaft, keine realen Kunden.</p>
                <span class="arrow">Live-Demo öffnen &rarr;</span>
            </a>
        </div>
    </section>

    <section class="fade-in">
        <div class="wrap" style="text-align: center;">
            <h2>Häufige Fragen.</h2>
            <div class="faq-grid">
${faqVisible}
            </div>
        </div>
    </section>

    <section class="fade-in" id="kontakt">
        <div class="wrap-xs" style="text-align: center;">
            <h2>Webseite erstellen lassen.</h2>
            <p class="subhead" style="margin-bottom: 36px;">Schreiben Sie uns kurz, was Sie vorhaben — Sie erhalten innerhalb von 24 Stunden eine ehrliche Einschätzung. Kostenlos und unverbindlich.</p>
            <form id="kontakt-form" data-lead="kwd-branche-${b.slug}-form" style="text-align: left; display: flex; flex-direction: column; gap: 12px;">
                <input type="hidden" name="quelle" value="webdesign-fuer-${b.slug}">
                <input type="hidden" name="branche" value="${b.name}">
                <input type="text" name="name" required placeholder="Ihr Name">
                <input type="email" name="email" required placeholder="E-Mail">
                <input type="text" name="website" placeholder="Ihre aktuelle Website (falls vorhanden)">
                <textarea name="message" rows="3" placeholder="Was möchten Sie erreichen?"></textarea>
                <label style="font-size: 12px; color: #86868b; display: flex; gap: 8px; align-items: flex-start; margin: 4px 0;">
                    <input type="checkbox" name="privacy" required style="margin-top: 3px;">
                    Ich stimme der <a href="/datenschutz" style="color: var(--c-ink-muted); text-decoration: underline;">Datenschutzerklärung</a> zu.
                </label>
                <button type="submit" class="submit-btn">Kostenlose Einschätzung anfordern</button>
            </form>
            <p class="muted" style="font-size: 13px; margin-top: 18px;">Lieber telefonisch? <a href="${TEL_HREF}" class="link-arrow" style="font-size: 13px;" data-cta="tel-form">${TEL}</a></p>
        </div>
    </section>

    </main>

    <footer>
        <div class="wrap" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
            <span>&copy; 2026 Karriaro Webdesign · Handcodierte Unikate zum Festpreis</span>
            <div style="display: flex; gap: 20px;">
                <a href="/">Start</a>
                <a href="/webseite-erstellen-lassen">Website erstellen lassen</a>
                <a href="/impressum">Impressum</a>
                <a href="/datenschutz">Datenschutz</a>
            </div>
        </div>
    </footer>

    <script>
        document.getElementById('kontakt-form').addEventListener('submit', function(e) {
            e.preventDefault();
            var form = this;
            var btn = form.querySelector('button');
            btn.textContent = 'Wird gesendet…';
            btn.disabled = true;
            var fd = new FormData(form);
            try { if (window.krAttributionFlat) { var attr = window.krAttributionFlat(); Object.keys(attr).forEach(function (k) { fd.append(k, attr[k]); }); } } catch (err) {}
            try { if (window.krTrack) window.krTrack('Lead Kontakt', { quelle: 'webdesign-fuer-${b.slug}' }); } catch (err) {}
            fetch('https://formspree.io/f/mjggbdre', { method: 'POST', body: fd, headers: { 'Accept': 'application/json' } })
                .then(function(response) { if (response.ok) { window.location.href = '/success.html'; } else { btn.textContent = 'Fehler — bitte erneut versuchen'; btn.disabled = false; } })
                .catch(function() { btn.textContent = 'Fehler — bitte erneut versuchen'; btn.disabled = false; });
        });
        var observer = new IntersectionObserver(function(entries) {
            entries.forEach(function(entry) { if (entry.isIntersecting) { entry.target.classList.add('visible'); observer.unobserve(entry.target); } });
        }, { threshold: 0.12 });
        document.querySelectorAll('.fade-in').forEach(function(el) { observer.observe(el); });
    </script>

</body>
</html>
`;
}

let n = 0;
for (const b of BRANCHEN) {
  const file = join(SRC, 'webdesign-fuer-' + b.slug + '.html');
  writeFileSync(file, buildPage(b));
  n++;
  console.log('  + webdesign-fuer-' + b.slug + '.html  (' + b.name + ')');
}
console.log('\n' + n + ' Branchen-Landingpages generiert.');
