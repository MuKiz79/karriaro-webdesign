#!/usr/bin/env node
/* Sprint 160/162 — Build-time Lean-HTML-Generator fuer Portfolio-Embed-Previews.
 *
 * Generiert PRO Portfolio-Page ZWEI Lean-Varianten:
 *   - <name>-embed.html         (Mobile-Layout, fuer Sheet-Modal)
 *   - <name>-embed-desktop.html (Desktop-Layout 1280x1024, fuer Demo-Card-iframes Sprint 162)
 *
 * Beide Varianten teilen sich denselben Generator-Code; nur die HTML-Class
 * unterscheidet sich (embed-hero vs embed-desktop). Beide CSS-Bloecke sind
 * im ersten <style>-Tag der Source-Pages → werden in beide Lean-Files
 * eingebettet, das jeweils greifende Regelset wird via class aktiviert.
 *
 * Was die Lean-HTML enthaelt:
 *   - Minimal <head> (charset, viewport, title, description, embed-CSS)
 *   - System-Font-Stack inline (kein Webfont-Download)
 *   - <section class="hero"> aus Source extrahiert
 *   - NICHTS sonst (keine Nav, Footer, Schema, Scripts, Webfonts, External-CSS)
 *
 * Run: node scripts/build-embed-hero.mjs
 */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const PORTFOLIO_DIR = join(ROOT, 'src', 'portfolio');

const CACHE_VERSION = 'v=412';

// ────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────

function extract(html, regex, group = 1) {
    const m = html.match(regex);
    return m ? m[group] : null;
}

function extractEmbedHeroStyle(html) {
    // Erster <style>-Block enthaelt BEIDE embed-hero + embed-desktop CSS-Regeln
    // (Z. 6-20 im Source-Pattern). Wird in beide Lean-Varianten eingebettet;
    // jeweilige <html class="embed-hero|embed-desktop"> aktiviert das richtige Regelset.
    const m = html.match(/<style>\s*\n?\s*html\.embed-hero[\s\S]*?<\/style>/);
    return m ? m[0].replace(/^<style>\s*\n?\s*/, '').replace(/<\/style>$/, '').trim() : '';
}

function extractPageStyle(html) {
    // Zweiter <style>-Block in <head> — page-spezifisches Layout
    const styles = [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map(m => m[1]);
    if (styles.length < 2) return '';
    const remaining = styles.slice(1).sort((a, b) => b.length - a.length);
    let css = remaining[0] || '';
    css = css.replace(/@import\s+url\(['"]?https?:\/\/fonts\.googleapis\.com[^)]*\)\s*;?/g, '');
    css = css.replace(/@font-face\s*\{[^}]*\}/g, '');
    return css.trim();
}

function extractHeroSection(html) {
    const m = html.match(/<section class="hero"[^>]*>([\s\S]*?)<\/section>/);
    return m ? m[0] : null;
}

function generateLeanHtml({ title, description, themeColor, embedStyle, pageStyle, heroSection, slug, mode }) {
    // mode = 'hero' (Mobile) or 'desktop' (Demo-Card-iframe 1280x1024)
    const htmlClass = mode === 'desktop' ? 'embed-desktop' : 'embed-hero';
    const sprintNote = mode === 'desktop'
        ? 'Sprint 162 — Lean-Desktop-Embed fuer Demo-Card-iframes (1280x1024).'
        : 'Sprint 160 — Lean-Mobile-Embed fuer Sheet-Modal.';
    return `<!DOCTYPE html>
<html lang="de" class="${htmlClass}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <meta name="description" content="${description}">
    <meta name="theme-color" content="${themeColor}">
    <meta name="robots" content="noindex, nofollow">
    <link rel="canonical" href="https://karriaro-webdesign.de/portfolio/${slug}.html">
    <!-- ${sprintNote} NO Webfonts, NO Scripts, NO external CSS.
         Generated von scripts/build-embed-hero.mjs. Cache-Bust ${CACHE_VERSION}. -->
    <style>
/* System-Font-Stack (Apple-HIG-Fallback, kein Webfont-Download) */
html, body {
    font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    margin: 0;
    background: #fff;
}
* { box-sizing: border-box; }
img { max-width: 100%; height: auto; }
a { color: inherit; text-decoration: none; }

/* Embed-CSS aus Source (beide embed-hero + embed-desktop Regeln) */
${embedStyle}

/* Page-spezifisches Layout (Branchen-Brand-Tokens + Hero-Style) */
${pageStyle}
    </style>
</head>
<body>
${heroSection}
</body>
</html>
`;
}

// ────────────────────────────────────────────────────────────────
// Main
// ────────────────────────────────────────────────────────────────

function main() {
    const files = readdirSync(PORTFOLIO_DIR)
        .filter(f => f.endsWith('.html') && !f.endsWith('-embed.html') && !f.endsWith('-embed-desktop.html'));

    console.log(`\n  Lean-Embed-Build Sprint 162 — ${files.length} Portfolio-Pages (Mobile + Desktop)\n`);

    let totalSizeBefore = 0;
    let totalSizeAfter = 0;
    let countOk = 0;
    let countFailed = 0;

    files.forEach(file => {
        const sourcePath = join(PORTFOLIO_DIR, file);
        const slug = file.replace(/\.html$/, '');

        const source = readFileSync(sourcePath, 'utf8');
        const sourceSize = source.length;
        totalSizeBefore += sourceSize;

        const title = extract(source, /<title>([^<]+)<\/title>/);
        const description = extract(source, /<meta name="description" content="([^"]+)"/);
        const themeColor = extract(source, /<meta name="theme-color" content="([^"]+)"/) || '#1A2E40';
        const embedStyle = extractEmbedHeroStyle(source);
        const pageStyle = extractPageStyle(source);
        const heroSection = extractHeroSection(source);

        if (!title || !heroSection) {
            console.log(`  ✗ ${file}: title=${!!title} hero=${!!heroSection} — skipped`);
            countFailed++;
            return;
        }

        // Mobile-Variante (-embed.html) — Sheet-Modal
        const leanMobile = generateLeanHtml({
            title, description: description || '', themeColor,
            embedStyle, pageStyle, heroSection, slug, mode: 'hero'
        });
        const mobilePath = join(PORTFOLIO_DIR, `${slug}-embed.html`);
        writeFileSync(mobilePath, leanMobile, 'utf8');

        // Desktop-Variante (-embed-desktop.html) — Demo-Card-iframes Sprint 162
        const leanDesktop = generateLeanHtml({
            title, description: description || '', themeColor,
            embedStyle, pageStyle, heroSection, slug, mode: 'desktop'
        });
        const desktopPath = join(PORTFOLIO_DIR, `${slug}-embed-desktop.html`);
        writeFileSync(desktopPath, leanDesktop, 'utf8');

        const mobileSize = leanMobile.length;
        const desktopSize = leanDesktop.length;
        totalSizeAfter += mobileSize + desktopSize;
        const mobileReduction = Math.round(100 - (mobileSize / sourceSize) * 100);
        const desktopReduction = Math.round(100 - (desktopSize / sourceSize) * 100);
        console.log(`  ✓ ${slug}: source ${Math.round(sourceSize/1024)} KB → embed ${Math.round(mobileSize/1024)} KB (-${mobileReduction}%) + embed-desktop ${Math.round(desktopSize/1024)} KB (-${desktopReduction}%)`);
        countOk++;
    });

    console.log(`\n  ✓ ${countOk}/${files.length} Pages × 2 Varianten = ${countOk * 2} Lean-Embed-Files generiert`);
    console.log(`  Source-Total: ${Math.round(totalSizeBefore/1024)} KB → Lean-Total: ${Math.round(totalSizeAfter/1024)} KB`);
    if (countFailed > 0) {
        console.log(`  ⚠ ${countFailed} skipped (siehe oben)`);
        process.exit(1);
    }
}

main();
