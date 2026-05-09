import { describe, it, expect } from 'vitest';
import { assessCognitiveLoad } from '../../src/analysis/cognitive-load.js';

function psi(audits) {
    return { lighthouseResult: { audits } };
}

describe('assessCognitiveLoad — domSize null-safe', () => {
    it('liefert domSize=null wenn dom-size-Audit fehlt (kein 0-Fallback)', () => {
        const r = assessCognitiveLoad(psi({}));
        expect(r.domSize).toBeNull();
    });

    it('liefert domSize=null wenn numericValue null ist', () => {
        const r = assessCognitiveLoad(psi({ 'dom-size': { numericValue: null } }));
        expect(r.domSize).toBeNull();
    });

    it('liefert domSize=null wenn numericValue undefined ist', () => {
        const r = assessCognitiveLoad(psi({ 'dom-size': {} }));
        expect(r.domSize).toBeNull();
    });

    it('liefert domSize=null wenn numericValue=0 (unplausibel fuer echte Site)', () => {
        const r = assessCognitiveLoad(psi({ 'dom-size': { numericValue: 0 } }));
        expect(r.domSize).toBeNull();
    });

    it('liefert echten DOM-Wert wenn Audit-Wert plausibel', () => {
        const r = assessCognitiveLoad(psi({ 'dom-size': { numericValue: 1200 } }));
        expect(r.domSize).toBe(1200);
    });

    it('Pitch-Argument zeigt domSize NICHT wenn null', () => {
        // Bug fixed: vorher kam "0 DOM-Elemente ueberfordert Besucher" auch
        // bei Sites ohne DOM-Audit-Daten.
        const r = assessCognitiveLoad(psi({
            'network-requests': { details: { items: Array(160).fill({ url: 'a' }) } },
            'unused-javascript': { details: { items: Array(8).fill({}) } },
            'unused-css-rules': { details: { items: Array(6).fill({}) } },
            'render-blocking-resources': { details: { items: Array(6).fill({}) } }
        }));
        expect(r.loadScore).toBeGreaterThanOrEqual(50);
        expect(r.domSize).toBeNull();
        if (r.pitchArg) {
            expect(r.pitchArg).not.toMatch(/0 DOM-Elemente/);
            expect(r.pitchArg).not.toMatch(/null DOM-Elemente/);
        }
    });
});
