#!/usr/bin/env node
/* Sprint 160 — Build-time Lean-HTML-Generator fuer Portfolio-Embed-Previews.
 *
 * Generiert pro Portfolio-Page ein <name>-embed.html (~15 KB statt 53-154 KB).
 * Verwendet als iframe-src in Mobile-Hauptseite Demo-Karten + Sheet-Modal.
 *
 * Eliminiert ~1.4 MB Mobile-Bandbreite-Waste (vs ?embed=hero CSS-Hide-Mode).
 *
 * Was die Lean-HTML enthaelt:
 *   - Minimal <head> (charset, viewport, title, description, embed-hero-CSS)
 *   - System-Font-Stack inline (kein Webfont-Download)
 *   - <section class="hero"> aus Source extrahiert
 *   - NICHTS sonst (keine Nav, Footer, Schema, Scripts, Webfonts, External-CSS)
 *
 * Run: node scripts/build-embed-hero.mjs
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const PORTFOLIO_DIR = join(ROOT, 'src', 'portfolio');

const CACHE_VERSION = 'v=410';

// ────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────

function extract(html, regex, group = 1) {
    const m = html.match(regex);
    return m ? m[group] : null;
}

function extractEmbedHeroStyle(html) {
    // Erster <style>-Block enthaelt die embed-hero CSS-Regeln (Z. 6-20 im Source-Pattern)
    const m = html.match(/<style>\s*\n?\s*html\.embed-hero[\s\S]*?<\/style>/);
    return m ? m[0].replace(/^<style>\s*\n?\s*/, '').replace(/<\/style>$/, '').trim() : '';
}

function extractPageStyle(html) {
    // Zweiter <style>-Block in <head> — page-spezifisches Layout
    // Findet alle <style>-Bloecke, nimmt den zweiten (oder den groessten falls Reihenfolge variiert)
    const styles = [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map(m => m[1]);
    if (styles.length < 2) return '';
    // Skip ersten (embed-hero), nimm den groessten verbleibenden (= page-spezifisch)
    const remaining = styles.slice(1).sort((a, b) => b.length - a.length);
    let css = remaining[0] || '';
    // Strip Webfont-Imports + @font-face Definitions
    css = css.replace(/@import\s+url\(['"]?https?:\/\/fonts\.googleapis\.com[^)]*\)\s*;?/g, '');
    css = css.replace(/@font-face\s*\{[^}]*\}/g, '');
    return css.trim();
}

function extractHeroSection(html) {
    // Lazy Match: erste <section class="hero"> bis erste </section>
    // (alle Portfolio-Pages haben class="hero" als gleicher Selector — verifiziert)
    const m = html.match(/<section class="hero"[^>]*>([\s\S]*?)<\/section>/);
    return m ? m[0] : null;
}

function generateLeanHtml({ title, description, themeColor, embedHeroStyle, pageStyle, heroSection, slug }) {
    return `<!DOCTYPE html>
<html lang="de" class="embed-hero">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <meta name="description" content="${description}">
    <meta name="theme-color" content="${themeColor}">
    <meta name="robots" content="noindex, nofollow">
    <link rel="canonical" href="https://karriaro-webdesign.de/portfolio/${slug}.html">
    <!-- Sprint 160 — Lean-Embed-Page. NO Webfonts, NO Scripts, NO external CSS.
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

/* Embed-Hero-CSS aus Source (Sprint 140-Mode) */
${embedHeroStyle}

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
        .filter(f => f.endsWith('.html') && !f.endsWith('-embed.html'));

    console.log(`\n  Lean-Embed-Build Sprint 160 — ${files.length} Portfolio-Pages\n`);

    let totalSizeBefore = 0;
    let totalSizeAfter = 0;
    let countOk = 0;
    let countFailed = 0;

    files.forEach(file => {
        const sourcePath = join(PORTFOLIO_DIR, file);
        const slug = file.replace(/\.html$/, '');
        const targetPath = join(PORTFOLIO_DIR, `${slug}-embed.html`);

        const source = readFileSync(sourcePath, 'utf8');
        const sourceSize = source.length;
        totalSizeBefore += sourceSize;

        const title = extract(source, /<title>([^<]+)<\/title>/);
        const description = extract(source, /<meta name="description" content="([^"]+)"/);
        const themeColor = extract(source, /<meta name="theme-color" content="([^"]+)"/) || '#1A2E40';
        const embedHeroStyle = extractEmbedHeroStyle(source);
        const pageStyle = extractPageStyle(source);
        const heroSection = extractHeroSection(source);

        if (!title || !heroSection) {
            console.log(`  ✗ ${file}: title=${!!title} hero=${!!heroSection} — skipped`);
            countFailed++;
            return;
        }

        const lean = generateLeanHtml({
            title,
            description: description || '',
            themeColor,
            embedHeroStyle,
            pageStyle,
            heroSection,
            slug
        });

        writeFileSync(targetPath, lean, 'utf8');
        const leanSize = lean.length;
        totalSizeAfter += leanSize;
        const reduction = Math.round(100 - (leanSize / sourceSize) * 100);
        console.log(`  ✓ ${slug}-embed.html (${Math.round(sourceSize/1024)} KB → ${Math.round(leanSize/1024)} KB, -${reduction}%)`);
        countOk++;
    });

    const totalReduction = Math.round(100 - (totalSizeAfter / totalSizeBefore) * 100);
    console.log(`\n  ✓ ${countOk}/${files.length} Lean-Embed-Pages generiert`);
    console.log(`  Total: ${Math.round(totalSizeBefore/1024)} KB → ${Math.round(totalSizeAfter/1024)} KB (-${totalReduction}%)`);
    if (countFailed > 0) {
        console.log(`  ⚠ ${countFailed} skipped (siehe oben)`);
        process.exit(1);
    }
}

main();
