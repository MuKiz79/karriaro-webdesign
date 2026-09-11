/**
 * 8. Technology Debt Trajectory
 * Nicht nur "wie alt ist die Tech jetzt" sondern "wie schnell veraltet sie?"
 *
 * 2026-09-10: Die Support-Lage kommt aus der gemessenen Version (analysis/tech-age.js,
 * bewerteCmsVersion). Die frühere Einstufung nach Hauptversion hielt jede WordPress-
 * Version unter 5 für ungepatcht und jede unter 6 für „bald ohne Updates" — beides
 * stimmt nicht (ab 4.7 wird weiter gepatcht). Behauptet wird nur, was die Version belegt.
 */

import { bewerteCmsVersion } from './tech-age.js';

const MONAT_MS = 30.44 * 86400000;

export function assessTechTrajectory(tech, wayback, jetzt = new Date()) {
    const trajectory = { current: '', timeToRisk: null, urgency: 'low', label: '' };

    if (tech.isBaukasten) {
        trajectory.current = `${tech.cms} (Baukasten)`;
        trajectory.timeToRisk = null;  // Baukasten = immer limitiert
        trajectory.urgency = 'chronic';
        trajectory.label = `${tech.cms} ist eine permanente Limitierung — kein "Verfallsdatum" aber ein ständiger Nachteil gegenüber individuellen Websites`;
        trajectory.pitchArg = `Baukasten-Systeme wie ${tech.cms} setzen strukturelle Grenzen die nicht überwunden werden können — egal wie viel Sie optimieren`;
    } else if (tech.version && tech.cms) {
        const sv = bewerteCmsVersion(tech.cms, tech.version, jetzt);
        const name = `${sv.cms || tech.cms} ${tech.version}`;
        if (sv.status === 'eol') {
            trajectory.current = `${name} (ohne Sicherheitsupdates)`;
            trajectory.timeToRisk = 0;
            trajectory.urgency = 'critical';
            trajectory.label = `${name}: ${sv.text}.`;
            trajectory.pitchArg = `${name} läuft ${sv.text}.`;
        } else if (sv.status === 'gepflegt') {
            trajectory.current = `${name} (gepflegt)`;
            const endeMs = sv.supportBis ? Date.parse(sv.supportBis) : NaN;
            const jetztMs = jetzt instanceof Date ? jetzt.getTime() : Number(jetzt);
            trajectory.timeToRisk = Number.isFinite(endeMs) ? Math.max(0, Math.round((endeMs - jetztMs) / MONAT_MS)) : null;
            trajectory.urgency = trajectory.timeToRisk !== null && trajectory.timeToRisk <= 6 ? 'medium' : 'low';
            trajectory.label = `${name}: ${sv.text}`;
        } else if (sv.status === 'nicht-aktuell') {
            trajectory.current = `${name} (nicht aktuell)`;
            trajectory.urgency = 'medium';
            trajectory.label = `${name} ist nicht die neueste Version${sv.text ? ` — ${sv.text}` : ''}`;
        } else {
            trajectory.current = name;
            trajectory.urgency = 'unknown';
            trajectory.label = 'Support-Lage dieser Version ist nicht belegt';
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
