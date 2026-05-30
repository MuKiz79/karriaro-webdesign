#!/usr/bin/env node
/**
 * Sprint Hygiene — Clean-URL-Canonicalization + m-dot Bot-Guard + Sitemap-Freshness.
 *
 * WARUM (Code-Audit 2026-05-30):
 *  - Firebase Hosting laeuft mit `cleanUrls:true` + `trailingSlash:false`:
 *    `/webdesign-stuttgart` wird 200 serviert, `/webdesign-stuttgart.html` 301 -> Clean-Form.
 *    Bisher zeigten ABER alle canonical/og:url/JSON-LD-url/hreflang/interne Links/Sitemap
 *    auf die `.html`-Form => Self-Referencing-Canonical = 301-Redirect, jeder interne Link
 *    ein 301-Hop. Auf junger Domain mit knappem Crawl-Budget schaedlich.
 *  - `/en/` (Trailing-Slash) 301 -> `/en` (trailingSlash:false). hreflang/Sitemap angleichen.
 *  - Der mobile-Redirect-IIFE (in allen Desktop-Seiten) matcht per /Android|Mobile/ auch
 *    Googlebot-Smartphone (Mobile-First-Crawler) und schickt ihn per location.replace auf
 *    m.karriaro-webdesign.de. Bot-UAs werden jetzt vom Redirect ausgenommen.
 *
 * SICHER & KONSERVATIV:
 *  - Dateien werden NICHT umbenannt — nur Referenzen im Inhalt umgeschrieben.
 *  - `-embed`-Iframe-Ziele (Sprint-140-Demo-System) bleiben unberuehrt.
 *  - `src/m/**` (generiert) wird ausgelassen — Mobile erbt nach `build:mobile` die Quelle.
 *  - Idempotent: erneutes Ausfuehren aendert nichts.
 *
 * Lauf: `node scripts/canonicalize-urls.mjs`  (danach: npm run smoke && npm run build:mobile)
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src');
const SPRINT_DATE = '2026-05-30';

const BOT_GUARD =
  'if(/bot|crawl|spider|slurp|mediapartners|googlebot|google-extended|bingpreview|gptbot|oai-searchbot|chatgpt|claudebot|claude-web|anthropic|perplexity|applebot|ccbot|facebookbot|facebookexternalhit|meta-external|bytespider|amazonbot|duckduckbot|yandex|baidu|lighthouse|pagespeed|headless|prerender/i.test(ua))return;';
const GUARD_MARKER = 'lighthouse|pagespeed|headless';

function walkHtml(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (dir === SRC && entry === 'm') continue; // src/m/** = generiert, auslassen
      walkHtml(p, acc);
    } else if (entry.endsWith('.html')) acc.push(p);
  }
  return acc;
}

// --- Transforms ---------------------------------------------------------------
// 1) Absolute Eigen-Domain-URLs: ".html" entfernen (ausser -embed)
const stripHtmlAbsolute = (s) =>
  s.replace(/(https:\/\/karriaro-webdesign\.de\/[A-Za-z0-9/_-]+?)\.html\b/g,
    (m, base) => (base.includes('-embed') ? m : base));

// 2) Root-relative interne Links href="/...html" (ausser -embed); behaelt #fragment
const stripHtmlRootRel = (s) =>
  s.replace(/(href=")(\/[A-Za-z0-9/_-]+?)\.html(["#])/g,
    (m, pre, path, tail) => (path.includes('-embed') ? m : pre + path + tail));

// 3) /en/ -> /en (Trailing-Slash), absolut + root-relativ; Root "/" bleibt unberuehrt
const fixEnTrailingSlash = (s) =>
  s.replace(/(https:\/\/karriaro-webdesign\.de\/en)\/(?=["'<) ])/g, '$1')
   .replace(/(href=")\/en\/(")/g, '$1/en$2');

// 4) Bot-Guard in den mobile-Redirect-IIFE injizieren (idempotent)
const injectBotGuard = (s) =>
  (s.includes('var isMobileUA=') && !s.includes(GUARD_MARKER))
    ? s.replace('var ua=navigator.userAgent||"";var isMobileUA=',
        `var ua=navigator.userAgent||"";${BOT_GUARD}var isMobileUA=`)
    : s;

// --- Anwenden -----------------------------------------------------------------
const htmlFiles = walkHtml(SRC);
const extraFiles = ['sitemap.xml', 'llms.txt', 'llms-full.txt'].map((f) => join(SRC, f));

let changed = 0;
const apply = (file, fns) => {
  const before = readFileSync(file, 'utf8');
  let after = before;
  for (const fn of fns) after = fn(after);
  if (after !== before) {
    writeFileSync(file, after);
    changed++;
    console.log('  ✓', relative(ROOT, file));
  }
};

console.log('HTML (src/, ohne m/):');
for (const f of htmlFiles) apply(f, [stripHtmlAbsolute, stripHtmlRootRel, fixEnTrailingSlash, injectBotGuard]);

console.log('Sitemap / LLM-Dateien:');
for (const f of extraFiles) {
  apply(f, [
    stripHtmlAbsolute,
    fixEnTrailingSlash,
    (s) => s.replace(/<lastmod>2026-05-15<\/lastmod>/g, `<lastmod>${SPRINT_DATE}</lastmod>`),
  ]);
}

console.log(`\nFertig. ${changed} Datei(en) geaendert. (Dateinamen unveraendert; cleanUrls serviert .html-lose Form.)`);
