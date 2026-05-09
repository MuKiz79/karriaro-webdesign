import { describe, it, expect } from 'vitest';
import { decideAction } from '../../src/scoring/decision-engine.js';

describe('decideAction — EV ist Top-Filter', () => {
    it('SKIP wenn EV negativ, egal wie stark Trigger-Events', () => {
        const d = decideAction({
            composite: { composite: 76 },
            kelly: { expectedValue: -43.71 },
            triggers: { totalImpact: 12, hasSofort: true, topEvent: { label: 'BFSG' } },
            leadScore: 83
        });
        expect(d.action).toBe('skip');
        expect(d.actionLabel).toMatch(/Skip/);
        expect(d.reason).toMatch(/-44|EV/);
    });

    it('SKIP auch bei EV genau 0', () => {
        const d = decideAction({ composite: { composite: 80 }, kelly: { expectedValue: 0 }, triggers: { totalImpact: 5 } });
        expect(d.action).toBe('skip');
    });

    it('CONTACT_NOW wenn EV positiv und Trigger urgent (totalImpact >= 8)', () => {
        const d = decideAction({
            composite: { composite: 60 },
            kelly: { expectedValue: 250 },
            triggers: { totalImpact: 10, hasSofort: false, topEvent: { label: 'BFSG-Risiko' } }
        });
        expect(d.action).toBe('contact_now');
    });

    it('CONTACT_NOW wenn EV positiv und hasSofort=true', () => {
        const d = decideAction({
            composite: { composite: 50 },
            kelly: { expectedValue: 100 },
            triggers: { totalImpact: 3, hasSofort: true, topEvent: { label: 'SSL fehlt' } }
        });
        expect(d.action).toBe('contact_now');
    });

    it('CONTACT_SOON wenn EV positiv und Composite >= 65 aber kein Trigger', () => {
        const d = decideAction({
            composite: { composite: 70 },
            kelly: { expectedValue: 150 },
            triggers: { totalImpact: 2, hasSofort: false }
        });
        expect(d.action).toBe('contact_soon');
    });

    it('WATCHLIST wenn EV positiv aber Composite schwach und kein Trigger', () => {
        const d = decideAction({
            composite: { composite: 40 },
            kelly: { expectedValue: 50 },
            triggers: { totalImpact: 1 }
        });
        expect(d.action).toBe('watchlist');
    });

    it('Diagnostics enthalten alle relevanten Inputs', () => {
        const d = decideAction({
            composite: { composite: 76 },
            kelly: { expectedValue: 200 },
            triggers: { totalImpact: 4 },
            leadScore: 83
        });
        const diag = d.diagnostics.join(' ');
        expect(diag).toMatch(/Composite 76/);
        expect(diag).toMatch(/EV \+200/);
        expect(diag).toMatch(/Lead-Score 83/);
    });

    it('handhabt fehlende Inputs (kein Crash)', () => {
        expect(() => decideAction({})).not.toThrow();
        expect(() => decideAction()).not.toThrow();
    });

    it('Fallback wenn EV nicht berechenbar — keine "Skip"-Aussage ohne Mathe-Basis', () => {
        const d = decideAction({
            composite: { composite: 70 },
            kelly: { expectedValue: null },
            triggers: { totalImpact: 3 }
        });
        expect(d.action).not.toBe('skip');
    });
});
