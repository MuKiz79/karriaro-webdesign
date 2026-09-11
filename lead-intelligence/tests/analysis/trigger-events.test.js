import { describe, it, expect } from 'vitest';
import { detectTriggerEvents, httpsBefund, phpBefund, datierteAnlaesse, CHROME_HTTPS_WARNUNG, HOSTER_PHP_HINWEIS } from '../../src/analysis/trigger-events.js';

const JETZT = new Date(2026, 8, 10);
const basis = (o = {}) => ({
    ws: { isHttps: true, a11y: 95, perf: 95 },
    tech: {}, place: null, wayback: null,
    footprint: null, psiData: null, contentAnalysis: null,
    socialSignals: null, competitors: null, jetzt: JETZT,
    ...o
});

describe('detectTriggerEvents', () => {
    it('no SSL + bad a11y = sofort triggers', () => {
        const result = detectTriggerEvents({
            ws: { isHttps: false, a11y: 40, perf: 50 },
            tech: {}, place: null, wayback: null,
            footprint: null, psiData: null, contentAnalysis: null,
            socialSignals: null, competitors: null
        });
        expect(result.hasSofort).toBe(true);
        expect(result.eventCount).toBeGreaterThanOrEqual(2);
    });

    it('perfect website = no triggers', () => {
        const result = detectTriggerEvents({
            ws: { isHttps: true, a11y: 95, perf: 95 },
            tech: {}, place: null, wayback: null,
            footprint: null, psiData: null, contentAnalysis: null,
            socialSignals: null, competitors: null
        });
        expect(result.hasSofort).toBe(false);
        expect(result.totalImpact).toBeLessThan(5);
    });

    it('old wayback + outdated tech = high impact', () => {
        // ⚠️ Fixture 2026-09-10: war `version: '4'`. Seit der datierten Tabelle ist
        // „WordPress 4" ohne Minor zu ungenau für eine Support-Aussage (3.7–4.0,
        // 4.1–4.6 und 4.7+ enden verschieden). Die Absicht des Tests — alte Seite
        // + EOL-Version = hohe Dringlichkeit — bleibt mit einer belegten Version.
        const result = detectTriggerEvents({
            ws: { isHttps: true, a11y: 80, perf: 50 },
            tech: { version: '4.5', cms: 'WordPress' },
            place: null,
            wayback: { daysSince: 900, yearsSince: 2.5 },
            footprint: null, psiData: null, contentAnalysis: null,
            socialSignals: null, competitors: null
        });
        expect(result.totalImpact).toBeGreaterThanOrEqual(6);
    });

    it('should sort events by impact', () => {
        const result = detectTriggerEvents({
            ws: { isHttps: false, a11y: 30, perf: 20 },
            tech: { version: '4', cms: 'WordPress' },
            place: null, wayback: { daysSince: 1000, yearsSince: 2.7 },
            footprint: null, psiData: null, contentAnalysis: null,
            socialSignals: null, competitors: null
        });
        for (let i = 1; i < result.events.length; i++) {
            expect(result.events[i].impact).toBeLessThanOrEqual(result.events[i-1].impact);
        }
    });
});

describe('tech_eol auf der datierten Tabelle (2026-09-10)', () => {
    const eol = r => r.events.find(e => e.type === 'tech_eol');

    it('Gegenprobe: WordPress 4.7 und 5.9 lösen KEIN tech_eol aus (vorher parseInt < 6)', () => {
        for (const v of ['4.7', '4.9.18', '5.9']) {
            expect(eol(detectTriggerEvents(basis({ tech: { cms: 'WordPress', version: v } }))), v).toBeUndefined();
        }
    });
    it('WordPress 4.5 meldet das Datum', () => {
        const e = eol(detectTriggerEvents(basis({ tech: { cms: 'WordPress', version: '4.5' } })));
        expect(e.label).toBe('WordPress 4.5 ohne Sicherheitsupdates seit 07/2025');
        expect(e.datum).toBe('2025-07');
    });
    it('Joomla 4 (Version aus adEvidence.techVersion) meldet EOL', () => {
        const e = eol(detectTriggerEvents(basis({ tech: { cms: 'Joomla', version: '4.4.3' } })));
        expect(e.label).toBe('Joomla 4.4.3 ohne Sicherheitsupdates seit 14.10.2025');
    });
    it('Joomla 5 bleibt still', () => {
        expect(eol(detectTriggerEvents(basis({ tech: { cms: 'Joomla', version: '5.1' } })))).toBeUndefined();
    });
});

describe('HTTPS nach httpsCheck (V6)', () => {
    const security = r => r.events.filter(e => e.type === 'security');

    it('gemessen nicht erreichbar → Chrome-Hinweis mit Datum, sofort', () => {
        // http-only-Seite: PSI landet auf http, die Messung findet kein HTTPS.
        const r = detectTriggerEvents(basis({ ws: { isHttps: false, a11y: 95, perf: 95 }, httpsCheck: { checked: true, reachable: false, certValidForHost: null, redirectsToHttps: null } }));
        const s = security(r);
        expect(s).toHaveLength(1);
        expect(s[0].label).toBe(CHROME_HTTPS_WARNUNG);
        expect(s[0].datum).toBe('2026-10');
        expect(r.hasSofort).toBe(true);
    });

    it('Gegenprobe (Prüfung): PSI hat die https-Fassung geladen → eine widersprechende Messung belegt nichts', () => {
        // z.B. fehlendes Zwischenzertifikat: Node-TLS bricht ab, Chrome lädt nach.
        const r = detectTriggerEvents(basis({ ws: { isHttps: true, a11y: 95, perf: 95 }, httpsCheck: { checked: true, reachable: false } }));
        expect(security(r)).toHaveLength(0);
        expect(r.events.some(e => e.label === CHROME_HTTPS_WARNUNG)).toBe(false);
        expect(r.anlaesse.some(a => a.art === 'chrome-warnung')).toBe(false);
    });

    it('Gegenprobe: HTTPS erreichbar, PSI hat nur die http-Fassung geladen → KEIN Sicherheits-Trigger', () => {
        const r = detectTriggerEvents(basis({
            ws: { isHttps: false, a11y: 95 },
            httpsCheck: { checked: true, reachable: true, certValidForHost: true, redirectsToHttps: false }
        }));
        expect(security(r)).toHaveLength(0);
        expect(r.hasSofort).toBe(false);
        // höchstens ein weicher Hinweis
        const hint = r.events.find(e => e.type === 'security_hint');
        expect(hint.impact).toBe(1);
        expect(r.events.some(e => e.label === CHROME_HTTPS_WARNUNG)).toBe(false);
    });

    it('ohne Messung: bisherige PSI-Logik, aber OHNE Chrome-Datumsaussage', () => {
        const r = detectTriggerEvents(basis({ ws: { isHttps: false, a11y: 95 } }));
        expect(security(r)).toHaveLength(1);
        expect(security(r)[0].label).not.toBe(CHROME_HTTPS_WARNUNG);
        expect(security(r)[0].datum).toBeUndefined();
    });

    it('reachable null (nicht gemessen) fällt auf PSI zurück — nie negativ gewertet', () => {
        const r = detectTriggerEvents(basis({ ws: { isHttps: true, a11y: 95 }, httpsCheck: { checked: true, reachable: null } }));
        expect(security(r)).toHaveLength(0);
    });

    it('fehlendes ws-Objekt erzeugt keinen „Nicht sicher"-Befund mehr', () => {
        const r = detectTriggerEvents(basis({ ws: undefined }));
        expect(security(r)).toHaveLength(0);
    });

    it('kein Wortlaut behauptet „alle Ihre Kunden"', () => {
        const r = detectTriggerEvents(basis({ ws: { isHttps: false, a11y: 95 }, httpsCheck: { checked: true, reachable: false } }));
        expect(r.events.some(e => e.type === 'security')).toBe(true);   // sonst prüft der Test nichts
        expect(r.events.map(e => e.label).join(' ')).not.toMatch(/alle (Ihre )?Kunden|jeder Besucher/i);
    });
});

describe('PHP + Hoster (V6)', () => {
    const php74 = { version: '7.4', eol: true, eolDatum: '2022-11-28' };

    it('PHP ohne Updates mit Datum + Hoster-Hinweis bei Strato', () => {
        const r = detectTriggerEvents(basis({ php: php74, hoster: { name: 'strato', quelle: 'mx' } }));
        const p = r.events.find(e => e.type === 'php_eol');
        expect(p.label).toBe('PHP 7.4 ohne Sicherheitsupdates seit 28.11.2022');
        expect(p.datum).toBe('2022-11-28');
        const h = r.events.find(e => e.type === 'hoster_hint');
        expect(h.label).toBe(`Strato: ${HOSTER_PHP_HINWEIS}`);
        expect(h.label).toMatch(/in der Regel/);
    });

    it('Gegenprobe: eol null / false / ohne Version → kein PHP-Befund', () => {
        for (const php of [{ version: '7.4', eol: null }, { version: '8.3', eol: false }, { version: null, eol: true }, null]) {
            const r = detectTriggerEvents(basis({ php, hoster: { name: 'ionos', quelle: 'ns' } }));
            expect(r.events.some(e => e.type === 'php_eol' || e.type === 'hoster_hint')).toBe(false);
        }
    });

    it('anderer Hoster: PHP-Befund ja, Aufpreis-Hinweis nein', () => {
        const r = detectTriggerEvents(basis({ php: php74, hoster: { name: null, quelle: null } }));
        expect(r.events.some(e => e.type === 'php_eol')).toBe(true);
        expect(r.events.some(e => e.type === 'hoster_hint')).toBe(false);
    });
});

describe('Helfer', () => {
    it('httpsBefund', () => {
        expect(httpsBefund({ isHttps: false }, { checked: true, reachable: false }).ohneHttps).toBe(true);
        expect(httpsBefund(undefined, { checked: true, reachable: false }).ohneHttps).toBe(true);
        // Widerspruch: PSI lud https → weder gemessen noch Mangel
        expect(httpsBefund({ isHttps: true }, { checked: true, reachable: false })).toEqual({ gemessen: false, ohneHttps: false, ohneWeiterleitung: false, zertifikatFremd: false });
        expect(httpsBefund({ isHttps: false }, { checked: true, reachable: true }).ohneHttps).toBe(false);
        expect(httpsBefund({ isHttps: false }, null)).toEqual({ gemessen: false, ohneHttps: true, ohneWeiterleitung: false, zertifikatFremd: false });
        expect(httpsBefund({}, { checked: false, reachable: false }).ohneHttps).toBe(false);
    });

    it('phpBefund ohne Datum behauptet kein Datum', () => {
        expect(phpBefund({ version: '5.6', eol: true, eolDatum: null }).text).toBe('PHP 5.6 ohne Sicherheitsupdates');
    });

    it('datierteAnlaesse sammelt Chrome, PHP und CMS — Contao-Zwischenversion ohne Datum', () => {
        const a = datierteAnlaesse({
            ws: { isHttps: false }, tech: { cms: 'Contao', version: '5.1' },
            httpsCheck: { checked: true, reachable: false },
            php: { version: '8.0', eol: true, eolDatum: '2023-11-26' }, jetzt: JETZT
        });
        expect(a.map(x => x.art)).toEqual(['chrome-warnung', 'php-eol', 'cms-eol']);
        expect(a.find(x => x.art === 'cms-eol').datum).toBeNull();
    });

    it('datierteAnlaesse: nichts gemessen → keine Anlässe', () => {
        expect(datierteAnlaesse({ ws: { isHttps: false }, tech: { cms: 'WordPress', version: '6.4' } })).toEqual([]);
    });
});
