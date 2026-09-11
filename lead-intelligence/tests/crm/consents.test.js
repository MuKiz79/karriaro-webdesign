import { describe, it, expect, afterEach, vi } from 'vitest';
import {
    zuMillis, normalisiereEinwilligung, einwilligungsStatus, istNutzbar, leadEmails,
    einwilligungsTreffer, einwilligungenFuerLead, findeEinwilligungFuerLead,
    ladeEinwilligungen, ladeEinwilligungenMitStatus, stoppeSequenz, MAX_SEQUENZ_SCHRITTE
} from '../../src/crm/consents.js';

const NOW = Date.parse('2026-09-10T10:00:00Z');
const TAG = 24 * 3600 * 1000;

afterEach(() => {
    delete globalThis.window;
    vi.restoreAllMocks();
});

/** Minimaler Firestore-Ersatz: zeichnet Abfragen und Schreibvorgänge auf. */
function fakeFirebase({ docs = [], wirft = null, angemeldet = true } = {}) {
    const aufrufe = { updateDoc: [], query: [] };
    const fb = {
        db: {},
        auth: { currentUser: angemeldet ? { uid: 'u1' } : null },
        fns: {
            collection: (_db, name) => ({ name }),
            orderBy: (feld, richtung) => ({ orderBy: [feld, richtung] }),
            limit: n => ({ limit: n }),
            query: (col, ...teile) => { aufrufe.query.push({ col, teile }); return { col, teile }; },
            getDocs: async () => {
                if (wirft) throw wirft;
                return { docs: docs.map(([id, data]) => ({ id, data: () => data })) };
            },
            doc: (_db, col, id) => ({ col, id }),
            updateDoc: async (ref, daten) => { aufrufe.updateDoc.push({ ref, daten }); }
        }
    };
    return { fb, aufrufe };
}

describe('zuMillis', () => {
    it('liest Timestamp, rohes Timestamp-Objekt, ISO, Date und ms', () => {
        expect(zuMillis({ toMillis: () => 1234 })).toBe(1234);
        expect(zuMillis({ seconds: 2, nanoseconds: 5e8 })).toBe(2500);
        expect(zuMillis('2026-09-10T10:00:00Z')).toBe(NOW);
        expect(zuMillis(new Date(NOW))).toBe(NOW);
        expect(zuMillis(NOW)).toBe(NOW);
    });
    it('fehlend oder unlesbar ist null — nie 0 (0 wäre 1970)', () => {
        expect(zuMillis(null)).toBeNull();
        expect(zuMillis('')).toBeNull();
        expect(zuMillis(0)).toBeNull();
        expect(zuMillis('kein Datum')).toBeNull();
        expect(zuMillis({})).toBeNull();
    });
});

describe('normalisiereEinwilligung', () => {
    it('bringt das Dokument auf Vertrag V8', () => {
        const e = normalisiereEinwilligung('c1', {
            email: '  Info@Baeckerei-Mueller.DE ', domain: 'https://www.Baeckerei-Mueller.de/impressum',
            confirmedAt: { toMillis: () => NOW }, revokedAt: null, stopped: false, sequenceStep: '2',
            source: 'website-pruefen', createdAt: { seconds: NOW / 1000 }, unsubscribeToken: 'tok',
            textVersion: '2026-09-10', confirmTokenHash: 'geheim'
        });
        expect(e).toMatchObject({
            id: 'c1', email: 'info@baeckerei-mueller.de', domain: 'baeckerei-mueller.de',
            confirmedAt: NOW, revokedAt: null, stopped: false, sequenceStep: 2,
            source: 'website-pruefen', createdAt: NOW, unsubscribeToken: 'tok', textVersion: '2026-09-10'
        });
        // Der Bestätigungs-Hash gehört nicht in die Oberfläche
        expect(e).not.toHaveProperty('confirmTokenHash');
    });
    it('stopped zählt nur als boolean true; unsinnige Schritte werden 0', () => {
        expect(normalisiereEinwilligung('x', { stopped: 'true' }).stopped).toBe(false);
        expect(normalisiereEinwilligung('x', { sequenceStep: -3 }).sequenceStep).toBe(0);
        expect(normalisiereEinwilligung('x', { email: 'kein-at' }).email).toBe('');
    });
});

describe('einwilligungsStatus', () => {
    const bestaetigt = { confirmedAt: NOW - TAG };
    it('Widerruf schlägt Bestätigung und Stopp', () => {
        expect(einwilligungsStatus({ ...bestaetigt, revokedAt: NOW, stopped: true }, NOW)).toBe('widerrufen');
    });
    it('Stopp schlägt Bestätigung', () => {
        expect(einwilligungsStatus({ ...bestaetigt, stopped: true }, NOW)).toBe('gestoppt');
    });
    it('eine bestätigte Einwilligung läuft über expiresAt nicht ab', () => {
        expect(einwilligungsStatus({ ...bestaetigt, expiresAt: NOW - 1 }, NOW)).toBe('bestaetigt');
    });
    it('unbestätigt: offen, nach Frist abgelaufen', () => {
        expect(einwilligungsStatus({ expiresAt: NOW + TAG }, NOW)).toBe('offen');
        expect(einwilligungsStatus({ expiresAt: NOW - TAG }, NOW)).toBe('abgelaufen');
    });
    it('nur bestätigt ist nutzbar', () => {
        expect(istNutzbar(bestaetigt, NOW)).toBe(true);
        expect(istNutzbar({ ...bestaetigt, stopped: true }, NOW)).toBe(false);
        expect(istNutzbar({ ...bestaetigt, revokedAt: NOW }, NOW)).toBe(false);
        expect(istNutzbar({ expiresAt: NOW + TAG }, NOW)).toBe(false);
    });
});

describe('Zuordnung Einwilligung ↔ Lead', () => {
    const lead = { domain: 'www.baeckerei-mueller.de', contactData: { allEmails: ['Info@baeckerei-mueller.de'] } };

    it('sammelt alle Adressen am Lead ohne Dubletten', () => {
        expect(leadEmails({ ...lead, contactEmail: 'INFO@baeckerei-mueller.de', contact: { email: 'chef@baeckerei-mueller.de' } }))
            .toEqual(['info@baeckerei-mueller.de', 'chef@baeckerei-mueller.de']);
    });

    it('E-Mail-Treffer ist case-insensitive', () => {
        expect(einwilligungsTreffer(lead, { email: 'info@BAECKEREI-mueller.de' })).toBe('email');
    });

    it('Domain-Treffer über die geprüfte Domain oder die Adresse auf der Lead-Domain', () => {
        expect(einwilligungsTreffer(lead, { email: 'privat@example.org', domain: 'baeckerei-mueller.de' })).toBe('domain');
        expect(einwilligungsTreffer(lead, { email: 'chef@baeckerei-mueller.de' })).toBe('domain');
    });

    it('Gegenprobe: Endung, Subdomain und fremde Domain treffen NICHT', () => {
        expect(einwilligungsTreffer(lead, { email: 'a@x.de', domain: 'meinbaeckerei-mueller.de' })).toBeNull();
        expect(einwilligungsTreffer(lead, { email: 'a@x.de', domain: 'shop.baeckerei-mueller.de' })).toBeNull();
        expect(einwilligungsTreffer(lead, { email: 'info@konditorei.de' })).toBeNull();
        expect(einwilligungsTreffer({ domain: '' }, { email: 'info@konditorei.de' })).toBeNull();
    });

    it('findeEinwilligungFuerLead nimmt nur eine tragende Einwilligung', () => {
        const widerrufen = { id: 'w', email: 'info@baeckerei-mueller.de', confirmedAt: NOW - TAG, revokedAt: NOW };
        const gestoppt = { id: 's', email: 'info@baeckerei-mueller.de', confirmedAt: NOW - TAG, stopped: true };
        const alt = { id: 'b', domain: 'baeckerei-mueller.de', email: 'x@y.de', confirmedAt: NOW - 30 * TAG };
        expect(findeEinwilligungFuerLead(lead, [widerrufen], NOW)).toBeNull();
        expect(findeEinwilligungFuerLead(lead, [gestoppt], NOW)).toBeNull();
        expect(findeEinwilligungFuerLead(lead, [widerrufen, gestoppt, alt], NOW)?.id).toBe('b');
    });

    it('einwilligungenFuerLead: E-Mail-Treffer vor Domain-Treffer, dann jüngste zuerst', () => {
        const liste = einwilligungenFuerLead(lead, [
            { id: 'd', domain: 'baeckerei-mueller.de', email: 'x@y.de', confirmedAt: NOW },
            { id: 'e1', email: 'info@baeckerei-mueller.de', confirmedAt: NOW - 2 * TAG },
            { id: 'e2', email: 'info@baeckerei-mueller.de', confirmedAt: NOW - TAG },
            { id: 'fremd', email: 'info@konditorei.de', confirmedAt: NOW }
        ], NOW);
        expect(liste.map(x => x.einwilligung.id)).toEqual(['e2', 'e1', 'd']);
        expect(einwilligungenFuerLead(lead, null)).toEqual([]);
    });
});

describe('ladeEinwilligungenMitStatus', () => {
    it('ohne Firebase: nicht gelesen ist NICHT „keine Einwilligungen"', async () => {
        const r = await ladeEinwilligungenMitStatus();
        expect(r).toMatchObject({ einwilligungen: [], geladen: false });
        expect(r.fehler).toBeTruthy();
        expect(await ladeEinwilligungen()).toEqual([]);
    });

    it('nicht angemeldet → nicht gelesen', async () => {
        globalThis.window = { __firebase: fakeFirebase({ angemeldet: false }).fb };
        expect((await ladeEinwilligungenMitStatus()).geladen).toBe(false);
    });

    it('liest consents neueste zuerst, begrenzt, und normalisiert', async () => {
        const { fb, aufrufe } = fakeFirebase({ docs: [
            ['c1', { email: 'A@B.de', confirmedAt: { toMillis: () => NOW }, sequenceStep: 1, source: 'startseite' }],
            ['c2', { email: 'c@d.de', revokedAt: { toMillis: () => NOW } }]
        ] });
        globalThis.window = { __firebase: fb };
        const r = await ladeEinwilligungenMitStatus();
        expect(r.geladen).toBe(true);
        expect(r.einwilligungen.map(e => [e.id, e.email])).toEqual([['c1', 'a@b.de'], ['c2', 'c@d.de']]);
        expect(aufrufe.query[0].col).toEqual({ name: 'consents' });
        expect(aufrufe.query[0].teile).toEqual([{ orderBy: ['createdAt', 'desc'] }, { limit: 500 }]);
        expect(await ladeEinwilligungen()).toHaveLength(2);
    });

    it('Lese-Limit erreicht → vollstaendig:false; darunter vollstaendig:true', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        const viele = Array.from({ length: 500 }, (_, i) => [`c${i}`, { email: `a${i}@b.de` }]);
        globalThis.window = { __firebase: fakeFirebase({ docs: viele }).fb };
        expect((await ladeEinwilligungenMitStatus()).vollstaendig).toBe(false);
        expect(console.warn).toHaveBeenCalled();
        globalThis.window = { __firebase: fakeFirebase({ docs: viele.slice(0, 2) }).fb };
        expect((await ladeEinwilligungenMitStatus()).vollstaendig).toBe(true);
    });

    it('fehlende Leseberechtigung wird benannt, nicht verschluckt', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const err = Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' });
        globalThis.window = { __firebase: fakeFirebase({ wirft: err }).fb };
        const r = await ladeEinwilligungenMitStatus();
        expect(r).toMatchObject({ einwilligungen: [], geladen: false, fehler: 'Keine Leseberechtigung für Einwilligungen' });
        expect(console.error).toHaveBeenCalled();
    });
});

describe('stoppeSequenz', () => {
    it('schreibt ausschliesslich {stopped:true} auf consents/{id}', async () => {
        const { fb, aufrufe } = fakeFirebase();
        globalThis.window = { __firebase: fb };
        expect(await stoppeSequenz(' c1 ')).toEqual({ ok: true });
        expect(aufrufe.updateDoc).toHaveLength(1);
        expect(aufrufe.updateDoc[0].ref).toEqual({ col: 'consents', id: 'c1' });
        // Gegenprobe gegen die Firestore-Regel: kein weiteres Feld (auch kein updatedAt)
        expect(aufrufe.updateDoc[0].daten).toEqual({ stopped: true });
    });

    it('ohne ID oder ohne Anmeldung wird nichts geschrieben', async () => {
        const { fb, aufrufe } = fakeFirebase({ angemeldet: false });
        globalThis.window = { __firebase: fb };
        expect((await stoppeSequenz('')).ok).toBe(false);
        expect((await stoppeSequenz('c1')).ok).toBe(false);
        expect(aufrufe.updateDoc).toHaveLength(0);
    });

    it('die Strecke umfasst höchstens drei E-Mails (V1)', () => {
        expect(MAX_SEQUENZ_SCHRITTE).toBe(3);
    });
});
