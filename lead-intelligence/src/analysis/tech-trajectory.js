/**
 * 8. Technology Debt Trajectory
 * Nicht nur "wie alt ist die Tech jetzt" sondern "wie schnell veraltet sie?"
 */

export function assessTechTrajectory(tech, wayback) {
    const trajectory = { current: '', timeToRisk: null, urgency: 'low', label: '' };

    if (tech.isBaukasten) {
        trajectory.current = `${tech.cms} (Baukasten)`;
        trajectory.timeToRisk = null;  // Baukasten = immer limitiert
        trajectory.urgency = 'chronic';
        trajectory.label = `${tech.cms} ist eine permanente Limitierung — kein "Verfallsdatum" aber ein ständiger Nachteil gegenüber individuellen Websites`;
        trajectory.pitchArg = `Baukasten-Systeme wie ${tech.cms} setzen strukturelle Grenzen die nicht überwunden werden können — egal wie viel Sie optimieren`;
    } else if (tech.version) {
        const v = parseFloat(tech.version);
        // WordPress-Versionen und ihr Support-Status
        if (tech.cms?.includes('WordPress')) {
            if (v < 5) {
                trajectory.current = `WordPress ${tech.version} (kritisch veraltet)`;
                trajectory.timeToRisk = 0;
                trajectory.urgency = 'critical';
                trajectory.label = `WordPress ${tech.version} hat KEINE Sicherheitsupdates mehr. Die Website ist ein Sicherheitsrisiko — jetzt.`;
                trajectory.pitchArg = `WordPress ${tech.version} bekommt keine Sicherheitsupdates mehr. Hacker-Angriffe auf veraltete WordPress-Versionen sind eine der häufigsten Ursachen für gehackte Websites.`;
            } else if (v < 6) {
                trajectory.current = `WordPress ${tech.version} (veraltet)`;
                trajectory.timeToRisk = 6;  // ~6 Monate bis kritisch
                trajectory.urgency = 'high';
                trajectory.label = `WordPress ${tech.version} — Sicherheitsupdates laufen in den nächsten Monaten aus`;
                trajectory.pitchArg = `WordPress ${tech.version} nähert sich dem Ende des Supports. In wenigen Monaten gibt es keine Sicherheitsupdates mehr.`;
            } else {
                trajectory.current = `WordPress ${tech.version} (aktuell)`;
                trajectory.timeToRisk = 24;
                trajectory.urgency = 'low';
                trajectory.label = 'WordPress-Version ist aktuell — kein dringender Handlungsbedarf aus technischer Sicht';
            }
        }
    } else {
        trajectory.current = tech.cms || 'Nicht erkannt';
        trajectory.urgency = 'unknown';
        trajectory.label = 'Technologie-Alter konnte nicht bestimmt werden';
    }

    // Wayback-Daten ergänzen
    if (wayback?.available && wayback.daysSince > 730) {
        trajectory.label += `. Die Website wurde seit ${wayback.yearsSince} Jahren nicht aktualisiert.`;
        if (trajectory.urgency === 'low') trajectory.urgency = 'medium';
    }

    return trajectory;
}
