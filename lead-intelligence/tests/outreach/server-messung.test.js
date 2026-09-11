import { describe, it, expect } from 'vitest';
import { serverMessungHtml } from '../../src/ui/render-components.js';

// Anzeige der Server-Messung im Einzel-Check (V6, EVIDENCE_SCHEMA 3).
// Kernregel: null = nicht gemessen → neutral, nie als Mangel.

function chips(html) {
    return [...html.matchAll(/<span class="badge" data-ton="(\w+)"[^>]*>([^<]*)<\/span>/g)].map(m => ({ ton: m[1], text: m[2] }));
}

describe('serverMessungHtml', () => {
    it('keine der drei Messungen vorhanden → keine Karte', () => {
        expect(serverMessungHtml({})).toBe('');
        expect(serverMessungHtml({ httpsCheck: null, php: null, hoster: null })).toBe('');
    });

    it('nicht gemessen erscheint neutral, nie als Mangel', () => {
        const c = chips(serverMessungHtml({ httpsCheck: { checked: false, reachable: null, certValidForHost: null, redirectsToHttps: null }, php: null, hoster: null }));
        expect(c.map(x => x.text)).toEqual(['HTTPS: nicht gemessen', 'PHP: nicht gemessen', 'Hoster: nicht gemessen']);
        expect(c.every(x => x.ton === 'neutral')).toBe(true);
        // checked:true, aber reachable null ist ebenfalls nicht gemessen
        const c2 = chips(serverMessungHtml({ httpsCheck: { checked: true, reachable: null } }));
        expect(c2[0]).toEqual({ ton: 'neutral', text: 'HTTPS: nicht gemessen' });
    });

    it('gemessen ohne HTTPS → Mangel; mit HTTPS, passendem Zertifikat und Weiterleitung → gut (Gegenprobe)', () => {
        const ohne = chips(serverMessungHtml({ ws: { isHttps: false }, httpsCheck: { checked: true, reachable: false } }));
        expect(ohne[0]).toEqual({ ton: 'schlecht', text: 'HTTPS nicht erreichbar (gemessen)' });

        const mit = chips(serverMessungHtml({ ws: { isHttps: true }, httpsCheck: { checked: true, reachable: true, certValidForHost: true, redirectsToHttps: true } }));
        expect(mit.slice(0, 3)).toEqual([
            { ton: 'gut', text: 'HTTPS erreichbar' },
            { ton: 'gut', text: 'Zertifikat passt zum Host' },
            { ton: 'gut', text: 'Leitet auf HTTPS um' }
        ]);
    });

    it('Widerspruch zur PSI-Endadresse (https geladen, Messung „nicht erreichbar") → kein Mangel', () => {
        const c = chips(serverMessungHtml({ ws: { isHttps: true }, httpsCheck: { checked: true, reachable: false } }));
        expect(c[0]).toEqual({ ton: 'neutral', text: 'HTTPS: Messung widersprüchlich' });
    });

    it('fremdes Zertifikat und fehlende Weiterleitung werden gezeigt', () => {
        const c = chips(serverMessungHtml({ httpsCheck: { checked: true, reachable: true, certValidForHost: false, redirectsToHttps: false } }));
        expect(c).toContainEqual({ ton: 'schlecht', text: 'Zertifikat passt nicht zum Host' });
        expect(c).toContainEqual({ ton: 'warn', text: 'Keine Weiterleitung auf HTTPS' });
    });

    it('PHP: nur eol === true mit Version ist ein Befund; eol null bleibt neutral', () => {
        const eol = chips(serverMessungHtml({ php: { version: '7.4', eol: true, eolDatum: '2022-11-28' } }));
        expect(eol.find(x => x.text.startsWith('PHP'))).toMatchObject({ ton: 'schlecht' });
        expect(eol.find(x => x.text.startsWith('PHP')).text).toMatch(/PHP 7\.4 ohne Sicherheitsupdates/);

        const unbekannt = chips(serverMessungHtml({ php: { version: '8.1', eol: null, eolDatum: null } }));
        expect(unbekannt.find(x => x.text.startsWith('PHP'))).toEqual({ ton: 'neutral', text: 'PHP 8.1 — Support-Stand unbekannt' });

        const aktuell = chips(serverMessungHtml({ php: { version: '8.3', eol: false, eolDatum: null } }));
        expect(aktuell.find(x => x.text.startsWith('PHP'))).toEqual({ ton: 'gut', text: 'PHP 8.3 — noch unterstützt' });

        const ohneVersion = chips(serverMessungHtml({ php: { version: null, eol: null, eolDatum: null } }));
        expect(ohneVersion.find(x => x.text.startsWith('PHP'))).toEqual({ ton: 'neutral', text: 'PHP-Version nicht erkennbar' });
    });

    it('Hoster mit Quelle; Hoster-Hinweis nur bei veraltetem PHP auf Strato/IONOS', () => {
        const html = serverMessungHtml({ php: { version: '7.4', eol: true, eolDatum: null }, hoster: { name: 'strato', quelle: 'mx' } });
        expect(chips(html)).toContainEqual({ ton: 'neutral', text: 'Hoster: Strato (laut MX-Eintrag)' });
        expect(html).toMatch(/Aufpreis/);

        const ohneEol = serverMessungHtml({ php: { version: '8.3', eol: false, eolDatum: null }, hoster: { name: 'ionos', quelle: 'ns' } });
        expect(chips(ohneEol)).toContainEqual({ ton: 'neutral', text: 'Hoster: IONOS (laut Nameserver)' });
        expect(ohneEol).not.toMatch(/Aufpreis/);

        expect(chips(serverMessungHtml({ hoster: { name: null, quelle: null } }))).toContainEqual({ ton: 'neutral', text: 'Hoster: nicht erkannt' });
    });

    it('Werte werden escaped', () => {
        const html = serverMessungHtml({ php: { version: '<b>7</b>', eol: null } });
        expect(html).not.toContain('<b>7</b>');
        expect(html).toContain('&lt;b&gt;7&lt;/b&gt;');
    });
});
