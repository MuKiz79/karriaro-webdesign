import { describe, it, expect } from 'vitest';
import { lintVoice, assertVoiceClean, stripTags, FORBIDDEN_PATTERNS } from '../../src/reports/voice-linter.js';

describe('lintVoice', () => {
    it('returns no hits for clean Sie-Anrede content', () => {
        expect(lintVoice('Wir freuen uns auf Ihre Anfrage. Karriaro vermisst Ihre Branche datenbasiert.')).toEqual([]);
    });

    it('flags handgemacht as isoliertes Hero-Wort', () => {
        const hits = lintVoice('Karriaro liefert handgemacht und in höchster Qualität.');
        expect(hits.length).toBe(1);
        expect(hits[0].pattern).toMatch(/handgemacht/);
    });

    it('flags Werkstatt', () => {
        const hits = lintVoice('Willkommen in unserer Werkstatt für Webdesign.');
        expect(hits.some(h => /Werkstatt/i.test(h.pattern))).toBe(true);
    });

    it('flags SaaS-Filler', () => {
        const hits = lintVoice('Jetzt kostenlos starten — keine Kreditkarte nötig — in unter 60 Sekunden.');
        const labels = hits.map(h => h.pattern).join('|');
        expect(labels).toMatch(/kostenlos starten/);
        expect(labels).toMatch(/keine Kreditkarte/);
        expect(labels).toMatch(/60 Sekunden/);
    });

    it('flags Du-Anrede on a normal sentence', () => {
        const hits = lintVoice('Du bekommst Deine Auswertung sofort.');
        expect(hits.some(h => /Du-Anrede/.test(h.pattern))).toBe(true);
    });

    it('flags Hansgrohe explicitly', () => {
        const hits = lintVoice('Unsere Erfahrung bei Hansgrohe zeigt das deutlich.');
        expect(hits.some(h => /Hansgrohe/.test(h.pattern))).toBe(true);
    });

    it('does not flag legitimate German words that happen to contain Du', () => {
        // "Durchgehend", "Dunkelheit" etc. start with "Du" but are not pronouns
        expect(lintVoice('Durchgehend hohe Qualität.')).toEqual([]);
    });
});

describe('assertVoiceClean', () => {
    it('does not throw on clean text', () => {
        expect(() => assertVoiceClean('Saubere Sie-Anrede.')).not.toThrow();
    });
    it('throws VOICE_VIOLATION with a list of hits', () => {
        let err;
        try { assertVoiceClean('Du hast Werkstatt gewählt.'); }
        catch (e) { err = e; }
        expect(err).toBeDefined();
        expect(err.code).toBe('VOICE_VIOLATION');
        expect(err.hits.length).toBeGreaterThan(0);
    });
});

describe('stripTags', () => {
    it('removes scripts and tags', () => {
        const html = '<html><head><script>alert("Werkstatt")</script><style>.x{}</style></head><body><p>Saubere <em>Voice</em>.</p></body></html>';
        const text = stripTags(html);
        expect(text).not.toContain('<');
        expect(text).not.toContain('Werkstatt');
        expect(text).toContain('Saubere');
    });
});

describe('FORBIDDEN_PATTERNS', () => {
    it('exports a non-empty array', () => {
        expect(Array.isArray(FORBIDDEN_PATTERNS)).toBe(true);
        expect(FORBIDDEN_PATTERNS.length).toBeGreaterThan(5);
    });
});
