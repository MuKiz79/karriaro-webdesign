/**
 * Setup-Gate — nicht-blockierender Hinweis, wenn die App nicht einsatzbereit ist.
 *
 * Ohne PageSpeed-API-Key bzw. Cloud-Function-URL laufen Analysen stumm ins Leere.
 * Statt den Nutzer in eine Sackgasse klicken zu lassen, zeigen wir proaktiv eine
 * Karte mit direktem Weg in die Einstellungen.
 *
 * @module ui/setup-gate
 */

import { config } from '../config.js';

/** Prüft die Konfiguration und rendert/versteckt den Hinweis im #setup-gate-Slot. */
export function renderSetupGate() {
    const el = document.getElementById('setup-gate');
    if (!el) return;

    // Nur die wirklich nötige Angabe blockiert: die Cloud-Function-URL (hat einen
    // Default, fehlt also normalerweise nie). Der PageSpeed-Key ist optional —
    // PageSpeed liefert auch ohne Key Daten (nur mit geringerem Limit für große Scans).
    if (config.fnUrl) {
        el.classList.add('hidden');
        el.innerHTML = '';
        return;
    }

    el.classList.remove('hidden');
    el.innerHTML = `
        <div class="setup-gate-card">
            <p class="setup-gate-eyebrow">Einrichtung</p>
            <p class="setup-gate-text">Es fehlt noch die Cloud-Function-URL.
                Ohne sie laufen Analysen ins Leere.</p>
            <button class="btn-primary" id="btn-open-settings">Einstellungen öffnen</button>
        </div>`;
    document.getElementById('btn-open-settings')?.addEventListener('click', () => {
        // Über den Nav-Button auslösen → nutzt den zentralen showView-Router ohne Import-Zyklus.
        document.querySelector('.nav-btn[data-view="einstellungen"]')?.click();
    });
}
