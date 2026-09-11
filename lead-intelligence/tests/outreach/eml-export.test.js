import { describe, it, expect } from 'vitest';
import { baueMbox } from '../../src/outreach/eml-export.js';

const erlaubt = {
    to: 'inhaber@betrieb.de', subject: 'Hinweis zu Ihrer Website', body: 'Text\n—\nWiderspruchsrecht …', bodyHtml: '',
    from: { name: 'Muammer Kizilaslan', email: 'kontakt@karriaro.de' },
    listUnsubscribe: { mailto: 'mailto:kontakt@karriaro.de?subject=Abmelden', https: 'https://karriaro-webdesign.de/abmelden?t=tok' },
    grundlage: { erlaubt: true, kanal: 'email', grundlage: 'doi' }
};
const ohneGrundlage = { ...erlaubt, to: 'kalt@fremd.de', grundlage: { erlaubt: false, kanal: 'email', grundlage: 'keine' } };
const ohnePruefung = { ...erlaubt, to: 'alt@fremd.de', grundlage: undefined };

describe('baueMbox', () => {
    it('exportiert nur Entwürfe mit erlaubter Grundlage', () => {
        const { mbox, exportiert, blockiert } = baueMbox([erlaubt, ohneGrundlage, ohnePruefung]);
        expect(exportiert).toBe(1);
        expect(blockiert).toBe(2);
        expect(mbox).toContain('To: inhaber@betrieb.de');
        expect(mbox).not.toContain('kalt@fremd.de');
        expect(mbox).not.toContain('alt@fremd.de');
    });

    it('trägt From, Date und List-Unsubscribe mit One-Click', () => {
        const { mbox } = baueMbox([erlaubt]);
        expect(mbox).toMatch(/^From outreach@karriaro /);
        expect(mbox).toContain('From: Muammer Kizilaslan <kontakt@karriaro.de>');
        expect(mbox).toMatch(/\r\nDate: /);
        expect(mbox).toContain('List-Unsubscribe-Post: List-Unsubscribe=One-Click');
    });

    it('ohne erlaubte Entwürfe: leer', () => {
        const r = baueMbox([ohneGrundlage]);
        expect(r.exportiert).toBe(0);
        expect(r.mbox).toBe('');
    });
});

describe('baueMbox — Versand-Kopf wird ergänzt', () => {
    it('Entwurf ohne from/listUnsubscribe bekommt Absender und Abmelde-Adresse', () => {
        const nackt = { to: 'inhaber@betrieb.de', subject: 'Hinweis', body: 'Text', grundlage: { erlaubt: true, kanal: 'email', grundlage: 'anfrage' } };
        const { mbox, exportiert } = baueMbox([nackt]);
        expect(exportiert).toBe(1);
        expect(mbox).toMatch(/\r\nFrom: .+ <kontakt@karriaro\.de>\r\n/);
        expect(mbox).toContain('List-Unsubscribe: <mailto:kontakt@karriaro.de?subject=Abmelden>');
        // Anfrage trägt keinen Token → kein One-Click-Versprechen (Gegenprobe)
        expect(mbox).not.toContain('List-Unsubscribe-Post');
    });

    it('ein mitgegebener Absender bleibt unverändert (Gegenprobe)', () => {
        const eigen = { ...erlaubt, from: { name: 'Anderer Name', email: 'anders@karriaro.de' } };
        const { mbox } = baueMbox([eigen]);
        expect(mbox).toContain('From: Anderer Name <anders@karriaro.de>');
        expect(mbox.match(/\r\nFrom: /g)).toHaveLength(1);
    });
});
