#!/usr/bin/env node
/**
 * Sprint 103 — Mockup-Image-Optimizer.
 *
 * Pro src/images/{slug}-mockup.jpg erzeugt:
 *   - src/images/mockups-opt/{slug}-mockup-480.webp  (480w, Q75)
 *   - src/images/mockups-opt/{slug}-mockup-800.webp  (800w, Q80)
 *   - src/images/mockups-opt/{slug}-mockup-800.jpg   (800w, Q78, Fallback)
 *
 * Verwendet macOS sips (vorinstalliert auf 11+). Dependency-frei.
 * Idempotent: skipt wenn Output existiert UND neuer als Input.
 *
 * Reduziert Mockup-Dateigroesse von ~230 KB JPEG (1536w) auf:
 *   - 480w webp: 25-40 KB (Mobile-Standard)
 *   - 800w webp: 50-80 KB (Tablet/Retina)
 *
 * Lauf:  node scripts/optimize-mockup-images.mjs
 *        npm run build:mobile  (build-mobile-pages.mjs nutzt die optimierten Pfade)
 */

import {
    readdirSync, statSync, existsSync, mkdirSync
} from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, resolve, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const IMAGES_DIR = join(ROOT, 'src', 'images');
const OUT_DIR = join(IMAGES_DIR, 'mockups-opt');

// Welche Mockup-Files sind im Demo-Swiper genutzt?
// (Stimmt mit DEMO_SWIPER_SLIDES in build-mobile-pages.mjs ueberein.)
const MOCKUP_SLUGS = [
    'immobilien-stadtmakler',
    'coaching-lehmann',
    'praxis-weber',
    'friseur-mueller',
    'dachdecker-meister',
    'gastro-hirsch',
    'logistik-schwaben',
    'handwerk-mueller',
];

// Sprint 116 — Q-Werte hoch für "hochklassig" Mockup-Wirkung (war 75/80/78).
// Source-Mockups sind jetzt 2x Retina (3072x1920), Optimize ist Mobile-Display-Resolution.
const VARIANTS = [
    { suffix: '-480.webp', maxDim: 480, format: 'webp',  quality: 82 },
    { suffix: '-800.webp', maxDim: 800, format: 'webp',  quality: 88 },
    { suffix: '-800.jpg',  maxDim: 800, format: 'jpeg', quality: 88 },
];

function isUpToDate(inputPath, outputPath) {
    if (!existsSync(outputPath)) return false;
    return statSync(outputPath).mtimeMs >= statSync(inputPath).mtimeMs;
}

function bytes(filePath) {
    return existsSync(filePath) ? statSync(filePath).size : 0;
}

function formatKb(b) {
    return (b / 1024).toFixed(1) + ' KB';
}

function processOne(slug) {
    const inputName = `${slug}-mockup.jpg`;
    const inputPath = join(IMAGES_DIR, inputName);
    if (!existsSync(inputPath)) {
        console.warn(`  ⚠ Input fehlt: ${inputName}`);
        return null;
    }

    const inputSize = bytes(inputPath);
    const results = [];

    for (const v of VARIANTS) {
        const outName = `${slug}-mockup${v.suffix}`;
        const outPath = join(OUT_DIR, outName);

        if (isUpToDate(inputPath, outPath)) {
            results.push({ name: outName, size: bytes(outPath), skipped: true });
            continue;
        }

        try {
            if (v.format === 'webp') {
                // cwebp: -resize 0 H -q Q (Width=0 = nur Höhe als Constraint? Nein, -resize W 0 = scale to W)
                // Wir brauchen "fit innerhalb maxDim" — cwebp hat dafuer -resize. Wir nutzen -resize W 0
                // mit W = maxDim wenn Image landscape (alle Mockups sind 1536x960 landscape).
                execSync(
                    `cwebp -quiet -q ${v.quality} -resize ${v.maxDim} 0 ` +
                    `"${inputPath}" -o "${outPath}"`,
                    { stdio: ['ignore', 'pipe', 'pipe'] }
                );
            } else {
                // Sprint 120 — sips JPEG-Fallback: --resampleWidth statt -Z, damit
                // bei portrait-Quellen (Sprint-120-Mobile-Mockups 786×1200) die
                // Breite konsistent ist mit den WebP-Varianten (cwebp -resize W 0).
                execSync(
                    `sips --resampleWidth ${v.maxDim} -s format ${v.format} -s formatOptions ${v.quality} ` +
                    `"${inputPath}" --out "${outPath}" >/dev/null 2>&1`,
                    { stdio: ['ignore', 'pipe', 'pipe'] }
                );
            }
            results.push({ name: outName, size: bytes(outPath), skipped: false });
        } catch (err) {
            console.error(`  ✗ ${outName}: ${err.message}`);
            results.push({ name: outName, size: 0, skipped: false, error: true });
        }
    }

    return { slug, inputSize, results };
}

function main() {
    console.log('Sprint 103 — Mockup-Image-Optimizer');
    console.log(`  Quelle: src/images/{slug}-mockup.jpg`);
    console.log(`  Ziel:   src/images/mockups-opt/{slug}-mockup-{480,800}.{webp,jpg}`);
    console.log('');

    if (!existsSync(OUT_DIR)) {
        mkdirSync(OUT_DIR, { recursive: true });
        console.log(`  → Verzeichnis erstellt: ${OUT_DIR.replace(ROOT + '/', '')}\n`);
    }

    let totalInput = 0;
    let totalOutput = 0;
    let skipCount = 0;
    let writeCount = 0;
    let errCount = 0;

    for (const slug of MOCKUP_SLUGS) {
        const res = processOne(slug);
        if (!res) continue;

        totalInput += res.inputSize;
        console.log(`  ${slug.padEnd(28)} ${formatKb(res.inputSize).padStart(8)} → `);
        for (const r of res.results) {
            totalOutput += r.size;
            if (r.error) {
                errCount++;
                console.log(`    ✗ ${r.name}`);
            } else if (r.skipped) {
                skipCount++;
                console.log(`    · ${r.name.padEnd(40)} ${formatKb(r.size).padStart(8)}  (cached)`);
            } else {
                writeCount++;
                console.log(`    ✓ ${r.name.padEnd(40)} ${formatKb(r.size).padStart(8)}`);
            }
        }
    }

    console.log('');
    console.log(`  ✓ ${writeCount} Files erzeugt, ${skipCount} cached, ${errCount} Fehler`);
    console.log(`  Σ Input:  ${formatKb(totalInput)}`);
    console.log(`  Σ Output: ${formatKb(totalOutput)}  (${((1 - totalOutput / totalInput / VARIANTS.length) * 100).toFixed(0)}% pro Variant kleiner)`);
}

main();
