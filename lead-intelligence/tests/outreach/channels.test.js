import { describe, it, expect } from 'vitest';
import { buildPitchEmail, buildCallSheet, buildLinkedIn, buildLetter } from '../../src/outreach/channels.js';
import { pruefeMailErlaubnis, leadAusCheck } from '../../src/outreach/kontakt-grundlage.js';

const data = {
    url: 'https://www.beispiel.de/',
    place: {
        displayName: { text: 'Beispiel <b>GmbH</b>' },
        formattedAddress: 'Hauptstr. 1, 77761 Schiltach',
        rating: 4.6, userRatingCount: 80, nationalPhoneNumber: '07836 123'
    },
    contactData: { owner: 'Anna Beispiel', emails: ['anna@beispiel.de'], allEmails: ['anna@beispiel.de'] }
};
const pack = { allArgs: [{ short: 'Perf 30/100', text: 'Google bewertet die Ladegeschwindigkeit mit 30/100.' }], mockupHeadline: null };

const einwilligung = {
    id: 'e1', email: 'buero@beispiel.de', domain: 'beispiel.de', confirmedAt: Date.now() - 86400000, revokedAt: null,
    stopped: false, sequenceStep: 0, source: 'startseite', createdAt: Date.now() - 2 * 86400000, unsubscribeToken: 'tok'
};

function pruefung(kontaktGrundlage, kanal, extra = {}) {
    const lead = leadAusCheck(data, [{ domain: 'beispiel.de', kontaktGrundlage }]);
    return pruefeMailErlaubnis(lead, { kanal, einwilligungen: [einwilligung], ...extra });
}
const KEINE = { art: 'keine' };
const DOI = { art: 'doi' };
const ANFRAGE = { art: 'anfrage', datum: '2026-09-01', nachweis: 'Formular vom 01.09.' };
const BESTAND = { art: 'bestandskunde', datum: '2025-03-01', nachweis: 'Auftrag 12' };

describe('buildPitchEmail', () => {
    it('ohne Prüfung, ohne Grundlage oder mit Prüfung eines anderen Kanals: kein Mailtext', () => {
        for (const p of [null, pruefung(KEINE, 'email'), pruefung(ANFRAGE, 'anruf')]) {
            const m = buildPitchEmail(data, 'https://pitch.example/x', p);
            expect(m.erlaubt).toBe(false);
            expect(m.body).toBeNull();
            expect(m.recipientEmail).toBeNull();
            expect(m.grund).toBeTruthy();
        }
    });

    it('Anfrage: Mail mit Seite, Einstieg als Antwort, Preis aus PREISE, Pflichtteil', () => {
        const m = buildPitchEmail(data, 'https://pitch.example/x', pruefung(ANFRAGE, 'email'));
        expect(m.erlaubt).toBe(true);
        expect(m.body).toContain('https://pitch.example/x');
        expect(m.body).toContain('vielen Dank für Ihre Anfrage');
        expect(m.body).not.toMatch(/ist uns dabei aufgefallen|Region online präsentieren/);
        expect(m.body).toContain('je nach Umfang ab 1.290 €');
        expect(m.body).toContain('Widerspruchsrecht');
        expect(m.body.startsWith(m.textKern)).toBe(true);
        expect(m.recipientEmail).toBe('anna@beispiel.de');
        expect(m.body).not.toMatch(/in den nächsten Tagen/);
    });

    it('Double-Opt-In: an die eingewilligte Adresse, ohne Anrede des Impressums-Inhabers', () => {
        const m = buildPitchEmail(data, 'https://pitch.example/x', pruefung(DOI, 'email'));
        expect(m.erlaubt).toBe(true);
        expect(m.recipientEmail).toBe('buero@beispiel.de');
        expect(m.body).toMatch(/^Sehr geehrte Damen und Herren,/);
        expect(m.listUnsubscribe.https).toContain('/abmelden?t=tok');
    });

    it('Sperrliste schlägt die Anfrage', () => {
        const m = buildPitchEmail(data, 'https://pitch.example/x', pruefung(ANFRAGE, 'email', { gesperrt: true }));
        expect(m.erlaubt).toBe(false);
    });
});

describe('buildCallSheet', () => {
    it('nur mit Anfrage oder Bestandskunde', () => {
        expect(buildCallSheet(data, pack, pruefung(KEINE, 'anruf')).erlaubt).toBe(false);
        expect(buildCallSheet(data, pack, pruefung(DOI, 'anruf')).erlaubt).toBe(false);
        expect(buildCallSheet(data, pack, null).erlaubt).toBe(false);
        expect(buildCallSheet(data, pack, pruefung(ANFRAGE, 'anruf')).erlaubt).toBe(true);
        expect(buildCallSheet(data, pack, pruefung(BESTAND, 'anruf')).erlaubt).toBe(true);
    });

    it('Einwand-Skript ohne Bitte um Post/E-Mail-Versand, Anlass sichtbar, Preis aus PREISE', () => {
        const cs = buildCallSheet(data, pack, pruefung(ANFRAGE, 'anruf'));
        const alles = JSON.stringify(cs);
        expect(alles).not.toMatch(/per Post oder E-Mail|schicken\?|zuschicken/);
        expect(cs.opener).toMatch(/angefragt/);
        expect(cs.anlass).toMatch(/Formular vom 01\.09\./);
        expect(alles).toContain('ab 1.290 €');
        expect(cs.nachDemGespraech).toMatch(/abgemeldet/);
    });

    it('trägt den Widerspruchshinweis für das Gespräch als eigenen Punkt (Art. 21 Abs. 4 DSGVO)', () => {
        const cs = buildCallSheet(data, pack, pruefung(BESTAND, 'anruf'));
        expect(cs.widerspruch).toMatch(/jederzeit widersprechen/);
        expect(cs.opener).not.toMatch(/widersprechen/);
        // Gegenprobe: ohne Grundlage gibt es gar kein Blatt und damit keinen Hinweistext
        expect(buildCallSheet(data, pack, pruefung(KEINE, 'anruf')).widerspruch).toBeUndefined();
    });
});

describe('buildLinkedIn', () => {
    it('nur als Antwort auf eine Anfrage — nicht mit Double-Opt-In, nicht als Bestandskunde, nicht kalt', () => {
        expect(buildLinkedIn(data, pack, pruefung(KEINE, 'linkedin')).erlaubt).toBe(false);
        expect(buildLinkedIn(data, pack, pruefung(DOI, 'linkedin')).erlaubt).toBe(false);
        expect(buildLinkedIn(data, pack, pruefung(BESTAND, 'linkedin')).erlaubt).toBe(false);
        const li = buildLinkedIn(data, pack, pruefung(ANFRAGE, 'linkedin'));
        expect(li.erlaubt).toBe(true);
        expect(li.message).toMatch(/vielen Dank für Ihre Anfrage/);
        // Widerspruchshinweis als eigener Absatz hinter der Signatur
        expect(li.message).toMatch(/\n\nSie können der Nutzung Ihrer Daten für Werbung jederzeit widersprechen/);
    });

    it('eine E-Mail-Prüfung schaltet LinkedIn nicht frei', () => {
        expect(buildLinkedIn(data, pack, pruefung(ANFRAGE, 'email')).erlaubt).toBe(false);
    });
});

describe('buildLetter', () => {
    const html = buildLetter(data, pack);

    it('trägt den Widerspruchshinweis mit Adresse aus dem Impressum', () => {
        expect(html).toMatch(/Art\. 21 Abs\. 2 DSGVO/);
        expect(html).toContain('kontakt@karriaro.de');
        expect(html).toContain('Spitalstr. 7, 77761 Schiltach');
    });

    it('Preis aus PREISE, Firmenname escaped', () => {
        expect(html).toContain('ab 1.290 €');
        expect(html).not.toContain('<b>GmbH</b>');
        expect(html).toContain('Beispiel &lt;b&gt;GmbH&lt;/b&gt;');
    });
});
