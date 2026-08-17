import { describe, it, expect } from 'vitest';
import { quickReasons, scanFazit } from '../../src/scoring/quick-reasons.js';

const texte = r => quickReasons(r).belege.map(b => b.text);
const arten = r => quickReasons(r).belege.map(b => b.kind);

describe('quickReasons — Belege der Schnellsuche-Karte', () => {
    it('der Founder-Fall ELBCAMPUS: viel Geschäft, aber nur ein Tempo-Befund', () => {
        // Genau die Karte aus dem Screenshot (2026-08-17): 67 % Chance klang nach
        // starkem Lead, tatsächlich trug die Badness NUR der Laborwert.
        const r = { reviews: 182, rating: 4.1, perf: 51, seo: 85, a11y: 78, isHttps: true, isBaukasten: false };
        const { belege, fazit } = quickReasons(r);
        expect(belege.map(b => b.text)).toContain('182 Bewertungen · 4,1★');
        expect(belege.map(b => b.text)).toContain('Labor-Tempo 51/100 (gedrosseltes 4G)');
        expect(fazit.stufe).toBe('mittel');
        expect(fazit.text).toMatch(/nicht ein Defekt/);
    });

    it('nennt strukturelle Mängel zuerst und stuft den Fall hoch', () => {
        const r = { reviews: 40, rating: 4.6, perf: 62, isHttps: false, isBaukasten: true, cms: 'Wix', viewportMissing: true };
        const { belege, fazit } = quickReasons(r);
        expect(belege[1].text).toBe('Baukasten: Wix');       // nach dem Geschäfts-Beleg
        expect(belege.map(b => b.text)).toContain('kein SSL — Browser warnt Besucher');
        expect(belege.map(b => b.text)).toContain('nicht für Handy gebaut');
        expect(fazit.stufe).toBe('stark');
    });

    it('Feld schnell schlägt Labor langsam — und macht den Fall SCHWACH', () => {
        // zbc.dental-Lehre: ein Tempo-Anschreiben wäre in einer Minute widerlegt.
        const r = { reviews: 90, rating: 4.8, perf: 34, isHttps: true, crux: { category: 'FAST', lcpMs: 2300, source: 'url' } };
        const { belege, fazit } = quickReasons(r);
        const gegen = belege.find(b => b.kind === 'gegenprobe');
        expect(gegen.text).toBe('Feld: echte Nutzer erleben sie schnell — 2,3 s bei 75 % der Aufrufe');
        expect(fazit.stufe).toBe('schwach');
    });

    it('Feld langsam ist ein Mangel-Beleg mit Sekundenwert', () => {
        const r = { reviews: 12, rating: 4.0, perf: 30, isHttps: true, crux: { category: 'SLOW', lcpMs: 6100, source: 'origin' } };
        expect(texte(r)).toContain('Feld: echte Nutzer warten — 6,1 s bei 75 % der Aufrufe (ganze Domain)');
    });

    it('eine nicht gemessene Kategorie wird NIE zum Mangel-Beleg', () => {
        // Der Kernfehler: PSI ohne Score liefert 0 — das las sich wie „Tempo 0".
        const r = { reviews: 50, rating: 4.2, perf: 0, perfKnown: false, seo: 0, seoKnown: false, a11y: 0, a11yKnown: false, isHttps: true };
        const t = texte(r);
        expect(t.some(x => /Labor-Tempo|SEO-Grundlagen|Barrierefreiheit/.test(x))).toBe(false);
        expect(t).toContain('Tempo nicht messbar — kein Tempo-Argument');
        expect(arten(r)).not.toContain('mangel');
        expect(quickReasons(r).fazit.stufe).toBe('schwach');
    });

    it('gespeicherte Alt-Scans ohne die neuen Felder bleiben lesbar', () => {
        // reopenBatch rendert Ergebnisse, die vor diesem Sprint gespeichert wurden:
        // kein perfKnown, kein crux, kein viewportMissing.
        const r = { reviews: 20, rating: 3.9, perf: 45, seo: 55, a11y: 60, isHttps: true, isBaukasten: false, cms: '' };
        const { belege, fazit } = quickReasons(r);
        expect(belege.map(b => b.text)).toContain('Labor-Tempo 45/100 (gedrosseltes 4G)');
        expect(belege.map(b => b.text)).toContain('SEO-Grundlagen 55/100');
        expect(fazit.stufe).toBe('mittel');
    });

    it('gute Werte ohne Mangel sagen ehrlich: hier gibt es nichts zu verkaufen', () => {
        const r = { reviews: 300, rating: 4.9, perf: 92, seo: 95, a11y: 90, isHttps: true, isBaukasten: false };
        const { belege, fazit } = quickReasons(r);
        expect(belege.filter(b => b.kind === 'mangel')).toHaveLength(0);
        expect(fazit.stufe).toBe('schwach');
        expect(fazit.text).toMatch(/wenig zu verkaufen/);
    });

    it('benennt IMMER, was die Schnellprüfung nicht gesehen hat', () => {
        const { ungeprueft } = quickReasons({ reviews: 10, rating: 4 });
        expect(ungeprueft).toEqual(['Anzeigen', 'Stellenanzeigen', 'KI-Sichtbarkeit', 'Alter der Seite']);
    });

    it('erfindet keine Bewertungs-Note und keine Sekunden', () => {
        expect(texte({ reviews: 7 })).toContain('7 Bewertungen');
        expect(texte({ reviews: 7, rating: 0 })).toContain('7 Bewertungen');
        const ohneMs = texte({ reviews: 5, perf: 20, crux: { category: 'SLOW' } });
        expect(ohneMs).toContain('Feld: echte Nutzer warten');
    });

    it('ist robust gegen ein leeres Ergebnis — und behauptet dann NICHTS', () => {
        // Ohne jeden Messwert bleibt genau ein ehrlicher Satz übrig: kein
        // Geschäfts-Beleg, kein Mangel-Beleg, nur die offene Tempo-Lücke.
        const { belege, fazit } = quickReasons({});
        expect(belege).toEqual([{ kind: 'gegenprobe', text: 'Tempo nicht messbar — kein Tempo-Argument' }]);
        expect(fazit.stufe).toBe('schwach');
        expect(() => quickReasons()).not.toThrow();
    });
});

describe('scanFazit — Urteil für die Region-Scan-Liste', () => {
    it('Mangel + bewiesenes Kaufsignal = der stärkste Fall', () => {
        const f = scanFazit({ hardStructural: 2, buySignal: { proven: true }, adChecked: true, ki: {}, siteAge: { konstanz4J: true } });
        expect(f.stufe).toBe('stark');
        expect(f.text).toMatch(/Belegter Mangel UND bewiesenes Kaufsignal/);
        expect(f.ungeprueft).toEqual([]);
    });

    it('Mangel ohne Kaufsignal bleibt mittel und sagt das auch', () => {
        const f = scanFazit({ hardStructural: 1, buySignal: { proven: false }, adChecked: true, ki: {}, siteAge: {} });
        expect(f.stufe).toBe('mittel');
        expect(f.text).toMatch(/Kaufbereitschaft ist offen/);
    });

    it('Kaufsignal ohne Mangel: ehrlich als Wirkungs-, nicht Defekt-Fall', () => {
        const f = scanFazit({ hardStructural: 0, buySignal: { adActive: true }, adChecked: true, ki: {}, siteAge: {} });
        expect(f.stufe).toBe('mittel');
        expect(f.text).toMatch(/nicht ein Defekt/);
    });

    it('weder noch = schwach', () => {
        expect(scanFazit({ hardStructural: 0, adChecked: true, ki: {}, siteAge: {} }).stufe).toBe('schwach');
    });

    it('eine schon zeitgemäße Seite schlägt alles andere', () => {
        const f = scanFazit({ hardStructural: 1, buySignal: { proven: true }, looksAlreadyGood: true });
        expect(f.stufe).toBe('schwach');
        expect(f.text).toMatch(/wenig zu verkaufen/);
    });

    it('nennt den Deckel, wenn er greift', () => {
        expect(scanFazit({ hardStructural: 0, scoreCap: 69 }).text).toMatch(/Score gedeckelt/);
        expect(scanFazit({ hardStructural: 0, scoreCap: null }).text).not.toMatch(/gedeckelt/);
    });

    it('unterscheidet „nie geprüft" von „geprüft und geblockt"', () => {
        expect(scanFazit({ adChecked: false }).ungeprueft).toContain('Anzeigen (nur die vorderen Ränge werden geprüft)');
        expect(scanFazit({ adChecked: false, adBlocked: true }).ungeprueft).toContain('Anzeigen (Seite hat den Prüfer geblockt)');
        // Vollständig geprüft heißt: Anzeigen sauber gescannt, KI-Signale da UND
        // ein Archiv-Urteil (true/false) — ein siteAge ohne konstanz4J ist offen.
        expect(scanFazit({ adChecked: true, ki: {}, siteAge: { konstanz4J: false } }).ungeprueft).toEqual([]);
    });

    it('meldet den Archiv-Ausfall getrennt vom fehlenden Seitenalter', () => {
        expect(scanFazit({ adChecked: true, ki: {}, siteAge: null }).ungeprueft).toContain('Alter der Seite');
        expect(scanFazit({ adChecked: true, ki: {}, siteAge: { konstanz4J: null } }).ungeprueft).toContain('Stillstand (Archiv lieferte nichts)');
    });

    it('ist robust gegen einen leeren Lead', () => {
        expect(() => scanFazit()).not.toThrow();
        expect(scanFazit().stufe).toBe('schwach');
    });
});
