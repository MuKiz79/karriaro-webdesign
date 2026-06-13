import { describe, it, expect } from 'vitest';
import { complianceBlock, compliancify } from '../../src/strategy/compliance.js';

const profile = { name: 'Muammer K.', company: 'Karriaro Webdesign', location: 'Köln', portfolio: 'karriaro-webdesign.de' };

const pack = {
    available: true,
    recipientEmail: 'info@beispiel.de',
    variants: [
        { tone: 'professionell', subject: 'Betreff A', body: 'Hallo,\n\nText.', bodyHtml: '<div style="x"><p>Text</p></div>', copyText: 'Betreff: Betreff A\n\nHallo,\n\nText.' },
        { tone: 'freundlich', subject: 'Betreff B', body: 'Hi,\n\nText B.', bodyHtml: '<div><p>Text B</p></div>', copyText: 'Betreff: Betreff B\n\nHi,\n\nText B.' }
    ],
    primary: null
};
pack.primary = pack.variants[0];

describe('complianceBlock', () => {
    it('enthält Absender-Impressum und Opt-out', () => {
        const cb = complianceBlock(profile);
        expect(cb.text).toContain('Karriaro Webdesign');
        expect(cb.text).toContain('kein Interesse');
        expect(cb.html).toContain('Karriaro Webdesign');
        expect(cb.html).toContain('kein Interesse');
    });
});

describe('compliancify', () => {
    it('hängt Impressum + Opt-out an body, copyText und bodyHtml jeder Variante', () => {
        const out = compliancify(pack, { allEmails: ['anna@beispiel.de'] }, profile);
        expect(out.complianceApplied).toBe(true);
        for (const v of out.variants) {
            expect(v.body).toContain('Karriaro Webdesign');
            expect(v.body).toContain('kein Interesse');
            expect(v.copyText).toContain('kein Interesse');
            expect(v.bodyHtml).toContain('kein Interesse');
        }
    });

    it('injiziert das HTML vor das letzte schließende </div>', () => {
        const out = compliancify(pack, null, profile);
        expect(out.variants[0].bodyHtml.endsWith('</div>')).toBe(true);
        // Opt-out steht VOR dem schließenden div, nicht danach
        expect(out.variants[0].bodyHtml.indexOf('kein Interesse')).toBeLessThan(out.variants[0].bodyHtml.lastIndexOf('</div>'));
    });

    it('setzt recipientEmail aus dem verifizierten Kontakt', () => {
        const out = compliancify(pack, { allEmails: ['anna@beispiel.de'] }, profile);
        expect(out.recipientEmail).toBe('anna@beispiel.de');
        expect(out.primary).toBe(out.variants[0]);
    });

    it('gibt unverfügbares Pack unverändert zurück', () => {
        const unav = { available: false, reason: 'x' };
        expect(compliancify(unav, null, profile)).toBe(unav);
    });
});
