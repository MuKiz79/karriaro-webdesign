/**
 * Regionen-Radar-UI — Modal: Städte eingeben → Live-Wirtschaftspuls (offene
 * Stellen je Branche) → ranking, welche Stadt sich für die Jagd lohnt.
 * Klick „Scannen" füllt das Scanner-Stadt-Feld und schließt.
 * @module ui/render-radar
 */
import { runRegionRadar } from '../analysis/region-radar.js';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const DEFAULT_CITIES = 'Stuttgart, München, Frankfurt, Köln, Hamburg, Düsseldorf, Nürnberg, Mannheim';

/** @param {(city:string)=>void} onPickCity */
export function showRegionRadar(onPickCity) {
    const el = document.createElement('div');
    el.className = 'channel-overlay';
    el.innerHTML = `
        <div class="channel-card radar-card">
            <p class="hero-eyebrow">Regionen-Radar</p>
            <h2 class="channel-title">Wo brummt die Wirtschaft?</h2>
            <p class="agg-hint">Live aus der Arbeitsagentur-Jobsuche: offene Stellen je Stadt über mehrere KMU-Branchen = wirtschaftlich aktive, wachsende Betriebe = zahlungsfähige Akquise-Region. <em>Absolute Aktivität — große Städte führen naturgemäß.</em></p>
            <label class="radar-label">Städte (kommagetrennt)</label>
            <input class="radar-input" id="radar-cities" value="${esc(DEFAULT_CITIES)}">
            <div class="channel-actions" style="margin:10px 0">
                <button class="btn-copy-large" id="radar-run">Radar starten</button>
            </div>
            <div id="radar-status" class="agg-hint"></div>
            <div id="radar-results"></div>
            <div class="channel-actions">
                <button class="btn-copy-large channel-close" data-close>Schließen</button>
            </div>
        </div>`;
    document.body.appendChild(el);
    const close = () => el.remove();
    el.querySelector('[data-close]').addEventListener('click', close);
    el.addEventListener('click', (e) => { if (e.target === el) close(); });

    const run = async () => {
        const cities = el.querySelector('#radar-cities').value.split(',').map(c => c.trim()).filter(Boolean);
        if (!cities.length) return;
        const btn = el.querySelector('#radar-run');
        const status = el.querySelector('#radar-status');
        const results = el.querySelector('#radar-results');
        btn.disabled = true; btn.textContent = 'Läuft…'; results.innerHTML = '';
        try {
            const rows = await runRegionRadar(cities, (done, total) => {
                status.textContent = `Frage Stellenmärkte ab… ${done}/${total}`;
            });
            status.textContent = '';
            results.innerHTML = `<div class="agg-table-wrap"><table class="agg-table">
                <thead><tr><th>#</th><th>Stadt</th><th>offene Stellen (Σ)</th><th>stärkste Branchen</th><th></th></tr></thead>
                <tbody>${rows.map((r, i) => `<tr class="agg-row">
                    <td class="agg-rank">${i + 1}</td>
                    <td class="agg-name">${esc(r.city)}</td>
                    <td class="agg-num agg-strong">${r.total.toLocaleString('de-DE')}</td>
                    <td>${r.top.map(t => `${esc(t.name)} (${t.total})`).join(' · ')}</td>
                    <td><button class="agg-pick" data-city="${esc(r.city)}">Scannen →</button></td>
                </tr>`).join('')}</tbody></table></div>`;
            results.querySelectorAll('.agg-pick').forEach(b => b.addEventListener('click', () => {
                if (typeof onPickCity === 'function') onPickCity(b.dataset.city);
                close();
            }));
        } catch (e) {
            status.textContent = 'Radar fehlgeschlagen: ' + (e?.message || e);
        } finally {
            btn.disabled = false; btn.textContent = 'Radar starten';
        }
    };
    el.querySelector('#radar-run').addEventListener('click', run);
}
