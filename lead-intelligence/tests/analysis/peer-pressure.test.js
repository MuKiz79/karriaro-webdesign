import { describe, it, expect } from 'vitest';
import { computePeerPressure, MIN_PEERS, MAX_PEER_MULT } from '../../src/analysis/peer-pressure.js';

const lead = (domain, branchKey, ws) => ({ domain, branch: { key: branchKey }, ws, badnessScore: 40 });

/** N gesunde Vergleichsbetriebe derselben Branche. */
function peers(branchKey, n, ws = { perf: 80, viewport: true, isHttps: true }) {
    return Array.from({ length: n }, (_, i) => lead(`peer${i}.de`, branchKey, { ...ws }));
}

describe('computePeerPressure', () => {
    it('wertet einen deutlich langsameren Betrieb auf', () => {
        const leads = [...peers('dentist', 6), lead('lahm.de', 'dentist', { perf: 40, viewport: true, isHttps: true })];
        const r = computePeerPressure(leads).get('lahm.de');
        expect(r.mult).toBeGreaterThan(1);
        expect(r.behindOn).toContain('Ladezeit');
        expect(r.pitch).toMatch(/Tempo 40/);
    });

    it('schweigt bei zu wenigen Vergleichsbetrieben', () => {
        // Aus drei Datenpunkten wird kein Urteil über einen Markt abgeleitet.
        const leads = [...peers('dentist', MIN_PEERS - 2), lead('lahm.de', 'dentist', { perf: 20, viewport: true, isHttps: true })];
        const r = computePeerPressure(leads).get('lahm.de');
        expect(r.mult).toBe(1.0);
        expect(r.chip).toBeNull();
    });

    it('wertet NICHT auf, wenn die ganze Branche gleich schwach ist', () => {
        // Kernfall: schlechte Seite unter lauter schlechten Seiten erzeugt keinen
        // Handlungsdruck — der Inhaber sieht bei der Konkurrenz dasselbe Bild.
        const leads = [...peers('dentist', 6, { perf: 42, viewport: true, isHttps: true }),
                       lead('auch-lahm.de', 'dentist', { perf: 40, viewport: true, isHttps: true })];
        const r = computePeerPressure(leads).get('auch-lahm.de');
        expect(r.mult).toBe(1.0);
    });

    it('erkennt fehlende Mobiloptimierung, wenn die Branche mobil ist', () => {
        const leads = [...peers('lawyer', 8), lead('desktop.de', 'lawyer', { perf: 80, viewport: false, isHttps: true })];
        const r = computePeerPressure(leads).get('desktop.de');
        expect(r.behindOn).toContain('Mobilnutzung');
        expect(r.pitch).toMatch(/Smartphone/);
    });

    it('erkennt fehlendes SSL, wenn die Branche verschlüsselt', () => {
        const leads = [...peers('lawyer', 8), lead('unsicher.de', 'lawyer', { perf: 80, viewport: true, isHttps: false })];
        const r = computePeerPressure(leads).get('unsicher.de');
        expect(r.behindOn).toContain('Verschlüsselung');
    });

    it('deckelt den Aufschlag bei mehreren Rückständen', () => {
        const leads = [...peers('lawyer', 8), lead('alles.de', 'lawyer', { perf: 30, viewport: false, isHttps: false })];
        const r = computePeerPressure(leads).get('alles.de');
        expect(r.behindOn.length).toBeGreaterThanOrEqual(2);
        expect(r.mult).toBe(MAX_PEER_MULT);       // nie über den Deckel
    });

    it('vergleicht ausschließlich innerhalb derselben Branche', () => {
        // Ein Umzugsunternehmen konkurriert nicht mit Zahnärzten um Sichtbarkeit.
        const leads = [...peers('dentist', 8), lead('umzug.de', 'moving_company', { perf: 30, viewport: false, isHttps: false })];
        const r = computePeerPressure(leads).get('umzug.de');
        expect(r.mult).toBe(1.0);                 // eigene Branche hat zu wenige Peers
    });

    it('gibt es KEINEN Abschlag — nur Aufschlag oder neutral', () => {
        const leads = [...peers('dentist', 8), lead('gut.de', 'dentist', { perf: 95, viewport: true, isHttps: true })];
        for (const [, v] of computePeerPressure(leads)) {
            expect(v.mult).toBeGreaterThanOrEqual(1.0);
        }
    });

    it('mutiert die Eingabe nicht', () => {
        const leads = [...peers('dentist', 6), lead('lahm.de', 'dentist', { perf: 40, viewport: true, isHttps: true })];
        const kopie = JSON.parse(JSON.stringify(leads));
        computePeerPressure(leads);
        expect(JSON.parse(JSON.stringify(leads))).toEqual(kopie);
    });

    it('leere oder kaputte Eingabe ergibt eine leere Map statt Absturz', () => {
        expect(computePeerPressure([]).size).toBe(0);
        expect(computePeerPressure(null).size).toBe(0);
        expect(computePeerPressure([{ domain: null }, {}]).size).toBe(0);
    });
});
