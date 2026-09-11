import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
    saveLead, updateLead, loadLeads,
    normalisiereKontaktGrundlage, normalisiereQuelle, leiteQuelleAb, normalisierePartnerCode,
    normalisiereBetrag, normalisiereProvision, provisionStatusErlaubt, provisionsBetrag,
    beurteileKontaktGrundlage, baueDetailUpdates, datumDe, datumFuerEingabe,
    sperrgrundFuerVerlust, kontaktGrundlageAusEinwilligung
} from '../../src/crm/leads.js';
import { isSuppressed, loadSuppressionLocal } from '../../src/crm/suppression.js';

const NOW = Date.parse('2026-09-10T10:00:00Z');
const TAG = 24 * 3600 * 1000;

// Vitest läuft in node: localStorage-Shim + leeres window (firebase.js liest window.__firebase).
beforeEach(() => {
    const store = new Map();
    globalThis.localStorage = {
        getItem: k => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => store.set(k, String(v)),
        removeItem: k => store.delete(k),
        clear: () => store.clear()
    };
    globalThis.window = {};
});
afterEach(() => {
    delete globalThis.window;
    vi.restoreAllMocks();
});

function lokaleLeads() { return JSON.parse(localStorage.getItem('karriaro_leads') || '[]'); }

describe('Normalisierung der neuen Lead-Felder', () => {
    it('Kontaktgrundlage: Default und unbekannte Art → keine', () => {
        expect(normalisiereKontaktGrundlage(null)).toEqual({ art: 'keine', datum: null, nachweis: null });
        expect(normalisiereKontaktGrundlage({ art: 'kaltakquise', datum: '2026-09-01', nachweis: 'x' }))
            .toEqual({ art: 'keine', datum: null, nachweis: null });
    });
    it('Kontaktgrundlage: Datum als ISO, Nachweis bereinigt', () => {
        expect(normalisiereKontaktGrundlage({ art: 'anfrage', datum: '2026-09-01', nachweis: '  Mail   vom 1.9. ' }))
            .toEqual({ art: 'anfrage', datum: '2026-09-01T00:00:00.000Z', nachweis: 'Mail vom 1.9.' });
        expect(normalisiereKontaktGrundlage({ art: 'anfrage', datum: 'gestern', nachweis: '   ' }))
            .toEqual({ art: 'anfrage', datum: null, nachweis: null });
    });
    it('Quelle: nur bekannte Werte; Scanner-Leads gelten als Scan', () => {
        expect(normalisiereQuelle('partner')).toBe('partner');
        expect(normalisiereQuelle('kaltakquise')).toBeNull();
        expect(leiteQuelleAb({ source: 'scanner_workspace' })).toBe('scan');
        expect(leiteQuelleAb({ quelle: 'ads', source: 'scanner_workspace' })).toBe('ads');
        expect(leiteQuelleAb({})).toBeNull();
    });
    it('Partnercode: Umlaute bleiben, Leerzeichen und Markup fallen weg', () => {
        expect(normalisierePartnerCode('Foto Müller-01')).toBe('FotoMüller-01');
        expect(normalisierePartnerCode('<b>x</b>')).toBe('bxb');
        expect(normalisierePartnerCode('   ')).toBeNull();
    });
    it('Betrag: deutsche und technische Schreibweise', () => {
        expect(normalisiereBetrag('1.290')).toBe(1290);
        expect(normalisiereBetrag('1.290,50 €')).toBe(1290.5);
        expect(normalisiereBetrag('1990.5')).toBe(1990.5);
        expect(normalisiereBetrag(3990)).toBe(3990);
        expect(normalisiereBetrag('abc')).toBeNull();
        expect(normalisiereBetrag(-5)).toBeNull();
        expect(normalisiereBetrag('')).toBeNull();
    });
    it('Provision: Satz 10 %, Status offen als Default, Betrag = Satz × Auftragswert', () => {
        expect(normalisiereProvision({})).toEqual({ satz: 0.10, status: 'offen', betragNetto: null });
        expect(normalisiereProvision({ satz: 7, status: 'irgendwas', betragNetto: '1.990' })).toEqual({ satz: 0.10, status: 'offen', betragNetto: 1990 });
        expect(provisionsBetrag({ betragNetto: 1990 })).toBe(199);
        expect(provisionsBetrag({ betragNetto: null })).toBeNull();
        expect(provisionsBetrag(null)).toBeNull();
    });
    it('Provision fällig/bezahlt nur bei Kunde', () => {
        expect(provisionStatusErlaubt('angebot', 'offen')).toBe(true);
        expect(provisionStatusErlaubt('angebot', 'faellig')).toBe(false);
        expect(provisionStatusErlaubt('kunde', 'faellig')).toBe(true);
        expect(provisionStatusErlaubt('kunde', 'erfunden')).toBe(false);
    });
    it('Verlust „kein Interesse / abgemeldet" sperrt, andere Gründe nicht', () => {
        expect(sperrgrundFuerVerlust('kein_interesse')).toBe('opt_out');
        expect(sperrgrundFuerVerlust('kein_budget')).toBeNull();
        expect(sperrgrundFuerVerlust('erfunden')).toBeNull();
    });
    it('Datum für Karte und Datumsfeld in derselben Zeitzone (Europe/Berlin)', () => {
        // 23:30 UTC ist in Berlin schon der nächste Tag
        expect(datumFuerEingabe('2026-09-09T23:30:00Z')).toBe('2026-09-10');
        expect(datumDe('2026-09-09T23:30:00Z')).toBe('10.09.2026');
        expect(datumFuerEingabe(null)).toBe('');
    });
});

describe('beurteileKontaktGrundlage', () => {
    const lead = { domain: 'baeckerei-mueller.de', contactData: { allEmails: ['info@baeckerei-mueller.de'] } };
    const bestaetigt = { id: 'c1', email: 'info@baeckerei-mueller.de', confirmedAt: Date.parse('2026-09-09T08:00:00Z'), sequenceStep: 1 };
    const komplett = { art: 'anfrage', datum: '2026-09-01', nachweis: 'Kontaktformular, Mail vom 01.09.' };

    it('vollständige Anfrage trägt', () => {
        expect(beurteileKontaktGrundlage({ ...lead, kontaktGrundlage: komplett }).stufe).toBe('traegt');
    });
    it('Werbewiderspruch schlägt jede Grundlage (Gegenprobe zur Zeile darüber)', () => {
        const r = beurteileKontaktGrundlage({ ...lead, kontaktGrundlage: komplett, contactData: { werbewiderspruch: true } });
        expect(r.stufe).toBe('gesperrt');
        expect(r.text).toMatch(/Werbewiderspruch/);
    });
    it('Sperrliste schlägt eine bestätigte Einwilligung', () => {
        const r = beurteileKontaktGrundlage({ ...lead, kontaktGrundlage: { art: 'doi' } }, { einwilligungen: [bestaetigt], geladen: true, gesperrt: true });
        expect(r.stufe).toBe('gesperrt');
        expect(r.vorschlag).toBeNull();
    });
    it('Anfrage ohne Nachweis ist unvollständig', () => {
        expect(beurteileKontaktGrundlage({ ...lead, kontaktGrundlage: { art: 'anfrage', datum: '2026-09-01' } }).stufe).toBe('unvollstaendig');
    });
    it('DOI: nicht gelesen ist „nicht prüfbar", nicht „entfallen"', () => {
        expect(beurteileKontaktGrundlage({ ...lead, kontaktGrundlage: { art: 'doi' } }, { einwilligungen: [], geladen: false }).stufe).toBe('nicht_pruefbar');
    });
    it('DOI mit bestätigter Einwilligung trägt und nennt das Datum', () => {
        const r = beurteileKontaktGrundlage({ ...lead, kontaktGrundlage: { art: 'doi' } }, { einwilligungen: [bestaetigt], geladen: true });
        expect(r.stufe).toBe('traegt');
        expect(r.text).toContain('Double-Opt-In vom 09.09.2026');
    });
    it('DOI nach Widerruf ist entfallen', () => {
        const r = beurteileKontaktGrundlage({ ...lead, kontaktGrundlage: { art: 'doi' } }, { einwilligungen: [{ ...bestaetigt, revokedAt: NOW }], geladen: true });
        expect(r.stufe).toBe('entfallen');
        expect(r.text).toMatch(/widerrufen/);
    });
    it('schlägt eine bestätigte Einwilligung zur Lead-Domain vor', () => {
        const r = beurteileKontaktGrundlage(lead, { einwilligungen: [bestaetigt], geladen: true });
        expect(r.stufe).toBe('keine');
        expect(r.vorschlag?.id).toBe('c1');
    });
    it('DOI ohne Treffer bei unvollständig gelesener Liste: nicht prüfbar statt entfallen', () => {
        const doi = { ...lead, kontaktGrundlage: { art: 'doi' } };
        expect(beurteileKontaktGrundlage(doi, { einwilligungen: [], geladen: true, vollstaendig: false }).stufe).toBe('nicht_pruefbar');
        // Gegenprobe: vollständig gelesen und kein Treffer → entfallen
        expect(beurteileKontaktGrundlage(doi, { einwilligungen: [], geladen: true, vollstaendig: true }).stufe).toBe('entfallen');
        // Gegenprobe: ein gelesener Widerruf bleibt ein Widerruf, auch bei abgeschnittener Liste
        expect(beurteileKontaktGrundlage(doi, { einwilligungen: [{ ...bestaetigt, revokedAt: NOW }], geladen: true, vollstaendig: false }).stufe).toBe('entfallen');
    });
    it('Gegenprobe: keine Vorschläge aus fremder Domain oder widerrufener Einwilligung', () => {
        expect(beurteileKontaktGrundlage(lead, { einwilligungen: [{ ...bestaetigt, email: 'info@konditorei.de' }], geladen: true }).vorschlag).toBeNull();
        expect(beurteileKontaktGrundlage(lead, { einwilligungen: [{ ...bestaetigt, revokedAt: NOW }], geladen: true }).vorschlag).toBeNull();
    });
});

describe('baueDetailUpdates (Formular → Update)', () => {
    const lead = { id: 'l1', domain: 'baeckerei-mueller.de', status: 'angebot', contactData: { allEmails: ['info@baeckerei-mueller.de'] } };
    const bestaetigt = { id: 'c1', email: 'info@baeckerei-mueller.de', confirmedAt: Date.parse('2026-09-09T08:00:00Z'), textVersion: '2026-09-10', source: 'website-pruefen' };

    it('Anfrage verlangt Datum und Nachweis', () => {
        expect(baueDetailUpdates({ kgArt: 'anfrage', kgDatum: '', kgNachweis: 'Mail' }, lead).fehler.join(' ')).toMatch(/Datum und Nachweis/);
        expect(baueDetailUpdates({ kgArt: 'bestandskunde', kgDatum: '2026-09-01', kgNachweis: '' }, lead).fehler.join(' ')).toMatch(/Datum und Nachweis/);
        const ok = baueDetailUpdates({ kgArt: 'anfrage', kgDatum: '2026-09-01', kgNachweis: 'Mail vom 01.09.' }, lead);
        expect(ok.fehler).toEqual([]);
        expect(ok.updates.kontaktGrundlage).toEqual({ art: 'anfrage', datum: '2026-09-01T00:00:00.000Z', nachweis: 'Mail vom 01.09.' });
    });

    it('„keine" verwirft Datum und Nachweis', () => {
        const r = baueDetailUpdates({ kgArt: 'keine', kgDatum: '2026-09-01', kgNachweis: 'x' }, lead);
        expect(r.fehler).toEqual([]);
        expect(r.updates.kontaktGrundlage).toEqual({ art: 'keine', datum: null, nachweis: null });
    });

    it('DOI lässt sich nur mit bestätigter Einwilligung neu eintragen', () => {
        expect(baueDetailUpdates({ kgArt: 'doi' }, lead, { einwilligungen: [], geladen: true }).fehler.join(' ')).toMatch(/Keine bestätigte Einwilligung/);
        expect(baueDetailUpdates({ kgArt: 'doi' }, lead, { einwilligungen: [bestaetigt], geladen: false }).fehler.join(' ')).toMatch(/nicht lesbar/);
        expect(baueDetailUpdates({ kgArt: 'doi' }, lead, { einwilligungen: [{ ...bestaetigt, stopped: true }], geladen: true }).fehler).toHaveLength(1);
        const ok = baueDetailUpdates({ kgArt: 'doi', kgDatum: '2020-01-01', kgNachweis: 'selbst ausgedacht' }, lead, { einwilligungen: [bestaetigt], geladen: true });
        expect(ok.fehler).toEqual([]);
        // Datum und Nachweis kommen aus der Einwilligung, nicht aus dem Formular
        expect(ok.updates.kontaktGrundlage.datum).toBe('2026-09-09T08:00:00.000Z');
        expect(ok.updates.kontaktGrundlage.nachweis).toContain('Einwilligung c1');
        expect(ok.updates.kontaktGrundlage.nachweis).toContain('Textversion 2026-09-10');
    });

    it('ein schon gespeichertes DOI blockiert andere Änderungen nach einem Widerruf nicht', () => {
        const doiLead = { ...lead, kontaktGrundlage: kontaktGrundlageAusEinwilligung(bestaetigt) };
        const r = baueDetailUpdates({ kgArt: 'doi', kgDatum: datumFuerEingabe(bestaetigt.confirmedAt), quelle: 'partner' }, doiLead, { einwilligungen: [{ ...bestaetigt, revokedAt: NOW }], geladen: true });
        expect(r.fehler).toEqual([]);
        expect(r.updates.quelle).toBe('partner');
    });

    it('unveränderter Tag behält den gespeicherten Zeitpunkt; geänderter Tag nicht', () => {
        const spaet = { ...lead, kontaktGrundlage: { art: 'anfrage', datum: '2026-09-09T21:30:00.000Z', nachweis: 'Mail' } };
        const gleich = baueDetailUpdates({ kgArt: 'anfrage', kgDatum: '2026-09-09', kgNachweis: 'Mail' }, spaet);
        expect(gleich.updates.kontaktGrundlage.datum).toBe('2026-09-09T21:30:00.000Z');
        const anders = baueDetailUpdates({ kgArt: 'anfrage', kgDatum: '2026-09-08', kgNachweis: 'Mail' }, spaet);
        expect(anders.updates.kontaktGrundlage.datum).toBe('2026-09-08T00:00:00.000Z');
    });

    it('Provision entsteht nur mit Partner-Bezug', () => {
        expect(baueDetailUpdates({ kgArt: 'keine', quelle: 'scan', provisionStatus: 'offen', provisionBetrag: '' }, lead).updates.provision).toBeNull();
        const p = baueDetailUpdates({ kgArt: 'keine', quelle: 'empfehlung', partnerCode: 'Foto-Weber', provisionStatus: 'offen', provisionBetrag: '1.990' }, lead);
        expect(p.fehler).toEqual([]);
        expect(p.updates).toMatchObject({ quelle: 'empfehlung', partnerCode: 'Foto-Weber', provision: { satz: 0.10, status: 'offen', betragNetto: 1990 } });
    });

    it('„fällig" vor Status Kunde wird abgelehnt, als Kunde nicht (Gegenprobe)', () => {
        const werte = { kgArt: 'keine', quelle: 'partner', partnerCode: 'P1', provisionStatus: 'faellig', provisionBetrag: '1990' };
        expect(baueDetailUpdates(werte, lead).fehler.join(' ')).toMatch(/Zahlungseingang/);
        expect(baueDetailUpdates(werte, { ...lead, status: 'kunde' }).fehler).toEqual([]);
    });

    it('unlesbarer Auftragswert ist ein Fehler, kein stilles null', () => {
        expect(baueDetailUpdates({ kgArt: 'keine', quelle: 'partner', provisionBetrag: 'zweitausend' }, lead).fehler.join(' ')).toMatch(/nicht lesbar/);
    });
});

describe('saveLead / updateLead — Sperrliste und Erhalt der Felder (localStorage)', () => {
    it('Werbewiderspruch beim Speichern → Sperrliste opt_out und Hinweis im Ergebnis', async () => {
        const r = await saveLead('baeckerei-mueller.de', 'https://baeckerei-mueller.de', { name: 'Bäckerei Müller', contactData: { werbewiderspruch: true } });
        expect(r).toMatchObject({ ok: true, werbewiderspruch: true, gesperrt: true });
        expect(isSuppressed('baeckerei-mueller.de')).toBe(true);
        expect(JSON.parse(localStorage.getItem('karriaro_suppression'))[0].reason).toBe('opt_out');
    });

    it('Gegenprobe: ohne Werbewiderspruch keine Sperre', async () => {
        const r = await saveLead('konditorei.de', 'https://konditorei.de', { name: 'Konditorei', contactData: { werbewiderspruch: false } });
        expect(r.werbewiderspruch).toBeUndefined();
        expect(loadSuppressionLocal().size).toBe(0);
    });

    it('Werbewiderspruch bleibt bei erneutem Speichern ohne Kontaktdaten erhalten', async () => {
        await saveLead('baeckerei-mueller.de', 'u', { contactData: { werbewiderspruch: true } });
        await saveLead('baeckerei-mueller.de', 'u', { name: 'Neu analysiert' });
        expect(lokaleLeads()[0].contactData.werbewiderspruch).toBe(true);
    });

    it('neuer Lead bekommt die Defaults; Scanner-Leads die Quelle Scan', async () => {
        await saveLead('a.de', 'u', { name: 'A', rating: 4.7 });
        await saveLead('b.de', 'u', { name: 'B', source: 'scanner_workspace' });
        const [a, b] = lokaleLeads();
        expect(a).toMatchObject({ kontaktGrundlage: { art: 'keine', datum: null, nachweis: null }, quelle: null, partnerCode: null, provision: null, rating: 4.7 });
        expect(b.quelle).toBe('scan');
    });

    it('Re-Analyse setzt Kontaktgrundlage, Quelle, Provision und Status NICHT zurück', async () => {
        await saveLead('a.de', 'u', { name: 'A' });
        await updateLead('a_de', {
            status: 'angebot',
            kontaktGrundlage: { art: 'anfrage', datum: '2026-09-01', nachweis: 'Mail' },
            quelle: 'partner', partnerCode: 'P1', provision: { status: 'offen', betragNetto: '1.990' }
        });
        await saveLead('a.de', 'u', { name: 'A neu analysiert', leadScore: 70 });
        expect(lokaleLeads()[0]).toMatchObject({
            name: 'A neu analysiert', leadScore: 70, status: 'angebot',
            kontaktGrundlage: { art: 'anfrage', datum: '2026-09-01T00:00:00.000Z', nachweis: 'Mail' },
            quelle: 'partner', partnerCode: 'P1', provision: { satz: 0.10, status: 'offen', betragNetto: 1990 }
        });
    });

    it('updateLead läuft durch die Normalisierung (kein ungeprüftes Feld im Speicher)', async () => {
        await saveLead('a.de', 'u', { name: 'A' });
        await updateLead('a_de', { kontaktGrundlage: { art: 'erfunden', datum: 'x', nachweis: 'y' }, quelle: 'kaltakquise', verlustGrund: 'erfunden' });
        expect(lokaleLeads()[0]).toMatchObject({ kontaktGrundlage: { art: 'keine', datum: null, nachweis: null }, quelle: null, verlustGrund: null });
    });

    it('updateLead mit neuen Kontaktdaten löscht einen früheren Werbewiderspruch nicht', async () => {
        await saveLead('a.de', 'u', { contactData: { werbewiderspruch: true } });
        await updateLead('a_de', { contactData: { email: 'info@a.de' } });
        expect(lokaleLeads()[0].contactData).toEqual({ werbewiderspruch: true, email: 'info@a.de' });
    });

    it('updateLead mit Werbewiderspruch sperrt die Domain', async () => {
        await saveLead('a.de', 'u', { name: 'A' });
        const r = await updateLead('a_de', { contactData: { werbewiderspruch: true } });
        expect(r).toMatchObject({ werbewiderspruch: true, gesperrt: true });
        expect(isSuppressed('a.de')).toBe(true);
    });

    it('loadLeads bringt Alt-Leads ohne neue Felder auf die bekannte Form', async () => {
        localStorage.setItem('karriaro_leads', JSON.stringify([{ id: 'alt', domain: 'alt.de', rating: 4.2, savedAt: 1 }]));
        const [l] = await loadLeads();
        expect(l).toMatchObject({ status: 'neu', kontaktGrundlage: { art: 'keine' }, quelle: null, provision: null, rating: 4.2 });
    });
});

describe('saveLead / updateLead — Firestore-Payload', () => {
    function fakeFirebase({ existiert }) {
        const geschrieben = [];
        const fb = {
            db: {},
            auth: { currentUser: { uid: 'u1' } },
            fns: {
                doc: (_db, col, id) => ({ col, id }),
                getDoc: async () => ({ exists: () => existiert }),
                setDoc: async (ref, daten, opts) => { geschrieben.push({ art: 'set', ref, daten, opts }); },
                updateDoc: async (ref, daten) => { geschrieben.push({ art: 'update', ref, daten }); },
                serverTimestamp: () => 'TS'
            }
        };
        return { fb, geschrieben };
    }

    it('bestehendes Dokument: Status und Notizen werden nicht überschrieben', async () => {
        const { fb, geschrieben } = fakeFirebase({ existiert: true });
        globalThis.window = { __firebase: fb };
        await saveLead('a.de', 'u', { name: 'A' });
        const lead = geschrieben.find(g => g.ref.col === 'leads');
        expect(lead.daten).not.toHaveProperty('status');
        expect(lead.daten).not.toHaveProperty('notes');
        expect(lead.daten).not.toHaveProperty('kontaktGrundlage');
    });

    it('neues Dokument: Status neu und Default-Kontaktgrundlage', async () => {
        const { fb, geschrieben } = fakeFirebase({ existiert: false });
        globalThis.window = { __firebase: fb };
        await saveLead('a.de', 'u', { name: 'A' });
        const lead = geschrieben.find(g => g.ref.col === 'leads');
        expect(lead.daten).toMatchObject({ status: 'neu', notes: '', kontaktGrundlage: { art: 'keine', datum: null, nachweis: null } });
    });

    it('Werbewiderspruch: nur das Flag in die Cloud, Sperre in die suppression-Collection', async () => {
        const { fb, geschrieben } = fakeFirebase({ existiert: true });
        globalThis.window = { __firebase: fb };
        await saveLead('a.de', 'u', { name: 'A', contactData: { werbewiderspruch: true, allEmails: ['info@a.de'], owner: 'Max Muster' } });
        const lead = geschrieben.find(g => g.ref.col === 'leads');
        expect(lead.daten.contactData).toEqual({ werbewiderspruch: true });
        expect(geschrieben.find(g => g.ref.col === 'suppression')?.daten).toMatchObject({ domain: 'a.de', reason: 'opt_out' });
    });

    it('updateLead schreibt contactData als Pfad-Updates (sonst ersetzt die Map den Widerspruch)', async () => {
        const { fb, geschrieben } = fakeFirebase({ existiert: true });
        globalThis.window = { __firebase: fb };
        await updateLead('u1_a_de', { contactData: { email: 'info@a.de' } });
        const upd = geschrieben.find(g => g.art === 'update');
        expect(upd.daten).not.toHaveProperty('contactData');
        expect(upd.daten['contactData.email']).toBe('info@a.de');
    });
});
