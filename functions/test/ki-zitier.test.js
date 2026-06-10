/**
 * KI-Zitier-Check — Tests für die pure, netzwerkfreie Signal-/Score-Logik.
 *
 * Sichert die Ehrlichkeits-Eigenschaften ab:
 *  1. Determinismus — gleiche Checks ⇒ gleicher Score (LLM-Verdikt nie roh).
 *  2. Renormalisierung — 'unknown' fällt aus Zähler UND Nenner ("nicht geprüft ≠ fehlt").
 *  3. score null bei messbarem Maximum < 40 (keine Scheinpräzision).
 *  4. Namensabgleich ohne False Positives (Umlaute, Rechtsformen, Generika).
 *  5. GBP nicht gefunden = GEMESSENES fail; API-Fehler = unknown.
 *  6. reconcileZitier streicht LLM-Aussagen, die grüne Messungen widersprechen.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
    normalizeBusinessName,
    distinctiveTokens,
    matchesBusiness,
    pickBestPlace,
    evalGbpChecks,
    evalDirectoryHtml,
    evalWikiResults,
    probeMatch,
    computeZitierScore,
    zitierLabel,
    reconcileZitier,
    KI_ZITIER_TOOL,
    DIRECTORIES
} = require('../lib/ki-zitier.js');

// ── normalizeBusinessName / distinctiveTokens ────────────────────────────────

test('normalizeBusinessName: lowercase + Umlaut-Folding + Rechtsform-Strip', () => {
    assert.equal(normalizeBusinessName('Müller GmbH'), 'mueller');
    assert.equal(normalizeBusinessName('Bäcker Höß e.K.'), 'baecker hoess');
    assert.equal(normalizeBusinessName('Schäfer & Co. KG'), 'schaefer');
    assert.equal(normalizeBusinessName('Kablan Immobilien UG'), 'kablan immobilien');
    assert.equal(normalizeBusinessName('  Doppel   Spatz  AG '), 'doppel spatz');
});

test('normalizeBusinessName: robust gegen null/undefined/Zahlen', () => {
    assert.equal(normalizeBusinessName(null), '');
    assert.equal(normalizeBusinessName(undefined), '');
    assert.equal(normalizeBusinessName(11880), '11880');
});

test('distinctiveTokens: Branchen-Generika und Füllwörter fliegen raus', () => {
    assert.deepEqual(distinctiveTokens('Friseur Müller'), ['mueller']);
    assert.deepEqual(distinctiveTokens('Salon Schmidt'), ['schmidt']);
    assert.deepEqual(distinctiveTokens('Praxis'), []);
    assert.deepEqual(distinctiveTokens('Friseursalon'), []);
    assert.deepEqual(distinctiveTokens('Kablan Immobilien GmbH'), ['kablan']);
});

// ── matchesBusiness: Kanten ──────────────────────────────────────────────────

test('matchesBusiness: Umlaut-Folding beidseitig (Müller = Mueller)', () => {
    assert.equal(matchesBusiness('Salon Mueller', 'Salon Müller'), true);
    assert.equal(matchesBusiness('Salon Müller', 'Salon Mueller'), true);
});

test('matchesBusiness: Rechtsform (GmbH) ändert die Identität nicht', () => {
    assert.equal(matchesBusiness('Kablan Immobilien GmbH', 'Kablan Immobilien'), true);
    assert.equal(matchesBusiness('Kablan Immobilien', 'Kablan Immobilien GmbH'), true);
});

test('matchesBusiness: komplett generischer Name ⇒ kein False Positive', () => {
    // "Friseur" allein darf NICHT jeden Friseur treffen — nur Voll-Token-Gleichheit.
    assert.equal(matchesBusiness('Friseur Schmidt', 'Friseur'), false);
    assert.equal(matchesBusiness('Friseur', 'Friseur'), true);
    assert.equal(matchesBusiness('Salon', 'Friseur'), false);
});

test('matchesBusiness: "Friseur Müller" trifft NICHT "Salon Müller-Lüdenscheidt"', () => {
    // Bindestrich-Namen bleiben EIN Token — "mueller" ≠ "mueller-luedenscheidt".
    assert.equal(matchesBusiness('Salon Müller-Lüdenscheidt', 'Friseur Müller'), false);
    // aber der echte Müller-Salon trifft:
    assert.equal(matchesBusiness('Friseursalon Müller', 'Friseur Müller'), true);
});

test('matchesBusiness: robust gegen leere/fehlende Werte', () => {
    assert.equal(matchesBusiness('', 'Friseur Müller'), false);
    assert.equal(matchesBusiness(null, 'Friseur Müller'), false);
    assert.equal(matchesBusiness('Friseur Müller', ''), false);
    assert.equal(matchesBusiness(undefined, undefined), false);
});

// ── pickBestPlace ────────────────────────────────────────────────────────────

const PLACE_A = { displayName: { text: 'Kablan Immobilien' }, websiteUri: 'https://www.kablan-immobilien.de/' };
const PLACE_B = { displayName: { text: 'Müller Immobilien' }, websiteUri: 'https://mueller-immo.example' };

test('pickBestPlace: Domain-Match gewinnt vor Namens-Match', () => {
    const picked = pickBestPlace([PLACE_B, PLACE_A], 'Müller Immobilien', 'kablan-immobilien.de');
    assert.equal(picked, PLACE_A);
});

test('pickBestPlace: ohne Domain entscheidet der Namens-Match', () => {
    assert.equal(pickBestPlace([PLACE_B, PLACE_A], 'Kablan Immobilien', ''), PLACE_A);
});

test('pickBestPlace: kein Match ⇒ null (= GBP nicht gefunden)', () => {
    assert.equal(pickBestPlace([PLACE_B], 'Kablan Immobilien', ''), null);
    assert.equal(pickBestPlace([], 'Kablan Immobilien', ''), null);
    assert.equal(pickBestPlace(null, 'Kablan Immobilien', ''), null);
});

// ── evalGbpChecks: Staffeln + Deckel + fail/unknown-Semantik ─────────────────

const NOW = Date.UTC(2026, 5, 10);
const monthsAgo = (m) => new Date(NOW - m * 30.44 * 86400000).toISOString();

function fullPlace() {
    return {
        userRatingCount: 120,
        rating: 4.7,
        reviews: [{ publishTime: monthsAgo(2) }, { publishTime: monthsAgo(20) }],
        photos: [{}, {}, {}, {}, {}, {}],
        websiteUri: 'https://example.de',
        regularOpeningHours: { periods: [] },
        nationalPhoneNumber: '0221 123456'
    };
}

const ptsById = (checks) => Object.fromEntries(checks.map(c => [c.id, c.points]));

test('evalGbpChecks: volles Profil erreicht exakt 45 Punkte (15+10+8+5+3+2+2)', () => {
    const checks = evalGbpChecks(fullPlace(), { now: NOW });
    const p = ptsById(checks);
    assert.deepEqual(p, { 'gbp-reviews': 15, 'gbp-rating': 10, 'gbp-fresh': 8, 'gbp-photos': 5, 'gbp-website': 3, 'gbp-hours': 2, 'gbp-phone': 2 });
    assert.equal(checks.reduce((s, c) => s + c.max, 0), 45);
    assert.ok(checks.every(c => c.status === 'ok'));
});

test('evalGbpChecks: Review-Staffel ≥100/≥50/≥20/≥5/≥1 → 15/11/7/4/2', () => {
    const pts = (n) => ptsById(evalGbpChecks({ ...fullPlace(), userRatingCount: n }, { now: NOW }))['gbp-reviews'];
    assert.equal(pts(100), 15);
    assert.equal(pts(50), 11);
    assert.equal(pts(20), 7);
    assert.equal(pts(5), 4);
    assert.equal(pts(1), 2);
    assert.equal(pts(0), 0);
});

test('evalGbpChecks: Rating-Staffel ≥4.5/≥4.0/≥3.5 → 10/7/4; <3.5 → 0/fail', () => {
    const rating = (r) => ptsById(evalGbpChecks({ ...fullPlace(), rating: r }, { now: NOW }))['gbp-rating'];
    assert.equal(rating(4.5), 10);
    assert.equal(rating(4.0), 7);
    assert.equal(rating(3.5), 4);
    assert.equal(rating(3.0), 0);
});

test('evalGbpChecks: Rating-Deckel — 5,0 aus <5 Bewertungen zählt nur 4 Punkte', () => {
    const checks = evalGbpChecks({ ...fullPlace(), userRatingCount: 3, rating: 5.0 }, { now: NOW });
    assert.equal(ptsById(checks)['gbp-rating'], 4);
    // ab 5 Bewertungen kein Deckel:
    const ok = evalGbpChecks({ ...fullPlace(), userRatingCount: 5, rating: 5.0 }, { now: NOW });
    assert.equal(ptsById(ok)['gbp-rating'], 10);
});

test('evalGbpChecks: Review-Frische — ≤12M→8, ≤24M→4, älter→0/fail', () => {
    const fresh = (m) => ptsById(evalGbpChecks({ ...fullPlace(), reviews: [{ publishTime: monthsAgo(m) }] }, { now: NOW }))['gbp-fresh'];
    assert.equal(fresh(2), 8);
    assert.equal(fresh(18), 4);
    assert.equal(fresh(30), 0);
});

test('evalGbpChecks: Bewertungen vorhanden, aber ohne publishTime ⇒ Frische unknown', () => {
    const checks = evalGbpChecks({ ...fullPlace(), reviews: [] }, { now: NOW });
    const freshCheck = checks.find(c => c.id === 'gbp-fresh');
    assert.equal(freshCheck.status, 'unknown');
    assert.equal(freshCheck.points, 0);
});

test('evalGbpChecks: GBP nicht gefunden ⇒ alles GEMESSENES fail (zählt im Nenner)', () => {
    const checks = evalGbpChecks(null);
    assert.equal(checks.length, 7);
    assert.ok(checks.every(c => c.status === 'fail' && c.points === 0));
});

test('evalGbpChecks: Places-API-Fehler ⇒ alles unknown (zählt NICHT im Nenner)', () => {
    const checks = evalGbpChecks(null, { unknown: true });
    assert.equal(checks.length, 7);
    assert.ok(checks.every(c => c.status === 'unknown' && c.points === 0));
});

test('evalGbpChecks: robust gegen fehlende Felder (leeres Place-Objekt)', () => {
    const checks = evalGbpChecks({});
    assert.equal(checks.length, 7);
    assert.ok(checks.every(c => c.points === 0));
    assert.ok(checks.every(c => c.status === 'fail')); // 0 Reviews ⇒ Frische gemessen fail, nicht unknown
});

// ── evalDirectoryHtml: sichtbarer Text, Echo-Falle ───────────────────────────

test('evalDirectoryHtml: Name im sichtbaren Text ⇒ found', () => {
    const html = '<html><body><h2>Kablan Immobilien</h2><p>Hürth, Maklerbüro</p></body></html>';
    assert.equal(evalDirectoryHtml(html, 'Kablan Immobilien GmbH'), 'found');
});

test('evalDirectoryHtml: Echo nur in <head>/<script>/Attributen zählt NICHT (Echo-Falle)', () => {
    const html = '<html><head><meta name="keywords" content="Kablan Immobilien Hürth"><title>Suche Kablan</title></head>' +
        '<body><script>var kw="Kablan Immobilien";</script>' +
        '<a href="https://tracker.example/?q=kablan+immobilien">Werbung</a>' +
        '<p>Leider keine passenden Einträge.</p></body></html>';
    assert.equal(evalDirectoryHtml(html, 'Kablan Immobilien'), 'notfound');
});

test('evalDirectoryHtml: Umlaut-Folding auch im Verzeichnis-Text', () => {
    const html = '<body><p>Friseursalon Mueller, Hauptstraße 1</p></body>';
    assert.equal(evalDirectoryHtml(html, 'Friseur Müller'), 'found');
});

test('evalDirectoryHtml: robust gegen leeres/fehlendes HTML', () => {
    assert.equal(evalDirectoryHtml('', 'Kablan Immobilien'), 'notfound');
    assert.equal(evalDirectoryHtml(null, 'Kablan Immobilien'), 'notfound');
});

// ── evalWikiResults ──────────────────────────────────────────────────────────

test('evalWikiResults: Wikipedia-Treffer (query.search[].title)', () => {
    const json = { query: { search: [{ title: 'Hürth' }, { title: 'Kablan Immobilien' }] } };
    assert.equal(evalWikiResults(json, 'Kablan Immobilien'), 'found');
});

test('evalWikiResults: Wikidata-Treffer (search[].label/aliases)', () => {
    assert.equal(evalWikiResults({ search: [{ label: 'Kablan Immobilien GmbH' }] }, 'Kablan Immobilien'), 'found');
    assert.equal(evalWikiResults({ search: [{ label: 'Anderes Ding', aliases: ['Kablan Immobilien'] }] }, 'Kablan Immobilien'), 'found');
});

test('evalWikiResults: nur thematische Treffer ⇒ notfound; robust gegen null', () => {
    assert.equal(evalWikiResults({ query: { search: [{ title: 'Immobilienmakler' }] } }, 'Kablan Immobilien'), 'notfound');
    assert.equal(evalWikiResults(null, 'Kablan Immobilien'), 'notfound');
    assert.equal(evalWikiResults({}, 'Kablan Immobilien'), 'notfound');
});

// ── probeMatch ───────────────────────────────────────────────────────────────

test('probeMatch: Empfehlung mit Rechtsform-Variante trifft', () => {
    assert.equal(probeMatch([{ name: 'Kablan Immobilien GmbH' }], 'Kablan Immobilien'), true);
});

test('probeMatch: leere/fremde Empfehlungen ⇒ false; robust gegen Müll', () => {
    assert.equal(probeMatch([], 'Kablan Immobilien'), false);
    assert.equal(probeMatch([{ name: 'Müller Immobilien' }], 'Kablan Immobilien'), false);
    assert.equal(probeMatch(null, 'Kablan Immobilien'), false);
    assert.equal(probeMatch([null, {}, { name: 42 }], 'Kablan Immobilien'), false);
});

// ── computeZitierScore: Determinismus, Renormalisierung, null-Schwelle ───────

function measuredChecks() {
    // gbp 30/45, verzeichnisse 10/15, entitaet 0/10, probe 20/25 ⇒ 60/95 ⇒ 63
    return [
        { id: 'gbp-reviews', category: 'gbp', status: 'ok', points: 15, max: 15 },
        { id: 'gbp-rating', category: 'gbp', status: 'ok', points: 7, max: 10 },
        { id: 'gbp-fresh', category: 'gbp', status: 'ok', points: 8, max: 8 },
        { id: 'gbp-photos', category: 'gbp', status: 'fail', points: 0, max: 5 },
        { id: 'gbp-website', category: 'gbp', status: 'fail', points: 0, max: 3 },
        { id: 'gbp-hours', category: 'gbp', status: 'fail', points: 0, max: 2 },
        { id: 'gbp-phone', category: 'gbp', status: 'fail', points: 0, max: 2 },
        { id: 'dir-dasoertliche', category: 'verzeichnisse', status: 'ok', points: 5, max: 5 },
        { id: 'dir-11880', category: 'verzeichnisse', status: 'ok', points: 5, max: 5 },
        { id: 'dir-gelbeseiten', category: 'verzeichnisse', status: 'fail', points: 0, max: 5 },
        { id: 'wikipedia', category: 'entitaet', status: 'fail', points: 0, max: 5 },
        { id: 'wikidata', category: 'entitaet', status: 'fail', points: 0, max: 5 },
        { id: 'probe-mentioned', category: 'probe', status: 'ok', points: 15, max: 15 },
        { id: 'probe-knowledge', category: 'probe', status: 'ok', points: 5, max: 10 }
    ];
}

test('computeZitierScore: deterministisch — gleiche Checks ⇒ identisches Ergebnis', () => {
    const a = computeZitierScore(measuredChecks());
    const b = computeZitierScore(measuredChecks());
    assert.deepEqual(a, b);
    assert.equal(a.score, Math.round((60 / 95) * 100)); // 63
});

test('computeZitierScore: Renormalisierung — unknown ändert den Score NICHT', () => {
    const base = computeZitierScore(measuredChecks()).score;
    const withUnknown = measuredChecks().concat([
        { id: 'dir-cylex', category: 'verzeichnisse', status: 'unknown', points: 0, max: 5 },
        { id: 'wikidata-2', category: 'entitaet', status: 'unknown', points: 0, max: 5 }
    ]);
    assert.equal(computeZitierScore(withUnknown).score, base);
});

test('computeZitierScore: unknown fällt aus Zähler UND Nenner (measuredMax)', () => {
    const checks = [
        { id: 'a', category: 'gbp', status: 'ok', points: 10, max: 15 },
        { id: 'b', category: 'gbp', status: 'unknown', points: 0, max: 30 }
    ];
    const { categories } = computeZitierScore(checks);
    assert.equal(categories[0].max, 45);
    assert.equal(categories[0].measuredMax, 15);
    assert.equal(categories[0].points, 10);
});

test('computeZitierScore: measuredMax < 40 ⇒ score null (keine Scheinpräzision)', () => {
    // Nur die Probe messbar (25 Punkte) — alles andere unknown.
    const checks = measuredChecks().map(c =>
        c.category === 'probe' ? c : { ...c, status: 'unknown', points: 0 });
    const { score, measuredMax } = computeZitierScore(checks);
    assert.equal(measuredMax, 25);
    assert.equal(score, null);
});

test('computeZitierScore: Kategorien tragen key/label/points/max/measuredMax', () => {
    const { categories } = computeZitierScore(measuredChecks());
    assert.deepEqual(categories.map(c => c.key), ['gbp', 'verzeichnisse', 'entitaet', 'probe']);
    const gbp = categories[0];
    assert.equal(gbp.max, 45);
    assert.equal(gbp.measuredMax, 45);
    assert.equal(gbp.points, 30);
    assert.ok(categories.every(c => typeof c.label === 'string' && c.label.length > 0));
});

test('computeZitierScore: robust gegen leere/kaputte Eingaben', () => {
    assert.equal(computeZitierScore([]).score, null);
    assert.equal(computeZitierScore(null).score, null);
    assert.doesNotThrow(() => computeZitierScore([null, { category: 'quatsch' }, {}]));
});

// ── zitierLabel: Bänder ──────────────────────────────────────────────────────

test('zitierLabel: Bänder inkl. neutralem null-Label', () => {
    assert.equal(zitierLabel(85), 'Zitierfähig — die KI kann Sie empfehlen');
    assert.equal(zitierLabel(80), 'Zitierfähig — die KI kann Sie empfehlen');
    assert.equal(zitierLabel(65), 'Solide Markensignale — Zitat in Reichweite');
    assert.equal(zitierLabel(45), 'Sichtbar, aber selten zitiert');
    assert.equal(zitierLabel(12), 'Für KI-Empfehlungen noch unsichtbar');
    assert.equal(zitierLabel(null), 'Zu wenig messbare Signale für eine Einschätzung');
});

// ── reconcileZitier: kein LLM-Widerspruch gegen grüne Messungen ──────────────

test('reconcileZitier: streicht Gaps/Fixes, die grünen Checks widersprechen', () => {
    const checks = [
        { id: 'dir-gelbeseiten', category: 'verzeichnisse', status: 'ok', points: 5, max: 5 },
        { id: 'wikipedia', category: 'entitaet', status: 'ok', points: 5, max: 5 },
        { id: 'gbp-website', category: 'gbp', status: 'ok', points: 3, max: 3 }
    ];
    const result = {
        gaps: [
            { gap: 'Kein Eintrag bei Gelbe Seiten', why: 'Verzeichnis-Signal fehlt' },
            { gap: 'Kein Google-Unternehmensprofil vorhanden', why: 'Wichtigstes lokales Signal fehlt' },
            { gap: 'Kaum KI-Trainingswissen', why: 'Lokaler Betrieb, wenig überregionale Quellen' }
        ],
        fixes: [
            { fix: 'Wikipedia-Artikel erstellen', impact: 'Entitäts-Signal' },
            { fix: 'Eintrag bei Gelbe Seiten anlegen', impact: 'Verzeichnis-Signal' },
            { fix: 'Pressearbeit in Lokalmedien aufbauen', impact: 'Off-Site-Brand-Signale' }
        ]
    };
    reconcileZitier(result, checks);
    assert.deepEqual(result.gaps.map(g => g.gap), ['Kaum KI-Trainingswissen']);
    assert.deepEqual(result.fixes.map(f => f.fix), ['Pressearbeit in Lokalmedien aufbauen']);
});

test('reconcileZitier: Verbesserungs-Fix ohne Anlege-Verb bleibt (pflegen/optimieren)', () => {
    const checks = [{ id: 'dir-11880', category: 'verzeichnisse', status: 'ok', points: 5, max: 5 }];
    const result = { gaps: [], fixes: [{ fix: '11880-Eintrag mit Fotos und Leistungen pflegen', impact: 'stärkeres Signal' }] };
    reconcileZitier(result, checks);
    assert.equal(result.fixes.length, 1);
});

test('reconcileZitier: Lücke zu einem ROTEN Signal bleibt erhalten', () => {
    const checks = [{ id: 'wikipedia', category: 'entitaet', status: 'fail', points: 0, max: 5 }];
    const result = { gaps: [{ gap: 'Kein Wikipedia-Artikel', why: 'Entität unbelegt' }], fixes: [] };
    reconcileZitier(result, checks);
    assert.equal(result.gaps.length, 1);
});

test('reconcileZitier: probe-mentioned grün streicht "KI erwähnt Sie nicht"', () => {
    const checks = [{ id: 'probe-mentioned', category: 'probe', status: 'ok', points: 15, max: 15 }];
    const result = {
        gaps: [{ gap: 'Die KI erwähnt Ihren Betrieb nicht', why: 'fehlende Markensignale' }],
        fixes: []
    };
    reconcileZitier(result, checks);
    assert.equal(result.gaps.length, 0);
});

test('reconcileZitier: robust gegen fehlende Felder', () => {
    assert.doesNotThrow(() => reconcileZitier(null, []));
    assert.doesNotThrow(() => reconcileZitier({}, null));
    assert.doesNotThrow(() => reconcileZitier({ gaps: null, fixes: undefined }, []));
});

// ── Konstanten-Verträge ──────────────────────────────────────────────────────

test('KI_ZITIER_TOOL: Pflichtfelder + Enum + max 7 Empfehlungen', () => {
    const s = KI_ZITIER_TOOL.input_schema;
    assert.deepEqual(s.required.sort(), ['aiKnows', 'empfehlungen', 'fixes', 'gaps', 'knowledgeLevel'].sort());
    assert.deepEqual(s.properties.knowledgeLevel.enum, ['keine', 'vage', 'solide']);
    assert.equal(s.properties.empfehlungen.maxItems, 7);
});

test('DIRECTORIES: Kill-Switch + URL-Bau mit Umlaut-Encoding', () => {
    assert.equal(DIRECTORIES.length, 4);
    const cylex = DIRECTORIES.find(d => d.key === 'cylex');
    assert.equal(cylex.enabled, false); // Cloudflare-Bot-Wall (live verifiziert)
    for (const d of DIRECTORIES) {
        const url = d.buildUrl('Friseur Müller', 'Hürth');
        assert.ok(/^https:\/\//.test(url), `${d.key}: https`);
        assert.ok(!/[äöüÄÖÜß ]/.test(url), `${d.key}: URL vollständig encodiert`);
    }
});

// ── Strikter Wiki-Match (Review-Fix Sprint 244) ──────────────────────────────

test('matchesBusinessStrict: fremde Müller-Artikel treffen NICHT (1 distinktiver Token → Phrase-Pflicht)', () => {
    const { matchesBusinessStrict } = require('../lib/ki-zitier.js');
    assert.equal(matchesBusinessStrict('Erwin Franz Müller', 'Friseur Müller'), false);
    assert.equal(matchesBusinessStrict('Müller (Handelskette)', 'Friseur Müller'), false);
    assert.equal(matchesBusinessStrict('Friseur Müller', 'Friseur Müller'), true);
    assert.equal(matchesBusinessStrict('Der bekannte Friseur Müller aus Köln', 'Friseur Müller'), true);
});

test('matchesBusinessStrict: ≥2 distinktive Tokens müssen ALLE vorkommen', () => {
    const { matchesBusinessStrict } = require('../lib/ki-zitier.js');
    assert.equal(matchesBusinessStrict('Kablan Immobilien GmbH', 'Kablan Bolat Immobilien'), false);
    assert.equal(matchesBusinessStrict('Kablan Bolat Immobilien aus Hürth', 'Kablan Bolat Immobilien'), true);
});

test('evalWikiResults: nutzt strikten Match — Namensvetter-Artikel ergibt notfound', () => {
    const json = { query: { search: [{ title: 'Erwin Franz Müller' }, { title: 'Müller (Handelskette)' }] } };
    assert.equal(evalWikiResults(json, 'Friseur Müller'), 'notfound');
    const hit = { query: { search: [{ title: 'Friseur Müller' }] } };
    assert.equal(evalWikiResults(hit, 'Friseur Müller'), 'found');
});
