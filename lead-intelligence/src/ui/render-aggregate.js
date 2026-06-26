/**
 * Voranalyse-Report-UI — zeigt die verdichtete Stadt×Branche-Auswertung eines
 * Scans als Overlay: wo sitzen die heißesten Nester (viele werbende, schwache,
 * erreichbare Betriebe). Klick auf eine Branche → filtert den Workspace.
 * @module ui/render-aggregate
 */
import { aggregateScan } from '../analysis/scan-aggregate.js';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const pct = (x) => Math.round((x || 0) * 100) + '%';

/**
 * @param {object[]} leads   alle Scan-Leads (ungefiltert)
 * @param {string} city
 * @param {(branchKey:string)=>void} onPickBranch  Workspace auf diese Branche filtern
 */
export function showAggregateReport(leads, city, onPickBranch) {
    const agg = aggregateScan(leads, city);
    const s = agg.summary;
    const rows = agg.branches.map((b, i) => {
        const seasonBadge = b.seasonalNow ? ' <span class="agg-badge agg-season">⏰ Saison</span>' : '';
        const hotBadge = b.hot ? ` <span class="agg-badge agg-hot">${b.hot}🔥</span>` : '';
        return `<tr class="agg-row" data-branch="${esc(b.key)}">
            <td class="agg-rank">${i + 1}</td>
            <td class="agg-name">${esc(b.name)}${seasonBadge}</td>
            <td class="agg-num">${b.qualified}<span class="agg-sub">/${b.count}</span>${hotBadge}</td>
            <td class="agg-num">${pct(b.adQuote)}</td>
            <td class="agg-num agg-strong">${b.adWeakCount}</td>
            <td class="agg-num">${b.medianOpportunity}</td>
            <td class="agg-num">${b.medianRating != null ? b.medianRating.toFixed(1).replace('.', ',') : '–'} · ${b.medianReviews}</td>
            <td><button class="agg-pick" data-branch="${esc(b.key)}">Filtern →</button></td>
        </tr>`;
    }).join('');

    const el = document.createElement('div');
    el.className = 'channel-overlay';
    el.innerHTML = `
        <div class="channel-card agg-card">
            <p class="hero-eyebrow">Voranalyse · ${esc(city || 'Scan')}</p>
            <h2 class="channel-title">Wo lohnt die Jagd?</h2>
            <p class="agg-summary">
                <strong>${s.totalLeads}</strong> Leads · <strong>${s.totalHot}</strong> hot ·
                <strong>${s.totalQualified}</strong> lohnend (≥ 50) ·
                <strong>${pct(s.adQuote)}</strong> schalten Anzeigen ·
                ${s.branchesWithLeads} Branchen
            </p>
            <p class="agg-hint">Sortiert nach „heißem Nest" = viele erreichbare Betriebe, die <strong>nachweislich werben</strong> und eine schwache Seite haben. Die Spalte <strong>„wirbt+schwach"</strong> ist dein bestes Akquise-Signal.</p>
            <div class="agg-table-wrap">
            <table class="agg-table">
                <thead><tr>
                    <th>#</th><th>Branche</th><th>lohnend/total</th><th>Anzeigen-Quote</th>
                    <th title="Betriebe, die werben UND eine schwache Seite haben">wirbt+schwach</th>
                    <th>Ø-Score</th><th>Ø ★ · Bew.</th><th></th>
                </tr></thead>
                <tbody>${rows || '<tr><td colspan="8">Keine Leads im Scan.</td></tr>'}</tbody>
            </table>
            </div>
            <div class="channel-actions">
                <button class="btn-copy-large channel-close" data-close>Schließen</button>
            </div>
        </div>`;
    document.body.appendChild(el);
    const close = () => el.remove();
    el.querySelector('[data-close]').addEventListener('click', close);
    el.addEventListener('click', (e) => { if (e.target === el) close(); });
    el.querySelectorAll('.agg-pick').forEach(btn => btn.addEventListener('click', () => {
        if (typeof onPickBranch === 'function') onPickBranch(btn.dataset.branch);
        close();
    }));
}
