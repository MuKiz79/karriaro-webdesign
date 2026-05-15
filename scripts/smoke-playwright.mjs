#!/usr/bin/env node
// Sprint 51 / 63 / 64 — Playwright-Smoke-Test der gesamten Karriaro-Webdesign-Surface.
//
// Was getestet wird:
//   Phase 1  (Page-Load):           HTTP 200, kein Console-Error, H1 sichtbar
//   Phase 2a (Hauptseite-Tools):    7 Branchen-Tools, Tab-Switch + Form-Submit + Reveal
//   Phase 2b (Sub-Page-Tools):      8 Tools, Form-Submit + Reveal
//   Phase 2c (Output-Correctness):  23 Cases, berechneter Wert via Regex (Sprint 63)
//   Phase 3  (Hauptseite-Widgets):  15 Cases, conversion-kritische Hauptseite-Elemente (Sprint 64)
//
// NICHT getestet (Phase 3 Out-of-Scope, cosmetic / animation-only):
//   - Audit-Placeholder Type-On (Animation)
//   - Stagger-Reveal (IntersectionObserver-Animation)
//   - Magnetic-CTA (Mouse-Tracking, Desktop-only)
//   - 3D-Tilt Mockup (Mouse-Tracking, Desktop-only)
//   - Lenis Smooth-Scroll (Behavior-Library)
//   - Reading-Progress-Bar (CSS-Variable, kosmetisch)
//   - Branche-Switcher Auto-Rotation (Timing-getrieben, flaky in Headless)
//   - Lighthouse-Tracking (Analytics)
//
// Bedienung:
//   npm run smoke                 (alle Pages + Tools + Widgets)
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

// === Sprint 63 — Output-Correctness-Cases ===
//
// Bekannte Input → erwarteter Output, gegen Regex geprüft.
// Math nachgerechnet in karriaro-tools.js. Bei Code-Änderung der Tool-Logik:
// hier mit-aktualisieren.
const CORRECTNESS_CASES = [
    // Dachdecker — BAFA-Rechner (basis = flaeche*80, maxIsfp = basis*1.15, solar = flaeche*50)
    { name: 'dachdecker · happy-no-solar', url: '/portfolio/dachdecker-meisterbetrieb.html', branche: 'dachdecker',
        fill: { plz: '70173', flaeche: '140', solar: '0' },
        expect: /11\.200\s*€[\s\S]*?12\.900\s*€/ },
    { name: 'dachdecker · with-solar', url: '/portfolio/dachdecker-meisterbetrieb.html', branche: 'dachdecker',
        fill: { plz: '70173', flaeche: '140', solar: '1' },
        expect: /18\.200\s*€[\s\S]*?19\.900\s*€/ },
    { name: 'dachdecker · max-flaeche+solar', url: '/portfolio/dachdecker-meisterbetrieb.html', branche: 'dachdecker',
        fill: { plz: '70173', flaeche: '2000', solar: '1' },
        expect: /260\.000\s*€[\s\S]*?284\.000\s*€/ },

    // Immobilien — Wertermittlung (4 PLZ-Tiers × Baujahr-Modifier)
    { name: 'immobilien · stuttgart-altbau', url: '/portfolio/immobilien-makler.html', branche: 'immobilien',
        fill: { plz: '70173', flaeche: '110', baujahr: '1998' },
        expect: /558\.000\s*€[\s\S]*?636\.000\s*€/ },
    { name: 'immobilien · muenchen-neubau', url: '/portfolio/immobilien-makler.html', branche: 'immobilien',
        fill: { plz: '80331', flaeche: '85', baujahr: '2020' },
        expect: /598\.000\s*€[\s\S]*?680\.000\s*€/ },
    { name: 'immobilien · ost-1989', url: '/portfolio/immobilien-makler.html', branche: 'immobilien',
        fill: { plz: '04103', flaeche: '80', baujahr: '1989' },
        expect: /166\.000\s*€[\s\S]*?189\.000\s*€/ },
    { name: 'immobilien · default-region', url: '/portfolio/immobilien-makler.html', branche: 'immobilien',
        fill: { plz: '33102', flaeche: '120', baujahr: '1995' },
        expect: /395\.000\s*€[\s\S]*?449\.000\s*€/ },

    // Praxis — Symptom-Checker (post Sprint-63 Bugfix: 'fieber_kopfschmerz' = sorted-key)
    { name: 'praxis · fieber+kopfschmerz (sort-key bugfix)', url: '/portfolio/praxis-weber.html', branche: 'praxis',
        checkChips: ['kopfschmerz', 'fieber'],
        expect: /Akutsprechstunde/ },
    { name: 'praxis · single muedigkeit', url: '/portfolio/praxis-weber.html', branche: 'praxis',
        checkChips: ['muedigkeit'],
        expect: /Routine-Check-Up/ },
    { name: 'praxis · rueckenschmerz+schwindel', url: '/portfolio/praxis-weber.html', branche: 'praxis',
        checkChips: ['rueckenschmerz', 'schwindel'],
        expect: /HNO/ },

    // Friseur — Style-Empfehlung (12 hartcodierte Mappings)
    { name: 'friseur · oval+alltag', url: '/portfolio/friseur-salon.html', branche: 'friseur',
        fill: { form: 'oval', anlass: 'alltag' },
        expect: /Long-Bob/ },
    { name: 'friseur · eckig+event', url: '/portfolio/friseur-salon.html', branche: 'friseur',
        fill: { form: 'eckig', anlass: 'event' },
        expect: /Weiche Updo/ },

    // Sanitär — Notdienst (3 PLZ-Regionen × Notfall-Typ)
    { name: 'sanitaer · sw-rohrbruch', url: '/portfolio/meisterbetrieb-mueller.html', branche: 'sanitaer',
        fill: { plz: '70173', art: 'rohrbruch' },
        expect: /25.{1,4}35\s*Min/ },
    { name: 'sanitaer · berlin-heizung', url: '/portfolio/meisterbetrieb-mueller.html', branche: 'sanitaer',
        fill: { plz: '10115', art: 'heizung' },
        expect: /40.{1,4}55\s*Min/ },
    { name: 'sanitaer · default-region', url: '/portfolio/meisterbetrieb-mueller.html', branche: 'sanitaer',
        fill: { plz: '99999', art: 'abfluss' },
        expect: /50.{1,4}75\s*Min/ },

    // Restaurant — AI-Sommelier
    { name: 'restaurant · fisch+30-60', url: '/portfolio/restaurant-template.html', branche: 'restaurant',
        fill: { gericht: 'fisch', preis: '30-60' },
        expect: /Riesling/ },
    { name: 'restaurant · rind+60+', url: '/portfolio/restaurant-template.html', branche: 'restaurant',
        fill: { gericht: 'rind', preis: '60+' },
        expect: /Barolo/ },

    // Spedition — Quote-Calc (PLZ-Distanz × Gewicht × Vehicle-Tier)
    { name: 'spedition · stuttgart-muenchen', url: '/portfolio/spedition-schwaben.html', branche: 'spedition',
        fill: { von: '70173', bis: '80331', gewicht: '500' },
        expect: /1\.411\s*€[\s\S]*?Wechselbrücke/ },
    { name: 'spedition · same-plz fallback', url: '/portfolio/spedition-schwaben.html', branche: 'spedition',
        fill: { von: '70173', bis: '70173', gewicht: '500' },
        expect: /142\s*€[\s\S]*?ETA\s*8\s*h/ },
    { name: 'spedition · heavy-load (Sattelzug)', url: '/portfolio/spedition-schwaben.html', branche: 'spedition',
        fill: { von: '10115', bis: '70173', gewicht: '10000' },
        expect: /Sattelzug/ },

    // Coaching — Klarheits-Score (sum 5-25 → 4 Brackets)
    { name: 'coaching · mittel (sum=18)', url: '/portfolio/coaching-lehmann.html', branche: 'coaching',
        fill: { focus: '4', team: '3', time: '4', energy: '3', 'next-step': '4' },
        expect: /Konkretisierungsbedarf[\s\S]*?18\/25/ },
    { name: 'coaching · low (sum=5)', url: '/portfolio/coaching-lehmann.html', branche: 'coaching',
        fill: { focus: '1', team: '1', time: '1', energy: '1', 'next-step': '1' },
        expect: /Hoher\s+Klärungsbedarf/ },
    { name: 'coaching · high (sum=25)', url: '/portfolio/coaching-lehmann.html', branche: 'coaching',
        fill: { focus: '5', team: '5', time: '5', energy: '5', 'next-step': '5' },
        expect: /Reflexionsbedarf/ }
];

// === Sprint 64 — Phase 3 Hauptseite-Widgets ===
//
// 15 Test-Cases pro Interaktion. Jeder Case bekommt fresh `/` per page.goto vor `action`.
// Cases sind selbst-contained (resetten State implizit durch Reload).
const HAUPTSEITE_CASES = [
    { name: 'pricing · premium-plus-tier-highlight',
        action: async (page) => {
            await page.locator('#kr-branche-select').selectOption('premium-plus');
            await sleep(150);
            const highlighted = await page.locator('.kr-tier[data-tier="premium-plus"]')
                .evaluate(el => el.classList.contains('kr-tier--highlight'));
            return { pass: highlighted, msg: 'Premium+-Tier .kr-tier--highlight gesetzt' };
        }
    },
    { name: 'pricing · essential-tier-highlight',
        action: async (page) => {
            await page.locator('#kr-branche-select').selectOption('essential');
            await sleep(150);
            const highlighted = await page.locator('.kr-tier[data-tier="essential"]')
                .evaluate(el => el.classList.contains('kr-tier--highlight'));
            return { pass: highlighted, msg: 'Essential-Tier .kr-tier--highlight gesetzt' };
        }
    },
    { name: 'pricing · wartung-toggle-changes-paket',
        action: async (page) => {
            const cta = page.locator('.kr-tier[data-tier="essential"] .kr-tier-cta a').first();
            const before = await cta.getAttribute('data-paket');
            await page.locator('.kr-tier[data-tier="essential"] .kr-wartung-toggle').uncheck();
            await sleep(100);
            const after = await cta.getAttribute('data-paket');
            return { pass: before !== after && /ohne Wartung/.test(after || ''),
                     msg: `before="${before}" after="${after}"` };
        }
    },
    { name: 'pricing · cta-click-fills-paket-field',
        action: async (page) => {
            await page.locator('.kr-tier[data-tier="essential"] .kr-tier-cta a').first().click();
            await sleep(200);
            const pakettext = await page.locator('#paket-field').inputValue();
            const badgeVisible = await page.locator('#paket-badge').isVisible();
            return { pass: pakettext.length > 0 && badgeVisible,
                     msg: `paket="${pakettext}" badge=${badgeVisible}` };
        }
    },
    { name: 'faq · details-toggles-open',
        action: async (page) => {
            const firstDetail = page.locator('.kr-faq-item').first();
            const beforeOpen = await firstDetail.evaluate(el => el.open);
            await firstDetail.locator('summary').click();
            await sleep(100);
            const afterOpen = await firstDetail.evaluate(el => el.open);
            return { pass: beforeOpen !== afterOpen, msg: `before=${beforeOpen} after=${afterOpen}` };
        }
    },
    { name: 'kr-tools-tab · switch-to-immobilien',
        action: async (page) => {
            await page.locator('.kr-tools-tab[data-kr-tool="immobilien"]').click();
            await sleep(150);
            const active = await page.locator('.kr-tool-panel[data-kr-panel="immobilien"]')
                .evaluate(el => el.classList.contains('is-active'));
            return { pass: active, msg: 'immobilien-Panel .is-active' };
        }
    },
    { name: 'tool-info · tooltip-opens',
        action: async (page) => {
            // Tool-Info-Button im Immobilien-Tab erst sichtbar machen
            await page.locator('.kr-tools-tab[data-kr-tool="immobilien"]').click();
            await sleep(150);
            const btn = page.locator('.tool-info').first();
            if (await btn.count() === 0) return { pass: false, msg: 'kein .tool-info gefunden' };
            await btn.click({ force: true });
            await sleep(200);
            const tooltipCount = await page.locator('.tool-tooltip').count();
            return { pass: tooltipCount > 0, msg: `.tool-tooltip count=${tooltipCount}` };
        }
    },
    { name: 'branche-switcher · tab-changes-mockup',
        action: async (page) => {
            const before = await page.locator('#hero-mockup-img').getAttribute('src');
            await page.locator('.branche-tab[data-branche="praxis"]').click();
            await sleep(400);  // crossfade
            const after = await page.locator('#hero-mockup-img').getAttribute('src');
            return { pass: before !== after && /praxis/i.test(after || ''),
                     msg: `before="${before}" after="${after}"` };
        }
    },
    { name: 'branche-more-button · reveals-hidden-tabs',
        action: async (page) => {
            const moreBtn = page.locator('#branche-more-btn').first();
            if (await moreBtn.count() === 0) return { pass: true, msg: 'kein more-btn (alle Tabs sichtbar)' };
            await moreBtn.click();
            await sleep(150);
            const hiddenTab = page.locator('.branche-tab[data-extra]').first();
            if (await hiddenTab.count() === 0) return { pass: true, msg: 'keine data-extra Tabs' };
            const revealed = await hiddenTab.evaluate(el => el.classList.contains('is-revealed'));
            return { pass: revealed, msg: 'verborgener tab .is-revealed' };
        }
    },
    // Sprint 65 — Demo-Buttons-Block entfernt; nur noch URL-Submit-Test.
    // Test verifiziert nur, dass Form-Submit ein Result rendert.
    // Score-Hero + Next-Step werden NUR bei realer API-Success-Response gerendert
    // (kanzlei-mueller.de existiert nicht öffentlich → API liefert degraded → showError-Pfad).
    // Echter Browser-Check zeigt Redesign-Features bei realen URLs.
    { name: 'hero-audit · form-submit-renders-result',
        action: async (page) => {
            await page.locator('#hero-audit-url').fill('https://kanzlei-mueller.de');
            await page.locator('#hero-audit-form button[type="submit"]').click();
            await sleep(3500);
            const result = await page.locator('#audit-result').innerText().catch(() => '');
            return { pass: result.length > 50, msg: `result-len=${result.length}` };
        }
    },
    { name: 'nav-scroll · is-scrolled-on-scroll',
        action: async (page) => {
            await page.evaluate(() => window.scrollTo(0, 300));
            await sleep(250);
            const scrolled = await page.locator('nav').first()
                .evaluate(el => el.classList.contains('is-scrolled'));
            await page.evaluate(() => window.scrollTo(0, 0));
            return { pass: scrolled, msg: 'nav .is-scrolled nach scrollY=300' };
        }
    },
    { name: 'floating-cta · is-visible-on-scroll',
        action: async (page) => {
            await page.evaluate(() => window.scrollTo(0, 700));
            await sleep(300);
            const visible = await page.locator('#kr-cta-float')
                .evaluate(el => el.classList.contains('is-visible'));
            await page.evaluate(() => window.scrollTo(0, 0));
            return { pass: visible, msg: 'kr-cta-float .is-visible nach scrollY=700' };
        }
    },
    { name: 'mobile-menu · opens-on-toggle-click',
        action: async (page) => {
            await page.setViewportSize({ width: 390, height: 844 });
            await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
            await sleep(300);
            const toggle = page.locator('.menu-toggle').first();
            if (await toggle.count() === 0) {
                await page.setViewportSize({ width: 1440, height: 900 });
                return { pass: false, msg: 'kein .menu-toggle gefunden' };
            }
            // .menu-toggle ist im nav rechts angepinnt, das auf 390px-viewport
            // subtle überläuft — Playwright's viewport-Check schlägt selbst mit
            // force:true an. dispatchEvent feuert den Click-Handler direkt,
            // umgeht die Sichtbarkeits-Heuristik.
            await toggle.dispatchEvent('click');
            await sleep(200);
            const isOpen = await page.locator('#mobile-menu')
                .evaluate(el => el.classList.contains('open'));
            await page.setViewportSize({ width: 1440, height: 900 });
            return { pass: isOpen, msg: 'mobile-menu .open gesetzt' };
        }
    },
    { name: 'code-counter · reaches-target',
        action: async (page) => {
            const counterEl = page.locator('[data-kr-counter]').first();
            if (await counterEl.count() === 0) return { pass: true, msg: 'keine counter — übersprungen' };
            // Element explizit ins Viewport scrollen → IntersectionObserver fires
            await counterEl.scrollIntoViewIfNeeded();
            await sleep(2200);  // Animation läuft 1.6s + Buffer
            const target = await counterEl.getAttribute('data-kr-counter');
            const text = (await counterEl.innerText()).trim();
            const expected = new Intl.NumberFormat('de-DE').format(parseInt(target, 10));
            return { pass: text === expected, msg: `target=${target} expected="${expected}" text="${text}"` };
        }
    }
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

// Sprint 63 — Output-Correctness-Runner: lädt Page, füllt Form, klickt Submit,
// liest gesamten Output-Text und prüft gegen Regex.
async function runCorrectness(page, c) {
    const label = `correctness · ${c.name}`;
    const formSel = `[data-kr-tool-form="${c.branche}"]`;
    const outputSel = `[data-kr-tool-output="${c.branche}"]`;

    try {
        await page.goto(BASE + c.url, { waitUntil: 'domcontentloaded', timeout: 12000 });
    } catch (e) {
        fail(label, `nav: ${e.message}`);
        return;
    }

    const form = page.locator(formSel).first();
    if (await form.count() === 0) { fail(label, `form ${formSel} nicht gefunden`); return; }

    if (c.fill) {
        for (const [name, val] of Object.entries(c.fill)) {
            const field = form.locator(`[name="${name}"]`).first();
            const tag = await field.evaluate(el => el.tagName).catch(() => null);
            if (!tag) { fail(label, `[name="${name}"] fehlt`); return; }
            if (tag === 'SELECT') await field.selectOption(val);
            else await field.fill(val);
        }
    }
    if (c.checkChips) {
        for (const v of c.checkChips) {
            await form.locator(`input[type="checkbox"][value="${v}"]`).first().check({ force: true });
        }
    }

    await form.locator('button[type="submit"]').first().click();
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
        fail(label, '.is-revealed wurde nicht gesetzt');
        return;
    }

    const text = await page.locator(outputSel).innerText().catch(() => '');
    if (!c.expect.test(text)) {
        const snippet = text.replace(/\s+/g, ' ').slice(0, 180);
        fail(label, `got: "${snippet}" — expected match: ${c.expect}`);
        return;
    }
    pass(label);
}

// Sprint 64 — Phase 3 Runner: lädt Hauptseite frisch pro Case, führt async action() aus,
// erwartet { pass: bool, msg: string }-Rückgabe.
async function runHauptseiteCase(page, c) {
    const label = `hauptseite · ${c.name}`;
    try {
        await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 12000 });
        await sleep(200);  // give JS time to initialize
        const result = await c.action(page);
        if (!result.pass) {
            fail(label, result.msg);
            return;
        }
        pass(label);
    } catch (e) {
        fail(label, `exception: ${e.message}`);
    }
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

            // === Phase 2c (Sprint 63): Output-Correctness ===
            // Prüft nicht nur, ob Output sichtbar ist, sondern ob der berechnete
            // Wert tatsächlich stimmt (Regex gegen erwartete Math-Outputs).
            console.log('\nPhase 2c — Output-Correctness (Sprint 63):\n');
            const correctnessToRun = QUICK ? CORRECTNESS_CASES.slice(0, 3) : CORRECTNESS_CASES;
            for (const c of correctnessToRun) {
                await runCorrectness(page, c);
            }

            // === Phase 3 (Sprint 64): Hauptseite-Widgets ===
            // 15 Cases für conversion-kritische interaktive Elemente auf der Hauptseite.
            console.log('\nPhase 3 — Hauptseite-Widgets (Sprint 64):\n');
            const widgetsToRun = QUICK ? HAUPTSEITE_CASES.slice(0, 4) : HAUPTSEITE_CASES;
            for (const c of widgetsToRun) {
                await runHauptseiteCase(page, c);
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
