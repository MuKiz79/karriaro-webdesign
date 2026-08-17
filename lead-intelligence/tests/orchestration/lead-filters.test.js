import { describe, it, expect } from 'vitest';
import { applyFilters, hasBuySignal, isReachable } from '../../src/orchestration/lead-filters.js';

const lead = (o = {}) => ({
    name: o.name || 'Betrieb',
    leadScore: o.leadScore ?? 50,
    reviews: o.reviews ?? 20,
    branch: { key: o.branchKey || 'dentist' },
    isBaukasten: o.isBaukasten ?? false,
    ws: { perf: o.perf ?? 60 },
    buySignal: o.buySignal ?? { adActive: false, hiring: false }
});

describe('hasBuySignal', () => {
    it('erkennt Anzeigen und Stellenanzeigen', () => {
        expect(hasBuySignal(lead({ buySignal: { adActive: true, hiring: false } }))).toBe(true);
        expect(hasBuySignal(lead({ buySignal: { adActive: false, hiring: true } }))).toBe(true);
    });
    it('zählt gute Bewertungen NICHT als Kaufsignal', () => {
        // Der Kernfehler, der die Stuttgart-Liste unbrauchbar machte: „läuft gut"
        // wurde als Kaufbereitschaft gelesen.
        expect(hasBuySignal(lead({ leadScore: 92, reviews: 307 }))).toBe(false);
    });
    it('ist robust gegen fehlende Felder', () => {
        expect(hasBuySignal(null)).toBe(false);
        expect(hasBuySignal({})).toBe(false);
    });
});

describe('applyFilters', () => {
    const werber = lead({ name: 'Anwalt', leadScore: 71, buySignal: { adActive: true, hiring: false } });
    const praxisA = lead({ name: 'Praxis A', leadScore: 92, reviews: 99 });
    const praxisB = lead({ name: 'Praxis B', leadScore: 81, reviews: 307, branchKey: 'vet' });
    const alle = [praxisA, praxisB, werber];

    it('lässt die Eingabeliste unberührt', () => {
        const kopie = [...alle];
        applyFilters(alle, { sort: 'name' });
        expect(alle).toEqual(kopie);
    });

    it('buy-Filter zeigt ausschließlich bewiesene Spender', () => {
        const r = applyFilters(alle, { buy: true });
        expect(r).toHaveLength(1);
        expect(r[0].name).toBe('Anwalt');
    });

    it('Kaufsignal-Sortierung hebt den Werbetreibenden über höher gescorte Praxen', () => {
        // Genau der Fall aus dem Founder-Screenshot: 92/92 vor 91.
        const r = applyFilters(alle, { sort: 'buy' });
        expect(r[0].name).toBe('Anwalt');
        expect(r[0].leadScore).toBeLessThan(r[1].leadScore);   // trotz niedrigerem Score vorn
    });

    it('sortiert innerhalb der Kaufsignal-Gruppe weiter nach Score', () => {
        const zweiter = lead({ name: 'Dachdecker', leadScore: 88, buySignal: { adActive: true, hiring: false } });
        const r = applyFilters([werber, zweiter, praxisA], { sort: 'buy' });
        expect(r.map(x => x.name)).toEqual(['Dachdecker', 'Anwalt', 'Praxis A']);
    });

    it('kombiniert buy-Filter mit minScore', () => {
        expect(applyFilters(alle, { buy: true, minScore: 80 })).toHaveLength(0);
        expect(applyFilters(alle, { buy: true, minScore: 70 })).toHaveLength(1);
    });

    it('Standardsortierung bleibt Score absteigend', () => {
        expect(applyFilters(alle, {}).map(x => x.leadScore)).toEqual([92, 81, 71]);
    });

    it('Branchen- und Baukasten-Filter unverändert', () => {
        expect(applyFilters(alle, { branch: 'vet' })).toHaveLength(1);
        expect(applyFilters(alle, { baukasten: true })).toHaveLength(0);
    });

    it('Performance-Sortierung aufsteigend (langsamste zuerst)', () => {
        const a = lead({ name: 'schnell', perf: 90 });
        const b = lead({ name: 'langsam', perf: 20 });
        expect(applyFilters([a, b], { sort: 'perf' }).map(x => x.name)).toEqual(['langsam', 'schnell']);
    });

    it('leere Eingabe ergibt eine leere Liste statt Absturz', () => {
        expect(applyFilters(null, { buy: true })).toEqual([]);
        expect(applyFilters([], {})).toEqual([]);
    });
});

describe('Erreichbarkeits-Filter — ungeprüft bleibt sichtbar', () => {
    const geprueftOk = lead({ name: 'erreichbar' });
    geprueftOk.siteEvidence = { contactPaths: { checked: true, hasMailto: true } };
    const geprueftLeer = lead({ name: 'kein Kontakt' });
    geprueftLeer.siteEvidence = { contactPaths: { checked: true, hasMailto: false, hasTel: false, hasImpressumLink: false } };
    const ungeprueft = lead({ name: 'ungeprüft' });          // kein siteEvidence

    it('blendet nur aus, was NACHWEISLICH keinen Kontaktweg hat', () => {
        const r = applyFilters([geprueftOk, geprueftLeer, ungeprueft], { reach: true });
        expect(r.map(x => x.name).sort()).toEqual(['erreichbar', 'ungeprüft']);
    });

    it('ein ungeprüfter Lead gilt als erreichbar — nicht geprüft ist nicht unerreichbar', () => {
        expect(isReachable(ungeprueft)).toBe(true);
        expect(isReachable({ siteEvidence: { contactPaths: { checked: false } } })).toBe(true);
    });

    it('Impressum-Link allein reicht für den Filter', () => {
        const nurImpressum = lead({ name: 'impressum' });
        nurImpressum.siteEvidence = { contactPaths: { checked: true, hasImpressumLink: true } };
        expect(isReachable(nurImpressum)).toBe(true);
    });

    it('kombiniert mit dem Kaufsignal-Filter', () => {
        const werberOhneKontakt = lead({ name: 'Werber', buySignal: { proven: true } });
        werberOhneKontakt.siteEvidence = { contactPaths: { checked: true, hasMailto: false, hasTel: false, hasImpressumLink: false } };
        expect(applyFilters([werberOhneKontakt], { buy: true })).toHaveLength(1);
        expect(applyFilters([werberOhneKontakt], { buy: true, reach: true })).toHaveLength(0);
    });
});

describe('hasBuySignal — neue proven-Semantik', () => {
    it('erkennt den proven-Marker aus der Kaufsignal-Achse', () => {
        expect(hasBuySignal({ buySignal: { proven: true, adActive: false, hiring: false } })).toBe(true);
    });
    it('bleibt rückwärtskompatibel zu gespeicherten Scans ohne proven', () => {
        expect(hasBuySignal({ buySignal: { adActive: true } })).toBe(true);
        expect(hasBuySignal({ buySignal: { hiring: true } })).toBe(true);
    });
    it('ein hoher Intent-Score OHNE proven zählt nicht', () => {
        // Aktivitätssignale erreichen die Schwelle, sind aber keine Ausgabe.
        expect(hasBuySignal({ buySignal: { proven: false, intentScore: 44 } })).toBe(false);
    });
});

describe('B6 — Sortierung „Ambition" (2026-08-17)', () => {
    const leads = [
        { name: 'A', leadScore: 90, buySignal: { intentScore: 12 } },
        { name: 'B', leadScore: 40, buySignal: { intentScore: 58 } },
        { name: 'C', leadScore: 70, buySignal: { intentScore: null } },
        { name: 'D', leadScore: 60, buySignal: { intentScore: 58 } }
    ];
    it('sortiert nach Kaufsignal-Evidenzsumme, Gleichstand nach Score, ungeprüft ans Ende', () => {
        const out = applyFilters(leads, { sort: 'ambition' });
        expect(out.map(l => l.name)).toEqual(['D', 'B', 'A', 'C']);
    });
    it('verändert die Eingabe nicht und lässt Standard-Sortierung unberührt', () => {
        applyFilters(leads, { sort: 'ambition' });
        expect(leads[0].name).toBe('A');
        expect(applyFilters(leads, {}).map(l => l.name)).toEqual(['A', 'C', 'D', 'B']);
    });
});
