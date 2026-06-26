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
export async function runRegionRadar(cities, onProgress = () => {}) {
    const clean = [...new Set((cities || []).map(c => String(c).trim()).filter(Boolean))].slice(0, 8);
    const total = clean.length * RADAR_BRANCHES.length;
    let done = 0;
    const rows = [];
    for (const city of clean) {
        const perBranch = await Promise.all(RADAR_BRANCHES.map(async (b) => {
            const r = await jobSignals({ was: b.was, wo: city, size: 1 }).catch(() => null);
            done++; onProgress(done, total);
            return { name: b.name, total: (r && r.total) || 0 };
        }));
        const sum = perBranch.reduce((s, x) => s + x.total, 0);
        perBranch.sort((a, b) => b.total - a.total);
        rows.push({ city, total: sum, top: perBranch.slice(0, 3) });
    }
    rows.sort((a, b) => b.total - a.total);
    return rows;
}
