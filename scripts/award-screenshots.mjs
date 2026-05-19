#!/usr/bin/env node
/**
 * Sprint 135 — Award-Submission-Screenshots Generator.
 *
 * Erzeugt 5 Submission-fertige Mockups für Apple Design Awards / FWA /
 * Awwwards in iPhone-16-Pro-Native-Resolution (1290×2796 @ 3× retina).
 *
 *   1. Hero       — Magazine-Cover mit Folio-Marker, Marginalia, Siegel-Embossing
 *   2. Demos      — Brand-Color-Vitrine (Stadtmakler Indigo) + Pin-Spy "02 / 06"
 *   3. Personas   — Persona-Tile-Grid + Body-BG-Shift cream-warmer
 *   4. Deep-Moment — Hero-zu-Demos-Transition (Mid-Scroll, Body-BG morph aktiv)
 *   5. Dark-Mode  — Hero in Dark-Variant (Editorial-Dark-Palette)
 *
 *   Output: award-submissions/screenshots/
 *
 * Lauf:  node scripts/award-screenshots.mjs
 *        Optionale Flags: --light-only, --dark-only
 */

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SRC = join(ROOT, 'src');
const OUT_DIR = join(ROOT, 'award-submissions', 'screenshots');
const PORT = 8895;

// iPhone 16 Pro native: 393×852 logical, 1179×2556 physical @ 3× — Submission-
// Standard für Apple/Awwwards/FWA. CSS-Pixel-Dim 393×852, deviceScaleFactor 3.
const IPHONE_16_PRO = {
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 3,
};

function startHttpServer() {
    return new Promise((resolveServer) => {
        const server = spawn('python3', ['-m', 'http.server', String(PORT)], {
            cwd: SRC,
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        server.stderr.on('data', () => {});
        setTimeout(() => resolveServer(server), 800);
    });
}

function bytes(filePath) {
    return existsSync(filePath) ? statSync(filePath).size : 0;
}

function formatKb(b) {
    return (b / 1024).toFixed(1) + ' KB';
}

async function capturePage(browser, { url, scrollTarget, scrollOffsetY, label, file, colorScheme, waitMs = 1500 }) {
    const ctx = await browser.newContext({
        ...IPHONE_16_PRO,
        colorScheme: colorScheme || 'light',
    });
    const page = await ctx.newPage();
    process.stdout.write(`  ${label.padEnd(28)} → `);
    try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 12000 });
        await page.waitForTimeout(waitMs);
        if (scrollTarget) {
            await page.evaluate((sel) => {
                const el = document.querySelector(sel);
                if (el) el.scrollIntoView({ block: 'start' });
            }, scrollTarget);
            await page.waitForTimeout(800);
        }
        if (typeof scrollOffsetY === 'number' && scrollOffsetY !== 0) {
            await page.evaluate((y) => window.scrollBy({ top: y, behavior: 'instant' }), scrollOffsetY);
            await page.waitForTimeout(600);
        }
        const outPath = join(OUT_DIR, file);
        await page.screenshot({ path: outPath, type: 'jpeg', quality: 92 });
        console.log(`${file} (${formatKb(bytes(outPath))})`);
    } catch (err) {
        console.log(`FAIL: ${err.message}`);
    } finally {
        await ctx.close();
    }
}

async function main() {
    const args = process.argv.slice(2);
    const lightOnly = args.includes('--light-only');
    const darkOnly = args.includes('--dark-only');

    console.log('Sprint 135 — Award-Submission-Screenshots');
    console.log(`  Viewport: ${IPHONE_16_PRO.viewport.width}×${IPHONE_16_PRO.viewport.height} @ ${IPHONE_16_PRO.deviceScaleFactor}× retina`);
    console.log(`  Output:   ${OUT_DIR}\n`);

    mkdirSync(OUT_DIR, { recursive: true });

    const server = await startHttpServer();
    process.on('exit', () => { try { server.kill(); } catch {} });
    process.on('SIGINT', () => { try { server.kill(); } catch {} process.exit(130); });

    const browser = await chromium.launch();
    const url = `http://localhost:${PORT}/m/index.html`;
    let count = 0;

    if (!darkOnly) {
        console.log('LIGHT-MODE captures:');
        await capturePage(browser, {
            url, label: '01-hero-cover',
            file: '01-hero-cover-light.jpg',
            scrollTarget: null,
            colorScheme: 'light',
        });
        count++;
        await capturePage(browser, {
            url, label: '02-demos-stadtmakler',
            file: '02-demos-stadtmakler-light.jpg',
            scrollTarget: '#demos',
            colorScheme: 'light',
        });
        count++;
        await capturePage(browser, {
            url, label: '03-personas-index',
            file: '03-personas-light.jpg',
            scrollTarget: '#branchen',
            colorScheme: 'light',
        });
        count++;
        await capturePage(browser, {
            url, label: '04-deep-moment-transition',
            file: '04-deep-moment-light.jpg',
            // Hero-zu-Demos-Übergang: scroll auf Hero-end + 400 px (während BG-shift aktiv)
            scrollTarget: '.hero-with-photo',
            scrollOffsetY: 700,
            colorScheme: 'light',
        });
        count++;
        await capturePage(browser, {
            url, label: '05-siegel-page',
            file: '05-siegel-light.jpg',
            scrollTarget: '.m-mag-siegel',
            colorScheme: 'light',
        });
        count++;
    }

    if (!lightOnly) {
        console.log('\nDARK-MODE captures:');
        await capturePage(browser, {
            url, label: '06-hero-cover-dark',
            file: '06-hero-cover-dark.jpg',
            scrollTarget: null,
            colorScheme: 'dark',
        });
        count++;
        await capturePage(browser, {
            url, label: '07-demos-stadtmakler-dark',
            file: '07-demos-stadtmakler-dark.jpg',
            scrollTarget: '#demos',
            colorScheme: 'dark',
        });
        count++;
    }

    // Sprint 135 — OG-Image (1200×630) für Social-Cards + Award-Submission-Cover
    console.log('\nOG-IMAGE capture:');
    const ogCtx = await browser.newContext({
        viewport: { width: 1200, height: 630 },
        deviceScaleFactor: 2,
    });
    const ogPage = await ogCtx.newPage();
    const ogTemplatePath = resolve(__dirname, 'og-image-template.html');
    const ogTemplateUrl = 'file://' + ogTemplatePath;
    process.stdout.write('  og-image-mobile           → ');
    try {
        await ogPage.goto(ogTemplateUrl, { waitUntil: 'networkidle', timeout: 12000 });
        await ogPage.waitForTimeout(800);
        const ogOutDir = resolve(ROOT, 'src', 'images');
        const ogOutPath = join(ogOutDir, 'og-image-mobile.jpg');
        const ogSubmissionPath = join(OUT_DIR, '08-og-image-mobile.jpg');
        await ogPage.screenshot({ path: ogOutPath, type: 'jpeg', quality: 92 });
        await ogPage.screenshot({ path: ogSubmissionPath, type: 'jpeg', quality: 92 });
        console.log(`og-image-mobile.jpg (${formatKb(bytes(ogOutPath))})`);
        count++;
    } catch (err) {
        console.log(`FAIL: ${err.message}`);
    }
    await ogCtx.close();

    await browser.close();
    server.kill();

    console.log(`\n  ✓ ${count} Award-Assets captured in ${OUT_DIR}`);
}

main().catch((err) => {
    console.error('Fatal:', err);
    process.exit(1);
});
