/**
 * Timing-Analyse — Wann kontaktieren?
 */
export function analyzeTiming(ws, tech, place) {
    const signals = [];
    if (!ws.isHttps) signals.push({ urgency: 'critical', label: 'SSL fehlt', detail: 'Browser zeigt "Nicht sicher"' });
    if (ws.viewportMissing) signals.push({ urgency: 'critical', label: 'Nicht mobilfreundlich', detail: 'Google Mobile-First' });
    if (ws.a11y < 70) signals.push({ urgency: 'high', label: 'BFSG-Compliance', detail: `A11y ${ws.a11y}/100 — Pflicht seit 2025` });
    if (ws.perf < 25) signals.push({ urgency: 'high', label: 'Performance kritisch', detail: `${ws.perf}/100` });
    if (tech.isBaukasten) signals.push({ urgency: 'medium', label: tech.cms, detail: 'Strukturelle Limitierung' });

    const hasCritical = signals.some(s => s.urgency === 'critical');
    const hasHigh = signals.some(s => s.urgency === 'high');
    return {
        signals,
        overall: hasCritical ? 'Sofort kontaktieren' : hasHigh ? 'Diese Woche' : signals.length > 0 ? 'Innerhalb von 2 Wochen' : 'Kein dringender Zeitpunkt'
    };
}
