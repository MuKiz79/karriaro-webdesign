/**
 * Platten-Cache je Phase — Re-Runs lesen den Cache statt neue API-Kosten
 * auszulösen. Alles liegt unter probe/data/<stadt-slug>/.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROBE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export function citySlug(city) {
    return String(city).toLowerCase().replace(/[^a-z0-9äöü]+/g, '-');
}

export function dataDir(city) {
    const d = join(PROBE_ROOT, 'data', citySlug(city));
    mkdirSync(d, { recursive: true });
    return d;
}

export function reportDir() {
    const d = join(PROBE_ROOT, 'report');
    mkdirSync(d, { recursive: true });
    return d;
}

export function readJson(path) {
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, 'utf8'));
}

export function writeJson(path, obj) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(obj, null, 1));
}

export { existsSync, join };
