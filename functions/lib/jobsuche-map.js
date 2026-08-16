/**
 * Jobsuche-v6-Antwort → internes payload-Format (2026-08-16).
 *
 * ─── Warum ────────────────────────────────────────────────────────────────────
 * Die Bundesagentur hat v4 abgeschaltet (jeder Aufruf: 403 — der Endpoint war
 * damit STILL tot, Einzel-Check und Radar liefen ins Leere; gefunden beim
 * Verdrahten der Stellenzahl in den Region-Scan). v6 antwortet 200, hat aber
 * ein anderes Schema:
 *
 *   v4: { stellenangebote: [{titel, arbeitgeber, arbeitsort:{ort}, eintrittsdatum}], maxErgebnisse }
 *   v6: { ergebnisliste:  [{stellenangebotsTitel, firma, stellenlokationen:[{adresse:{ort}}],
 *                           eintrittszeitraum:{von}}], maxErgebnisse }
 *
 * ⚠️ Der v4-Parameter `arbeitgeber=` existiert in v6 NICHT mehr (liefert leer,
 * selbst für Hansgrohe/Edeka — empirisch 2026-08-16). Arbeitgeber-Zuordnung
 * passiert deshalb client-seitig: Branchen-Suche (was+wo) → `firma`-Liste →
 * matchEmployer/deriveJobOpenings (signals/employer-match.js).
 *
 * Pure Funktion, kein Netz — ohne Mock testbar (CJS).
 */
function mapJobsucheV6(data) {
    const jobs = (data?.ergebnisliste || []).map(s => ({
        titel: s.stellenangebotsTitel || null,
        arbeitgeber: s.firma || null,
        ort: (Array.isArray(s.stellenlokationen) && s.stellenlokationen[0]?.adresse?.ort) || null,
        eintrittsdatum: s.eintrittszeitraum?.von || null
    }));
    const employers = [...new Set(jobs.map(j => j.arbeitgeber).filter(Boolean))];
    const total = typeof data?.maxErgebnisse === "number" ? data.maxErgebnisse : jobs.length;
    return { jobs, employers, total };
}

module.exports = { mapJobsucheV6 };
