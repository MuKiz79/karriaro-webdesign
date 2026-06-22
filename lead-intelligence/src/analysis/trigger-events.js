/**
 * #4 Trigger Events — Timing-Signale die Kaufbereitschaft anzeigen
 *
 * Forschung: Der ERSTE Anbieter der auf ein Trigger-Event reagiert,
 * gewinnt 35-50% der Deals.
 */

/**
 * Saisonale Trigger je Branche (Monate 0-basiert = Vor-Saison: jetzt bauen = rechtzeitig
 * fertig). Exportiert → auch der Scanner nutzt sie für den billigen Timing-Chip, ohne den
 * ganzen Detektor (der teure Deep-Daten braucht) erneut zu fahren.
 */
export const SEASONAL_TRIGGERS = {
    'restaurant': { months: [1, 2, 3], label: 'Vor der Sommersaison — neue Website jetzt = rechtzeitig für Outdoor-Geschäft' },
    'cafe': { months: [1, 2, 3], label: 'Vor der Sommersaison' },
    'hotel': { months: [0, 1, 2], label: 'Vor der Buchungssaison — Gäste buchen jetzt für Sommer' },
    'hair_salon': { months: [9, 10], label: 'Vor Weihnachten/Silvester — Hochsaison steht bevor' },
    'beauty_salon': { months: [9, 10], label: 'Vor der Weihnachts-Hochsaison' },
    'florist': { months: [0, 1, 4], label: 'Vor Valentinstag / Muttertag' },
    'gym': { months: [11, 0], label: 'Neujahrsvorsätze — größter Ansturm des Jahres steht bevor' },
};

/** Aktiver Saison-Trigger für Branche+Monat, sonst null. (month 0-basiert; Default = jetzt) */
export function seasonalTriggerFor(type, month = new Date().getMonth()) {
    const s = SEASONAL_TRIGGERS[type];
    return (s && s.months.includes(month)) ? s : null;
}

/**
 * Erkennt Trigger-Events aus verfügbaren Daten
 * @param {Object} params - Alle verfügbaren Signal-Daten
 * @returns {Object} Erkannte Trigger-Events mit Dringlichkeit
 */
export function detectTriggerEvents(params) {
    const { ws, tech, place, wayback, footprint, psiData, contentAnalysis } = params;
    const events = [];

    // ── Saisonale Trigger ──
    const month = new Date().getMonth();
    const type = place?.primaryType || '';

    const seasonal = seasonalTriggerFor(type, month);
    if (seasonal) {
        events.push({ type: 'seasonal', urgency: 'hoch', label: seasonal.label, timing: 'jetzt', impact: 3 });
    }

    // ── BFSG Deadline (seit Juni 2025 aktiv) ──
    if (ws?.a11y < 70) {
        events.push({
            type: 'legal', urgency: 'sofort',
            label: 'BFSG seit Juni 2025 in Kraft — Bußgelder bis 100.000€',
            timing: 'überfällig', impact: 5
        });
    }

    // ── Technologie-Veralterung ──
    if (tech?.version) {
        const v = parseInt(tech.version);
        if (v > 0 && v < 6) {
            events.push({
                type: 'tech_eol', urgency: 'hoch',
                label: `${tech.cms} ${tech.version} — Sicherheitsupdates laufen aus`,
                timing: '1-3 Monate', impact: 3
            });
        }
    }

    // ── Website nicht aktualisiert ──
    if (wayback?.daysSince > 730) {
        events.push({
            type: 'stale', urgency: 'hoch',
            label: `Website seit ${wayback.yearsSince} Jahren unverändert — digitale Stagnation`,
            timing: 'überfällig', impact: 4
        });
    } else if (wayback?.daysSince > 365) {
        events.push({
            type: 'stale', urgency: 'mittel',
            label: `Seit ${Math.round(wayback.daysSince / 30)} Monaten keine Änderung`,
            timing: '1-3 Monate', impact: 2
        });
    }

    // ── Copyright-Jahr veraltet ──
    if (contentAnalysis?.copyrightYear) {
        const currentYear = new Date().getFullYear();
        const yearDiff = currentYear - contentAnalysis.copyrightYear;
        if (yearDiff >= 3) {
            events.push({
                type: 'copyright', urgency: 'mittel',
                label: `Copyright © ${contentAnalysis.copyrightYear} — ${yearDiff} Jahre veraltet`,
                timing: 'bald', impact: 2
            });
        }
    }

    // ── SSL fehlt = aktive Browser-Warnung ──
    if (!ws?.isHttps) {
        events.push({
            type: 'security', urgency: 'sofort',
            label: 'Browser zeigt "Nicht sicher" — jeder Besucher sieht es',
            timing: 'jetzt', impact: 5
        });
    }

    // ── Google-Bewertungen werden schlechter ──
    if (params.socialSignals?.reviewTrend?.direction === 'fallend') {
        events.push({
            type: 'reputation', urgency: 'hoch',
            label: 'Google-Bewertungen im Abwärtstrend — Handlungsbedarf',
            timing: 'jetzt', impact: 3
        });
    }

    // ── Neuer Wettbewerber mit moderner Website ──
    if (params.competitors?.some(c => c.rating >= 4.5 && c.userRatingCount > 50)) {
        events.push({
            type: 'competition', urgency: 'mittel',
            label: 'Konkurrent mit starker Online-Präsenz im Umfeld',
            timing: '1-3 Monate', impact: 2
        });
    }

    // Sortiere nach Impact
    events.sort((a, b) => b.impact - a.impact);

    // Gesamt-Dringlichkeit
    const totalImpact = events.reduce((s, e) => s + e.impact, 0);
    const hasSofort = events.some(e => e.urgency === 'sofort');

    return {
        events,
        eventCount: events.length,
        totalImpact,
        hasSofort,
        topEvent: events[0] || null,
        label: hasSofort ? 'Sofortiger Handlungsbedarf — mehrere kritische Trigger'
            : totalImpact >= 10 ? 'Hohe Dringlichkeit — optimales Timing für Kontakt'
            : totalImpact >= 5 ? 'Guter Zeitpunkt — zeitnahe Kontaktaufnahme empfohlen'
            : 'Kein dringender Anlass',
        funnelImpact: {
            interest: Math.min(5, Math.round(totalImpact / 3)),
            close: hasSofort ? 3 : totalImpact >= 8 ? 2 : 0
        }
    };
}
