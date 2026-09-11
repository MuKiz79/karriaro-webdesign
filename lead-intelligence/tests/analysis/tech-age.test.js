import { describe, it, expect } from 'vitest';
import { analyzeTechAge, bewerteCmsVersion, formatiereDatum, kanonischerCmsName, ergaenzeTechVersion } from '../../src/analysis/tech-age.js';

// Fester Stichtag: die Tabelle hängt an Daten, die Tests dürfen nicht an der Uhr hängen.
const JETZT = new Date(2026, 8, 10);   // 10.09.2026

describe('analyzeTechAge', () => {
    it('WordPress 4.9 ist NICHT „ohne Sicherheitsupdates" (Korrektur 2026-09-10)', () => {
        // ⚠️ Dieser Test verlangte bis 2026-09-10 cmsEolYear 2022 + techSeverity 5
        // für 4.9.18 — die alte Tabelle führte die GANZE 4er-Reihe als EOL. Ab 4.7
        // erscheinen weiter Sicherheitsupdates; die Erwartung ist deshalb gedreht.
        const r = analyzeTechAge(
            { cms: 'WordPress', version: '4.9.18', isBaukasten: false },
            { yearsSince: 4, domainAgeYears: 8, firstSeen: '2017-03-12', lastChanged: '2021-06-01' },
            { jetzt: JETZT }
        );
        expect(r.cmsEolYear).toBe(null);
        expect(r.eol).toBe(false);
        expect(r.techSeverity).toBe(2);
        expect(r.techStackVerdict).toMatch(/nicht aktuell/);
        expect(r.pitchArg || '').not.toMatch(/Sicherheitsupdates/);
    });

    it('flags WordPress 4.5 as EOL since 07/2025 with high severity', () => {
        const r = analyzeTechAge(
            { cms: 'WordPress', version: '4.5.3', isBaukasten: false },
            { yearsSince: 4 },
            { jetzt: JETZT }
        );
        expect(r.eol).toBe(true);
        expect(r.eolDatum).toBe('2025-07');
        expect(r.cmsEolYear).toBe(2025);
        expect(r.techSeverity).toBe(5);
        expect(r.eolText).toBe('ohne Sicherheitsupdates seit 07/2025');
        expect(r.pitchArg).toMatch(/WordPress 4\.5\.3/);
        expect(r.pitchArg).toMatch(/seit 07\/2025 keine Sicherheitsupdates/);
    });

    it('keeps current WordPress 6.x at low severity', () => {
        const r = analyzeTechAge(
            { cms: 'WordPress', version: '6.4.2', isBaukasten: false },
            { yearsSince: 0.3, domainAgeYears: 5 }
        );
        expect(r.cmsEolYear).toBe(null);
        expect(r.techSeverity).toBeLessThanOrEqual(2);
        expect(r.era).toBe('modern');
        // Keine Behauptung „aktuell" — die neueste Versionsnummer kennt die Tabelle nicht.
        expect(r.techStackVerdict).not.toMatch(/aktuelle/);
    });

    it('flags Baukasten regardless of age', () => {
        const r = analyzeTechAge(
            { cms: 'Wix', version: null, isBaukasten: true },
            { yearsSince: 0.5, domainAgeYears: 2 }
        );
        expect(r.isBaukasten).toBe(true);
        expect(r.techStackVerdict).toMatch(/Baukasten/);
        expect(r.techSeverity).toBeGreaterThanOrEqual(3);
    });

    it('handles missing wayback data gracefully', () => {
        const r = analyzeTechAge(
            { cms: 'WordPress', version: '6.4.0', isBaukasten: false },
            {}
        );
        expect(r.era).toBe('unknown');
        expect(r.eraSeverity).toBe(0);
    });

    it('produces a strong pitchArg when both EOL and abandoned', () => {
        const r = analyzeTechAge(
            { cms: 'WordPress', version: '4.5.0', isBaukasten: false },
            { yearsSince: 6, domainAgeYears: 10, firstSeen: '2014-05-01', lastChanged: '2019-08-01' },
            { jetzt: JETZT }
        );
        expect(r.pitchArg).toMatch(/Sicherheitsupdates/);
        expect(r.pitchArg).toMatch(/nicht mehr substanziell überarbeitet/);
    });

    it('headline reflects severity', () => {
        const high = analyzeTechAge(
            { cms: 'WordPress', version: '4.0', isBaukasten: false },
            { yearsSince: 5 }
        );
        const low = analyzeTechAge(
            { cms: 'WordPress', version: '6.4', isBaukasten: false },
            { yearsSince: 0.2 }
        );
        expect(high.headline).toMatch(/⚠/);
        expect(low.headline).not.toMatch(/⚠/);
    });
});

describe('Support-Tabelle mit Datum (2026-09-10)', () => {
    const sv = (cms, v, jetzt = JETZT) => bewerteCmsVersion(cms, v, jetzt);

    describe('WordPress', () => {
        it('Gegenprobe: 4.7 und 5.9 melden NICHT „ohne Sicherheitsupdates"', () => {
            for (const v of ['4.7', '4.7.0', '5.9', '5.9.3']) {
                const r = sv('WordPress', v);
                expect(r.eol, `WordPress ${v}`).toBe(false);
                expect(r.status, `WordPress ${v}`).toBe('nicht-aktuell');
                expect(r.text).not.toMatch(/Sicherheitsupdates/);
            }
        });
        it('4.5 und 4.1 melden EOL seit 07/2025', () => {
            expect(sv('WordPress', '4.5').text).toBe('ohne Sicherheitsupdates seit 07/2025');
            expect(sv('WordPress', '4.1.2').eolDatum).toBe('2025-07');
            expect(sv('WordPress', '4.6').eol).toBe(true);
        });
        it('3.7–4.0 melden EOL seit 09/2022', () => {
            expect(sv('WordPress', '3.7').text).toBe('ohne Sicherheitsupdates seit 09/2022');
            expect(sv('WordPress', '4.0.1').eolDatum).toBe('2022-09');
        });
        it('älter als 3.7: sicher ohne Updates, aber OHNE erfundenes Datum („spätestens")', () => {
            const r = sv('WordPress', '3.5.1');
            expect(r.eol).toBe(true);
            expect(r.spaetestens).toBe(true);
            expect(r.text).toBe('ohne Sicherheitsupdates (spätestens seit 09/2022)');
            // Die Jahreszahl für „seit JJJJ"-Betreffzeilen bleibt leer.
            expect(analyzeTechAge({ cms: 'WordPress', version: '3.5.1' }, {}, { jetzt: JETZT }).cmsEolYear).toBeNull();
        });
        it('6.x und 7.x: kein Befund, keine Behauptung', () => {
            expect(sv('WordPress', '6.4.2').status).toBe('ohne-befund');
            expect(sv('WordPress', '7.0').eol).toBe(false);
        });
        it('„WordPress 4" ohne Minor ist zu ungenau — keine Support-Aussage', () => {
            const r = sv('WordPress', '4');
            expect(r.status).toBe('unbekannt');
            expect(r.eol).toBe(false);
        });
        it('Plugin-Zusatz im CMS-Namen stört nicht', () => {
            expect(sv('WordPress + Elementor', '4.5').eol).toBe(true);
        });
    });

    describe('Joomla', () => {
        it('Joomla 4 meldet EOL seit 14.10.2025, Joomla 3 seit 17.08.2023', () => {
            expect(sv('Joomla', '4.4.9').text).toBe('ohne Sicherheitsupdates seit 14.10.2025');
            expect(sv('Joomla!', '3.10.12').text).toBe('ohne Sicherheitsupdates seit 17.08.2023');
            expect(sv('Joomla', '3').eol).toBe(true);   // eine Regel deckt die ganze 3er-Reihe
        });
        it('Joomla 5 ist gepflegt bis 12.10.2027 — kein Befund', () => {
            const r = sv('Joomla', '5.2');
            expect(r.eol).toBe(false);
            expect(r.status).toBe('gepflegt');
            expect(r.supportBis).toBe('2027-10-12');
        });
        it('Gegenprobe Stichtag: vor dem 14.10.2025 war Joomla 4 noch gepflegt', () => {
            expect(sv('Joomla', '4.4', new Date(2025, 9, 13)).eol).toBe(false);
            expect(sv('Joomla', '4.4', new Date(2025, 9, 14)).eol).toBe(true);
        });
    });

    describe('TYPO3 — nur KOSTENLOSE Updates enden', () => {
        it('v11 seit 31.10.2024 ohne kostenlose Updates, nie „keine Sicherheitsupdates"', () => {
            const r = sv('TYPO3', '11.5.30');
            expect(r.eol).toBe(true);
            expect(r.nurKostenlos).toBe(true);
            expect(r.text).toBe('ohne kostenlose Sicherheitsupdates seit 31.10.2024 (nur kostenpflichtige Verlängerung)');
            const ta = analyzeTechAge({ cms: 'TYPO3', version: '11.5.30' }, {}, { jetzt: JETZT });
            expect(ta.pitchArg).toMatch(/keine kostenlosen Sicherheitsupdates/);
            expect(ta.pitchArg).toMatch(/kostenpflichtige Verlängerung/);
            expect(ta.cmsEolYear).toBeNull();   // „seit 2024 ohne Sicherheitsupdates" wäre falsch
        });
        it('v12 endete am 30.04.2026 — davor gepflegt', () => {
            expect(sv('TYPO3', '12.4').eolDatum).toBe('2026-04-30');
            expect(sv('TYPO3', '12.4', new Date(2026, 2, 1)).eol).toBe(false);
        });
        it('v13 ohne Befund', () => {
            expect(sv('TYPO3', '13.4').eol).toBe(false);
        });
        it('älter als v11 (Prüfung): ohne kostenlose Updates, aber KEINE Behauptung über eine kaufbare Verlängerung', () => {
            const r = sv('TYPO3', '10.4.37');
            expect(r.eol).toBe(true);
            expect(r.spaetestens).toBe(true);
            expect(r.text).toBe('ohne kostenlose Sicherheitsupdates (spätestens seit 31.10.2024)');
            const ta = analyzeTechAge({ cms: 'TYPO3', version: '10.4.37' }, {}, { jetzt: JETZT });
            expect(ta.pitchArg).toMatch(/keine kostenlosen Sicherheitsupdates/);
            expect(ta.pitchArg).not.toMatch(/Verlängerung/);
            expect(ta.cmsEolYear).toBeNull();
        });
    });

    describe('Contao', () => {
        it('4.13 EOL seit 14.02.2026, 5.3 LTS gepflegt bis 14.02.2028', () => {
            expect(sv('Contao', '4.13.40').text).toBe('ohne Sicherheitsupdates seit 14.02.2026');
            expect(sv('Contao', '5.3.9').status).toBe('gepflegt');
        });
        it('Nicht-LTS-Minors 5.0–5.2 und 5.4–5.6 ohne Support, ohne Datum', () => {
            for (const v of ['5.0', '5.1.4', '5.2', '5.4', '5.5.1', '5.6']) {
                const r = sv('Contao', v);
                expect(r.eol, `Contao ${v}`).toBe(true);
                expect(r.eolDatum, `Contao ${v}`).toBeNull();
            }
            // Satzbau wie die datierten Fälle, weil Chips „CMS Version Text" zusammensetzen.
            expect(analyzeTechAge({ cms: 'Contao', version: '5.1' }, {}, { jetzt: JETZT }).techStackVerdict)
                .toBe('Contao 5.1 ohne Sicherheitsupdates (Nicht-LTS-Version)');
        });
        it('Contao 5.7 und „5" ohne Minor: keine Behauptung', () => {
            expect(sv('Contao', '5.7').eol).toBe(false);
            expect(sv('Contao', '5').status).toBe('unbekannt');
        });
    });

    it('Shopware 5 ohne Sicherheitsupdates seit 07/2024, Shopware 6 ohne Befund', () => {
        expect(sv('Shopware', '5.7.19').text).toBe('ohne Sicherheitsupdates seit 07/2024');
        expect(sv('Shopware', '6.5').eol).toBe(false);
    });

    it('ohne Version, unbekanntes CMS oder Baukasten: nie EOL', () => {
        expect(sv('WordPress', null).eol).toBe(false);
        expect(sv('Webflow', '1.0').eol).toBe(false);
        const bk = analyzeTechAge({ cms: 'Joomla', version: '3.10', isBaukasten: true }, {}, { jetzt: JETZT });
        expect(bk.eol).toBe(false);
    });
});

describe('Hilfsfunktionen', () => {
    it('formatiereDatum bleibt so genau wie die Quelle', () => {
        expect(formatiereDatum('2025')).toBe('2025');
        expect(formatiereDatum('2025-07')).toBe('07/2025');
        expect(formatiereDatum('2023-08-17')).toBe('17.08.2023');
        expect(formatiereDatum('Ende 2024')).toBe('Ende 2024');
    });

    it('kanonischerCmsName', () => {
        expect(kanonischerCmsName('WordPress + Divi')).toBe('WordPress');
        expect(kanonischerCmsName('Joomla!')).toBe('Joomla');
        expect(kanonischerCmsName('TYPO3 CMS')).toBe('TYPO3');
    });

    describe('ergaenzeTechVersion — Lücken füllen, PSI hat Vorrang', () => {
        it('füllt ein NICHT erkanntes CMS aus dem Quelltext (der alte Scanner-Fall griff nie)', () => {
            const t = ergaenzeTechVersion({ cms: 'Nicht erkannt (moeglicherweise handcodiert)', version: null, isBaukasten: false },
                { cms: 'Joomla', version: '4.4.2', quelle: 'generator' });
            expect(t.cms).toBe('Joomla');
            expect(t.version).toBe('4.4.2');
            expect(analyzeTechAge(t, {}, { jetzt: JETZT }).eol).toBe(true);
        });
        it('füllt die WordPress-Version auch bei „WordPress + Elementor"', () => {
            const t = ergaenzeTechVersion({ cms: 'WordPress + Elementor', version: null }, { cms: 'WordPress', version: '4.6.1' });
            expect(t.cms).toBe('WordPress + Elementor');
            expect(t.version).toBe('4.6.1');
        });
        it('Gegenprobe: vorhandene PSI-Version und fremdes CMS bleiben unangetastet', () => {
            const psi = { cms: 'WordPress', version: '6.4.2' };
            expect(ergaenzeTechVersion(psi, { cms: 'WordPress', version: '4.1' })).toBe(psi);
            const wp = { cms: 'WordPress', version: null };
            expect(ergaenzeTechVersion(wp, { cms: 'Joomla', version: '3.10' })).toBe(wp);
            expect(ergaenzeTechVersion(wp, null)).toBe(wp);
        });
    });
});
