import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import { selectVariant, logSent, logReply, VARIANTS } from '../../src/learning/ab-test.js';

// localStorage-Stub (Node-Umgebung, kein jsdom).
let store = {};
beforeAll(() => {
    globalThis.localStorage = {
        getItem: k => (k in store ? store[k] : null),
        setItem: (k, v) => { store[k] = String(v); },
        removeItem: k => { delete store[k]; }
    };
});
afterAll(() => { delete globalThis.localStorage; });
beforeEach(() => { store = {}; });

describe('A/B-Test — Rückkanal, der vorher keinen einzigen Aufrufer hatte', () => {
    it('nutzt die TONALITÄTEN, die das Outreach-Studio tatsächlich verschickt', () => {
        // Vorher standen hier 'emotional'/'rational'/'hybrid' — eine Achse, die
        // nirgends verschickt wurde. logSent('professionell') wäre still abgeprallt.
        expect(VARIANTS).toEqual(['professionell', 'freundlich', 'direkt']);
    });

    it('meldet KEINE Konfidenz, solange nichts verschickt wurde', () => {
        // §7: einer Zufallswahl kein Vertrauens-Label anheften.
        const r = selectVariant();
        expect(r.confidence).toBeNull();
        expect(r.totalSent).toBe(0);
        expect(VARIANTS).toContain(r.variant);
    });

    it('zählt Versand und Antwort und meldet dann eine Konfidenz', () => {
        for (let i = 0; i < 12; i++) logSent('direkt');
        logReply('direkt');
        const r = selectVariant();
        expect(r.totalSent).toBe(12);
        expect(r.confidence).toBe('mittel');
        expect(r.stats.direkt).toEqual({ sent: 12, replied: 1 });
    });

    it('ignoriert unbekannte Varianten, statt den Stand zu verfälschen', () => {
        logSent('emotional');          // alte Achse
        logReply('gibtsnicht');
        expect(selectVariant().totalSent).toBe(0);
    });

    it('lässt die Antwortquote nie über 100 % laufen', () => {
        // Fall: Status per Hand auf „geantwortet" gesetzt, ohne dass der Versand
        // erfasst wurde. Ohne Korrektur wäre das Beta-Update ungültig (b < 0).
        logReply('freundlich');
        const s = selectVariant().stats.freundlich;
        expect(s.replied).toBe(1);
        expect(s.sent).toBeGreaterThanOrEqual(s.replied);
    });

    it('übersteht einen kaputten/teilweisen gespeicherten Stand', () => {
        store['karriaro_ab_stats_v2'] = '{"direkt":{"sent":5,"replied":2}}';
        const r = selectVariant();
        expect(r.stats.direkt).toEqual({ sent: 5, replied: 2 });
        expect(r.stats.professionell).toEqual({ sent: 0, replied: 0 });
        expect(VARIANTS).toContain(r.variant);
    });

    it('übersteht unlesbares JSON', () => {
        store['karriaro_ab_stats_v2'] = 'kein json {{{';
        expect(() => selectVariant()).not.toThrow();
        expect(selectVariant().totalSent).toBe(0);
    });

    it('liest den ALTEN Schlüssel nicht mehr (andere Achse, andere Bedeutung)', () => {
        store['karriaro_ab_stats'] = '{"emotional":{"sent":99,"replied":50}}';
        expect(selectVariant().totalSent).toBe(0);
    });
});
