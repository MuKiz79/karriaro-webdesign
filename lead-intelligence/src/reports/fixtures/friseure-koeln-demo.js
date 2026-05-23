/**
 * Demo-Fixture für den Pilot-Report.
 *
 * KEINE echten Lead-Daten. Domains sind frei erfunden (.demo-TLD),
 * Verteilungen sind realistisch (Long-Tail Performance, ~70 % WordPress,
 * ~20 % Baukasten) aber synthetisch.
 *
 * Wenn der Pilot mit ECHTEN Daten deployed werden soll, exportieren Sie
 * einen Scanner-Run als JSON und übergeben ihn an
 * `scripts/build-report-pilot.mjs` per `--leads`-Flag.
 */

const CMSS = ['WordPress', 'WordPress', 'WordPress', 'WordPress', 'WordPress', 'WordPress', 'WordPress',
              'Jimdo', 'Wix', 'IONOS', 'Static', 'Squarespace'];
const BAUKASTEN_SET = new Set(['Jimdo', 'Wix', 'IONOS', 'Squarespace']);

function pickCms(i) { return CMSS[i % CMSS.length]; }

function perfFor(cms, i) {
    // WordPress: 30–70 (mit Long-Tail), Baukasten: 35–65, Static: 80–95
    if (cms === 'Static') return 78 + (i % 18);
    if (BAUKASTEN_SET.has(cms)) return 32 + ((i * 7) % 35);
    return 28 + ((i * 11) % 44);
}

function makeLead(i) {
    const cms = pickCms(i);
    const isBaukasten = BAUKASTEN_SET.has(cms);
    return {
        domain: `friseur-beispiel-${String(i + 1).padStart(2, '0')}.demo`,
        websiteUri: `https://friseur-beispiel-${String(i + 1).padStart(2, '0')}.demo`,
        name: `Friseur Beispiel ${i + 1}`,
        reviews: 6 + ((i * 3) % 80),
        rating: 3.8 + ((i % 12) * 0.1),
        ws: {
            perf: perfFor(cms, i),
            seo: 55 + ((i * 9) % 40),
            a11y: 50 + ((i * 13) % 45),
            isHttps: i % 14 !== 0,
            viewport: i % 22 !== 0
        },
        cms,
        version: cms === 'WordPress' ? '6.5' : '',
        isBaukasten,
        leadScore: 30 + ((i * 17) % 60),
        conversionRate: 0.03 + ((i % 10) * 0.005),
        expectedValue: 80 + ((i * 23) % 200)
    };
}

export function buildFriseureKoelnFixture(n = 47) {
    return Array.from({ length: n }, (_, i) => makeLead(i));
}
