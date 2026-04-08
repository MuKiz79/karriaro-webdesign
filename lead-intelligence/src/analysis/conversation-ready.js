/**
 * 5. Conversation-Ready Score
 * Ist der Lead JETZT bereit für ein Gespräch? Zeitbasierte Dringlichkeits-Signale.
 */

export function assessConversationReadiness(ws, tech, place, wayback, futureReadiness) {
    const triggers = [];
    let readiness = 0;

    // SSL fehlt = Browser-Warnung JETZT
    if (!ws.isHttps) {
        triggers.push({ urgency: 'sofort', label: 'Browser zeigt "Nicht sicher"', detail: 'Jeder Besucher sieht die Warnung — aktiver Kundenverlust', impact: 5 });
        readiness += 5;
    }

    // BFSG seit Juni 2025 = gesetzliche Pflicht JETZT
    if (ws.a11y < 60) {
        triggers.push({ urgency: 'sofort', label: 'BFSG nicht erfüllt', detail: `Barrierefreiheit ${ws.a11y}/100 — Abmahnrisiko seit Juni 2025`, impact: 4 });
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

    // Alte WordPress-Version
    if (tech.version) {
        const v = parseInt(tech.version);
        if (v > 0 && v < 6) {
            triggers.push({ urgency: 'hoch', label: `WordPress ${tech.version} (veraltet)`, detail: 'Sicherheitsupdates laufen aus — Sicherheitsrisiko', impact: 3 });
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
