/**
 * Sprint 240 — Tests für die evidenzbasierte KI-Sichtbarkeits-Logik.
 *
 * Sichert die drei Eigenschaften ab, die vorher fehlten:
 *  1. Reproduzierbarkeit — gleiche Signale + knowledgeLevel ⇒ gleicher Score (vorher 65 vs 25).
 *  2. Konsistenz mit den Chips — alle Signale grün ⇒ kein vernichtender Score.
 *  3. Keine widersprüchlichen Lücken — gaps/fixes über ein grünes Signal werden entfernt.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { kiVisScore, kiVisParts, kiVisLabel, reconcileKiVis } = require('../lib/ki-visibility.js');

const ALL_GREEN = {
    reachable: true,
    hasSchema: true,
    hasLocalBusinessSchema: true,
    hasMetaDescription: true,
    hasFaqSchema: true,
};

// ── kiVisScore: Reproduzierbarkeit & Verankerung ──────────────────────────────

test('kiVisScore: deterministisch — gleiche Eingabe liefert immer denselben Score', () => {
    const a = kiVisScore(ALL_GREEN, 'vage');
    const b = kiVisScore(ALL_GREEN, 'vage');
    assert.equal(a, b);
    assert.equal(a, 52 + 24); // Technik voll (52) + vage (24) = 76
});

test('kiVisScore: alle Signale grün ⇒ kein vernichtender Score (Karriaro-Fall)', () => {
    assert.equal(kiVisScore(ALL_GREEN, 'vage'), 76);
    assert.ok(kiVisScore(ALL_GREEN, 'vage') >= 70, 'Grade-A-Seite darf nicht als „unsichtbar" gelten');
});

test('kiVisScore: schwache Seite ohne Signale + keine KI-Kenntnis ⇒ niedriger Score (Hook bleibt)', () => {
    const bare = { reachable: true, hasSchema: false, hasLocalBusinessSchema: false, hasMetaDescription: true, hasFaqSchema: false };
    assert.equal(kiVisScore(bare, 'keine'), 8 + 10); // Technik nur Meta (8) + keine-Sockel (10) = 18
});

test('kiVisScore: alle Signale grün bleiben über keine/vage im selben Label-Band (kein Sprung)', () => {
    assert.equal(kiVisScore(ALL_GREEN, 'keine'), 52 + 10); // 62 → „Solide Basis"
    assert.equal(kiVisScore(ALL_GREEN, 'vage'), 52 + 24);  // 76 → „Solide Basis"
    assert.equal(kiVisLabel(kiVisScore(ALL_GREEN, 'keine')), kiVisLabel(kiVisScore(ALL_GREEN, 'vage')));
});

test('kiVisScore: jedes technische Signal trägt seinen Punktwert bei', () => {
    const base = { reachable: true, hasSchema: false, hasLocalBusinessSchema: false, hasMetaDescription: false, hasFaqSchema: false };
    assert.equal(kiVisScore(base, 'keine'), 10); // nur Wissens-Sockel
    assert.equal(kiVisScore({ ...base, hasFaqSchema: true }, 'keine'), 10 + 18);
    assert.equal(kiVisScore({ ...base, hasSchema: true }, 'keine'), 10 + 12);
});

test('kiVisScore: nicht erreichbar / keine Domain ⇒ null (LLM-Score bleibt)', () => {
    assert.equal(kiVisScore({ reachable: null }, 'vage'), null);
    assert.equal(kiVisScore({ reachable: false, hasSchema: false }, 'keine'), null);
});

test('kiVisScore: niemals außerhalb 0–100', () => {
    const s = kiVisScore(ALL_GREEN, 'solide'); // 52 + 48 = 100
    assert.equal(s, 100);
    assert.ok(s <= 100 && s >= 0);
});

// ── kiVisLabel: konsistent mit dem Score-Band ─────────────────────────────────

test('kiVisLabel: Bänder', () => {
    assert.equal(kiVisLabel(100), 'Technisch stark — KI-Basis gelegt');
    assert.equal(kiVisLabel(76), 'Solide Basis — KI-Training noch dünn');
    assert.equal(kiVisLabel(45), 'Grundlage da — KI-Ausbau nötig');
    assert.equal(kiVisLabel(12), 'Für KI noch kaum sichtbar');
});

// ── reconcileKiVis: keine Lücke/Fix, die ein grünes Signal widerlegt ──────────

test('reconcileKiVis: streicht „fehlende FAQ"-Lücke, wenn FAQPage vorhanden ist', () => {
    const result = {
        gaps: [
            { gap: 'Fehlende FAQ-strukturierte Daten', why: 'KI kann häufige Fragen nicht extrahieren' },
            { gap: 'Fehlendes KI-Trainingswissen', why: 'Lokaler Anbieter, kaum in Trainingsdaten' },
        ],
        fixes: [
            { fix: 'FAQ-Schema ergänzen für typische Fragen', impact: 'KI liefert direkte Antworten' },
            { fix: 'llms.txt optimieren mit Leistungen & Standort', impact: 'bessere KI-Antworten' },
        ],
    };
    reconcileKiVis(result, ALL_GREEN);
    assert.equal(result.gaps.length, 1);
    assert.equal(result.gaps[0].gap, 'Fehlendes KI-Trainingswissen');
    // „FAQ-Schema ergänzen" fliegt raus (FAQ vorhanden + Ergänz-Verb); „llms.txt optimieren"
    // fliegt seit Sprint 247 EBENFALLS raus (Doktrin: llms.txt nie empfehlen).
    assert.equal(result.fixes.length, 0);
});

test('reconcileKiVis: streicht verb-losen FAQ-Fix („FAQ-Schema für typische Fragen"), wenn FAQ vorhanden', () => {
    const result = {
        gaps: [],
        fixes: [{ fix: "FAQ-Schema für typische Webdesign-Fragen: 'Was kostet eine Website?'", impact: 'KI liefert direkte Antworten' }],
    };
    reconcileKiVis(result, ALL_GREEN);
    assert.equal(result.fixes.length, 0);
});

test('reconcileKiVis: streicht „Schema-Qualität unbekannt"-Hedge, wenn Schema vorhanden', () => {
    const result = {
        gaps: [{ gap: 'Unbekannte Schema-Qualität', why: 'Schema vorhanden, aber Qualität unklar' }],
        fixes: [],
    };
    reconcileKiVis(result, ALL_GREEN);
    assert.equal(result.gaps.length, 0);
});

test('reconcileKiVis: behält Lücke für ein ROTES Signal', () => {
    const noMeta = { ...ALL_GREEN, hasMetaDescription: false };
    const result = {
        gaps: [{ gap: 'Keine Meta-Description', why: 'KI-Suchen fehlt die kompakte Kurzbeschreibung' }],
        fixes: [{ fix: 'Meta-Description ergänzen', impact: 'bessere Snippets in KI-Antworten' }],
    };
    reconcileKiVis(result, noMeta);
    assert.equal(result.gaps.length, 1);
    assert.equal(result.fixes.length, 1);
});

test('reconcileKiVis: llms.txt fliegt IMMER raus — als gap wie als fix (Sprint 247, Doktrin)', () => {
    // Die FAQ derselben Seite + der GEO-Score stufen llms.txt als wirkungslos ein — der Spiegel
    // darf sie weder als Mangel anklagen noch ihre Erstellung empfehlen (Selbstwiderspruch).
    const result = {
        gaps: [{ gap: 'Keine llms.txt-Datei', why: 'KI-Modelle können keine strukturierten Infos abrufen' }],
        fixes: [{ fix: 'llms.txt erstellen mit Kernleistungen und Standort', impact: 'präzisere KI-Antworten' }],
    };
    reconcileKiVis(result, ALL_GREEN);
    assert.equal(result.gaps.length, 0);
    assert.equal(result.fixes.length, 0);
});

test('kiVisParts: Aufschlüsselung konsistent zum Score; null wenn unerreichbar', () => {
    const p = kiVisParts(ALL_GREEN, 'keine');
    assert.deepEqual(p, { tech: 52, techMax: 52, know: 10, knowMax: 48, localApplies: true });
    assert.equal(p.tech + p.know, kiVisScore(ALL_GREEN, 'keine'));
    assert.equal(kiVisParts({ reachable: false }, 'vage'), null);
});

test('reconcileKiVis: robust gegen fehlende Felder', () => {
    const result = {};
    assert.doesNotThrow(() => reconcileKiVis(result, ALL_GREEN));
    assert.doesNotThrow(() => reconcileKiVis(null, ALL_GREEN));
    assert.doesNotThrow(() => reconcileKiVis({ gaps: [] }, null));
});

// ── Sprint 250: Unternehmenstyp (scope) — LocalBusiness nur für lokale Betriebe ──

test('kiVisScore: scope default = local (unverändert), LocalBusiness zählt', () => {
    assert.equal(kiVisScore(ALL_GREEN, 'vage'), 76);          // ohne scope
    assert.equal(kiVisScore(ALL_GREEN, 'vage', 'local'), 76); // explizit local
});

test('kiVisScore: Hersteller/global — fehlendes LocalBusiness ist KEIN Mangel (Hansgrohe-Fall)', () => {
    // Schema✓ + Meta✓, LocalBusiness✗ + FAQ✗. local würde 12+8=20 geben; global gewichtet ohne Local: 18+12=30.
    const hg = { reachable: true, hasSchema: true, hasLocalBusinessSchema: false, hasMetaDescription: true, hasFaqSchema: false };
    assert.equal(kiVisScore(hg, 'solide', 'local'), 20 + 48);   // altes Raster: 68
    assert.equal(kiVisScore(hg, 'solide', 'global'), 30 + 48);  // neues Raster: 78 (LocalBusiness entfällt)
    assert.ok(kiVisScore(hg, 'solide', 'global') > kiVisScore(hg, 'solide', 'local'));
});

test('kiVisScore: nicht-lokal max bleibt 52 (alle universellen Signale grün)', () => {
    const allUniversal = { reachable: true, hasSchema: true, hasLocalBusinessSchema: false, hasMetaDescription: true, hasFaqSchema: true };
    assert.equal(kiVisScore(allUniversal, 'keine', 'national'), 52 + 10); // 18+12+22 = 52
});

test('kiVisParts: localApplies = false bei nicht-lokalem Scope', () => {
    const p = kiVisParts(ALL_GREEN, 'solide', 'global');
    assert.equal(p.localApplies, false);
    assert.equal(p.techMax, 52);
    assert.equal(kiVisParts(ALL_GREEN, 'solide', 'local').localApplies, true);
});

test('reconcileKiVis: nicht-lokal streicht LocalBusiness-/lokale-Sichtbarkeit-Befunde', () => {
    const result = {
        gaps: [
            { gap: 'Lokale Sichtbarkeit begrenzt', why: 'fehlen strukturierte lokale Signale für standortbezogene Anfragen' },
            { gap: 'Kein Trainingswissen', why: 'unklar' },
        ],
        fixes: [
            { fix: 'LocalBusiness-Schema ergänzen', impact: 'lokale Treffer' },
            { fix: 'Google-Unternehmensprofil pflegen', impact: 'lokale Sichtbarkeit' },
            { fix: 'Organization-Schema konsolidieren', impact: 'klare Entität' },
        ],
    };
    const sig = { reachable: true, hasSchema: true, hasLocalBusinessSchema: false, hasMetaDescription: true, hasFaqSchema: false };
    reconcileKiVis(result, sig, 'global');
    assert.equal(result.gaps.length, 1);
    assert.equal(result.gaps[0].gap, 'Kein Trainingswissen');
    // LocalBusiness- + Google-Profil-Fix raus; Organization-Fix bleibt (legitimer Hebel für Hersteller).
    assert.equal(result.fixes.length, 1);
    assert.match(result.fixes[0].fix, /Organization/);
});

test('reconcileKiVis: lokaler Scope BEHÄLT den LocalBusiness-Mangel', () => {
    const result = { gaps: [{ gap: 'Lokale Sichtbarkeit begrenzt', why: 'kein LocalBusiness-Schema' }], fixes: [] };
    const sig = { reachable: true, hasSchema: true, hasLocalBusinessSchema: false, hasMetaDescription: true, hasFaqSchema: false };
    reconcileKiVis(result, sig, 'local');
    assert.equal(result.gaps.length, 1); // für einen lokalen Betrieb ist das ein echter Mangel
});

// ── Sprint 250: Bot-Wall — blockierte Seite ist „ungeprüft", nicht „mangelhaft" ──

test('kiVisScore/kiVisParts: blocked ⇒ null (kein Technik-Score)', () => {
    const blocked = { reachable: false, blocked: 'challenge', hasSchema: null, hasLocalBusinessSchema: null, hasMetaDescription: null, hasFaqSchema: null };
    assert.equal(kiVisScore(blocked, 'solide', 'global'), null);
    assert.equal(kiVisParts(blocked, 'solide', 'global'), null);
    // Selbst wenn reachable fälschlich true wäre, verhindert blocked den Score:
    assert.equal(kiVisScore({ reachable: true, blocked: 'http-403', hasSchema: true }, 'solide'), null);
});

test('reconcileKiVis: blocked streicht technische Mängel (Signale ungeprüft)', () => {
    const result = {
        gaps: [
            { gap: 'Kein Schema vorhanden', why: 'KI kann nichts extrahieren' },
            { gap: 'Geringe Markenbekanntheit', why: 'wenig Off-Site-Erwähnungen' },
        ],
        fixes: [{ fix: 'Meta-Description ergänzen', impact: 'bessere Snippets' }],
    };
    const sig = { reachable: false, blocked: 'challenge' };
    reconcileKiVis(result, sig, 'global');
    assert.equal(result.gaps.length, 1);
    assert.match(result.gaps[0].gap, /Markenbekanntheit/);
    assert.equal(result.fixes.length, 0); // technischer Fix gestrichen (ungeprüft)
});
