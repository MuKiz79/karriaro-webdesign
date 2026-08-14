import { describe, it, expect } from 'vitest';
import { checkBFSGCompliance } from '../../src/analysis/bfsg-compliance.js';

const mockPsi = (overrides = {}) => ({
    lighthouseResult: {
        audits: {
            'color-contrast': { score: 1 },
            'image-alt': { score: 1 },
            'label': { score: 1 },
            'link-name': { score: 1 },
            'button-name': { score: 1 },
            'html-has-lang': { score: 1 },
            'document-title': { score: 1 },
            'heading-order': { score: 1 },
            'tabindex': { score: 1 },
            'meta-viewport': { score: 1 },
            'target-size': { score: 1 },
            'duplicate-id-active': { score: 1 },
            ...overrides
        },
        categories: { accessibility: { score: 0.95 } }
    }
});

describe('checkBFSGCompliance', () => {
    it('all passing = niedrig risk', () => {
        const result = checkBFSGCompliance(mockPsi());
        expect(result.risk).toBe('niedrig');
        expect(result.criticalFails).toHaveLength(0);
        expect(result.complianceScore).toBeGreaterThanOrEqual(90);
    });

    it('missing color-contrast + image-alt = hoch risk', () => {
        const result = checkBFSGCompliance(mockPsi({
            'color-contrast': { score: 0, details: { items: [{},{},{}] } },
            'image-alt': { score: 0, details: { items: [{}] } }
        }));
        expect(result.risk).toBe('hoch');
        expect(result.criticalFails.length).toBeGreaterThanOrEqual(2);
        expect(result.pitchArg).toBeTruthy();
    });

    it('many failures = kritisch risk', () => {
        const result = checkBFSGCompliance(mockPsi({
            'color-contrast': { score: 0 },
            'image-alt': { score: 0 },
            'label': { score: 0 },
            'link-name': { score: 0 },
            'button-name': { score: 0 },
            'tabindex': { score: 0 },
            'meta-viewport': { score: 0 }
        }));
        expect(result.risk).toBe('kritisch');
        expect(result.riskLabel).toBe('gravierende Barrieren');
    });

    it('should return funnelImpact', () => {
        const result = checkBFSGCompliance(mockPsi({ 'color-contrast': { score: 0 }, 'image-alt': { score: 0 } }));
        expect(result.funnelImpact).toBeGreaterThan(0);
    });
});

// ════════════════════════════════════════════════════════════════════════════
// 2026-08-14 — Keine Rechtsfolge ohne geprüfte Betroffenheit.
//
// Diese Gruppe ist der eigentliche Schutz. Sie prüft in BEIDE Richtungen: das
// Verbot muss greifen UND das erlaubte Argument muss weiter durchkommen. Ein
// Test, der nur „nichts Verbotenes gefunden" sagen kann, beweist nichts — er
// bestünde auch, wenn die Funktion gar nichts mehr zurückgäbe.
// ════════════════════════════════════════════════════════════════════════════

const kaputt = () => mockPsi({
    'color-contrast': { score: 0 }, 'image-alt': { score: 0 },
    'label': { score: 0 }, 'link-name': { score: 0 },
    'button-name': { score: 0 }, 'tabindex': { score: 0 },
    'meta-viewport': { score: 0 }
});

// Alles, was eine Geldsumme oder eine Rechtsfolge behauptet. Die Beträge sind
// die drei, die früher aus dem Score abgeleitet wurden — 50.000 € steht in
// § 37 BFSG an keiner Stelle.
const VERBOTEN = /\b(?:Bußgeld|Bussgeld|Abmahn|abmahn|100\.000|50\.000|10\.000\s*€|drohen)/;

function alleTexte(r) {
    return [r.pitchArg, r.riskLabel, r.rechtsHinweis].filter(Boolean).join(' || ');
}

describe('BFSG: keine Rechtsfolge ohne geprüfte Betroffenheit', () => {
    it('ohne Pflichtlage: kein Rechtssatz, keine Geldsumme, kein Abmahnwort', () => {
        const r = checkBFSGCompliance(kaputt());          // zweites Argument fehlt = nicht geprüft
        expect(r.pflichtLage).toBeNull();
        expect(r.rechtsHinweis).toBeNull();
        expect(alleTexte(r)).not.toMatch(VERBOTEN);
    });

    it('wahrscheinlich ausgenommen: weiterhin kein Rechtssatz', () => {
        const r = checkBFSGCompliance(kaputt(), {
            lage: 'ausgenommen_wahrscheinlich', label: 'wahrscheinlich nicht erfasst',
            vertragsschluss: false, belege: [], vorbehalt: 'kein Online-Vertragsschluss gefunden'
        });
        expect(r.rechtsHinweis).toBeNull();
        expect(alleTexte(r)).not.toMatch(VERBOTEN);
    });

    it('Gegenprobe: der QUALITÄTS-Befund kommt trotzdem durch', () => {
        // Sonst hätte man das Signal versehentlich ganz abgeschaltet — der Fix
        // wäre „grün" und das Werkzeug stumm.
        const r = checkBFSGCompliance(kaputt());
        expect(r.pitchArg).toBeTruthy();
        expect(r.pitchArg).toMatch(/WCAG-Kriterien/);
        expect(r.riskLabel).toBe('gravierende Barrieren');
    });

    it('belegter Online-Abschluss: Rechtssatz erscheint — aber nur mit Vorbehalt', () => {
        const r = checkBFSGCompliance(kaputt(), {
            lage: 'moeglich', label: 'möglicherweise erfasst', vertragsschluss: true,
            belege: ['Shopify-Shop'],
            vorbehalt: 'Ob eine Pflicht besteht, hängt zusätzlich von der Betriebsgröße ab.'
        });
        expect(r.rechtsHinweis).toBeTruthy();
        expect(r.rechtsHinweis).toMatch(/kann sie unter das BFSG fallen/);
        expect(r.rechtsHinweis).toMatch(/Betriebsgröße/);      // der Vorbehalt fährt mit
        expect(r.rechtsHinweis).not.toMatch(VERBOTEN);          // auch hier kein Betrag
    });

    it('belegter Abschluss, aber Seite in Ordnung: kein Rechtssatz', () => {
        // Ein Shop mit sauberer Barrierefreiheit hat keinen Anlass — sonst wäre der
        // Satz ein reiner Anlass-Generator statt eines Befundes.
        const r = checkBFSGCompliance(mockPsi(), {
            lage: 'moeglich', label: 'möglicherweise erfasst', vertragsschluss: true,
            belege: ['Shopify-Shop'], vorbehalt: '…'
        });
        expect(r.rechtsHinweis).toBeNull();
    });

    it('das Verbots-Muster erkennt einen echten Verstoß (Selbsttest des Gates)', () => {
        // Ohne diese Zeile könnte VERBOTEN eine kaputte Regex sein und alles wäre
        // stumm grün.
        expect('Es drohen Bußgelder bis 50.000 €').toMatch(VERBOTEN);
        expect('Ihre Website erfüllt 43% der geprüften WCAG-Kriterien.').not.toMatch(VERBOTEN);
    });
});
