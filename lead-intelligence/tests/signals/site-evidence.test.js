import { describe, it, expect } from 'vitest';
// Pure CJS-Lib aus dem Functions-Repo — bewusst direkt importiert, damit die
// Tests genau den Code prüfen, der serverseitig läuft (kein Re-Implement).
import pkg from '../../../functions/lib/site-evidence.js';
const { scanPaidTools, scanCareSignals, scanContactPaths, PAID_TOOLS } = pkg;

describe('scanPaidTools — Budget-Beweis ohne Anzeigen', () => {
    it('erkennt Doctolib im Buchungs-Widget', () => {
        const r = scanPaidTools('<a href="https://www.doctolib.de/praxis/koeln/dr-mueller">Termin online</a>');
        expect(r.keys).toContain('doctolib');
        expect(r.count).toBe(1);
    });

    it('erkennt einen WhatsApp-LINK — genau das, was die PSI-Variante nie konnte', () => {
        // messaging-check.js prüfte href="…wa.me…" gegen eine Liste von
        // Netzwerk-URLs. Ein Link ist kein Request → konnte strukturell nie matchen.
        const r = scanPaidTools('<a href="https://wa.me/4915112345678">Schreiben Sie uns</a>');
        expect(r.keys).toContain('whatsapp');
    });

    it('zählt mehrere Werkzeuge einzeln', () => {
        const html = `<script src="https://cdn.shopify.com/x.js"></script>
                      <a href="https://calendly.com/team">Termin</a>`;
        const r = scanPaidTools(html);
        expect(r.count).toBe(2);
        expect(r.keys.sort()).toEqual(['calendly', 'shopify']);
    });

    it('wertet eine nackte Seite nicht als Werkzeug-Nutzung', () => {
        const r = scanPaidTools('<html><body><h1>Zahnarztpraxis</h1></body></html>');
        expect(r.count).toBe(0);
        expect(r.found).toEqual([]);
    });

    it('ist robust gegen leeres/fehlendes HTML', () => {
        expect(scanPaidTools('').count).toBe(0);
        expect(scanPaidTools(null).count).toBe(0);
        expect(scanPaidTools(undefined).count).toBe(0);
    });

    it('jedes Werkzeug trägt einen Beleg-Text (kein nacktes Flag)', () => {
        for (const t of PAID_TOOLS) {
            expect(t.name, `${t.key} braucht einen Namen`).toBeTruthy();
            expect(t.hint, `${t.key} braucht einen Beleg-Hinweis`).toBeTruthy();
        }
    });

    it('ein bloßer Instagram-Link zählt NICHT — kostenlos beweist kein Budget', () => {
        const r = scanPaidTools('<a href="https://instagram.com/praxis">Instagram</a>');
        expect(r.count).toBe(0);
    });
});

describe('scanCareSignals — „kümmert sich" statt „hat aufgegeben"', () => {
    const YEAR = 2026;

    it('erkennt ein aktuelles Copyright-Jahr', () => {
        const r = scanCareSignals('<footer>© 2026 Praxis Müller</footer>', YEAR);
        expect(r.newestCopyright).toBe(2026);
        expect(r.copyrightCurrent).toBe(true);
    });

    it('nimmt bei einem Zeitraum das ENDJAHR', () => {
        const r = scanCareSignals('<footer>&copy; 2014–2026 Kanzlei</footer>', YEAR);
        expect(r.newestCopyright).toBe(2026);
        expect(r.copyrightCurrent).toBe(true);
    });

    it('erkennt ein veraltetes Copyright als NICHT aktuell', () => {
        const r = scanCareSignals('<footer>© 2014 Praxis</footer>', YEAR);
        expect(r.newestCopyright).toBe(2014);
        expect(r.copyrightCurrent).toBe(false);
        expect(r.caresCount).toBe(0);
    });

    it('ignoriert Zukunftsjahre (Tippfehler/Fremdinhalt)', () => {
        const r = scanCareSignals('<footer>© 2099 Praxis</footer>', YEAR);
        expect(r.newestCopyright).toBeNull();
    });

    it('erkennt datierte Inhalte über <time datetime> und ISO-Datum', () => {
        expect(scanCareSignals('<time datetime="2026-03-01">März</time>', YEAR).datedContentCurrent).toBe(true);
        expect(scanCareSignals('<span>2026-05-14</span>', YEAR).datedContentCurrent).toBe(true);
        expect(scanCareSignals('<span>2013-05-14</span>', YEAR).datedContentCurrent).toBe(false);
    });

    it('erkennt eine hinterlegte Sitemap', () => {
        expect(scanCareSignals('<a href="/sitemap.xml">Sitemap</a>', YEAR).hasSitemap).toBe(true);
    });

    it('liefert bei fehlenden Hinweisen NULL Signale — und keine Strafe', () => {
        // Entscheidend: das Modul gibt nur Signale zurück. Es gibt keinen
        // negativen Wert, den ein Aufrufer versehentlich als Abschlag lesen könnte.
        const r = scanCareSignals('<html><body>nichts</body></html>', YEAR);
        expect(r.caresCount).toBe(0);
        expect(r.signals).toEqual([]);
        expect(Object.values(r).some(v => typeof v === 'number' && v < 0)).toBe(false);
    });
});

describe('scanContactPaths — ist der Betrieb ansprechbar?', () => {
    it('findet eine verlinkte E-Mail und erkennt sie als persönlich', () => {
        const r = scanContactPaths('<a href="mailto:m.vornberger@praxis.de">Mail</a>');
        expect(r.checked).toBe(true);
        expect(r.hasMailto).toBe(true);
        expect(r.hasPersonalMailto).toBe(true);
    });

    it('erkennt ein generisches Postfach als NICHT persönlich', () => {
        const r = scanContactPaths('<a href="mailto:info@praxis.de">Mail</a>');
        expect(r.hasMailto).toBe(true);
        expect(r.hasPersonalMailto).toBe(false);
    });

    it('findet Telefon und Impressum-Link', () => {
        const r = scanContactPaths('<a href="tel:+4922112345">Anrufen</a><a href="/impressum">Impressum</a>');
        expect(r.hasTel).toBe(true);
        expect(r.hasImpressumLink).toBe(true);
    });

    it('dedupliziert mehrfach verlinkte Adressen', () => {
        const r = scanContactPaths('<a href="mailto:info@x.de">a</a><a href="mailto:info@x.de">b</a>');
        expect(r.mailtoCount).toBe(1);
    });

    it('sortiert kaputte mailto-Werte aus', () => {
        const r = scanContactPaths('<a href="mailto:">leer</a><a href="mailto:kein-at-zeichen">x</a>');
        expect(r.hasMailto).toBe(false);
    });

    it('meldet checked:true auch wenn nichts gefunden wurde', () => {
        // Der Unterschied zu „nicht geprüft" (null) ist die ganze Ehrlichkeitsregel:
        // nur ein durchgeführter Scan darf im Score abwerten.
        const r = scanContactPaths('<html><body>keine Kontaktdaten</body></html>');
        expect(r.checked).toBe(true);
        expect(r.hasMailto).toBe(false);
        expect(r.hasTel).toBe(false);
        expect(r.hasImpressumLink).toBe(false);
    });
});
