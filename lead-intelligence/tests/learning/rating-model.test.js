import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';

// localStorage-Stub (Node-Umgebung, kein jsdom).
let store = {};
beforeAll(() => {
    globalThis.localStorage = {
        getItem: k => (k in store ? store[k] : null),
        setItem: (k, v) => { store[k] = String(v); },
        removeItem: k => { delete store[k]; }
    };
});
afterAll(() => { delete globalThis.localStorage; vi.restoreAllMocks(); });
beforeEach(() => { store = {}; });

const { extractFeatures, toRow, FEATURE_KEYS, trainRatingModel, MIN_N_FOR_MODEL, MIN_PER_CLASS, blendRanks, predictLeads }
    = await import('../../src/learning/rating-model.js');
const { setRating, getRating, getTrainingRows, getRatingStats, FEATURE_VERSION }
    = await import('../../src/learning/lead-ratings.js');

const lead = (o = {}) => ({
    domain: o.domain || 'betrieb.de',
    leadScore: o.leadScore ?? 60,
    badnessScore: o.badnessScore ?? 40,
    businessStrength: o.businessStrength ?? 55,
    hardStructural: o.hardStructural ?? 1,
    isBaukasten: o.isBaukasten ?? false,
    ws: o.ws ?? { perf: 55 },
    place: o.place ?? { userRatingCount: 40, rating: 4.5, primaryType: 'lawyer', reviewRecency: { daysSinceLast: 30 } },
    buySignal: o.buySignal ?? { proven: false },
    buyingIntent: o.buyingIntent ?? { score: 10 },
    siteEvidence: o.siteEvidence,
    peerPressure: o.peerPressure,
    demandFactor: o.demandFactor ?? 1.0,
    reachFactor: o.reachFactor ?? 1.0,
    ...o
});

describe('extractFeatures — Lücken werden als Lücken geführt', () => {
    it('setzt für jedes optionale Signal einen *_bekannt-Indikator', () => {
        const f = extractFeatures(lead());
        for (const k of ['perf_bekannt', 'note_bekannt', 'tageSeitBewertung_bekannt', 'werkzeuge_bekannt', 'pflege_bekannt', 'kontakt_bekannt']) {
            expect(FEATURE_KEYS, `${k} muss in der Merkmalsliste stehen`).toContain(k);
        }
        expect(f.perf_bekannt).toBe(1);
        expect(f.note_bekannt).toBe(1);
    });

    it('eine fehlende Messung ergibt 0 UND bekannt=0 — NIE einen Negativwert', () => {
        // Genau die Fehlerklasse, die am 2026-08-08 an fünf Stellen repariert
        // wurde. Hier als Test festgeschrieben, damit sie nicht ins Modell wandert.
        const f = extractFeatures(lead({
            ws: {},                                         // kein perf
            place: { userRatingCount: 40, primaryType: 'lawyer' },  // kein rating, keine recency
            siteEvidence: undefined                          // nie geprüft
        }));
        expect(f.perf).toBe(0);
        expect(f.perf_bekannt).toBe(0);
        expect(f.note).toBe(0);
        expect(f.note_bekannt).toBe(0);
        expect(f.tageSeitBewertung_bekannt).toBe(0);
        expect(f.werkzeuge_bekannt).toBe(0);
        expect(f.kontakt_bekannt).toBe(0);
        // Kein einziger negativer Wert aus reiner Abwesenheit.
        expect(Object.values(f).every(v => v >= 0)).toBe(true);
    });

    it('unterscheidet „geprüft, nichts gefunden" von „nie geprüft"', () => {
        const nieGeprueft = extractFeatures(lead({ siteEvidence: undefined }));
        const geprueftLeer = extractFeatures(lead({
            siteEvidence: { paidTools: { count: 0 }, careSignals: { caresCount: 0 }, contactPaths: { checked: true, hasPersonalMailto: false } }
        }));
        expect(nieGeprueft.werkzeuge_bekannt).toBe(0);
        expect(geprueftLeer.werkzeuge_bekannt).toBe(1);
        expect(nieGeprueft.kontakt_bekannt).toBe(0);
        expect(geprueftLeer.kontakt_bekannt).toBe(1);
    });

    it('rating 0 (Places-Datenlücke) gilt als unbekannt, nicht als Note 0', () => {
        const f = extractFeatures(lead({ place: { userRatingCount: 40, rating: 0, primaryType: 'lawyer' } }));
        expect(f.note_bekannt).toBe(0);
    });

    it('toRow liefert die Merkmale in stabiler Reihenfolge und ohne NaN', () => {
        const r = toRow(extractFeatures(lead()));
        expect(r.length).toBe(FEATURE_KEYS.length);
        expect(r.every(Number.isFinite)).toBe(true);
    });

    it('überlebt ein kaputtes/leeres Lead-Objekt', () => {
        expect(toRow(extractFeatures({})).every(Number.isFinite)).toBe(true);
        expect(toRow(extractFeatures(null)).every(Number.isFinite)).toBe(true);
    });
});

describe('lead-ratings — Store', () => {
    it('speichert eine Bewertung samt eingefrorenem Merkmalsvektor', async () => {
        const l = lead({ domain: 'a.de' });
        await setRating('a.de', 'up', { features: extractFeatures(l), score: l.leadScore, key: 'k', city: 'Stuttgart' });
        const e = getRating('a.de');
        expect(e.rating).toBe('up');
        expect(e.scoreAtRating).toBe(60);
        expect(e.features.badness).toBe(40);
        expect(e.featureVersion).toBe(FEATURE_VERSION);
    });

    it('friert die Merkmale beim ERSTEN Klick ein — eine Korrektur ändert sie nicht', () => {
        // Der Founder hat auf DIESE Zahlen geschaut. Ändert er später sein Urteil,
        // bleibt der Vektor von damals die Wahrheit über den Zeitpunkt.
        return (async () => {
            await setRating('b.de', 'up', { features: extractFeatures(lead({ badnessScore: 40 })), score: 60 });
            await setRating('b.de', 'down', { features: extractFeatures(lead({ badnessScore: 99 })), score: 99 });
            const e = getRating('b.de');
            expect(e.rating).toBe('down');
            expect(e.features.badness).toBe(40);      // eingefroren
            expect(e.scoreAtRating).toBe(60);
        })();
    });

    it('ein zweiter Klick auf denselben Knopf nimmt die Bewertung zurück', async () => {
        await setRating('c.de', 'up', { features: extractFeatures(lead()), score: 60 });
        const r = await setRating('c.de', 'up', {});
        expect(r.rating).toBeNull();
        expect(getRating('c.de')).toBeNull();
    });

    it('„skip" zählt mit, aber NICHT als Trainingsdatum', async () => {
        await setRating('d.de', 'skip', { features: extractFeatures(lead()), score: 60 });
        await setRating('e.de', 'up', { features: extractFeatures(lead()), score: 60 });
        const { rows, skipped } = getTrainingRows();
        expect(skipped).toBe(1);
        expect(rows.map(r => r.domain)).toEqual(['e.de']);
        expect(getRatingStats().total).toBe(2);
        expect(getRatingStats().trainierbar).toBe(1);
    });

    it('weist einen ungültigen Wert ab', async () => {
        const r = await setRating('f.de', 'vielleicht', {});
        expect(r.ok).toBe(false);
        expect(getRating('f.de')).toBeNull();
    });

    it('mischt keine Vektoren aus einem alten Schema ins Training', async () => {
        await setRating('g.de', 'up', { features: extractFeatures(lead()), score: 60 });
        const map = JSON.parse(store['karriaro_lead_ratings']);
        map['g.de'].featureVersion = 0;                 // Alt-Schema simulieren
        store['karriaro_lead_ratings'] = JSON.stringify(map);
        expect(getTrainingRows().rows).toHaveLength(0);
    });
});

describe('Gate — das Modell übernimmt nur, wenn es besser ist', () => {
    async function bewerte(n, regel) {
        for (let i = 0; i < n; i++) {
            const gut = regel(i);
            const l = lead({
                domain: `lead${i}.de`,
                badnessScore: gut ? 70 : 20,
                leadScore: gut ? 80 : 30,
                buySignal: { proven: gut }
            });
            await setRating(l.domain, gut ? 'up' : 'down', { features: extractFeatures(l), score: l.leadScore });
        }
    }

    it('bleibt unter der Mindestzahl still — Rangfolge unverändert', async () => {
        await bewerte(MIN_N_FOR_MODEL - 5, i => i % 2 === 0);
        const t = trainRatingModel();
        expect(t.status).toBe('zu_wenig');
        expect(t.besser).toBe(false);
        expect(t.lambda).toBe(0);
        expect(t.hinweis).toMatch(/unverändert/);
    });

    it('verweigert bei einseitiger Datenlage', async () => {
        // 50 Bewertungen, aber nur 3× runter → das Modell würde die Basisrate lernen.
        await bewerte(50, i => i >= 3);
        const t = trainRatingModel();
        expect(t.status).toBe('einseitig');
        expect(t.besser).toBe(false);
        expect(t.hinweis).toMatch(new RegExp(String(MIN_PER_CLASS)));
    });

    it('gibt bei genügend, ausgewogenen Daten lesbare Gewichte aus', async () => {
        await bewerte(60, i => i % 2 === 0);
        const t = trainRatingModel();
        expect(t.n).toBe(60);
        expect(t.gewichte.length).toBe(FEATURE_KEYS.length);
        expect(t.gewichte[0]).toHaveProperty('merkmal');
        expect(t.gewichte.every(g => Number.isFinite(g.gewicht))).toBe(true);
        // Nach Betrag sortiert — das wichtigste Merkmal steht oben.
        expect(Math.abs(t.gewichte[0].gewicht)).toBeGreaterThanOrEqual(Math.abs(t.gewichte.at(-1).gewicht));
    });

    it('übernimmt NICHT, wenn die Heuristik den Fall schon perfekt trennt', async () => {
        // Hier ist leadScore mit dem Urteil deckungsgleich → AUC der Heuristik = 1.0.
        // Kein Modell kann das um die geforderte Marge schlagen.
        await bewerte(60, i => i % 2 === 0);
        const t = trainRatingModel();
        expect(t.aucHeuristik).toBeCloseTo(1.0, 2);
        expect(t.besser).toBe(false);
        expect(t.lambda).toBe(0);
        expect(t.hinweis).toMatch(/unverändert/);
    });

    it('lambda bleibt ohne Gate-Freigabe bei 0 und die Mischung leer', async () => {
        await bewerte(60, i => i % 2 === 0);
        const t = trainRatingModel();
        const leads = [lead({ domain: 'x.de' }), lead({ domain: 'y.de' })];
        expect(blendRanks(leads, t).size).toBe(0);
    });

    it('ohne Modell liefert predictLeads eine leere Map statt zu raten', () => {
        expect(predictLeads([lead()], { model: null, scaler: null }).size).toBe(0);
    });
});
