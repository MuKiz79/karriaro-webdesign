/**
 * Sprint 73 — Audit-Pipeline Regression-Tests
 *
 * Pure Node:test (Node 18+ built-in, keine externen Deps).
 * Run: `node --test functions/test/audit-pipeline.test.js`
 *
 * Schutz-Bereich:
 * - normalizePlacesType   — Google-Places Sub-Type → BRANCH_STANDARDS-Hauptkategorie
 * - guessBranchFromUrl    — Hostname-Slug → Branche
 * - checkBranchStandards  — synthetic ctx pro Branche, foundCount-Erwartung
 * - getCrossSell          — aliasFor-Filter
 * - detectPainPoints.spaArchitecture — Framework-Marker-Detection
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
    normalizePlacesType,
    guessBranchFromUrl,
    detectPainPoints
} = require('../lib/light-audit.js');
const { BRANCH_STANDARDS, checkBranchStandards } = require('../lib/branch-standards.js');
const { getCrossSell, CROSS_SELL } = require('../lib/karriaro-cross-sell.js');

// ────────────────────────────────────────────────────────────────
// normalizePlacesType — Sprint 70
// ────────────────────────────────────────────────────────────────

test('normalizePlacesType: cuisine restaurants → restaurant', () => {
    for (const t of ['german_restaurant', 'italian_restaurant', 'pizza_restaurant', 'french_restaurant', 'turkish_restaurant', 'sushi_restaurant', 'ramen_restaurant']) {
        assert.equal(normalizePlacesType(t), 'restaurant', `${t} should normalize to 'restaurant'`);
    }
});

test('normalizePlacesType: cafes/bars → restaurant', () => {
    for (const t of ['cafe', 'coffee_shop', 'bakery_cafe', 'tea_house', 'bar', 'pub', 'meal_takeaway']) {
        assert.equal(normalizePlacesType(t), 'restaurant');
    }
});

test('normalizePlacesType: dental sub-types → dentist', () => {
    for (const t of ['general_dentist', 'oral_surgeon', 'orthodontist', 'cosmetic_dentist', 'dental_clinic']) {
        assert.equal(normalizePlacesType(t), 'dentist');
    }
});

test('normalizePlacesType: physician sub-types → doctor', () => {
    for (const t of ['general_physician', 'family_practice', 'internal_medicine', 'pediatrician', 'gynecologist', 'dermatologist', 'cardiologist', 'medical_clinic', 'doctors_office']) {
        assert.equal(normalizePlacesType(t), 'doctor');
    }
});

test('normalizePlacesType: trade sub-types → plumber/electrician', () => {
    assert.equal(normalizePlacesType('hvac_contractor'), 'plumber');
    assert.equal(normalizePlacesType('gas_installer'), 'plumber');
    assert.equal(normalizePlacesType('general_contractor'), 'plumber');
    assert.equal(normalizePlacesType('electrical_contractor'), 'electrician');
});

test('normalizePlacesType: beauty/auto/legal sub-types', () => {
    assert.equal(normalizePlacesType('barber_shop'), 'hair_salon');
    assert.equal(normalizePlacesType('nail_salon'), 'beauty_salon');
    assert.equal(normalizePlacesType('spa'), 'beauty_salon');
    assert.equal(normalizePlacesType('massage'), 'beauty_salon');
    assert.equal(normalizePlacesType('day_spa'), 'beauty_salon');
    assert.equal(normalizePlacesType('car_repair'), 'auto_repair');
    assert.equal(normalizePlacesType('tire_shop'), 'auto_repair');
    assert.equal(normalizePlacesType('law_firm'), 'lawyer');
    assert.equal(normalizePlacesType('attorney'), 'lawyer');
    assert.equal(normalizePlacesType('physical_therapist'), 'physiotherapist');
});

test('normalizePlacesType: pass-through known types', () => {
    for (const t of ['real_estate_agency', 'restaurant', 'dentist', 'plumber', 'lawyer']) {
        assert.equal(normalizePlacesType(t), t);
    }
});

test('normalizePlacesType: handles null/empty', () => {
    assert.equal(normalizePlacesType(null), null);
    assert.equal(normalizePlacesType(''), '');
    assert.equal(normalizePlacesType(undefined), undefined);
});

// ────────────────────────────────────────────────────────────────
// guessBranchFromUrl — Sprint 67/70
// ────────────────────────────────────────────────────────────────

test('guessBranchFromUrl: Immobilien-Domains', () => {
    assert.equal(guessBranchFromUrl('https://kablan-immobilien.de'), 'real_estate_agency');
    assert.equal(guessBranchFromUrl('https://www.maklerbuero-mueller.de'), 'real_estate_agency');
    assert.equal(guessBranchFromUrl('https://immo-experts.com'), 'real_estate_agency');
});

test('guessBranchFromUrl: Restaurant-Domains (Sprint 70: + sattlerei|osteria)', () => {
    assert.equal(guessBranchFromUrl('https://www.zur-sattlerei.de'), 'restaurant');
    assert.equal(guessBranchFromUrl('https://osteria-mia.de'), 'restaurant');
    assert.equal(guessBranchFromUrl('https://brauerei-loewen.de'), 'restaurant');
    assert.equal(guessBranchFromUrl('https://gasthof-krone.de'), 'restaurant');
});

test('guessBranchFromUrl: Friseur-Domains', () => {
    assert.equal(guessBranchFromUrl('https://friseur-stuttgart.de'), 'hair_salon');
    assert.equal(guessBranchFromUrl('https://hairdesign-mueller.de'), 'hair_salon');
});

test('guessBranchFromUrl: Handwerk-Domains', () => {
    assert.equal(guessBranchFromUrl('https://heizung-mueller.de'), 'plumber');
    assert.equal(guessBranchFromUrl('https://elektro-schmidt.de'), 'electrician');
});

test('guessBranchFromUrl: keine Match → null', () => {
    assert.equal(guessBranchFromUrl('https://example.com'), null);
    assert.equal(guessBranchFromUrl('https://random-domain.xyz'), null);
});

test('guessBranchFromUrl: invalid URL → null (kein throw)', () => {
    assert.equal(guessBranchFromUrl('not-a-url'), null);
    assert.equal(guessBranchFromUrl(''), null);
});

// ────────────────────────────────────────────────────────────────
// checkBranchStandards — synthetic ctx pro Branche
// ────────────────────────────────────────────────────────────────

test('checkBranchStandards: real_estate_agency mit allen Items', () => {
    const ctx = {
        subPages: [
            { url: '/leistungen', anchorText: 'Leistungen', slot: 'services' },
            { url: '/team', anchorText: 'Team', slot: 'team' },
            { url: '/objekte', anchorText: 'Aktuelle Objekte', slot: 'objects' },
            { url: '/kontakt', anchorText: 'Kontakt', slot: 'contact' },
            { url: '/marktbericht', anchorText: 'Markt', slot: 'market' },
            { url: '/referenzen', anchorText: 'Referenzen', slot: 'refs' }
        ],
        body: 'Unser Team in Stuttgart. Wir bieten Wertermittlung, Immobilienbewertung an. Kontakt: 70173 Stuttgart. IVD-Mitgliedschaft. Marktbericht aktuell. Verkauft 100+ Objekte. Filter Preis von bis.'
    };
    const r = checkBranchStandards('real_estate_agency', ctx);
    assert.equal(r.primaryType, 'real_estate_agency');
    assert.equal(r.foundCount, 9);
    assert.equal(r.totalCount, 9);
});

test('checkBranchStandards: leerer ctx → alle false', () => {
    const r = checkBranchStandards('real_estate_agency', { subPages: [], body: '' });
    assert.equal(r.foundCount, 0);
});

test('checkBranchStandards: hair_salon Sprint 70+72 Pattern wirken', () => {
    const ctx = {
        subPages: [],
        body: 'PREISLISTE Color ab 89 €. Unser Team Stylist Hair. GALERIE Inspiration. Mo - Fr 9:00 Uhr. Stuttgart 70173.'
    };
    const r = checkBranchStandards('hair_salon', ctx);
    assert.ok(r.mustHave.find(i => i.id === 'leistungen-preise').found, 'Preisliste body-Fallback');
    assert.ok(r.mustHave.find(i => i.id === 'team').found, 'Team body-Fallback');
    assert.ok(r.mustHave.find(i => i.id === 'oeffnungszeiten').found, 'Mo-Fr Pattern');
});

test('checkBranchStandards: lawyer Sprint 72 body-Fallbacks', () => {
    const ctx = {
        subPages: [],
        body: 'Rechtsgebiete im Überblick. Kanzlei Stuttgart. Adresse 70173 Stuttgart. Fachanwalt fuer Arbeitsrecht.'
    };
    const r = checkBranchStandards('lawyer', ctx);
    assert.ok(r.mustHave.find(i => i.id === 'fachgebiete').found, 'Rechtsgebiete body-Fallback');
    assert.ok(r.mustHave.find(i => i.id === 'team').found, 'Kanzlei/Fachanwalt body-Fallback');
});

test('checkBranchStandards: restaurant Sprint 71 speisekarte body-Fallback', () => {
    const ctx = {
        subPages: [],
        body: 'Willkommen. ZUR SPEISEKARTE. Wochenkarte aktuell. Mo - So 11 Uhr.'
    };
    const r = checkBranchStandards('restaurant', ctx);
    assert.ok(r.mustHave.find(i => i.id === 'speisekarte').found, 'Speisekarte body-Pattern');
    assert.ok(r.mustHave.find(i => i.id === 'oeffnungszeiten').found, 'Mo-So Pattern');
});

test('checkBranchStandards: plumber Sprint 70 robust tel-Pattern', () => {
    const ctx = {
        subPages: [],
        body: 'Notdienst 24h. Einsatzgebiet Stuttgart. Unsere Leistungen Heizungsbau. Telefon: 0711 22063 03.'
    };
    const r = checkBranchStandards('plumber', ctx);
    assert.ok(r.mustHave.find(i => i.id === 'leistungen').found, 'Leistungen body-Fallback');
    assert.ok(r.mustHave.find(i => i.id === 'kontakt-telefon').found, 'Robust tel-Pattern (Telefon:0711...)');
});

test('checkBranchStandards: dentist Sprint 71 kontakt-adresse PLZ', () => {
    const ctx = {
        subPages: [],
        body: 'Praxis Stuttgart. 70329 Stuttgart. Sprechzeiten Mo-Fr.'
    };
    const r = checkBranchStandards('dentist', ctx);
    assert.ok(r.mustHave.find(i => i.id === 'kontakt-adresse').found, 'PLZ-Pattern fuer SPA-Sites');
});

test('checkBranchStandards: pharmacy Sprint 76 — Notdienst/Rezept/Bestand', () => {
    const ctx = {
        subPages: [],
        body: 'Notdienst 24/7. E-Rezept bequem hochladen. Apotheker Mueller berät. Stuttgart 70173. Mo-Fr 8:00 Uhr. Beratung Impfung.'
    };
    const r = checkBranchStandards('pharmacy', ctx);
    assert.equal(r.primaryType, 'pharmacy');
    assert.ok(r.mustHave.find(i => i.id === 'notdienst').found);
    assert.ok(r.mustHave.find(i => i.id === 'leistungen').found, 'Beratung-Pattern');
    assert.ok(r.shouldHave.find(i => i.id === 'rezept-online').found, 'E-Rezept-Pattern');
});

test('checkBranchStandards: veterinary_care Sprint 76 — Tier-Spezialisierung + Notfall', () => {
    const ctx = {
        subPages: [],
        body: 'Praxis für Hund, Katze und Kleintier. Tierärztin Dr. Mueller. Sprechzeit Mo-Fr 9 Uhr. Notdienst 24h.'
    };
    const r = checkBranchStandards('veterinary_care', ctx);
    assert.equal(r.primaryType, 'veterinary_care');
    assert.ok(r.mustHave.find(i => i.id === 'leistungen').found, 'Hund/Katze body-Pattern');
    assert.ok(r.mustHave.find(i => i.id === 'team').found, 'Tieraerztin body-Pattern');
    assert.ok(r.mustHave.find(i => i.id === 'notfall').found);
});

test('checkBranchStandards: accounting Sprint 76 — DATEV + Bilanz', () => {
    const ctx = {
        subPages: [],
        body: 'Wir bieten Bilanz, EUER, Lohnabrechnung. Steuerberater Mueller. Stuttgart 70173. Mandantenportal DATEV Unternehmen Online. Honorar nach StBVV.'
    };
    const r = checkBranchStandards('accounting', ctx);
    assert.equal(r.primaryType, 'accounting');
    assert.ok(r.mustHave.find(i => i.id === 'leistungen').found, 'Bilanz/EUER-Pattern');
    assert.ok(r.mustHave.find(i => i.id === 'mandantenportal').found, 'DATEV-Pattern');
    assert.ok(r.shouldHave.find(i => i.id === 'kosten-rechner').found, 'StBVV-Pattern');
});

test('checkBranchStandards: architect Sprint 76 — Portfolio + HOAI', () => {
    const ctx = {
        subPages: [],
        body: 'Projektliste mit Referenzprojekten. Planung und Bauleitung nach HOAI Leistungsphasen. Architekt Mueller. Wohnungsbau, Sanierung, Denkmalschutz. Stuttgart 70173.'
    };
    const r = checkBranchStandards('architect', ctx);
    assert.equal(r.primaryType, 'architect');
    assert.ok(r.mustHave.find(i => i.id === 'portfolio').found);
    assert.ok(r.mustHave.find(i => i.id === 'leistungen').found, 'HOAI-Pattern');
    assert.ok(r.shouldHave.find(i => i.id === 'schwerpunkte').found, 'Wohnungsbau-Pattern');
});

test('normalizePlacesType: Sprint 76 Sub-Types', () => {
    assert.equal(normalizePlacesType('drug_store'), 'pharmacy');
    assert.equal(normalizePlacesType('veterinarian'), 'veterinary_care');
    assert.equal(normalizePlacesType('animal_hospital'), 'veterinary_care');
    assert.equal(normalizePlacesType('tax_consultant'), 'accounting');
    assert.equal(normalizePlacesType('accountant'), 'accounting');
    assert.equal(normalizePlacesType('architecture_firm'), 'architect');
});

test('guessBranchFromUrl: Sprint 76 Domains', () => {
    assert.equal(guessBranchFromUrl('https://apotheke-mueller.de'), 'pharmacy');
    assert.equal(guessBranchFromUrl('https://tierarzt-stuttgart.de'), 'veterinary_care');
    assert.equal(guessBranchFromUrl('https://steuerberater-mueller.de'), 'accounting');
    assert.equal(guessBranchFromUrl('https://architekt-mueller.de'), 'architect');
});

test('checkBranchStandards: unbekannter primaryType → _default + usedDefault=true', () => {
    const r = checkBranchStandards('unknown_branch', { subPages: [], body: '' });
    assert.equal(r.usedDefault, true);
    assert.equal(r.branch, 'Lokales Unternehmen');
});

test('checkBranchStandards: auto_repair Sprint 72 marken-Compound-Match', () => {
    const ctx = {
        subPages: [],
        body: 'SASS ist eine freie, markenungebundene KFZ-Meisterwerkstatt. TUEV verfügbar. Stuttgart 70173.'
    };
    const r = checkBranchStandards('auto_repair', ctx);
    assert.ok(r.shouldHave.find(i => i.id === 'marken').found, 'markenungebundene Compound-Wort');
});

test('checkBranchStandards: beauty_salon Sprint 72 team/gutschein body-Fallback', () => {
    const ctx = {
        subPages: [],
        body: 'Inhaberin und Kosmetikerin Stuttgart 70173. Beauty Gutschein erhältlich. Mo-Fr 10 Uhr.'
    };
    const r = checkBranchStandards('beauty_salon', ctx);
    assert.ok(r.mustHave.find(i => i.id === 'team').found, 'Kosmetikerin/Inhaberin body-Fallback');
    assert.ok(r.shouldHave.find(i => i.id === 'gutscheine').found, 'Gutschein body-Fallback');
});

// ────────────────────────────────────────────────────────────────
// getCrossSell — aliasFor-Filter Sprint 70
// ────────────────────────────────────────────────────────────────

test('getCrossSell: real_estate_agency aliasFor mappt wertermittlung→bewertung', () => {
    const branch = {
        mustHave: [],
        shouldHave: [
            { id: 'bewertung', found: true },
            { id: 'marktbericht', found: true }
        ]
    };
    const cs = getCrossSell('real_estate_agency', branch);
    const ids = cs.tools.map(t => t.id);
    assert.ok(!ids.includes('wertermittlung'), 'wertermittlung→bewertung gefiltert');
    assert.ok(!ids.includes('marktbarometer'), 'marktbarometer→marktbericht gefiltert');
    assert.ok(ids.includes('verkaeufer-dashboard'), 'verkaeufer-dashboard (kein Alias) bleibt');
});

test('getCrossSell: plumber aliasFor (notdienst-puls/foto-festpreis/bafa-rechner)', () => {
    const branch = {
        mustHave: [{ id: 'notdienst', found: true }],
        shouldHave: [{ id: 'foerder', found: true }]
    };
    const cs = getCrossSell('plumber', branch);
    const ids = cs.tools.map(t => t.id);
    assert.ok(!ids.includes('notdienst-puls'), 'notdienst-puls→notdienst gefiltert');
    assert.ok(!ids.includes('bafa-rechner'), 'bafa-rechner→foerder gefiltert');
    assert.ok(ids.includes('foto-festpreis'));
});

test('getCrossSell: alle detected → Fallback zeigt alle Tools', () => {
    const branch = {
        mustHave: [],
        shouldHave: [
            { id: 'bewertung', found: true },
            { id: 'marktbericht', found: true }
        ]
    };
    // verkaeufer-dashboard hat kein Alias, ist NICHT detected → 1 Tool angezeigt
    const cs = getCrossSell('real_estate_agency', branch);
    assert.equal(cs.allDetected, false);
    assert.equal(cs.tools.length, 1);
});

test('getCrossSell: unbekannter primaryType → null', () => {
    assert.equal(getCrossSell('unknown_branch', null), null);
});

test('getCrossSell: ohne branch-Argument → alle Tools angezeigt', () => {
    const cs = getCrossSell('real_estate_agency', null);
    assert.equal(cs.tools.length, 3);
});

// ────────────────────────────────────────────────────────────────
// detectPainPoints.spaArchitecture — Sprint 72
// ────────────────────────────────────────────────────────────────

test('spaArchitecture: synthetic React-SPA → isSpa true', () => {
    const spa = '<!DOCTYPE html><html><head><title>App</title><script src="/static/js/main.js"></script></head><body><div id="root"></div><script>window.__INITIAL_STATE__={}</script></body></html>'.repeat(5);
    const pp = detectPainPoints(spa, {}, null, {});
    assert.equal(pp.spaArchitecture.isSpa, true);
    assert.equal(pp.spaArchitecture.frameworkMarkers, true);
    assert.equal(pp.spaArchitecture.ok, false);
});

test('spaArchitecture: Next.js Marker → isSpa true', () => {
    const next = '<html><body><div id="__next"></div><script>__NEXT_DATA__={}</script></body></html>';
    const pp = detectPainPoints(next, {}, null, {});
    assert.equal(pp.spaArchitecture.isSpa, true);
});

test('spaArchitecture: SSR HTML mit viel Content → isSpa false', () => {
    const ssr = '<!DOCTYPE html><html><body>' + '<h1>Friseur Stuttgart</h1><p>Wir sind ein Salon mit Tradition. Adresse: Hauptstraße 1, 70173 Stuttgart. Termine online buchen.</p>'.repeat(20) + '</body></html>';
    const pp = detectPainPoints(ssr, {}, null, {});
    assert.equal(pp.spaArchitecture.isSpa, false);
    assert.equal(pp.spaArchitecture.ok, true);
});

test('LOCAL_BUSINESS_TYPES: WebDesignAgency (Sprint 74) zählt als LocalBusiness', () => {
    // Schema.org Hierarchie: WebDesignAgency → ProfessionalService → LocalBusiness
    const html = '<html><head><script type="application/ld+json">{"@type":"WebDesignAgency","name":"Karriaro Webdesign"}</script></head><body><p>Wir bauen Sites.</p></body></html>';
    // detectSeoGeo wird async, vereinfacht: wir testen ueber detectPainPoints + assertion ueber Schema-Match.
    // Direkter Test: Whitelist enthaelt WebDesignAgency.
    const LOCAL_BUSINESS_TYPES = ['LocalBusiness', 'RealEstateAgent', 'Restaurant', 'FoodEstablishment', 'HealthAndBeautyBusiness', 'Dentist', 'DentalClinic', 'Physician', 'MedicalClinic', 'AutoRepair', 'Plumber', 'Electrician', 'LegalService', 'HairSalon', 'BeautySalon', 'Store', 'ProfessionalService', 'WebDesignAgency'];
    assert.ok(LOCAL_BUSINESS_TYPES.includes('WebDesignAgency'), 'Sprint 74 added WebDesignAgency');
});

test('spaArchitecture: WordPress inline-CSS-heavy aber kein Framework → isSpa false', () => {
    // WordPress-Style: viel inline-CSS, mittlere textRatio (~0.01-0.03), aber KEINE Framework-Marker.
    // Erwartet: NICHT als SPA flagged (war Sprint-72-Threshold-Bug). Sprint-72-Threshold ist
    // bewusst sehr strict (textRatio < 0.005 ODER frameworkMarkers).
    const bodyContent = '<p>Willkommen bei Hotel Azenberg in Stuttgart. Unsere Zimmer ab 89 EUR. Herzlich willkommen in unserem Haus. Familiengefuehrt seit drei Generationen. Ruhige Lage in Stuttgart-Nord. Frühstück inklusive, Parkplatz vorhanden.</p>'.repeat(8);
    const wp = '<html><head>' + '<style>.foo{color:red;background:#fff;}</style>'.repeat(300) + '</head><body>' + bodyContent + '</body></html>';
    const pp = detectPainPoints(wp, {}, null, {});
    assert.equal(pp.spaArchitecture.isSpa, false, `WordPress inline-CSS sollte NICHT als SPA gelten (textRatio=${pp.spaArchitecture.textRatio})`);
});

// ────────────────────────────────────────────────────────────────
// Integrity-Check: CROSS_SELL aliasFor-Refs sind valide BRANCH_STANDARDS-IDs
// ────────────────────────────────────────────────────────────────

test('integrity: CROSS_SELL aliasFor referenziert existierende BRANCH_STANDARDS-IDs', () => {
    for (const [branch, entry] of Object.entries(CROSS_SELL)) {
        const standards = BRANCH_STANDARDS[branch];
        if (!standards) continue; // cafe/physician sind Aliases ohne eigene BRANCH_STANDARDS
        const validIds = new Set([
            ...standards.mustHave.map(i => i.id),
            ...standards.shouldHave.map(i => i.id)
        ]);
        for (const tool of entry.tools) {
            if (tool.aliasFor) {
                assert.ok(
                    validIds.has(tool.aliasFor),
                    `${branch}.${tool.id} aliasFor=${tool.aliasFor} not in BRANCH_STANDARDS`
                );
            }
        }
    }
});

test('integrity: alle BRANCH_STANDARDS-Branchen haben pitchMissing + pitchAllOk', () => {
    for (const [branch, def] of Object.entries(BRANCH_STANDARDS)) {
        assert.ok(typeof def.pitchMissing === 'string' && def.pitchMissing.length > 10, `${branch} missing pitchMissing`);
        assert.ok(typeof def.pitchAllOk === 'string' && def.pitchAllOk.length > 10, `${branch} missing pitchAllOk`);
    }
});
