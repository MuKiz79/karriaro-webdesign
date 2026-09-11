import { describe, it, expect } from 'vitest';
import {
    filterNachQuelle, quelleFilterHtml, leadBadgesHtml, leadDetailsHtml,
    einwilligungenPanelHtml, einwilligungZeileHtml, befundMitGate, renderHotLeadsHtml
} from '../../src/ui/render-crm.js';
import { beurteileKontaktGrundlage } from '../../src/crm/leads.js';

const NOW = Date.parse('2026-09-10T10:00:00Z');
const TAG = 24 * 3600 * 1000;

function anzahl(html, teil) { return html.split(teil).length - 1; }

describe('filterNachQuelle', () => {
    const leads = [
        { id: 1, quelle: 'partner' },
        { id: 2, source: 'scanner_workspace' },
        { id: 3 },
        { id: 4, quelle: 'kaltakquise' }
    ];
    it('filtert nach gespeicherter und abgeleiteter Quelle', () => {
        expect(filterNachQuelle(leads, 'partner').map(l => l.id)).toEqual([1]);
        expect(filterNachQuelle(leads, 'scan').map(l => l.id)).toEqual([2]);
        expect(filterNachQuelle(leads, 'ohne').map(l => l.id)).toEqual([3, 4]);
        expect(filterNachQuelle(leads, 'alle')).toHaveLength(4);
        expect(filterNachQuelle(null, 'alle')).toEqual([]);
    });
    it('blendet leere Quellen aus, ausser „alle" und der aktiven', () => {
        const html = quelleFilterHtml(leads, 'ads');
        expect(html).toContain('data-quelle-filter="partner"');
        expect(html).toContain('data-quelle-filter="ads"');
        expect(html).not.toContain('data-quelle-filter="empfehlung"');
        expect(html).toMatch(/data-quelle-filter="ads">Google Ads \(0\)/);
    });
});

describe('einwilligungenPanelHtml', () => {
    const bestaetigt = { id: 'c1', email: 'info@baeckerei-mueller.de', domain: 'baeckerei-mueller.de', confirmedAt: NOW - TAG, createdAt: NOW - 2 * TAG, sequenceStep: 2, source: 'website-pruefen', nextSendAt: NOW + 3 * TAG };
    const widerrufen = { id: 'c2', email: 'chef@konditorei.de', confirmedAt: NOW - 5 * TAG, revokedAt: NOW - TAG, sequenceStep: 1, source: 'startseite' };
    const gestoppt = { id: 'c3', email: 'a@b.de', confirmedAt: NOW - 5 * TAG, stopped: true, sequenceStep: 1 };
    const offen = { id: 'c4', email: 'neu@c.de', createdAt: NOW, expiresAt: NOW + TAG, sequenceStep: 0 };

    it('nicht lesbar wird ausdrücklich gesagt — nicht als „keine Einwilligungen"', () => {
        const html = einwilligungenPanelHtml({ einwilligungen: [], geladen: false, fehler: 'Keine Leseberechtigung für Einwilligungen' }, NOW);
        expect(html).toContain('nicht lesbar');
        expect(html).toContain('Keine Leseberechtigung');
        expect(html).not.toContain('Noch keine Einwilligungen');
    });
    it('gelesen und leer', () => {
        expect(einwilligungenPanelHtml({ einwilligungen: [], geladen: true }, NOW)).toContain('Noch keine Einwilligungen eingegangen.');
    });
    it('Stopp-Knopf nur für bestätigte und offene Einwilligungen', () => {
        const html = einwilligungenPanelHtml({ einwilligungen: [bestaetigt, widerrufen, gestoppt, offen], geladen: true }, NOW);
        expect(anzahl(html, 'data-action="stoppe-sequenz"')).toBe(2);
        expect(html).toContain('data-einwilligung-id="c1"');
        expect(html).toContain('data-einwilligung-id="c4"');
        expect(html).not.toContain('data-einwilligung-id="c2"');
        expect(html).not.toContain('data-einwilligung-id="c3"');
        expect(html).toContain('Bestätigt: 1 · Nicht bestätigt: 1 · Gestoppt: 1 · Widerrufen: 1');
    });
    it('widerrufene Einwilligung ist deutlich markiert', () => {
        const zeile = einwilligungZeileHtml(widerrufen, NOW);
        expect(zeile).toContain('crm-einw-widerrufen');
        expect(zeile).toContain('>Widerrufen<');
        expect(zeile).toContain('widerrufen 09.09.2026');
    });
    it('zeigt Schritt, Quelle und Termine', () => {
        const zeile = einwilligungZeileHtml(bestaetigt, NOW);
        expect(zeile).toContain('Schritt 2 von 3');
        expect(zeile).toContain('Website-Prüfung');
        expect(zeile).toContain('bestätigt 09.09.2026');
        expect(zeile).toContain('nächste E-Mail 13.09.2026');
        expect(einwilligungZeileHtml(offen, NOW)).toContain('Strecke nicht gestartet');
    });
    it('Adressen aus dem öffentlichen Formular werden escaped', () => {
        const html = einwilligungZeileHtml({ id: 'x"><script>', email: '<img src=x onerror=alert(1)>@x.de', confirmedAt: NOW }, NOW);
        expect(html).not.toContain('<img');
        expect(html).not.toContain('<script>');
        expect(html).toContain('&lt;img');
    });
});

describe('Lead-Karte: Kennzeichen und Details', () => {
    const lead = { id: 'u1_baeckerei_mueller_de', domain: 'baeckerei-mueller.de', status: 'angebot', contactData: { allEmails: ['info@baeckerei-mueller.de'] } };
    const bestaetigt = { id: 'c1', email: 'info@baeckerei-mueller.de', confirmedAt: Date.parse('2026-09-09T08:00:00Z') };

    it('bestätigte Einwilligung zur Lead-Adresse: „Double-Opt-In vom …" und Übernahme-Knopf', () => {
        const befund = beurteileKontaktGrundlage(lead, { einwilligungen: [bestaetigt], geladen: true });
        expect(leadBadgesHtml(lead, befund)).toContain('Double-Opt-In vom 09.09.2026');
        const details = leadDetailsHtml(lead, befund);
        expect(details).toContain('data-action="uebernehme-doi"');
        expect(details).toContain('data-einwilligung-id="c1"');
    });

    it('gesperrt: kein DOI-Vorschlag, kein Sperr-Knopf, Hinweis „Auf der Sperrliste"', () => {
        const gesperrt = { ...lead, contactData: { ...lead.contactData, werbewiderspruch: true } };
        const befund = beurteileKontaktGrundlage(gesperrt, { einwilligungen: [bestaetigt], geladen: true });
        const badges = leadBadgesHtml(gesperrt, befund, { gesperrt: true });
        expect(badges).toContain('Werbewiderspruch — gesperrt');
        expect(badges).not.toContain('Double-Opt-In vom');
        const details = leadDetailsHtml(gesperrt, befund, { gesperrt: true });
        expect(details).not.toContain('data-action="suppress"');
        expect(details).not.toContain('data-action="uebernehme-doi"');
        expect(details).toContain('Auf der Sperrliste');
    });

    it('nicht gesperrt: Knopf „Nicht mehr kontaktieren" mit Domain', () => {
        const befund = beurteileKontaktGrundlage(lead);
        const details = leadDetailsHtml(lead, befund);
        expect(details).toContain('data-action="suppress" data-domain="baeckerei-mueller.de"');
        expect(details).toContain('Nicht mehr kontaktieren');
    });

    it('Formular zeigt gespeicherte Werte, Erklärung und Provisionshinweis', () => {
        const mitPartner = {
            ...lead, quelle: 'partner', partnerCode: 'Foto-Weber',
            kontaktGrundlage: { art: 'anfrage', datum: '2026-09-01T00:00:00.000Z', nachweis: 'Mail "Angebot" vom 01.09.' },
            provision: { satz: 0.10, status: 'offen', betragNetto: 1990 }
        };
        const befund = beurteileKontaktGrundlage(mitPartner);
        const html = leadDetailsHtml(mitPartner, befund, { offen: true });
        expect(html).toMatch(/<details[^>]* open>/);
        expect(html).toContain('<option value="anfrage" selected>');
        expect(html).toContain('<option value="partner" selected>');
        expect(html).toContain('value="2026-09-01"');
        expect(html).toContain('value="Mail &quot;Angebot&quot; vom 01.09."');
        expect(html).toContain('Antworten Sie nur zum Gegenstand seiner Anfrage');
        expect(html).toContain('Provision: 199,00 € netto');
        expect(html).toContain('Provision nur nach vollständigem Zahlungseingang; Offenlegung gegenüber dem Kunden und dessen Zustimmung dokumentieren.');
        expect(leadBadgesHtml(mitPartner, befund)).toContain('Partner Foto-Weber · Provision Offen');
    });

    it('Datum und Nachweis sind bei „keine" gesperrt, bei Anfrage nicht', () => {
        const keine = leadDetailsHtml(lead, beurteileKontaktGrundlage(lead));
        expect(keine).toMatch(/data-feld="kg-datum"[^>]* disabled/);
        const anfrage = { ...lead, kontaktGrundlage: { art: 'anfrage' } };
        expect(leadDetailsHtml(anfrage, beurteileKontaktGrundlage(anfrage))).not.toMatch(/data-feld="kg-datum"[^>]* disabled/);
    });
});

describe('befundMitGate — die Karte sagt nie „trägt", wo das Versand-Gate nein sagt', () => {
    const basis = { id: 'l1', domain: 'baeckerei-mueller.de', status: 'angebot', contactData: { allEmails: ['info@baeckerei-mueller.de'] } };
    const einw = (step) => ({ einwilligungen: [{ id: 'c1', email: 'info@baeckerei-mueller.de', confirmedAt: Date.now() - TAG, sequenceStep: step }], geladen: true });

    it('DOI mit drei versandten E-Mails: ausgeschöpft, nicht „trägt"', () => {
        const lead = { ...basis, kontaktGrundlage: { art: 'doi' } };
        const e = einw(3);
        const vorher = beurteileKontaktGrundlage(lead, e);
        expect(vorher.stufe).toBe('traegt');
        const r = befundMitGate(lead, vorher, { einw: e });
        expect(r.stufe).toBe('traegt_nicht');
        expect(r.text).toMatch(/höchstens 3 E-Mails/);
        expect(leadBadgesHtml(lead, r)).toContain('Grundlage trägt nicht');
    });
    it('Gegenprobe: DOI mit einer versandten E-Mail trägt weiter', () => {
        const lead = { ...basis, kontaktGrundlage: { art: 'doi' } };
        const e = einw(1);
        expect(befundMitGate(lead, beurteileKontaktGrundlage(lead, e), { einw: e }).stufe).toBe('traegt');
    });
    it('Anfrage mit Datum in der Zukunft trägt nicht; mit vergangenem Datum schon', () => {
        const zukunft = { ...basis, kontaktGrundlage: { art: 'anfrage', datum: '2099-01-01', nachweis: 'Mail' } };
        expect(befundMitGate(zukunft, beurteileKontaktGrundlage(zukunft), { einw: { geladen: true } }).stufe).toBe('traegt_nicht');
        const vergangen = { ...basis, kontaktGrundlage: { art: 'anfrage', datum: '2026-09-01', nachweis: 'Mail' } };
        expect(befundMitGate(vergangen, beurteileKontaktGrundlage(vergangen), { einw: { geladen: true } }).stufe).toBe('traegt');
    });
    it('andere Stufen bleiben unberührt', () => {
        const b = { stufe: 'keine', text: 'x', vorschlag: null };
        expect(befundMitGate(basis, b)).toBe(b);
    });
});

describe('renderHotLeadsHtml — Daten aus dem öffentlichen Audit-Formular', () => {
    const boese = { slug: 's1', tier: 'very_hot', heat: 80, domain: '<img src=x onerror=alert(1)>.de', name: '<script>alert(1)</script>', email: 'info@baeckerei-mueller.de', techHeadline: '<b>x</b>' };

    it('escaped Name, Domain und Überschrift', () => {
        const html = renderHotLeadsHtml([boese]);
        expect(html).not.toContain('<img');
        expect(html).not.toContain('<script>');
        expect(html).not.toContain('<b>x</b>');
        expect(html).toContain('&lt;script&gt;');
    });
    it('gültige Adresse: E-Mail-Knopf; Adresse mit eingeschleusten Parametern: kein Knopf', () => {
        const ok = { ...boese, domain: 'baeckerei-mueller.de' };
        const mitMail = renderHotLeadsHtml([ok], { gesperrt: new Set() });
        expect(mitMail).toContain('href="mailto:info@baeckerei-mueller.de?subject=');
        // Pflichtteil wie bei jeder Mail aus dem Werkzeug, Herkunft = Anfrage.
        expect(mitMail).toContain(encodeURIComponent('als Antwort auf Ihre Anfrage'));
        expect(mitMail).toContain(encodeURIComponent('Abmelden'));
        // Kein Hinweis darauf, dass Seitenaufrufe gemessen werden.
        expect(mitMail).not.toContain(encodeURIComponent('angesehen'));
        const injiziert = { ...ok, email: 'a@b.de?bcc=fremd@x.de' };
        expect(renderHotLeadsHtml([injiziert], { gesperrt: new Set() })).not.toContain('mailto:');
    });
    it('gesperrte Domain: kein E-Mail-Knopf, sichtbarer Hinweis (Gegenprobe zur Zeile darüber)', () => {
        const ok = { ...boese, domain: 'baeckerei-mueller.de' };
        const html = renderHotLeadsHtml([ok], { gesperrt: new Set(['baeckerei-mueller.de']) });
        expect(html).not.toContain('mailto:');
        expect(html).toContain('Auf der Sperrliste');
    });
});

describe('einwilligungenPanelHtml — Lese-Limit', () => {
    it('nennt, dass ältere Einwilligungen nicht geladen sind', () => {
        const e = { id: 'c1', email: 'a@b.de', confirmedAt: NOW };
        expect(einwilligungenPanelHtml({ einwilligungen: [e], geladen: true, vollstaendig: false }, NOW)).toContain('ältere sind nicht geladen');
        expect(einwilligungenPanelHtml({ einwilligungen: [e], geladen: true, vollstaendig: true }, NOW)).not.toContain('ältere sind nicht geladen');
    });
});
