#!/usr/bin/env node
// Sprint 51 — Playwright-Smoke-Test der gesamten Karriaro-Webdesign-Surface.
//
// Was getestet wird:
//   Phase 1 (Page-Load):  HTTP 200, kein Console-Error, H1 sichtbar
//   Phase 2 (Tool-Submit): jedes Live-Tool auf Hauptseite + Sub-Pages fuellen,
//                          submitten und Output-Reveal pruefen.
//
// Bedienung:
//   npm run smoke                 (alle Pages + Tools)
//   npm run smoke -- --quick      (nur Hauptseite + 1 Sub-Page, fuer Iteration)
//   npm run smoke -- --pages      (nur Phase 1)
//
// Voraussetzung: `npm install` + `npx playwright install chromium`.
// Server: das Skript startet selbst `python3 -m http.server` auf Port 8770.

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const SRC_DIR = join(REPO_ROOT, 'src');
const PORT = 8770;
const BASE = `http://127.0.0.1:${PORT}`;

const args = new Set(process.argv.slice(2));
const QUICK = args.has('--quick');
const PAGES_ONLY = args.has('--pages');

// === Page-Set ===
const PAGES = [
    { path: '/', name: 'Hauptseite DE' },
    { path: '/en/', name: 'Hauptseite EN' },
    { path: '/gruender.html', name: 'Gruender-Story' },
    { path: '/blog.html', name: 'Blog-Index' },
    { path: '/blog/core-web-vitals-erklaert.html', name: 'Blog · Core Web Vitals' },
    { path: '/blog/dsgvo-website-checkliste.html', name: 'Blog · DSGVO-Checkliste' },
    { path: '/blog/wordpress-vs-handcode.html', name: 'Blog · WordPress-vs-Handcode' },
    // Portfolio Sub-Pages (8)
    { path: '/portfolio/coaching-lehmann.html', name: 'Portfolio · Coaching' },
    { path: '/portfolio/dachdecker-meisterbetrieb.html', name: 'Portfolio · Dachdecker' },
    { path: '/portfolio/friseur-salon.html', name: 'Portfolio · Friseur' },
    { path: '/portfolio/immobilien-makler.html', name: 'Portfolio · Immobilien' },
    { path: '/portfolio/meisterbetrieb-mueller.html', name: 'Portfolio · Meisterbetrieb' },
    { path: '/portfolio/praxis-weber.html', name: 'Portfolio · Praxis' },
    { path: '/portfolio/restaurant-template.html', name: 'Portfolio · Restaurant' },
    { path: '/portfolio/spedition-schwaben.html', name: 'Portfolio · Spedition' },
    // City-Pages (14)
    { path: '/webdesign-berlin.html', name: 'City · Berlin' },
    { path: '/webdesign-bremen.html', name: 'City · Bremen' },
    { path: '/webdesign-dortmund.html', name: 'City · Dortmund' },
    { path: '/webdesign-dresden.html', name: 'City · Dresden' },
    { path: '/webdesign-duesseldorf.html', name: 'City · Duesseldorf' },
    { path: '/webdesign-essen.html', name: 'City · Essen' },
    { path: '/webdesign-frankfurt.html', name: 'City · Frankfurt' },
    { path: '/webdesign-hamburg.html', name: 'City · Hamburg' },
    { path: '/webdesign-hannover.html', name: 'City · Hannover' },
    { path: '/webdesign-koeln.html', name: 'City · Koeln' },
    { path: '/webdesign-leipzig.html', name: 'City · Leipzig' },
    { path: '/webdesign-muenchen.html', name: 'City · Muenchen' },
    { path: '/webdesign-nuernberg.html', name: 'City · Nuernberg' },
    { path: '/webdesign-stuttgart.html', name: 'City · Stuttgart' }
];

// === Tool-Set (Hauptseite hat Tab-Switcher, Sub-Pages je nur 1 Tool) ===
//
// `subPage` = die Sub-Page-URL, wo dasselbe Tool eingebettet ist.
// `tabKey`  = der Tab-Selector-Wert auf Hauptseite (data-kr-tool).
const TOOLS = [
    {
        branche: 'dachdecker',
        subPage: '/portfolio/dachdecker-meisterbetrieb.html',
        tabKey: 'dachdecker',
        fill: { plz: '70173', flaeche: '140', solar: '0' }
    },
    {
        branche: 'immobilien',
        subPage: '/portfolio/immobilien-makler.html',
        tabKey: 'immobilien',
        fill: { plz: '70173', flaeche: '110', baujahr: '1998' }
    },
    {
        branche: 'praxis',
        subPage: '/portfolio/praxis-weber.html',
        tabKey: 'praxis',
        checkChips: ['kopfschmerz', 'fieber']
    },
    {
        branche: 'friseur',
        subPage: '/portfolio/friseur-salon.html',
        tabKey: 'friseur',
        fill: { form: 'oval', anlass: 'alltag' }
    },
    {
        branche: 'sanitaer',
        subPage: '/portfolio/meisterbetrieb-mueller.html',
        tabKey: 'sanitaer',
        fill: { plz: '70173', art: 'rohrbruch' }
    },
    {
        branche: 'restaurant',
        subPage: '/portfolio/restaurant-template.html',
        tabKey: 'restaurant',
        fill: { gericht: 'fisch', preis: '30-60' }
    },
    {
        branche: 'spedition',
        subPage: '/portfolio/spedition-schwaben.html',
        tabKey: 'spedition',
        fill: { von: '70173', bis: '80331', gewicht: '500' }
    },
    // Coaching ist nur auf Sub-Page, Hauptseite hat keinen Tab dafuer (Sprint 48).
    {
        branche: 'coaching',
        subPage: '/portfolio/coaching-lehmann.html',
        tabKey: null,
        fill: { focus: '4', team: '3', time: '4', energy: '3', 'next-step': '4' }
    }
];

// === Server-Lifecycle ===
function startServer() {
    const srv = spawn('python3', ['-m', 'http.server', String(PORT)], {
        cwd: SRC_DIR,
        stdio: ['ignore', 'pipe', 'pipe']
    });
    return srv;
}

async function waitForServer(maxAttempts = 30) {
    for (let i = 0; i < maxAttempts; i++) {
        try {
            const r = await fetch(BASE + '/');
            if (r.ok) return true;
        } catch (_) { /* not yet */ }
        await sleep(200);
    }
    return false;
}

// === Test-Helpers ===
const results = { passed: 0, failed: 0, failures: [] };

function pass(label) { results.passed++; console.log(`  ✓ ${label}`); }
function fail(label, reason) {
    results.failed++;
    results.failures.push({ label, reason });
    console.log(`  ✗ ${label}\n    → ${reason}`);
}

async function loadPage(page, url, name) {
    const errors = [];
    const consoleErrors = [];
    page.removeAllListeners('pageerror');
    page.removeAllListeners('console');
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (msg) => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    let response;
    try {
        response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 12000 });
    } catch (e) {
        fail(`${name} — Navigation`, e.message);
        return false;
    }

    if (!response || !response.ok()) {
        fail(`${name} — HTTP`, `Status ${response?.status() ?? 'n/a'}`);
        return false;
    }

    // H1 muss existieren + nicht leer
    const h1Count = await page.locator('h1').count();
    if (h1Count === 0) {
        fail(`${name} — H1`, 'kein h1 gefunden');
        return false;
    }

    // Konsolen-Fehler tolerieren wir, aber loggen
    if (errors.length || consoleErrors.length) {
        const msg = [...errors, ...consoleErrors].slice(0, 2).join(' | ');
        fail(`${name} — JS-Errors`, msg);
        return false;
    }

    pass(`${name} — Load`);
    return true;
}

async function fillAndSubmit(page, tool, scope = '') {
    const formSel = `[data-kr-tool-form="${tool.branche}"]`;
    const outputSel = `[data-kr-tool-output="${tool.branche}"]`;
    const label = `${tool.branche}${scope ? ' (' + scope + ')' : ''}`;

    // Wait for the form to be attached (and not be a non-existent panel)
    const form = page.locator(formSel).first();
    try {
        await form.waitFor({ state: 'attached', timeout: 4000 });
    } catch {
        fail(`${label} — Form attach`, `${formSel} nicht gefunden`);
        return;
    }

    // Fill text/number inputs and selects
    if (tool.fill) {
        for (const [name, value] of Object.entries(tool.fill)) {
            const field = form.locator(`[name="${name}"]`).first();
            const tag = await field.evaluate((el) => el.tagName).catch(() => null);
            if (!tag) {
                fail(`${label} — Field`, `[name="${name}"] fehlt`);
                return;
            }
            if (tag === 'SELECT') {
                await field.selectOption(value);
            } else {
                await field.fill(value);
            }
        }
    }

    // Check checkbox chips (max 3, takes first 3)
    if (tool.checkChips) {
        for (const v of tool.checkChips) {
            const cb = form.locator(`input[type="checkbox"][value="${v}"]`).first();
            await cb.check({ force: true });
        }
    }

    // Submit
    const submit = form.locator('button[type="submit"]').first();
    await submit.click();

    // Wait for output to be revealed (.is-revealed class on output element)
    try {
        await page.waitForFunction(
            (sel) => {
                const el = document.querySelector(sel);
                return el && el.classList.contains('is-revealed');
            },
            outputSel,
            { timeout: 4000 }
        );
    } catch {
        fail(`${label} — Output reveal`, 'output bekam keine .is-revealed Klasse');
        return;
    }

    // Check that .kr-tool-output-value contains something non-trivial
    const valueText = await page.locator(`${outputSel} .kr-tool-output-value`).first().innerText().catch(() => '');
    if (!valueText || valueText.trim() === '— €' || valueText.trim() === '—') {
        fail(`${label} — Output value`, `unaufgeloester Wert: "${valueText}"`);
        return;
    }

    pass(`${label} — Submit + Reveal`);
}

// === Hauptlauf ===
async function main() {
    console.log(`Karriaro-Webdesign Smoke-Test ${QUICK ? '(quick)' : ''}\n`);

    console.log('Starting local server...');
    const srv = startServer();
    let exitCode = 0;

    try {
        const ready = await waitForServer();
        if (!ready) throw new Error('Server kam nicht hoch');
        console.log(`Server on ${BASE}\n`);

        const browser = await chromium.launch();
        const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
        const page = await ctx.newPage();

        // === Phase 1: Page-Load ===
        console.log('Phase 1 — Page-Load + H1 + Console-Errors:\n');
        const pagesToTest = QUICK ? PAGES.slice(0, 4) : PAGES;
        for (const p of pagesToTest) {
            await loadPage(page, BASE + p.path, p.name);
        }

        if (!PAGES_ONLY) {
            // === Phase 2: Tools auf Hauptseite ===
            console.log('\nPhase 2a — Tools auf Hauptseite (Tab-Switching):\n');
            await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
            const toolsHaupt = TOOLS.filter(t => t.tabKey);
            const toolsToRun = QUICK ? toolsHaupt.slice(0, 2) : toolsHaupt;
            for (const tool of toolsToRun) {
                // Tab anklicken, damit das Panel sichtbar wird
                const tab = page.locator(`.kr-tools-tab[data-kr-tool="${tool.tabKey}"]`).first();
                if (await tab.count() === 0) {
                    fail(`${tool.branche} — Tab`, `.kr-tools-tab[data-kr-tool="${tool.tabKey}"] nicht gefunden`);
                    continue;
                }
                await tab.click();
                await sleep(150);
                await fillAndSubmit(page, tool, 'Hauptseite');
            }

            // === Phase 2: Tools auf Sub-Pages ===
            console.log('\nPhase 2b — Tools auf Sub-Pages (je 1 Tool pro Page):\n');
            const subPagesToRun = QUICK ? TOOLS.slice(0, 2) : TOOLS;
            for (const tool of subPagesToRun) {
                await page.goto(BASE + tool.subPage, { waitUntil: 'domcontentloaded' });
                await fillAndSubmit(page, tool, 'Sub-Page');
            }
        }

        await browser.close();
    } catch (e) {
        console.error('\nFatal:', e.message);
        exitCode = 2;
    } finally {
        srv.kill('SIGTERM');
    }

    console.log(`\n─── Ergebnis ───`);
    console.log(`Passed: ${results.passed}`);
    console.log(`Failed: ${results.failed}`);
    if (results.failures.length) {
        console.log('\nFehler-Details:');
        results.failures.forEach((f, i) => console.log(`  ${i + 1}. ${f.label}: ${f.reason}`));
        exitCode = exitCode || 1;
    }
    process.exit(exitCode);
}

main();
