import { describe, it, expect } from 'vitest';
import { pruefeMailErlaubnis, nurMitGrundlage, leadAusCheck, manuelleDoiMails, empfaengerAusLead } from '../../src/outreach/kontakt-grundlage.js';

const NOW = Date.parse('2026-09-10T12:00:00Z');
const TAG = 24 * 60 * 60 * 1000;

function einwilligung(extra = {}) {
    return {
        id: 'e1', email: 'inhaber@betrieb.de', domain: 'betrieb.de',
        confirmedAt: NOW - 3 * TAG, revokedAt: null, stopped: false, sequenceStep: 0,
        source: 'website-pruefen', createdAt: NOW - 4 * TAG, unsubscribeToken: 'tok123',
        expiresAt: null, ...extra
    };
}
function lead(extra = {}) {
    return {
        id: 'betrieb_de', domain: 'betrieb.de',
        contactData: { allEmails: ['info@betrieb.de'] },
        kontaktGrundlage: { art: 'keine', datum: null, nachweis: null },
        ...extra
    };
}
const doi = { art: 'doi', datum: null, nachweis: null };
const anfrage = { art: 'anfrage', datum: '2026-09-01T00:00:00.000Z', nachweis: 'Kontaktformular, Nachricht vom 01.09.' };
const bestand = { art: 'bestandskunde', datum: '2025-03-01T00:00:00.000Z', nachweis: 'Auftrag Nr. 12' };

describe('pruefeMailErlaubnis — keine Grundlage', () => {
    it('blockiert E-Mail, LinkedIn und Anruf', () => {
        for (const kanal of ['email', 'linkedin', 'anruf']) {
            const r = pruefeMailErlaubnis(lead(), { kanal, now: NOW });
            expect(r.erlaubt).toBe(false);
            expect(r.grundlage).toBe('keine');
            expect(r.einwilligung).toBeNull();
            expect(r.rechtshinweis).toMatch(/§ 7|Anlass/);
        }
    });

    it('fehlendes kontaktGrundlage-Feld und unbekannte Art gelten als keine', () => {
        expect(pruefeMailErlaubnis({ domain: 'x.de' }, { now: NOW }).grundlage).toBe('keine');
        expect(pruefeMailErlaubnis(lead({ kontaktGrundlage: { art: 'kalt' } }), { now: NOW }).erlaubt).toBe(false);
        expect(pruefeMailErlaubnis(null, { now: NOW }).erlaubt).toBe(false);
    });

    it('Brief bleibt ohne Grundlage erlaubt (Gegenprobe)', () => {
        const r = pruefeMailErlaubnis(lead(), { kanal: 'brief', now: NOW });
        expect(r.erlaubt).toBe(true);
    });

    it('eine passende bestätigte Einwilligung trägt erst nach Übernahme — wird aber vorgeschlagen', () => {
        const r = pruefeMailErlaubnis(lead(), { einwilligungen: [einwilligung()], now: NOW });
        expect(r.erlaubt).toBe(false);
        expect(r.vorschlag?.id).toBe('e1');
        expect(r.einwilligung).toBeNull();
    });
});

describe('pruefeMailErlaubnis — Double-Opt-In', () => {
    it('bestätigte Einwilligung mit gleicher Adresse → erlaubt, Empfänger = eingewilligte Adresse', () => {
        const r = pruefeMailErlaubnis(lead({ kontaktGrundlage: doi, contactData: { allEmails: ['inhaber@betrieb.de'] } }), { einwilligungen: [einwilligung()], now: NOW });
        expect(r.erlaubt).toBe(true);
        expect(r.grundlage).toBe('doi');
        expect(r.einwilligung.id).toBe('e1');
        expect(r.empfaenger).toBe('inhaber@betrieb.de');
        expect(r.verbleibend).toBe(3);
    });

    it('Domain-Treffer → Empfänger ist die EINGEWILLIGTE Adresse, nie die Impressums-Adresse', () => {
        const r = pruefeMailErlaubnis(lead({ kontaktGrundlage: doi }), { einwilligungen: [einwilligung()], now: NOW });
        expect(r.erlaubt).toBe(true);
        expect(r.empfaenger).toBe('inhaber@betrieb.de');
        expect(r.empfaenger).not.toBe('info@betrieb.de');
    });

    it('widerrufen → blockiert', () => {
        const r = pruefeMailErlaubnis(lead({ kontaktGrundlage: doi }), { einwilligungen: [einwilligung({ revokedAt: NOW - TAG })], now: NOW });
        expect(r.erlaubt).toBe(false);
        expect(r.grund).toMatch(/widerrufen/);
    });

    it('gestoppt → blockiert', () => {
        const r = pruefeMailErlaubnis(lead({ kontaktGrundlage: doi }), { einwilligungen: [einwilligung({ stopped: true })], now: NOW });
        expect(r.erlaubt).toBe(false);
        expect(r.grund).toMatch(/gestoppt/);
    });

    it('nicht bestätigt → blockiert', () => {
        const r = pruefeMailErlaubnis(lead({ kontaktGrundlage: doi }), { einwilligungen: [einwilligung({ confirmedAt: null })], now: NOW });
        expect(r.erlaubt).toBe(false);
        expect(r.grund).toMatch(/nicht bestätigt/);
    });

    it('Einwilligung einer FREMDEN Domain trägt nicht', () => {
        const r = pruefeMailErlaubnis(lead({ kontaktGrundlage: doi }), { einwilligungen: [einwilligung({ email: 'a@meinbetrieb.de', domain: 'meinbetrieb.de' })], now: NOW });
        expect(r.erlaubt).toBe(false);
        expect(r.grund).toMatch(/Keine bestätigte Einwilligung/);
    });

    it('Einwilligungen nicht lesbar → blockiert, aber als „nicht prüfbar" (nicht als „keine")', () => {
        const r = pruefeMailErlaubnis(lead({ kontaktGrundlage: doi }), { einwilligungen: [einwilligung()], einwilligungenGeladen: false, now: NOW });
        expect(r.erlaubt).toBe(false);
        expect(r.nichtPruefbar).toBe(true);
        expect(r.grund).toMatch(/nicht prüfbar/);
    });

    it('deckt höchstens drei E-Mails: Server-Sequenz + Studio-Versand zusammen', () => {
        const zwei = pruefeMailErlaubnis(lead({ kontaktGrundlage: doi }), { einwilligungen: [einwilligung({ sequenceStep: 2 })], now: NOW });
        expect(zwei.erlaubt).toBe(true);
        expect(zwei.verbleibend).toBe(1);
        const drei = pruefeMailErlaubnis(lead({ kontaktGrundlage: doi, einwilligungsMails: { e1: 1 } }), { einwilligungen: [einwilligung({ sequenceStep: 2 })], now: NOW });
        expect(drei.erlaubt).toBe(false);
        expect(drei.grund).toMatch(/höchstens 3/);
        // Zähler einer ANDEREN Einwilligung zählt nicht mit
        const andere = pruefeMailErlaubnis(lead({ kontaktGrundlage: doi, einwilligungsMails: { e9: 5 } }), { einwilligungen: [einwilligung({ sequenceStep: 2 })], now: NOW });
        expect(andere.erlaubt).toBe(true);
    });

    it('läuft die Server-Strecke noch (Termin gesetzt), ist jede zusätzliche E-Mail über dem Kontingent', () => {
        // Die Server-Strecke sendet selbst bis zu drei E-Mails und kennt die Studio-
        // Zähler nicht: Schritt 0 + 1 manuelle Mail + 3 Server-Mails wären vier.
        for (const step of [0, 1, 2]) {
            const r = pruefeMailErlaubnis(lead({ kontaktGrundlage: doi }), {
                einwilligungen: [einwilligung({ sequenceStep: step, nextSendAt: NOW + TAG })], now: NOW
            });
            expect(r.erlaubt).toBe(false);
            expect(r.strecke).toBe(true);
            expect(r.grund).toMatch(new RegExp(`noch ${3 - step} von 3`));
        }
        // Gegenprobe: Strecke ohne Termin (angehalten) → das Restkontingent trägt
        const ohneTermin = pruefeMailErlaubnis(lead({ kontaktGrundlage: doi }), {
            einwilligungen: [einwilligung({ sequenceStep: 1, nextSendAt: null })], now: NOW
        });
        expect(ohneTermin.erlaubt).toBe(true);
        expect(ohneTermin.verbleibend).toBe(2);
        // Der Block gilt nur für Double-Opt-In: eine Anfrage bleibt erlaubt
        const anf = pruefeMailErlaubnis(lead({ kontaktGrundlage: anfrage }), {
            einwilligungen: [einwilligung({ nextSendAt: NOW + TAG })], now: NOW
        });
        expect(anf.erlaubt).toBe(true);
    });

    it('die Einwilligung umfasst nur E-Mails — nicht LinkedIn und nicht den Anruf', () => {
        for (const kanal of ['linkedin', 'anruf']) {
            const r = pruefeMailErlaubnis(lead({ kontaktGrundlage: doi }), { einwilligungen: [einwilligung()], kanal, now: NOW });
            expect(r.erlaubt).toBe(false);
            expect(r.grund).toMatch(/nur E-Mails/);
        }
    });
});

describe('pruefeMailErlaubnis — Anfrage und Bestandskunde', () => {
    it('Anfrage mit Datum und Nachweis → erlaubt, mit Hinweis auf den Gegenstand', () => {
        const r = pruefeMailErlaubnis(lead({ kontaktGrundlage: anfrage }), { now: NOW });
        expect(r.erlaubt).toBe(true);
        expect(r.grundlage).toBe('anfrage');
        expect(r.hinweis).toMatch(/Gegenstand/);
        expect(r.empfaenger).toBe('info@betrieb.de');
        expect(r.datum).toBe(anfrage.datum);
    });

    it('Anfrage ohne Datum oder ohne Nachweis → blockiert', () => {
        expect(pruefeMailErlaubnis(lead({ kontaktGrundlage: { ...anfrage, datum: null } }), { now: NOW }).erlaubt).toBe(false);
        expect(pruefeMailErlaubnis(lead({ kontaktGrundlage: { ...anfrage, nachweis: '' } }), { now: NOW }).erlaubt).toBe(false);
        expect(pruefeMailErlaubnis(lead({ kontaktGrundlage: { ...anfrage, nachweis: '   ' } }), { now: NOW }).erlaubt).toBe(false);
    });

    it('Datum in der Zukunft trägt nicht', () => {
        const r = pruefeMailErlaubnis(lead({ kontaktGrundlage: { ...anfrage, datum: '2027-01-01' } }), { now: NOW });
        expect(r.erlaubt).toBe(false);
        expect(r.grund).toMatch(/Zukunft/);
    });

    it('Bestandskunde mit beidem → E-Mail und Anruf erlaubt, LinkedIn nicht', () => {
        const kgLead = lead({ kontaktGrundlage: bestand });
        expect(pruefeMailErlaubnis(kgLead, { now: NOW }).erlaubt).toBe(true);
        expect(pruefeMailErlaubnis(kgLead, { kanal: 'anruf', now: NOW }).erlaubt).toBe(true);
        expect(pruefeMailErlaubnis(kgLead, { kanal: 'linkedin', now: NOW }).erlaubt).toBe(false);
    });

    it('Bestandskunde: Hinweis nennt die beim Auftrag erhaltene Adresse — die Anfrage nicht (Gegenprobe)', () => {
        const b = pruefeMailErlaubnis(lead({ kontaktGrundlage: bestand }), { now: NOW });
        expect(b.hinweis).toMatch(/beim Auftrag erhaltene E-Mail-Adresse/);
        const a = pruefeMailErlaubnis(lead({ kontaktGrundlage: anfrage }), { now: NOW });
        expect(a.hinweis).toMatch(/von der die Anfrage kam/);
        expect(a.hinweis).not.toMatch(/Auftrag/);
        // Beim Anruf keine Rede von einer Adresse
        expect(pruefeMailErlaubnis(lead({ kontaktGrundlage: bestand }), { kanal: 'anruf', now: NOW }).hinweis).not.toMatch(/Adresse/);
    });

    it('Anfrage trägt LinkedIn und Anruf', () => {
        const kgLead = lead({ kontaktGrundlage: anfrage });
        expect(pruefeMailErlaubnis(kgLead, { kanal: 'linkedin', now: NOW }).erlaubt).toBe(true);
        expect(pruefeMailErlaubnis(kgLead, { kanal: 'anruf', now: NOW }).erlaubt).toBe(true);
    });

    it('Empfänger nimmt nie die alte, möglicherweise geratene contactEmail', () => {
        expect(empfaengerAusLead({ contactEmail: 'info@geraten.de' })).toBeNull();
        expect(empfaengerAusLead({ contactEmail: 'info@geraten.de', contact: { email: 'Echt@Betrieb.de' } })).toBe('echt@betrieb.de');
    });
});

describe('pruefeMailErlaubnis — Sperrliste und Werbewiderspruch schlagen jede Grundlage', () => {
    const faelle = [
        ['doi', lead({ kontaktGrundlage: doi }), { einwilligungen: [einwilligung()] }],
        ['anfrage', lead({ kontaktGrundlage: anfrage }), {}],
        ['bestandskunde', lead({ kontaktGrundlage: bestand }), {}]
    ];

    for (const [name, l, opts] of faelle) {
        it(`${name}: ohne Sperre erlaubt (Gegenprobe), mit Sperre nie`, () => {
            expect(pruefeMailErlaubnis(l, { ...opts, now: NOW }).erlaubt).toBe(true);
            expect(pruefeMailErlaubnis(l, { ...opts, gesperrt: true, now: NOW }).erlaubt).toBe(false);
            expect(pruefeMailErlaubnis({ ...l, suppressed: true }, { ...opts, now: NOW }).erlaubt).toBe(false);
        });

        it(`${name}: Werbewiderspruch → nie, über keinen Kanal`, () => {
            const w = { ...l, contactData: { ...l.contactData, werbewiderspruch: true } };
            for (const kanal of ['email', 'linkedin', 'anruf', 'brief']) {
                const r = pruefeMailErlaubnis(w, { ...opts, kanal, now: NOW });
                expect(r.erlaubt).toBe(false);
                expect(r.grund).toMatch(/Werbewiderspruch/);
            }
        });
    }

    it('Brief auf der Sperrliste → blockiert', () => {
        expect(pruefeMailErlaubnis(lead(), { kanal: 'brief', gesperrt: true, now: NOW }).erlaubt).toBe(false);
    });

    it('Sperre und Widerspruch tragen gesperrt:true — eine fehlende Grundlage nicht (Gegenprobe)', () => {
        expect(pruefeMailErlaubnis(lead(), { gesperrt: true, now: NOW }).gesperrt).toBe(true);
        expect(pruefeMailErlaubnis(lead({ contactData: { werbewiderspruch: true } }), { now: NOW }).gesperrt).toBe(true);
        expect(pruefeMailErlaubnis(lead(), { now: NOW }).gesperrt).toBeUndefined();
    });
});

describe('nurMitGrundlage', () => {
    it('lässt nur erlaubte E-Mail-Entwürfe mit Empfänger durch', () => {
        const ok = { to: 'a@b.de', grundlage: { erlaubt: true, kanal: 'email' } };
        const { erlaubt, blockiert } = nurMitGrundlage([
            ok,
            { to: 'a@b.de', grundlage: { erlaubt: false, kanal: 'email' } },
            { to: 'a@b.de' },
            { to: '', grundlage: { erlaubt: true, kanal: 'email' } },
            { to: 'a@b.de', grundlage: { erlaubt: true, kanal: 'brief' } }
        ]);
        expect(erlaubt).toEqual([ok]);
        expect(blockiert).toHaveLength(4);
    });
});

describe('leadAusCheck', () => {
    it('übernimmt Grundlage und Zähler aus dem gespeicherten Lead, Kontaktdaten aus der Analyse', () => {
        const gespeichert = [{ domain: 'betrieb.de', kontaktGrundlage: anfrage, einwilligungsMails: { e1: 1 } }];
        const l = leadAusCheck({ url: 'https://www.betrieb.de/', contactData: { allEmails: ['info@betrieb.de'] } }, gespeichert);
        expect(l.kontaktGrundlage).toEqual(anfrage);
        expect(l.contactData.allEmails).toEqual(['info@betrieb.de']);
        expect(manuelleDoiMails(l, 'e1')).toBe(1);
    });

    it('ein gespeicherter Werbewiderspruch bleibt, auch wenn die neue Analyse false meldet', () => {
        const gespeichert = [{ domain: 'betrieb.de', contactData: { werbewiderspruch: true } }];
        const l = leadAusCheck({ url: 'https://betrieb.de', contactData: { werbewiderspruch: false } }, gespeichert);
        expect(l.contactData.werbewiderspruch).toBe(true);
        expect(pruefeMailErlaubnis(l, { kanal: 'brief', now: NOW }).erlaubt).toBe(false);
    });

    it('ohne gespeicherten Lead: keine Grundlage', () => {
        const l = leadAusCheck({ url: 'https://neu.de', contactData: null }, []);
        expect(pruefeMailErlaubnis(l, { now: NOW }).grundlage).toBe('keine');
    });
});
