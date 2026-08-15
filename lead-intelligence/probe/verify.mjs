/**
 * Phase 06 — Verifikations-Matrix über 05-scored.json (rein offline).
 *
 *   node probe/verify.mjs <Stadt>
 *
 * PASS-Kriterien aus dem Plan. Liest AUSSCHLIESSLICH Rohfaktoren (nie Chips) —
 * die Chips werden hier selbst geprüft (Matrix e).
 */
import { dataDir, readJson, writeJson, join } from './lib/io.mjs';
import { assessBuyingIntent, computeOpportunity, analyzeTechAge, seasonalTriggerFor } from './lib/app.mjs';
import { buildBuyingIntent } from './lib/orchestration.mjs';

const city = process.argv[2];
if (!city) { console.error('Stadt fehlt.'); process.exit(1); }
const dir = dataDir(city);
const scored = readJson(join(dir, '05-scored.json'));
if (!scored) { console.error('05-scored.json fehlt — erst run.mjs.'); process.exit(1); }

const CAPACITY_BOUND = new Set(['dentist', 'doctor', 'veterinary_care', 'physiotherapist']); // opportunity.js:50
const ESTABLISHED_STRENGTH = 45;                                                             // opportunity.js:62
const leads = scored.leads;
const month = scored.month;
const out = { city, verifiedAt: new Date().toISOString(), matrix: {}, versandliste: null };

const top10 = leads.slice(0, 10);
const geprueft = leads.filter(l => l.adChecked || l.adBlocked);

// ── a: Kaufsignal-Priorisierung ──
// Vergleichsbasis Rang 31-60 der GEPRÜFTEN Menge (Top-60-Selektionseffekt!).
{
    const provenTop10 = top10.filter(l => l.buySignal?.proven).length;
    const rang3160 = leads.slice(30, 60).filter(l => l.adChecked || l.adBlocked);
    const proven3160 = rang3160.filter(l => l.buySignal?.proven).length;
    const q10 = provenTop10 / 10;
    const q3160 = rang3160.length ? proven3160 / rang3160.length : 0;
    out.matrix.a = {
        provenTop10, quoteTop10: q10,
        vergleichsmenge: rang3160.length, proven3160, quote3160: q3160,
        pass: q10 >= 0.40 && (q3160 === 0 ? provenTop10 > 0 : q10 >= 2.5 * q3160)
    };
}

// ── b: Kein „nicht mein Klientel" in Top-10 ──
{
    const treffer = top10.filter(l =>
        CAPACITY_BOUND.has(l.primaryType) &&
        l.businessStrength >= ESTABLISHED_STRENGTH &&
        !l.buySignal?.proven
    ).map(l => ({ rang: leads.indexOf(l) + 1, name: l.name, domain: l.domain, typ: l.primaryType, demandFactor: l.passes.at(-1)?.demandFactor }));
    // Grenzfälle: kapazitätsgebunden, aber MIT proven (zulässig — Kaufsignal hebt den Dämpfer).
    const grenzfaelle = top10.filter(l => CAPACITY_BOUND.has(l.primaryType) && l.buySignal?.proven)
        .map(l => ({ rang: leads.indexOf(l) + 1, name: l.name, typ: l.primaryType }));
    out.matrix.b = { treffer, grenzfaelle, pass: treffer.length === 0 };
}

// ── b2: Referenz-Rangfolge auf ECHTEN Instanzen ──
{
    const aInst = leads.filter(l => l.primaryType === 'lawyer' && l.buySignal?.proven);
    const bInst = leads.filter(l => CAPACITY_BOUND.has(l.primaryType) && l.businessStrength >= ESTABLISHED_STRENGTH && !l.buySignal?.proven);
    const rangOf = l => leads.indexOf(l) + 1;
    const aWorst = aInst.length ? Math.max(...aInst.map(rangOf)) : null;
    const bBest = bInst.length ? Math.min(...bInst.map(rangOf)) : null;
    out.matrix.b2 = {
        aInstanzen: aInst.map(l => ({ rang: rangOf(l), name: l.name, score: l.opportunity })),
        bInstanzenBeste5: bInst.slice(0, 5).map(l => ({ rang: rangOf(l), name: l.name, score: l.opportunity })),
        bInstanzen: bInst.length,
        pass: aInst.length === 0 ? null : (bInst.length === 0 ? true : aWorst < bBest),
        datenluecke: aInst.length === 0 ? 'keine Anwalt-mit-Anzeigen-Instanz im Lauf' : null
    };
}

// ── d: Deckel-Integrität (VOR Peer) ──
{
    const verstoesse = leads.filter(l => {
        const opp = l.oppBeforePeer ?? l.opportunity;
        if (opp < 70) return false;
        const ratingUnknown = (l.reviews || 0) >= 8 && !l.rating;
        return (l.hardStructural || 0) < 1 || ratingUnknown;
    }).map(l => ({ rang: leads.indexOf(l) + 1, name: l.name, opp: l.oppBeforePeer, hardStructural: l.hardStructural }));
    out.matrix.d = { verstoesse, pass: verstoesse.length === 0 };
}

// ── d2: Peer-Deckel-Durchbruch (Befund, kein Fix) ──
{
    const durchbrueche = leads.filter(l =>
        (l.oppBeforePeer ?? l.opportunity) <= 69 && l.opportunity >= 70 && (l.hardStructural || 0) < 1
    ).map(l => ({ rang: leads.indexOf(l) + 1, name: l.name, vorher: l.oppBeforePeer, nachher: l.opportunity, mult: l.peerPressure?.mult }));
    out.matrix.d2 = { durchbrueche, anzahl: durchbrueche.length };
}

// ── e: Chips vs. Faktoren (Erklärbarkeits-Lücken) ──
{
    const perfChipOhneMessung = leads.filter(l => !l.perfKnown && (l.reasons || []).some(r => /^Perf \d/.test(r)))
        .map(l => ({ rang: leads.indexOf(l) + 1, name: l.name, chip: l.reasons.find(r => /^Perf /.test(r)) }));
    const top20 = leads.slice(0, 20).map((l, i) => ({
        rang: i + 1, name: l.name, domain: l.domain, branche: l.branch.key, score: l.opportunity,
        faktoren: {
            badness: l.badnessScore, strength: l.businessStrength, hardStructural: l.hardStructural,
            buyMult: l.buySignal?.mult, proven: !!l.buySignal?.proven, tier: l.buySignal?.tier,
            demand: l.passes.at(-1)?.demandFactor, reach: l.passes.at(-1)?.reachFactor,
            peer: l.peerPressure?.mult ?? 1, vision: l.visionVerdict || null,
            perfKnown: l.perfKnown, adChecked: !!l.adChecked, adBlocked: !!l.adBlocked
        },
        chips: l.reasons
    }));
    out.matrix.e = { perfChipOhneMessung: perfChipOhneMessung.slice(0, 10), anzahlPerfChipOhneMessung: perfChipOhneMessung.length, top20 };
}

// ── f: Hiring-Defekt quantifizieren (kontrafaktisch) ──
{
    const betroffen = [];
    for (const l of leads) {
        if (!l.jobIntent?.isHiring || l.buySignal?.proven) continue;
        // Kontrafaktisch: mit echter Stellenzahl (>=3) würde `hiring` (26) statt
        // `hiring_page` (10) zünden und isProvenSpender wahr werden.
        const biCounter = assessBuyingIntent({
            googleAds: l.adIntent?.googleAds || null, footprint: null, jobSignal: l.jobIntent,
            jobOpenings: 3, reviewRecency: l.placeLite?.reviewRecency || null,
            paidTools: l.siteEvidence?.paidTools || null, careSignals: l.siteEvidence?.careSignals || null
        });
        const re = computeOpportunity({
            ws: l.ws, tech: l.tech,
            place: { rating: l.rating, userRatingCount: l.reviews, primaryType: l.primaryType, businessStatus: 'OPERATIONAL' },
            websiteUri: l.websiteUri, techAge: analyzeTechAge(l.tech, {}),
            reviewRecency: l.placeLite?.reviewRecency || null,
            adIntent: l.adIntent, jobIntent: l.jobIntent, buyingIntent: biCounter,
            contactPaths: l.siteEvidence?.contactPaths || null,
            seasonal: seasonalTriggerFor(l.primaryType, month)
        });
        betroffen.push({ rang: leads.indexOf(l) + 1, name: l.name, ist: l.opportunity, kontrafaktisch: re.opportunity, delta: re.opportunity - l.opportunity });
    }
    betroffen.sort((x, y) => y.delta - x.delta);
    out.matrix.f = { betroffen: betroffen.slice(0, 10), anzahl: betroffen.length, maxDelta: betroffen[0]?.delta ?? 0 };
}

// ── Stratifizierte Versandliste (vorläufig — Spitze erst nach Adversarial-Pass final) ──
{
    // Deterministischer Zufall (Mulberry32) — Seed in run-meta dokumentiert.
    const seed = 20260815;
    let s = seed;
    const rnd = () => { s |= 0; s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

    const kontaktweg = l => {
        const c = l.siteEvidence?.contactPaths;
        if (!c || c.checked !== true) return 'ungeprüft';
        if (c.hasMailto) return 'E-Mail';
        if (c.hasTel) return 'Telefon';
        if (c.hasImpressumLink) return 'Impressum';
        return 'keiner gefunden';
    };
    const begruendung = l => {
        const f = [];
        if (l.buySignal?.proven) f.push('zahlt für Kundengewinnung');
        if ((l.hardStructural || 0) >= 1) f.push(l.isBaukasten ? `Baukasten (${l.cms})` : 'hartes Strukturzeichen');
        if (l.perfKnown && l.ws?.perf < 55) f.push(`Perf ${l.ws.perf}`);
        if (l.visionVerdict === 'veraltet') f.push('sichtbar veraltet');
        if (l.peerPressure) f.push('hinter der Branche');
        return f.join(' · ') || 'hoher Gesamt-Score';
    };
    const zeile = (l, kohorte) => ({
        kohorte, rang: leads.indexOf(l) + 1, name: l.name, domain: l.domain,
        branche: l.branch.name, score: l.opportunity, proven: !!l.buySignal?.proven,
        kontaktweg: kontaktweg(l), begruendung: begruendung(l),
        versendet: '', antwort: '', termin: ''
    });

    const spitze = leads.slice(0, 15).slice(0, 10).map(l => zeile(l, 'Spitze'));
    // Mittelfeld 40-60, über Branchen stratifiziert: je Branche max 2, per Seed gemischt.
    const mittel = [];
    const mittelPool = leads.filter(l => l.opportunity >= 40 && l.opportunity <= 60);
    const byBranch = new Map();
    for (const l of mittelPool) {
        if (!byBranch.has(l.branch.key)) byBranch.set(l.branch.key, []);
        byBranch.get(l.branch.key).push(l);
    }
    const branchKeys = [...byBranch.keys()].sort(() => rnd() - 0.5);
    outer: for (let round = 0; round < 2; round++) {
        for (const k of branchKeys) {
            const pool = byBranch.get(k);
            if (pool.length > round) {
                mittel.push(zeile(pool[round], 'Mittelfeld'));
                if (mittel.length >= 10) break outer;
            }
        }
    }
    out.versandliste = { seed, hinweis: 'Spitze vorläufig bis Adversarial-Pass; Antworten von Hand tracken (App erfasst sie nicht)', eintraege: [...spitze, ...mittel] };
}

writeJson(join(dir, '06-verify.json'), out);

// ── Konsolen-Zusammenfassung ──
const m = out.matrix;
console.log(`\n═══ Verifikations-Matrix ${city} (${leads.length} Leads) ═══`);
console.log(`a  Kaufsignal-Priorisierung: Top-10 ${m.a.provenTop10}/10 proven vs. Rang-31-60 ${m.a.proven3160}/${m.a.vergleichsmenge} → ${m.a.pass ? 'PASS' : 'FAIL'}`);
console.log(`b  „nicht mein Klientel" in Top-10: ${m.b.treffer.length} Treffer → ${m.b.pass ? 'PASS' : 'FAIL'}${m.b.grenzfaelle.length ? ` (${m.b.grenzfaelle.length} zulässige Grenzfälle mit Kaufsignal)` : ''}`);
console.log(`b2 Referenz-Rangfolge: ${m.b2.pass === null ? `DATENLÜCKE (${m.b2.datenluecke})` : m.b2.pass ? 'PASS' : 'FAIL'} — A-Instanzen: ${m.b2.aInstanzen.length}, B-Instanzen: ${m.b2.bInstanzen}`);
console.log(`d  Deckel-Integrität: ${m.d.verstoesse.length} Verstöße → ${m.d.pass ? 'PASS' : 'FAIL'}`);
console.log(`d2 Peer-Deckel-Durchbrüche: ${m.d2.anzahl}`);
console.log(`e  Perf-Chip ohne Messung: ${m.e.anzahlPerfChipOhneMessung}`);
console.log(`f  Hiring-Defekt: ${m.f.anzahl} betroffen, max. Score-Delta +${m.f.maxDelta}`);
console.log(`\nVersandliste: ${out.versandliste.eintraege.length} Einträge → 06-verify.json`);
