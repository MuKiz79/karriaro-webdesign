import { describe, it, expect, vi, afterEach } from 'vitest';
import { createGmailDrafts } from '../../src/outreach/gmail-drafts.js';

// Gmail erwartet `raw` als base64url — für die Prüfung zurückwandeln.
function entschluesseln(raw) {
    return Buffer.from(raw.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
}

const doiPruefung = { erlaubt: true, kanal: 'email', grundlage: 'doi', einwilligung: { id: 'e1', unsubscribeToken: 'tok123' } };
// Absichtlich OHNE from/listUnsubscribe: die Schranke muss beides selbst ergänzen.
const erlaubtOhneKopf = { to: 'inhaber@betrieb.de', subject: 'Hinweis zu Ihrer Website', body: 'Text', bodyHtml: '', grundlage: doiPruefung };
const ohneGrundlage = { to: 'kalt@fremd.de', subject: 'x', body: 'y', grundlage: { erlaubt: false, kanal: 'email', grundlage: 'keine' } };
const ohnePruefung = { to: 'alt@fremd.de', subject: 'x', body: 'y' };

function stubFirebaseUndFetch() {
    class GoogleAuthProvider {
        addScope() {}
        static credentialFromResult() { return { accessToken: 'test-token' }; }
    }
    const signInWithPopup = vi.fn(async () => ({}));
    globalThis.window = { __firebase: { fns: { GoogleAuthProvider, signInWithPopup }, auth: {} } };
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }));
    vi.stubGlobal('fetch', fetchMock);
    return { fetchMock, signInWithPopup };
}

afterEach(() => {
    delete globalThis.window;
    vi.unstubAllGlobals();
});

describe('createGmailDrafts — letzte Schranke vor dem Konto', () => {
    it('nur Entwürfe ohne erlaubte Grundlage: keine Anmeldung, kein Netz-Call', async () => {
        const { fetchMock, signInWithPopup } = stubFirebaseUndFetch();
        const r = await createGmailDrafts([ohneGrundlage, ohnePruefung]);
        expect(r).toEqual({ created: 0, failed: 0, blockiert: 2 });
        expect(signInWithPopup).not.toHaveBeenCalled();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('gemischt: nur der erlaubte Entwurf geht an Gmail — mit From und List-Unsubscribe, auch ohne Angabe des Aufrufers', async () => {
        const { fetchMock } = stubFirebaseUndFetch();
        const r = await createGmailDrafts([ohneGrundlage, erlaubtOhneKopf, ohnePruefung]);
        expect(r).toEqual({ created: 1, failed: 0, blockiert: 2 });
        expect(fetchMock).toHaveBeenCalledTimes(1);
        const mime = entschluesseln(JSON.parse(fetchMock.mock.calls[0][1].body).message.raw);
        expect(mime).toContain('To: inhaber@betrieb.de');
        expect(mime).not.toContain('kalt@fremd.de');
        expect(mime).not.toContain('alt@fremd.de');
        expect(mime).toMatch(/^From: .+ <kontakt@karriaro\.de>\r$/m);
        expect(mime).toContain('List-Unsubscribe: <mailto:kontakt@karriaro.de?subject=Abmelden>, <https://karriaro-webdesign.de/abmelden?t=tok123>');
        expect(mime).toContain('List-Unsubscribe-Post: List-Unsubscribe=One-Click');
        // genau EIN From- und EIN List-Unsubscribe-Header (keine Dopplung)
        expect(mime.match(/^From: /gm)).toHaveLength(1);
        expect(mime.match(/^List-Unsubscribe: /gm)).toHaveLength(1);
    });
});
