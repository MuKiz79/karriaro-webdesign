#!/usr/bin/env node
// Sprint Social-Asset-Engine — Playwright-Render der Social-Templates zu PNG.
//
// Was passiert:
//   - liest marketing/social/render-config.json (7 Branchen, je Carousel + Story)
//   - startet HTTP-Server auf Port 8771 (root = REPO_ROOT)
//   - oeffnet carousel-1080x1350.html + story-1080x1920.html mit Query-Params
//   - macht Screenshots pro Slide / Variant
//   - speichert in marketing/social/out/{branche}/
//
// Bedienung:
//   npm run render:social                       (alle 7 Branchen)
//   npm run render:social -- --branche friseur  (nur eine Branche)
//   npm run render:social -- --only carousel    (nur Carousels, keine Stories)
//   npm run render:social -- --only story
//
// Voraussetzung: `npm install` + `npx playwright install chromium`.

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdir, readFile } from 'node:fs/promises';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const PORT = 8771;
const BASE = `http://127.0.0.1:${PORT}`;
const TEMPLATES = `${BASE}/marketing/social`;
const OUT_DIR = join(REPO_ROOT, 'marketing/social/out');

// CLI-Args
const args = process.argv.slice(2);
const flagValue = (name) => {
  const idx = args.indexOf(name);
  return idx >= 0 && idx < args.length - 1 ? args[idx + 1] : undefined;
};
const branchenArg = flagValue('--branche');
const onlyArg = flagValue('--only'); // 'carousel' | 'story' | undefined

const config = JSON.parse(
  await readFile(join(REPO_ROOT, 'marketing/social/render-config.json'), 'utf-8')
);

// HTTP-Server (Python statt serve, weil Repo das schon kennt)
const server = spawn('python3', ['-m', 'http.server', String(PORT)], {
  cwd: REPO_ROOT,
  stdio: ['ignore', 'ignore', 'pipe']
});
process.on('exit', () => { try { server.kill(); } catch {} });

await sleep(800);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1100, height: 1400 } });
const page = await ctx.newPage();

const branchenToRender = branchenArg
  ? [branchenArg]
  : Object.keys(config.branchen);

let totalRendered = 0;

for (const slug of branchenToRender) {
  const branche = config.branchen[slug];
  if (!branche) {
    console.error(`[skip] Branche "${slug}" nicht in render-config.json`);
    continue;
  }

  const brancheDir = join(OUT_DIR, slug);
  await mkdir(brancheDir, { recursive: true });

  // === Carousel: 5 Slides ===
  if (!onlyArg || onlyArg === 'carousel') {
    const params = new URLSearchParams(branche.carousel);
    const url = `${TEMPLATES}/carousel-1080x1350.html?${params.toString()}`;
    await page.setViewportSize({ width: 1080, height: 1350 });
    await page.goto(url, { waitUntil: 'networkidle' });

    // Fonts brauchen einen Beat
    await sleep(600);

    for (let i = 1; i <= 5; i++) {
      const slide = page.locator(`#slide-${i}`);
      const out = join(brancheDir, `carousel-${i}.png`);
      await slide.screenshot({ path: out, omitBackground: false });
      console.log(`[ok] ${slug} carousel-${i} → ${out}`);
      totalRendered++;
    }
  }

  // === Story: 3 Varianten ===
  if (!onlyArg || onlyArg === 'story') {
    const storyParams = new URLSearchParams({
      branche: branche.label,
      headline: branche.story.headline,
      meta: branche.story.meta,
      quote: branche.story.quote,
      quoteAuthor: branche.story.quoteAuthor,
      quoteRole: branche.story.quoteRole
    });
    const url = `${TEMPLATES}/story-1080x1920.html?${storyParams.toString()}`;
    await page.setViewportSize({ width: 1080, height: 1920 });
    await page.goto(url, { waitUntil: 'networkidle' });
    await sleep(600);

    const variants = [
      { id: 'story-headline', name: 'headline' },
      { id: 'story-quote',    name: 'quote' },
      { id: 'story-cta',      name: 'cta' }
    ];
    for (const v of variants) {
      const el = page.locator(`#${v.id}`);
      const out = join(brancheDir, `story-${v.name}.png`);
      await el.screenshot({ path: out });
      console.log(`[ok] ${slug} story-${v.name} → ${out}`);
      totalRendered++;
    }
  }
}

await browser.close();
server.kill();
console.log(`\nFERTIG · ${totalRendered} PNGs in ${OUT_DIR}`);
