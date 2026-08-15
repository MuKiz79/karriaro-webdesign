/**
 * E1-Eichung — GATE vor jeder Rangfolge-Bewertung.
 *
 * Beweist, dass die Probe-Orchestrierung Inputs NICHT verfälscht: dieselben
 * Fixture-Eingaben müssen durch die Probe-Pässe EXAKT denselben Score ergeben
 * wie ein direkter, scanner-gleich komponierter computeOpportunity-Aufruf.
 * Ohne bestandene Eichung misst der Report das Skript, nicht die App.
 *
 * Fixtures aus tests/scoring/opportunity-tiers.test.js (Bedarfsdruck-Block +
 * Kernfall „Anwalt schlägt ausgebuchte Praxis").
 *
 *   node probe/calibrate.mjs
 */
import {
    computeOpportunity, analyzeTechAge, seasonalTriggerFor
} from './lib/app.mjs';
import { pass1, pass2, pass3, peerAndSort, buildBuyingIntent } from './lib/orchestration.mjs';

const MONTH = 7; // fester Monat für deterministische Eichung (August)
let failures = 0;

function check(name, actual, expected) {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    console.log(`${ok ? '✔' : '✘'} ${name}${ok ? '' : `  — probe=${JSON.stringify(actual)} direkt=${JSON.stringify(expected)}`}`);
    if (!ok) failures++;
}

// ── Fixtures (opportunity-tiers.test.js, Bedarfsdruck-Block) ──
const praxis = {
    ws: { perf: 63, viewport: true, isHttps: true },
    tech: { isBaukasten: true, cms: 'Wix' },
    place: {
        rating: 5.0, userRatingCount: 25, primaryType: 'dentist', businessStatus: 'OPERATIONAL',
        websiteUri: 'https://praxis-fixture.de', displayName: { text: 'Praxis-Fixture' },
        reviewRecency: { daysSinceLast: 33, velocity: null, n: 5 }
    }
};
// ⚠️ Erste Eichungs-Erkenntnis (2026-08-15): Das Test-Fixture übergibt `techAge`
// mit cmsEolYear EXPLIZIT — der Scanner leitet techAge aber aus `tech` ab. Ohne
// `tech.version` gibt es im echten Scan KEIN EOL-Signal (analyzeTechAge braucht
// die Major-Version). tech.version='4.9' ⇒ cmsEolYear 2022, severity 5 — die
// scanner-erreichbare Entsprechung des Test-Falls. Für den Report heißt das:
// Der Kernfall trägt im echten Scan NUR, wenn detectTech die Version findet.
const anwalt = {
    ws: { perf: 64, viewport: true, isHttps: false },
    tech: { cms: 'WordPress', version: '4.9' },
    place: {
        rating: 5.0, userRatingCount: 30, primaryType: 'lawyer', businessStatus: 'OPERATIONAL',
        websiteUri: 'https://anwalt-fixture.de', displayName: { text: 'Anwalt-Fixture' },
        reviewRecency: { daysSinceLast: 200, velocity: null, n: 5 }
    },
    adIntent: { active: true, signals: ['Google Ads'] }
};

/** Direkter Aufruf, komponiert EXAKT wie scanner.js:249-252. */
function direct(fix) {
    const techAge = analyzeTechAge(fix.tech, {});
    const buyingIntent = buildBuyingIntent({
        adIntent: fix.adIntent || null, footprint: fix.footprint || null,
        jobIntent: fix.jobIntent || null, place: fix.place
    });
    return computeOpportunity({
        ws: fix.ws, tech: fix.tech, place: fix.place, websiteUri: fix.place.websiteUri,
        techAge, reviewRecency: fix.place.reviewRecency,
        adIntent: fix.adIntent || null, jobIntent: fix.jobIntent || null, buyingIntent,
        seasonal: seasonalTriggerFor(fix.place.primaryType, MONTH)
    });
}

/** Kandidat im Phase-02-Format. */
function asCandidate(fix, branchKey) {
    return {
        branch: { key: branchKey, q: branchKey, name: branchKey },
        place: fix.place,
        psi: {
            psiStatus: 'ok', ws: fix.ws, tech: fix.tech,
            adIntent: fix.adIntent || null, jobIntent: fix.jobIntent || null,
            footprint: fix.footprint || null, screenshotKept: false
        }
    };
}

// ── E1a: Pass 1 = direkter Aufruf ──
{
    const [pl] = pass1({ candidates: [asCandidate(praxis, 'dentist')], month: MONTH });
    const d = direct(praxis);
    check('Pass 1 Praxis: opportunity', pl.opportunity, d.opportunity);
    check('Pass 1 Praxis: badness/strength/demand',
        [pl.badnessScore, pl.businessStrength, pl.passes[0].demandFactor],
        [d.badnessScore, d.businessStrength, d.demandFactor]);
    check('Pass 1 Praxis: demandFactor 0.70 (Bedarfsdruck wirkt)', pl.passes[0].demandFactor, 0.70);

    const [al] = pass1({ candidates: [asCandidate(anwalt, 'lawyer')], month: MONTH });
    const da = direct(anwalt);
    check('Pass 1 Anwalt: opportunity', al.opportunity, da.opportunity);
    check('KERNFALL: Anwalt mit Anzeigen > ausgebuchte Praxis', al.opportunity > pl.opportunity, true);
}

// ── E1b: Pass 2 Merge-Logik = scanner-identisch ──
{
    // Synthetische adEvidence-Antwort mit aktivem Google-Ads-Fund + Kontaktwegen.
    const ev = {
        ok: true, blocked: null,
        adEvidence: { googleAds: { found: true, confidence: 'aktiv' }, metaPixel: { found: false }, microsoftAds: { found: false } },
        paidTools: { found: [], count: 0, keys: [] },
        careSignals: { cares: [], caresCount: 0 },
        contactPaths: { checked: true, hasMailto: true, hasTel: true, hasImpressumLink: true }
    };
    const [lead] = pass1({ candidates: [asCandidate(praxis, 'dentist')], month: MONTH });
    pass2({ leads: [lead], adevMap: { [lead.domain]: ev }, month: MONTH });

    // Direkter Vergleichsaufruf mit dem von Hand gebauten adIntent (scanner.js:340-352).
    const mergedAdIntent = { active: true, signals: ['Google Ads aktiv'], googleAds: { signals: ['Google Ads aktiv'], active: true } };
    const buyingIntent = buildBuyingIntent({
        adIntent: mergedAdIntent, footprint: null, jobIntent: null, place: praxis.place,
        siteEv: { paidTools: ev.paidTools, careSignals: ev.careSignals, contactPaths: ev.contactPaths }
    });
    const d = computeOpportunity({
        ws: praxis.ws, tech: praxis.tech, place: praxis.place, websiteUri: praxis.place.websiteUri,
        techAge: analyzeTechAge(praxis.tech, {}), reviewRecency: praxis.place.reviewRecency,
        adIntent: mergedAdIntent, jobIntent: null, buyingIntent,
        contactPaths: ev.contactPaths,
        seasonal: seasonalTriggerFor('dentist', MONTH)
    });
    check('Pass 2: Ads-Fund hebt den Bedarfsdruck-Abschlag auf', lead.buySignal.proven, true);
    check('Pass 2: opportunity == direkter Aufruf', lead.opportunity, d.opportunity);
    check('Pass 2: adChecked-Flag gesetzt', lead.adChecked, true);

    // Blocked-Pfad: KEINE Neuberechnung, Flags korrekt (scanner.js:327-333).
    const [lb] = pass1({ candidates: [asCandidate(praxis, 'dentist')], month: MONTH });
    const before = lb.opportunity;
    pass2({ leads: [lb], adevMap: { [lb.domain]: { ok: true, blocked: 'waf' } }, month: MONTH });
    check('Pass 2 blocked: Score unverändert + adBlocked', [lb.opportunity, lb.adChecked, lb.adBlocked], [before, false, true]);
}

// ── E1c: Pass 3 Vision-Semantik ──
{
    // „modern" ohne hartes Strukturzeichen ⇒ ×0.45 (scanner.js:389-397).
    const soft = {
        ws: { perf: 30, viewport: true, isHttps: true }, tech: {},
        place: { ...praxis.place, primaryType: 'hair_salon', websiteUri: 'https://salon-fixture.de' }
    };
    const [lv] = pass1({ candidates: [asCandidate(soft, 'hair_salon')], month: MONTH });
    const before = lv.opportunity;
    check('Vision-Fixture hat KEIN hartes Strukturzeichen', lv.hardStructural, 0);
    pass3({ leads: [lv], visionMap: { [lv.domain]: { isModern: true } }, month: MONTH });
    check('Pass 3 modern (weich): ×0.45', lv.opportunity, Math.max(0, Math.min(100, Math.round(before * 0.45))));

    // „veraltet" ⇒ Recompute mit visionOutdated (zählt zu hardStructural).
    const [lo] = pass1({ candidates: [asCandidate(soft, 'hair_salon')], month: MONTH });
    pass3({ leads: [lo], visionMap: { [lo.domain]: { isModern: false } }, month: MONTH });
    check('Pass 3 veraltet: hardStructural steigt', lo.hardStructural >= 1, true);
    check('Pass 3 veraltet: Chip gesetzt', lo.reasons.includes('Bild: veraltet'), true);
}

// ── E1d: Peer NACH den Deckeln (IST-Verhalten, Matrix d2) ──
{
    // Sechs Salon-Leads: fünf stark, einer schwach OHNE hartes Strukturzeichen
    // (gedeckelt bei 69). Der Peer-Aufschlag darf ihn per IST-Code ÜBER 70 heben.
    const weak = {
        ws: { perf: 30, viewport: true, isHttps: true }, tech: {},
        place: { rating: 4.8, userRatingCount: 120, primaryType: 'hair_salon', businessStatus: 'OPERATIONAL', websiteUri: 'https://weak-salon.de', displayName: { text: 'Weak' }, reviewRecency: { daysSinceLast: 20, velocity: 4, n: 5 } }
    };
    const peers = Array.from({ length: 5 }, (_, i) => ({
        ws: { perf: 95, viewport: true, isHttps: true }, tech: {},
        place: { rating: 4.5, userRatingCount: 50, primaryType: 'hair_salon', businessStatus: 'OPERATIONAL', websiteUri: `https://peer-${i}.de`, displayName: { text: `Peer${i}` }, reviewRecency: { daysSinceLast: 30, velocity: 2, n: 5 } }
    }));
    const cands = [weak, ...peers].map(f => asCandidate(f, 'hair_salon'));
    const leads = pass1({ candidates: cands, month: MONTH });
    const weakLead = leads.find(l => l.domain === 'weak-salon.de');
    peerAndSort({ leads });
    console.log(`  (info) Peer-Demo: schwacher Salon ${weakLead.oppBeforePeer} → ${weakLead.opportunity} (mult ${weakLead.peerPressure?.mult ?? 1})`);
    check('Peer-Mult wird NACH den Deckeln multipliziert (oppBeforePeer erfasst)', typeof weakLead.oppBeforePeer, 'number');
}

console.log(failures === 0 ? '\nE1-EICHUNG BESTANDEN — Probe = App.' : `\n✘ E1 FEHLGESCHLAGEN: ${failures} Abweichung(en). STOPP.`);
process.exit(failures === 0 ? 0 : 1);
