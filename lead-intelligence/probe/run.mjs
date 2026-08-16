/**
 * Verifikations-Probe — fährt den Region-Scan der App headless nach.
 *
 *   node probe/run.mjs <Stadt> [--phase=places|psi|adev|vision|score] [--force]
 *
 * Ohne --phase laufen alle Phasen; jede Phase liest ihren Platten-Cache und
 * wird übersprungen, wenn ihr Output existiert (--force erzwingt Neulauf der
 * benannten Phase). Places-Kosten fallen dadurch nur EINMAL an.
 *
 * PSI-Key: env PSI_KEY (Pflicht für Phase psi).
 */
import { dataDir, readJson, writeJson, existsSync, join } from './lib/io.mjs';
import { runPlaces } from './phases/01-places.mjs';
import { runPsi, loadPsiRecord } from './phases/02-psi.mjs';
import { runAdEvidence } from './phases/03-adevidence.mjs';
import { runVision } from './phases/04-vision.mjs';
import { pass1, pass2, scoreAll } from './lib/orchestration.mjs';
import { checkEnterpriseDB } from './lib/app.mjs';

const city = process.argv[2];
if (!city || city.startsWith('--')) { console.error('Stadt fehlt. Nutzung: node probe/run.mjs <Stadt> [--phase=…]'); process.exit(1); }
const phaseArg = (process.argv.find(a => a.startsWith('--phase=')) || '').split('=')[1] || 'all';
const force = process.argv.includes('--force');

const dir = dataDir(city);
const metaFile = join(dir, 'run-meta.json');

// Monat wird beim ERSTEN Lauf eingefroren — seasonalTriggerFor bleibt dadurch
// über Re-Runs stabil (Playbook: Zeitabhängigkeit explizit machen).
let meta = readJson(metaFile);
if (!meta) {
    meta = { city, startedAt: new Date().toISOString(), month: new Date().getMonth(), psiKeySource: process.env.PSI_KEY ? 'env' : null };
    writeJson(metaFile, meta);
}
const month = meta.month;

function want(name) { return phaseArg === 'all' || phaseArg === name; }
function log(...a) { console.log(new Date().toISOString().slice(11, 19), ...a); }

// ── Phase 01: Places ──
const placesFile = join(dir, '01-places.json');
if (want('places') && (force || !existsSync(placesFile))) {
    log(`① Places-Suche ${city} (18 Suchen ≈ 0,72 $)…`);
    const res = await runPlaces({ city });
    writeJson(placesFile, res);
    log(`① fertig: ${res.candidates.length} Kandidaten aus ${res.rawTreffer} Treffern`, JSON.stringify(res.filtered));
}
const places = readJson(placesFile);
if (!places) { console.error('01-places.json fehlt — Phase places zuerst.'); process.exit(1); }

// ── Phase 02: PSI ──
const psiIndexFile = join(dir, '02-psi-index.json');
if (want('psi') && (force || !existsSync(psiIndexFile))) {
    if (!process.env.PSI_KEY) { console.error('PSI_KEY fehlt (env).'); process.exit(1); }
    log(`② PSI für ${places.candidates.length} Kandidaten (Concurrency 8)…`);
    const index = await runPsi({
        candidates: places.candidates, psiKey: process.env.PSI_KEY, month, dir,
        onProgress: (d, t) => log(`② ${d}/${t}`)
    });
    writeJson(psiIndexFile, index);
    const failed = Object.values(index).filter(r => r.psiStatus === 'failed').length;
    log(`② fertig: ${Object.keys(index).length} Datensätze, ${failed} PSI-Hardfails (fallen wie in der App still raus)`);
}
const psiIndex = readJson(psiIndexFile);

// Kandidaten mit PSI-Ableitungen anreichern (ohne Screenshots — Speicher).
// Der Enterprise-/Ketten-Filter läuft hier ERNEUT über die gecachten
// Kandidaten: Phase 01 speichert nur die Durchgelassenen, und der Filter ist
// seit 2026-08-16 um Ketten (radissonhotels, anicura, …) erweitert — ein
// Re-Score soll dem AKTUELLEN Scanner entsprechen, nicht dem vom Scan-Tag.
function candidatesWithPsi() {
    return places.candidates.filter(cand => {
        const host = new URL(cand.place.websiteUri).hostname.replace(/^www\./, '');
        const ent = checkEnterpriseDB(host);
        return !ent.isEnterprise && !ent.isCompetitor;
    }).map(cand => {
        const domain = new URL(cand.place.websiteUri).hostname.replace(/^www\./, '');
        const rec = loadPsiRecord(dir, domain);
        if (!rec) return { ...cand, psi: { psiStatus: 'failed' } };
        const { screenshot, ...light } = rec;
        return { ...cand, psi: light };
    });
}

// ── Phase 03: adEvidence ──
const adevFile = join(dir, '03-adevidence.json');
if (want('adev') && (force || !existsSync(adevFile))) {
    if (!psiIndex) { console.error('02-psi-index.json fehlt.'); process.exit(1); }
    const leads = pass1({ candidates: candidatesWithPsi(), month });
    log(`③ adEvidence: Auswahl aus ${leads.length} Leads…`);
    const res = await runAdEvidence({ leads, onProgress: (d, t) => { if (d % 10 === 0 || d === t) log(`③ ${d}/${t}`); } });
    writeJson(adevFile, res);
    const blocked = Object.values(res.adevMap).filter(e => e?.ok && e.blocked).length;
    log(`③ fertig: ${res.selected.length} geprüft, ${blocked} WAF-geblockt`);
}
const adev = readJson(adevFile);

// ── Phase 04: Vision ──
const visionFile = join(dir, '04-vision.json');
if (want('vision') && (force || !existsSync(visionFile))) {
    if (!adev) { console.error('03-adevidence.json fehlt.'); process.exit(1); }
    const leads = pass1({ candidates: candidatesWithPsi(), month });
    pass2({ leads, adevMap: adev.adevMap, month });
    log('④ Vision: Auswahl auf Pass-2-Scores…');
    const res = await runVision({ leads, dir, onProgress: (d, t) => log(`④ ${d}/${t}`) });
    writeJson(visionFile, res);
    log(`④ fertig: ${Object.keys(res.visionMap).length} Vision-Verdikte, ${res.skipped.length} ohne Screenshot übersprungen`);
}
const vision = readJson(visionFile);

// ── Phase 05: Offline-Score ──
const scoredFile = join(dir, '05-scored.json');
if (want('score') && (force || !existsSync(scoredFile) || phaseArg === 'score')) {
    if (!psiIndex || !adev || !vision) { console.error('Vorphasen fehlen.'); process.exit(1); }
    log('⑤ Offline-Score (3 Pässe + Peer)…');
    const leads = scoreAll({
        candidates: candidatesWithPsi(),
        adevMap: adev.adevMap,
        visionMap: vision.visionMap,
        month
    });
    // place/tech im Output verschlanken; passes bleiben komplett (Beleg-Kette).
    const out = leads.map(l => ({
        ...l,
        place: undefined,
        psi: undefined,
        footprint: undefined,
        // fürs Verifizieren gebraucht:
        placeLite: {
            rating: l.rating, userRatingCount: l.reviews,
            primaryType: l.primaryType, reviewRecency: l.place?.reviewRecency || null,
            formattedAddress: l.place?.formattedAddress || null,
            googleMapsUri: l.place?.googleMapsUri || null
        }
    }));
    writeJson(scoredFile, {
        city, month, scoredAt: new Date().toISOString(),
        stats: {
            candidates: places.candidates.length,
            psiFailed: Object.values(psiIndex).filter(r => r.psiStatus === 'failed').length,
            scored: out.length,
            adevSelected: adev.selected.length,
            adevBlocked: Object.values(adev.adevMap).filter(e => e?.ok && e.blocked).length,
            visionVerdicts: Object.keys(vision.visionMap).length,
            visionSkippedNoScreenshot: vision.skipped.length
        },
        leads: out
    });
    log(`⑤ fertig: ${out.length} Leads gescort → ${scoredFile}`);
}

const scored = readJson(scoredFile);
if (scored) {
    log(`Top 10 ${city}:`);
    for (const l of scored.leads.slice(0, 10)) {
        log(`  ${String(l.opportunity).padStart(3)}  ${l.name}  [${l.branch.key}]  proven=${l.buySignal?.proven ? 'JA' : 'nein'}  ${l.reasons.join(' · ')}`);
    }
}
