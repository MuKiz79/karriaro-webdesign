import { describe, it, expect } from 'vitest';
import { complianceBlock, compliancify, herkunftsSatz, setzeVarianteZusammen, listUnsubscribeFuer, mitVersandKopf } from '../../src/strategy/compliance.js';
import { pruefeMailErlaubnis } from '../../src/outreach/kontakt-grundlage.js';

// 2026-09-10 — Die frühere Fassung hängte an JEDE Mail „Sie erhalten diese
// einmalige Nachricht, weil Ihr Unternehmen öffentlich gelistet ist … kurze
// Antwort mit „kein Interesse" genügt" und die Tests schrieben genau diesen Satz
// fest. Beides war rechtlich falsch: Impressum und Opt-out machen eine Werbe-Mail
// ohne Einwilligung nicht zulässig (§ 7 Abs. 2 Nr. 2 UWG). Die Tests prüfen jetzt
// die Pflichtbausteine einer ZULÄSSIGEN Mail — und dass es ohne Grundlage keine gibt.

const NOW = Date.parse('2026-09-10T12:00:00Z');
const profile = { name: 'Muammer K.', company: 'Karriaro Webdesign', portfolio: 'karriaro-webdesign.de' };

const einwilligung = {
    id: 'e1', email: 'inhaber@beispiel.de', domain: 'beispiel.de', confirmedAt: Date.parse('2026-09-07T09:00:00Z'),
    revokedAt: null, stopped: false, sequenceStep: 0, source: 'website-pruefen', createdAt: NOW - 1e9,
    unsubscribeToken: 'abc/123'
};
function leadMit(kontaktGrundlage) {
    return { domain: 'beispiel.de', contactData: { allEmails: ['info@beispiel.de'] }, kontaktGrundlage };
}
const pDoi = pruefeMailErlaubnis(leadMit({ art: 'doi' }), { einwilligungen: [einwilligung], now: NOW });
const pAnfrage = pruefeMailErlaubnis(leadMit({ art: 'anfrage', datum: '2026-09-01', nachweis: 'Formular' }), { now: NOW });
const pBestand = pruefeMailErlaubnis(leadMit({ art: 'bestandskunde', datum: '2025-03-01', nachweis: 'Auftrag 12' }), { now: NOW });
const pKeine = pruefeMailErlaubnis(leadMit({ art: 'keine' }), { now: NOW });

function packFixture() {
    const variants = [
        { tone: 'professionell', subject: 'Betreff A', body: 'Hallo,\n\nText.', bodyHtml: '<div style="x"><p>Text</p></div>', copyText: 'Betreff: Betreff A\n\nHallo,\n\nText.' },
        { tone: 'freundlich', subject: 'Betreff B', body: 'Hi,\n\nText B.', bodyHtml: '<div><p>Text B</p></div>', copyText: 'Betreff: Betreff B\n\nHi,\n\nText B.' }
    ];
    return { available: true, recipientEmail: null, variants, primary: variants[0] };
}

describe('mitVersandKopf — Absender und Abmeldeweg vor Gmail/.mbox', () => {
    it('ergänzt fehlenden Absender aus dem Profil und List-Unsubscribe aus der Prüfung (DOI mit Token)', () => {
        const d = mitVersandKopf({ to: 'inhaber@beispiel.de', grundlage: pDoi }, profile);
        expect(d.from).toEqual({ name: 'Muammer K.', email: 'kontakt@karriaro.de' });
        expect(d.listUnsubscribe.mailto).toBe('mailto:kontakt@karriaro.de?subject=Abmelden');
        expect(d.listUnsubscribe.https).toBe('https://karriaro-webdesign.de/abmelden?t=abc%2F123');
    });

    it('Anfrage: nur mailto, kein https-Ziel (Gegenprobe zum DOI-Token)', () => {
        const d = mitVersandKopf({ to: 'info@beispiel.de', grundlage: pAnfrage }, profile);
        expect(d.listUnsubscribe.https).toBeNull();
        expect(d.listUnsubscribe.mailto).toMatch(/^mailto:kontakt@karriaro\.de/);
    });

    it('vorhandene gültige Angaben bleiben unverändert', () => {
        const eigen = { from: { name: 'X', email: 'x@karriaro.de' }, listUnsubscribe: { mailto: 'mailto:x@karriaro.de', https: null }, grundlage: pDoi };
        const d = mitVersandKopf(eigen, profile);
        expect(d.from).toBe(eigen.from);
        expect(d.listUnsubscribe).toBe(eigen.listUnsubscribe);
    });

    it('ungültige Absender-Adresse wird ersetzt statt einen leeren From-Header zu erzeugen', () => {
        const d = mitVersandKopf({ from: { name: 'X', email: 'kaputt' }, grundlage: pAnfrage }, profile);
        expect(d.from.email).toBe('kontakt@karriaro.de');
    });

    it('verändert den Eingang nicht', () => {
        const eingang = { to: 'a@b.de', grundlage: pAnfrage };
        mitVersandKopf(eingang, profile);
        expect(eingang.from).toBeUndefined();
        expect(eingang.listUnsubscribe).toBeUndefined();
    });
});

describe('Voraussetzung: die Prüfungen der Fixtures sind so, wie die Tests es annehmen', () => {
    it('DOI, Anfrage, Bestandskunde erlaubt; keine nicht', () => {
        expect(pDoi.erlaubt).toBe(true);
        expect(pAnfrage.erlaubt).toBe(true);
        expect(pBestand.erlaubt).toBe(true);
        expect(pKeine.erlaubt).toBe(false);
    });
});

describe('complianceBlock', () => {
    it('ohne erlaubte Prüfung gibt es KEINEN Pflichtteil (und damit keine Mail)', () => {
        expect(complianceBlock(profile, null)).toBeNull();
        expect(complianceBlock(profile, pKeine)).toBeNull();
        expect(complianceBlock(profile, { ...pAnfrage, kanal: 'linkedin' })).toBeNull();
    });

    it('DOI: Absender aus dem Impressum, Herkunft, Abmeldelink mit Token, getrennter Widerspruchshinweis', () => {
        const cb = complianceBlock(profile, pDoi);
        expect(cb.text).toContain('Muammer K. · Karriaro Webdesign');
        expect(cb.text).toContain('Spitalstr. 7, 77761 Schiltach');
        expect(cb.text).toContain('kontakt@karriaro.de');
        expect(cb.herkunft).toMatch(/am 07\.09\.2026 eingewilligt/);
        expect(cb.herkunft).toMatch(/Website-Prüfung/);
        expect(cb.text).toContain('https://karriaro-webdesign.de/abmelden?t=abc%2F123');
        // Widerspruchshinweis als eigener Absatz — durch eine Leerzeile getrennt
        expect(cb.text).toMatch(/\n\nWiderspruchsrecht: .*Art\. 21 Abs\. 2 DSGVO/);
        expect(cb.html).toContain('href="https://karriaro-webdesign.de/abmelden?t=abc%2F123"');
        expect(cb.html).toMatch(/<p [^>]*>Widerspruchsrecht:/);
        expect(cb.listUnsubscribe.https).toBe('https://karriaro-webdesign.de/abmelden?t=abc%2F123');
    });

    it('der alte Satz ist restlos weg', () => {
        for (const p of [pDoi, pAnfrage, pBestand]) {
            const cb = complianceBlock(profile, p);
            expect(cb.text + cb.html).not.toMatch(/kein Interesse|öffentlich gelistet|einmalige Nachricht/);
        }
    });

    it('Anfrage: Herkunft als Antwort, Abmeldung per Mail ohne Token-Link', () => {
        const cb = complianceBlock(profile, pAnfrage);
        expect(cb.herkunft).toBe('Sie erhalten diese E-Mail als Antwort auf Ihre Anfrage vom 01.09.2026.');
        expect(cb.text).not.toContain('/abmelden?t=');
        expect(cb.text).toMatch(/Betreff „Abmelden"/);
        expect(listUnsubscribeFuer(pAnfrage).https).toBeNull();
    });

    it('Bestandskunde: Herkunft aus dem Auftrag, Widerspruch mit Kostenhinweis', () => {
        const cb = complianceBlock(profile, pBestand);
        expect(cb.herkunft).toMatch(/im Rahmen Ihres Auftrags vom 01\.03\.2025/);
        expect(cb.widerspruch).toMatch(/Basistarifen/);
    });

    it('fehlender Profilname fällt auf das Impressum zurück, nie auf leer', () => {
        const cb = complianceBlock({}, pAnfrage);
        expect(cb.text).toContain('Muammer Kizilaslan · Karriaro Webdesign');
    });

    it('escaped Profilwerte im HTML', () => {
        const cb = complianceBlock({ name: '<script>x</script>' }, pAnfrage);
        expect(cb.html).not.toContain('<script>');
        expect(cb.html).toContain('&lt;script&gt;');
    });

    it('herkunftsSatz ohne Grundlage ist null', () => {
        expect(herkunftsSatz(pKeine)).toBeNull();
    });
});

describe('compliancify', () => {
    it('ohne Grundlage bleibt das Pack unverändert und trägt complianceApplied:false', () => {
        const pack = packFixture();
        const out = compliancify(pack, { allEmails: ['info@beispiel.de'] }, profile, pKeine);
        expect(out.complianceApplied).toBe(false);
        expect(out.variants[0].body).toBe('Hallo,\n\nText.');
        expect(out.grundlage.erlaubt).toBe(false);
    });

    it('DOI: Empfänger ist ausschliesslich die eingewilligte Adresse', () => {
        const out = compliancify(packFixture(), { allEmails: ['info@beispiel.de'] }, profile, pDoi);
        expect(out.complianceApplied).toBe(true);
        expect(out.recipientEmail).toBe('inhaber@beispiel.de');
        expect(out.listUnsubscribe.https).toContain('/abmelden?t=');
    });

    it('Anfrage: Empfänger aus der Prüfung, sonst aus dem verifizierten Kontakt', () => {
        const out = compliancify(packFixture(), { allEmails: ['anna@beispiel.de'] }, profile, { ...pAnfrage, empfaenger: null });
        expect(out.recipientEmail).toBe('anna@beispiel.de');
    });

    it('hängt den Pflichtteil an body, copyText und bodyHtml jeder Variante — Kern bleibt getrennt', () => {
        const out = compliancify(packFixture(), null, profile, pAnfrage);
        for (const v of out.variants) {
            expect(v.body.startsWith(v.textKern)).toBe(true);
            expect(v.body).toContain('Widerspruchsrecht');
            expect(v.copyText).toContain('Widerspruchsrecht');
            expect(v.bodyHtml).toContain('Widerspruchsrecht');
            expect(v.pflichtteil.text).toContain('Abmelden');
        }
        expect(out.primary).toBe(out.variants[0]);
    });

    it('injiziert das HTML vor das letzte schließende </div>', () => {
        const out = compliancify(packFixture(), null, profile, pAnfrage);
        const h = out.variants[0].bodyHtml;
        expect(h.endsWith('</div>')).toBe(true);
        expect(h.indexOf('Widerspruchsrecht')).toBeLessThan(h.lastIndexOf('</div>'));
    });

    it('ein $& im Profilnamen wird nicht als Ersatzmuster gedeutet', () => {
        const out = compliancify(packFixture(), null, { name: 'A $& B' }, pAnfrage);
        expect(out.variants[0].bodyHtml).toContain('A $&amp; B');
        expect(out.variants[0].bodyHtml.match(/<div style="x">/g)).toHaveLength(1);
    });

    it('Bearbeiten des Kerns kann den Pflichtteil nicht entfernen', () => {
        const out = compliancify(packFixture(), null, profile, pAnfrage);
        const v = out.variants[0];
        v.textKern = 'Ganz neuer Text ohne alles.';
        setzeVarianteZusammen(v);
        expect(v.body).toContain('Ganz neuer Text ohne alles.');
        expect(v.body).toContain('Widerspruchsrecht');
        expect(v.copyText).toContain('Widerspruchsrecht');
    });

    it('gibt unverfügbares Pack unverändert zurück', () => {
        const unav = { available: false, reason: 'x' };
        expect(compliancify(unav, null, profile, pAnfrage)).toBe(unav);
    });
});
