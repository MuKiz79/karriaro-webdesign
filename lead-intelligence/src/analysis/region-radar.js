/**
 * Regionen-Radar — beantwortet „WO soll ich suchen?" mit LIVE-Daten:
 * pro Stadt die offene-Stellen-Aktivität über mehrere KMU-Branchen (gratis
 * Arbeitsagentur-Jobsuche-API). Viele offene Stellen = wirtschaftlich aktive,
 * wachsende Betriebe = zahlungsfähige Akquise-Region.
 *
 * ⚠️ Ehrlich: das ist ABSOLUTE Stellen-Aktivität (große Städte führen
 * naturgemäß), ein Wirtschafts-PROXY — nicht normierte KMU-Dichte. Die echte
 * KMU-Dichte je Kreis liefert Destatis (siehe Runbook), benötigt aber einen
 * (kostenlosen) API-Token.
 * @module analysis/region-radar
 */
import { jobSignals } from '../api/cloud-functions.js';

// Repräsentative KMU-Branchen für den Wirtschafts-Puls (deckt sich mit den
// Scanner-Branchen, bewusst klein gehalten = wenige Calls je Stadt).
export const RADAR_BRANCHES = [
    { was: 'Friseur', name: 'Friseure' },
    { was: 'Zahnarzt', name: 'Zahnärzte' },
    { was: 'Restaurant', name: 'Gastronomie' },
    { was: 'Immobilienmakler', name: 'Makler' },
    { was: 'Sanitär Heizung', name: 'Sanitär/Heizung' },
    { was: 'Rechtsanwalt', name: 'Kanzleien' }
];

/**
 * @param {string[]} cities
 * @param {(done:number,total:number)=>void} [onProgress]
 * @returns {Promise<Array<{city, total, top:Array<{name,total}>}>>}  nach total sortiert
 */
// Backend-Limit: 90 jobSignals-Calls/h. Bei 6 Branchen je Stadt sind 5 Staedte
// = 30 Calls — ein zweiter und dritter Lauf innerhalb der Stunde passen noch rein.
// Mit 8 Staedten (48 Calls) lief der zweite Lauf ins Limit, und weil ein
// Fehlversuch still als 0 gezaehlt wurde, sah die Stadt faelschlich TOT aus.
export const MAX_RADAR_CITIES = 5;

export async function runRegionRadar(cities, onProgress = () => {}) {
    const clean = [...new Set((cities || []).map(c => String(c).trim()).filter(Boolean))].slice(0, MAX_RADAR_CITIES);
    const total = clean.length * RADAR_BRANCHES.length;
    let done = 0;
    const rows = [];
    for (const city of clean) {
        const perBranch = await Promise.all(RADAR_BRANCHES.map(async (b) => {
            // retries:0 — ein Fehlversuch soll das Rate-Limit nicht doppelt belasten.
            const r = await jobSignals({ was: b.was, wo: city, size: 1, retries: 0 }).catch(() => null);
            done++; onProgress(done, total);
            // Ein fehlgeschlagener Call ist NICHT "0 Stellen" — sonst sieht eine
            // lebendige Stadt nach einem Rate-Limit-Treffer tot aus. Unbekannt
            // bleibt unbekannt und wird unten sichtbar ausgewiesen.
            const ok = r && typeof r.total === 'number';
            return { name: b.name, total: ok ? r.total : 0, unknown: !ok };
        }));
        const sum = perBranch.reduce((s, x) => s + x.total, 0);
        const unknownCount = perBranch.filter(x => x.unknown).length;
        perBranch.sort((a, b) => b.total - a.total);
        rows.push({ city, total: sum, top: perBranch.slice(0, 3), unknownCount, partial: unknownCount > 0 });
    }
    rows.sort((a, b) => b.total - a.total);
    return rows;
}
