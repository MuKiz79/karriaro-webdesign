/**
 * BFSG-Betroffenheit — beantwortet die Frage VOR der Frage.
 *
 * ─── Warum es dieses Modul gibt ──────────────────────────────────────────────
 * Die WCAG-Messung sagt, WIE barrierefrei eine Seite ist. Sie sagt NICHT, ob
 * der Betrieb dem BFSG überhaupt unterliegt. Bis 2026-08 lief die Kette
 * Score → Risiko → Bußgeld für JEDE Domain durch: eine Vier-Mann-Bäckerei mit
 * Visitenkarten-Seite bekam „Risiko kritisch · bis 100.000 €" angezeigt, obwohl
 * sie null Rechtspflicht hat. Der eigene Ratgeber (/bfsg-website-pflicht) sagte
 * zwei Klicks weiter das Gegenteil — und der Ratgeber hatte recht.
 *
 * ─── Die drei Bedingungen (§§ 1, 3 BFSG) ─────────────────────────────────────
 *   1. B2C — Angebot richtet sich an Verbraucher.
 *   2. Dienstleistung im elektronischen Geschäftsverkehr: die Seite ermöglicht
 *      einen VERBRAUCHERVERTRAGSSCHLUSS (Shop, Buchung, Bestellung). Eine reine
 *      Visitenkarten-Seite ohne Abschluss ist in der Regel NICHT erfasst.
 *   3. Kein Kleinstunternehmen (§ 3 Abs. 3): < 10 Beschäftigte UND ≤ 2 Mio. €
 *      Jahresumsatz bzw. Bilanzsumme sind bei Dienstleistungen ausgenommen.
 *
 * ─── Die bewusste Asymmetrie ─────────────────────────────────────────────────
 * Bedingung 2 lässt sich am Quelltext PLAUSIBEL machen. Bedingung 3 NIEMALS —
 * Mitarbeiterzahl und Umsatz stehen in keinem HTML. Deshalb kann dieses Modul
 * „wahrscheinlich ausgenommen" sagen, aber NIE „pflichtig". Der stärkste Befund
 * ist `moeglich` — und der trägt seinen Vorbehalt immer mit.
 *
 * Das ist die schützende Richtung: Ein falsches „ausgenommen" kostet ein
 * Verkaufsargument. Ein falsches „pflichtig" ist eine unzutreffende
 * Rechtsbehauptung gegenüber einem Gewerbetreibenden (§ 5 UWG).
 *
 * Pure Funktion, kein Netz — ohne Mock testbar (CJS).
 *
 * @module lib/bfsg-scope
 */

/**
 * Bezahlte Werkzeuge, die einen Online-Vertragsschluss BELEGEN.
 *
 * Bewusst eine Teilmenge von PAID_TOOLS in site-evidence.js: Mailchimp und
 * Brevo beweisen Budget, aber keinen Vertragsschluss — sie stehen deshalb
 * nicht hier. WhatsApp ebenfalls nicht: ein Chat-Link ist Anbahnung, kein
 * Abschluss.
 */
const VERTRAGS_TOOLS = {
    shopify: 'Shopify-Shop',
    woocommerce: 'WooCommerce-Shop',
    opentable: 'OpenTable-Reservierung',
    quandoo: 'Quandoo-Reservierung',
    doctolib: 'Doctolib-Terminbuchung',
    treatwell: 'Treatwell-Buchung',
    timify: 'Timify-Terminbuchung',
    bookingkit: 'bookingkit-Buchung',
    calendly: 'Calendly-Terminbuchung',
    jameda: 'Jameda-Terminbuchung'
};

/**
 * Quelltext-Marker für einen Abschluss auf der Seite selbst.
 *
 * ⚠️ Absichtlich eng: „Kontakt aufnehmen", „Anfrage senden", „Rückruf" sind
 * KEIN Vertragsschluss, sondern Anbahnung — sie stehen hier nicht drin, sonst
 * wäre jede Handwerkerseite mit Kontaktformular „möglicherweise pflichtig".
 */
const HTML_MARKER = [
    { re: /in den warenkorb|zum warenkorb|warenkorb\b|add[-_ ]?to[-_ ]?cart/i, beleg: 'Warenkorb' },
    { re: /zur kasse|zum checkout|\/checkout\b|jetzt kaufen|kostenpflichtig bestellen/i, beleg: 'Kaufabschluss' },
    { re: /shopware|magento|jtl-?shop|oxid-?esales|presta ?shop/i, beleg: 'Shop-System' },
    { re: /"@type"\s*:\s*"(?:Product|Offer)"/i, beleg: 'Produktdaten mit Angebot' },
    { re: /jetzt buchen|online buchen|termin buchen|termin online|tisch reservieren|jetzt reservieren|online bestellen|zimmer buchen/i, beleg: 'Buchungs-/Bestellstrecke' }
];

const VORBEHALT = 'Ob eine Pflicht besteht, hängt zusätzlich von der Betriebsgröße ab '
    + '(Kleinstunternehmen unter 10 Beschäftigten und bis 2 Mio. € Umsatz sind bei '
    + 'Dienstleistungen ausgenommen). Diese Angaben stehen in keinem Quelltext und '
    + 'sind hier nicht geprüft.';

/**
 * Bestimmt die BFSG-Betroffenheitslage aus dem, was der Quelltext hergibt.
 *
 * @param {{html?:string, paidToolKeys?:string[]}} p
 * @returns {{lage:'ausgenommen_wahrscheinlich'|'moeglich'|'unbekannt',
 *            label:string, vertragsschluss:boolean|null,
 *            belege:string[], vorbehalt:string}}
 */
function bfsgPflichtLage(p) {
    const html = typeof p?.html === 'string' ? p.html : '';
    const keys = Array.isArray(p?.paidToolKeys) ? p.paidToolKeys : [];

    // Ohne Quelltext UND ohne Werkzeug-Fund ist nichts geprüft — und „nicht
    // geprüft" ist nicht „nicht vorhanden" (dieselbe Fehlerklasse wie beim
    // Lead-Scoring: eine Datenlücke darf nie wie ein Befund wirken).
    if (!html && keys.length === 0) {
        return {
            lage: 'unbekannt',
            label: 'nicht geprüft',
            vertragsschluss: null,
            belege: [],
            vorbehalt: VORBEHALT
        };
    }

    const belege = [];
    for (const k of keys) {
        if (VERTRAGS_TOOLS[k]) belege.push(VERTRAGS_TOOLS[k]);
    }
    if (html) {
        for (const m of HTML_MARKER) {
            if (m.re.test(html)) belege.push(m.beleg);
        }
    }

    if (belege.length === 0) {
        return {
            lage: 'ausgenommen_wahrscheinlich',
            label: 'wahrscheinlich nicht erfasst',
            vertragsschluss: false,
            belege: [],
            vorbehalt: 'Auf der Seite wurde kein Online-Vertragsschluss gefunden '
                + '(kein Shop, keine Buchung, keine Bestellung). Ohne Abschluss ist eine '
                + 'Website in der Regel keine Dienstleistung im elektronischen '
                + 'Geschäftsverkehr und damit nicht vom BFSG erfasst.'
        };
    }

    return {
        lage: 'moeglich',
        label: 'möglicherweise erfasst',
        vertragsschluss: true,
        // Doppelte Belege zusammenfassen (Shop-System + Warenkorb + Produktdaten
        // sind oft derselbe Shop).
        belege: Array.from(new Set(belege)),
        vorbehalt: VORBEHALT
    };
}

module.exports = { bfsgPflichtLage, VERTRAGS_TOOLS, VORBEHALT };
