/**
 * 5. Conversation-Ready Score
 * Ist der Lead JETZT bereit für ein Gespräch? Zeitbasierte Dringlichkeits-Signale.
 */

import { httpsBefund, CHROME_HTTPS_WARNUNG } from './trigger-events.js';
import { bewerteCmsVersion } from './tech-age.js';

export function assessConversationReadiness(ws, tech, place, wayback, futureReadiness, httpsCheck = null) {
    const triggers = [];
    let readiness = 0;

    // HTTPS: gemessen (adEvidence.httpsCheck) schlägt die PSI-Ableitung (httpsBefund).
    // 2026-09-10: kein „jeder Besucher sieht die Warnung" mehr — Chrome warnt nur neue
    // Besucher, und ohne Messung ist nicht einmal belegt, dass HTTPS fehlt.
    const hb = httpsBefund(ws, httpsCheck);
    if (hb.ohneHttps) {
        triggers.push(hb.gemessen
            ? { urgency: 'sofort', label: 'Seite ohne HTTPS', detail: `${CHROME_HTTPS_WARNUNG}; Browser markieren sie schon heute als „Nicht sicher"`, impact: 5 }
            : { urgency: 'sofort', label: 'Seite lädt ohne HTTPS', detail: 'Browser markieren sie als „Nicht sicher"', impact: 4 });
        readiness += hb.gemessen ? 5 : 4;
    }

    // 2026-08-14: kein „Abmahnrisiko" mehr — das behauptete eine Rechtsfolge, die
    // für die meisten Betriebe gar nicht gilt (§§ 1, 3 BFSG). Der Befund selbst
    // bleibt: eine Seite mit diesem Wert schließt Besucher aus.
    if (ws.a11y < 60) {
        triggers.push({ urgency: 'sofort', label: 'Barrierefreiheit mangelhaft', detail: `${ws.a11y}/100 — Besucher mit Seh- oder Bedien-Einschränkung kommen nicht durch`, impact: 4 });
        readiness += 4;
    }

    // Website seit Jahren nicht aktualisiert
    if (wayback?.daysSince > 730) {
        triggers.push({ urgency: 'hoch', label: `Seit ${wayback.yearsSince} Jahren nicht aktualisiert`, detail: 'Die Website ist eingefroren — der Zeitpunkt für einen Neustart ist jetzt', impact: 4 });
        readiness += 4;
    } else if (wayback?.daysSince > 365) {
        triggers.push({ urgency: 'hoch', label: `Seit ${Math.round(wayback.daysSince / 30)} Monaten unverändert`, detail: 'Website wird vernachlässigt', impact: 2 });
        readiness += 2;
    }

    // CMS ohne Sicherheitsupdates — nur, was die gemessene Version belegt (tech-age.js).
    // Früher: jede WordPress-Version unter 6 galt als „Sicherheitsupdates laufen aus".
    if (tech?.version && tech?.cms) {
        const sv = bewerteCmsVersion(tech.cms, tech.version);
        if (sv.eol) {
            triggers.push({ urgency: 'hoch', label: `${sv.cms || tech.cms} ${tech.version}`, detail: sv.text, impact: 3 });
            readiness += 3;
        }
    }

    // Baukasten = strukturelle Limitierung die sich verschärft
    if (tech.isBaukasten) {
        triggers.push({ urgency: 'mittel', label: `${tech.cms} erreicht seine Grenzen`, detail: 'Der Baukasten kann die wachsenden Anforderungen nicht mehr erfüllen', impact: 2 });
        readiness += 2;
    }

    // Saisongeschäft vor Hochsaison
    const month = new Date().getMonth();
    const type = place?.primaryType || '';
    if (['restaurant', 'hotel', 'cafe'].includes(type) && month >= 1 && month <= 3) {
        triggers.push({ urgency: 'timing', label: 'Vor der Sommersaison', detail: 'Jetzt neue Website = rechtzeitig vor dem Hauptgeschäft', impact: 2 });
        readiness += 2;
    }
    if (['hair_salon', 'beauty_salon'].includes(type) && month >= 9 && month <= 10) {
        triggers.push({ urgency: 'timing', label: 'Vor Weihnachten/Silvester', detail: 'Hochsaison steht bevor', impact: 2 });
        readiness += 2;
    }

    return {
        triggers: triggers.sort((a, b) => b.impact - a.impact),
        readiness,
        isReady: readiness >= 5,
        label: readiness >= 10 ? 'Höchste Dringlichkeit — sofort kontaktieren' :
               readiness >= 5 ? 'Guter Zeitpunkt — diese Woche kontaktieren' :
               readiness >= 2 ? 'Moderat — innerhalb von 2 Wochen' :
               'Kein dringender Anlass',
        topTrigger: triggers[0] || null,
        funnelImpact: Math.min(5, Math.round(readiness / 2))
    };
}
