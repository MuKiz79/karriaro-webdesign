import { describe, it, expect } from 'vitest';
import { analyzeTechDepth } from '../../src/analysis/tech-depth.js';

const JETZT = new Date(2026, 8, 10);
const mockPsi = (urls = []) => ({
    lighthouseResult: {
        audits: {
            'network-requests': {
                details: { items: urls.map(u => ({ url: u, mimeType: 'text/html' })) }
            }
        }
    }
});

describe('analyzeTechDepth', () => {
    it('clean modern site = modern techAge', () => {
        const result = analyzeTechDepth(mockPsi(['https://example.de/style.css']), { cms: null });
        expect(result.techAge).toBe('modern');
        expect(result.obsoleteScore).toBe(0);
    });

    it('old jQuery = high obsolete score', () => {
        const result = analyzeTechDepth(
            mockPsi(['https://cdn.example.de/jquery-1.12.4.min.js']),
            { cms: null }
        );
        expect(result.obsoleteScore).toBeGreaterThanOrEqual(3);
        expect(result.findings.some(f => f.label.includes('jQuery'))).toBe(true);
    });

    it('many WordPress plugins = security risk', () => {
        const plugins = Array.from({length: 20}, (_, i) => `https://site.de/wp-content/plugins/plugin-${i}/style.css`);
        const result = analyzeTechDepth(mockPsi(plugins), { cms: 'WordPress' });
        expect(result.securityRisk).toBeGreaterThan(0);
        expect(result.findings.some(f => f.type === 'plugins')).toBe(true);
    });

    it('old Bootstrap = obsolete', () => {
        const result = analyzeTechDepth(
            mockPsi(['https://cdn.example.de/bootstrap/3.3.7/css/bootstrap.min.css']),
            { cms: null }
        );
        expect(result.findings.some(f => f.label.includes('Bootstrap'))).toBe(true);
        expect(result.obsoleteScore).toBeGreaterThanOrEqual(2);
    });
});

describe('CMS-Version auf der datierten Tabelle (2026-09-10)', () => {
    const cmsFund = r => r.findings.find(f => f.type === 'cms_version');

    it('Gegenprobe: WordPress 4.9 ist „nicht aktuell", KEIN Sicherheitsrisiko', () => {
        const r = analyzeTechDepth(mockPsi([]), { cms: 'WordPress', version: '4.9.18' }, { jetzt: JETZT });
        expect(cmsFund(r).severity).toBe('mittel');
        expect(cmsFund(r).risk).not.toMatch(/Sicherheitsupdates/);
        expect(r.securityRisk).toBe(0);
    });

    it('WordPress 4.5 ist ein Sicherheitsrisiko mit Datum', () => {
        const r = analyzeTechDepth(mockPsi([]), { cms: 'WordPress', version: '4.5' }, { jetzt: JETZT });
        expect(cmsFund(r).severity).toBe('hoch');
        expect(cmsFund(r).risk).toBe('ohne Sicherheitsupdates seit 07/2025');
        expect(r.securityRisk).toBeGreaterThanOrEqual(3);
    });

    it('Joomla 3.10 (Version aus dem Quelltext) wird ebenfalls bewertet', () => {
        const r = analyzeTechDepth(mockPsi([]), { cms: 'Joomla', version: '3.10.12' }, { jetzt: JETZT });
        expect(cmsFund(r).label).toBe('Joomla 3.10.12');
        expect(cmsFund(r).risk).toBe('ohne Sicherheitsupdates seit 17.08.2023');
    });
});

describe('PHP aus adEvidence statt aus URLs (Korrektur 2026-09-10)', () => {
    it('die alte Header-in-URL-Suche liefert keinen Befund mehr', () => {
        const r = analyzeTechDepth(mockPsi(['https://x.de/?X-Powered-By: PHP/5.6']), { cms: null });
        expect(r.findings.some(f => f.type === 'server')).toBe(false);
        expect(r.php).toBeNull();
    });

    it('gemessenes PHP ohne Updates → hoch, Datum, Hoster-Hinweis bei IONOS', () => {
        const r = analyzeTechDepth(mockPsi([]), { cms: null }, {
            php: { version: '7.4', eol: true, eolDatum: '2022-11-28' },
            hoster: { name: 'ionos', quelle: 'ns' }
        });
        const f = r.findings.find(x => x.type === 'server');
        expect(f.label).toBe('PHP 7.4');
        expect(f.risk).toBe('ohne Sicherheitsupdates seit 28.11.2022');
        expect(f.hinweis).toMatch(/in der Regel einen Aufpreis/);
        expect(r.securityRisk).toBe(3);
        expect(r.hosterHinweis).toMatch(/prüfen Sie Ihre letzte Rechnung/);
    });

    it('Gegenprobe: eol null (nicht gemessen) und eol false → kein Befund', () => {
        for (const php of [{ version: '7.4', eol: null, eolDatum: null }, { version: '8.3', eol: false, eolDatum: null }]) {
            const r = analyzeTechDepth(mockPsi([]), { cms: null }, { php, hoster: { name: 'strato' } });
            expect(r.findings.some(f => f.type === 'server')).toBe(false);
            expect(r.securityRisk).toBe(0);
        }
    });
});

describe('pitchArg zählt nur Befunde mit Sicherheitsbezug (Prüfung 2026-09-10)', () => {
    const php = { version: '7.4', eol: true, eolDatum: '2022-11-28' };

    it('Gegenprobe: Bootstrap 3 (Design) steht NICHT in der Sicherheitsliste', () => {
        const r = analyzeTechDepth(
            mockPsi(['https://cdn.example.de/bootstrap/3.3.7/css/bootstrap.min.css']),
            { cms: null }, { php, jetzt: JETZT }
        );
        expect(r.securityRisk).toBe(3);
        expect(r.pitchArg).toContain('PHP 7.4');
        expect(r.pitchArg).not.toContain('Bootstrap');
        expect(r.pitchArg).not.toMatch(/Angriffspunkt|Hacker/);
    });

    it('nennt das belegte Datum statt einer Angriffs-Behauptung', () => {
        const r = analyzeTechDepth(mockPsi([]), { cms: 'WordPress', version: '4.5' }, { jetzt: JETZT });
        expect(r.pitchArg).toBe('Ihre Website nutzt veraltete Software mit Sicherheitsbezug: WordPress 4.5 (ohne Sicherheitsupdates seit 07/2025).');
    });

    it('nur Design-Befunde → kein Sicherheitssatz', () => {
        const r = analyzeTechDepth(mockPsi(['https://cdn.example.de/bootstrap/3.3.7/css/bootstrap.min.css']), { cms: null }, { jetzt: JETZT });
        expect(r.securityRisk).toBe(0);
        expect(r.pitchArg === null || !/Sicherheit/.test(r.pitchArg)).toBe(true);
    });
});
