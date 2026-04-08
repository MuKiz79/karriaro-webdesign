/**
 * Lead Intelligence v2 — Entry Point
 * Initialisiert Config, Firebase Auth, Event Listeners, Router
 */

import { config, loadConfig, saveConfig } from './config.js';
import { state } from './state.js';
import { loadCloudSettings, saveCloudSettings } from './crm/settings.js';
import { checkReminders } from './crm/reminders.js';
import { selectVariant } from './learning/ab-test.js';
import { checkDrift } from './learning/tracking.js';

// ── Config laden ──
loadConfig();

// ── DOM Ready ──
document.addEventListener('DOMContentLoaded', () => {
    initTabs();
    initButtons();
    initAuth();
    checkOnboarding();
});

// ── Tab Navigation ──
function initTabs() {
    const tabs = document.querySelectorAll('.tab');
    const inputs = {
        single: document.getElementById('input-single'),
        batch: document.getElementById('input-batch'),
        scanner: document.getElementById('input-scanner')
    };

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const mode = tab.dataset.tab;
            state.mode = mode;

            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            Object.entries(inputs).forEach(([key, el]) => {
                el.classList.toggle('hidden', key !== mode);
            });

            // Hide all results
            document.getElementById('results').classList.add('hidden');
            document.getElementById('batch-results').classList.add('hidden');
            document.getElementById('crm-view').classList.add('hidden');
            document.getElementById('error').classList.add('hidden');
        });
    });
}

// ── Button Events ──
function initButtons() {
    // Analyze
    document.getElementById('btn-analyze')?.addEventListener('click', async () => {
        const { runSingleCheck } = await import('./orchestration/single-check.js');
        runSingleCheck();
    });

    // Batch
    document.getElementById('btn-batch')?.addEventListener('click', async () => {
        const { runBatchSearch } = await import('./orchestration/batch-search.js');
        runBatchSearch();
    });

    // Scanner
    document.getElementById('btn-scanner')?.addEventListener('click', async () => {
        const { runScanner } = await import('./orchestration/scanner.js');
        runScanner();
    });

    // Abort
    document.getElementById('btn-abort')?.addEventListener('click', () => abort());
    document.getElementById('btn-abort-progress')?.addEventListener('click', () => abort());

    // Enter keys
    document.getElementById('url-input')?.addEventListener('keydown', async (e) => {
        if (e.key === 'Enter') {
            const { runSingleCheck } = await import('./orchestration/single-check.js');
            runSingleCheck();
        }
    });
    document.getElementById('batch-query')?.addEventListener('keydown', async (e) => {
        if (e.key === 'Enter') {
            const { runBatchSearch } = await import('./orchestration/batch-search.js');
            runBatchSearch();
        }
    });

    // Nav buttons
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const action = btn.dataset.action;
            if (action === 'settings') toggleSettings();
            if (action === 'crm') showCRM();
            if (action === 'auth') toggleAuth();
        });
    });
}

// ── Auth ──
function initAuth() {
    if (!window.__firebase) return;
    window.__firebase.fns.onAuthStateChanged(window.__firebase.auth, (user) => {
        state.user = user;
        const btn = document.getElementById('auth-btn');
        if (user) {
            btn.textContent = user.email.split('@')[0];
            btn.classList.add('logged-in');
            // Fix 1: Settings aus Firestore laden
            loadCloudSettings();
            // Fix 3: Reminders prüfen
            showReminders();
        } else {
            btn.textContent = 'Anmelden';
            btn.classList.remove('logged-in');
        }
    });
}

async function toggleAuth() {
    if (!window.__firebase) return;
    if (state.user) {
        await window.__firebase.fns.signOut(window.__firebase.auth);
    } else {
        const provider = new window.__firebase.fns.GoogleAuthProvider();
        await window.__firebase.fns.signInWithPopup(window.__firebase.auth, provider);
    }
}

// ── Settings ──
function toggleSettings() {
    const panel = document.getElementById('settings-panel');
    panel.classList.toggle('hidden');
    if (!panel.classList.contains('hidden')) {
        const p = config.profile;
        panel.innerHTML = `
            <h3>API-Konfiguration</h3>
            <label>Google PageSpeed API Key</label>
            <input type="text" id="cfg-psi-key" value="${config.psiKey}" placeholder="AIza...">
            <div class="hint">Kostenlos unter console.cloud.google.com</div>
            <label>Cloud Function URL</label>
            <input type="text" id="cfg-fn-url" value="${config.fnUrl}" placeholder="https://us-central1-projekt.cloudfunctions.net">

            <h3 style="margin-top:24px;padding-top:16px;border-top:1px solid var(--border)">Mein Profil (SuperPrompt)</h3>
            <div class="hint" style="margin-bottom:12px">Diese Daten werden in Pitches und E-Mail-Vorlagen verwendet.</div>

            <label>Mein Name</label>
            <input type="text" id="cfg-name" value="${p.name}" placeholder="Muammer Kizilaslan">
            <label>Mein Unternehmen</label>
            <input type="text" id="cfg-company" value="${p.company}" placeholder="Karriaro Webdesign">
            <label>Meine Rolle</label>
            <input type="text" id="cfg-role" value="${p.role}" placeholder="Gründer & Webdesigner">
            <label>Meine Leistungen</label>
            <input type="text" id="cfg-services" value="${p.services}" placeholder="Handcodierte Websites, SEO, BFSG-Compliance">
            <label>Preisbereich</label>
            <input type="text" id="cfg-price" value="${p.priceRange}" placeholder="990-1.990€ einmalig, kein Abo">
            <label>Meine Zielgruppe</label>
            <input type="text" id="cfg-target" value="${p.targetGroup}" placeholder="Lokale Unternehmen (Handwerk, Gastronomie, Ärzte, Makler)">
            <label>Mein USP (Was macht mich besonders?)</label>
            <input type="text" id="cfg-usp" value="${p.usp}" placeholder="Kein Baukasten, kein Template. Handcodiert, in 2 Wochen fertig.">
            <label>Mein Standort</label>
            <input type="text" id="cfg-location" value="${p.location}" placeholder="Schwarzwald / Ortenau">
            <label>Referenz-Projekte</label>
            <input type="text" id="cfg-portfolio" value="${p.portfolio}" placeholder="karriaro-webdesign.de, Spedition Kolbe">
            <label>Tonalität</label>
            <select id="cfg-tone"><option value="professionell" ${p.tone==='professionell'?'selected':''}>Professionell</option><option value="freundlich" ${p.tone==='freundlich'?'selected':''}>Freundlich</option><option value="direkt" ${p.tone==='direkt'?'selected':''}>Direkt</option></select>

            <button class="btn-primary" style="margin-top:16px;width:100%" id="btn-save-settings">Speichern</button>
        `;
        document.getElementById('btn-save-settings').addEventListener('click', () => {
            config.psiKey = document.getElementById('cfg-psi-key').value.trim();
            config.fnUrl = document.getElementById('cfg-fn-url').value.trim().replace(/\/$/, '');
            // Profil speichern
            config.profile.name = document.getElementById('cfg-name').value.trim();
            config.profile.company = document.getElementById('cfg-company').value.trim();
            config.profile.role = document.getElementById('cfg-role').value.trim();
            config.profile.services = document.getElementById('cfg-services').value.trim();
            config.profile.priceRange = document.getElementById('cfg-price').value.trim();
            config.profile.targetGroup = document.getElementById('cfg-target').value.trim();
            config.profile.usp = document.getElementById('cfg-usp').value.trim();
            config.profile.location = document.getElementById('cfg-location').value.trim();
            config.profile.portfolio = document.getElementById('cfg-portfolio').value.trim();
            config.profile.tone = document.getElementById('cfg-tone').value;
            saveConfig();
            saveCloudSettings();  // Fix 1: Auch in Firestore speichern
            panel.classList.add('hidden');
        });
    }
}

// ── CRM ──
async function showCRM() {
    const { renderCRM } = await import('./ui/render-crm.js');
    renderCRM();
}

// ── Abort ──
function abort() {
    state.aborted = true;
    document.getElementById('loading').classList.add('hidden');
    document.getElementById('progress').classList.add('hidden');
    document.querySelectorAll('.btn-primary').forEach(b => b.disabled = false);
    const errorEl = document.getElementById('error');
    document.getElementById('error-text').textContent = 'Analyse abgebrochen.';
    errorEl.classList.remove('hidden');
}

// ── Fix 2: Onboarding ──
function checkOnboarding() {
    if (localStorage.getItem('karriaro_onboarded')) return;
    const el = document.getElementById('onboarding');
    el.classList.remove('hidden');
    el.innerHTML = `
        <div style="position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:200;display:flex;align-items:center;justify-content:center;padding:24px">
            <div style="background:var(--card);border-radius:var(--radius);padding:32px;max-width:480px;width:100%">
                <h2 style="font-size:1.5rem;font-weight:700;margin-bottom:12px">Willkommen bei Lead Intelligence</h2>
                <p style="color:var(--muted);font-size:14px;line-height:1.6;margin-bottom:24px">
                    Dieses Tool analysiert Websites potenzieller Kunden und berechnet mit Bayesianischer Statistik
                    wie wahrscheinlich eine Konversion ist.<br><br>
                    <strong>3 Schritte:</strong><br>
                    1. URL eingeben → Website wird analysiert<br>
                    2. Ergebnis lesen → Score, Gründe, Strategie<br>
                    3. Lead speichern → Im CRM weiterverfolgen<br><br>
                    <strong>Tipp:</strong> Trage zuerst unter "Einstellungen" deinen API-Key ein.
                </p>
                <button class="btn-primary" id="btn-onboarding-close" style="width:100%">Verstanden — loslegen</button>
            </div>
        </div>
    `;
    document.getElementById('btn-onboarding-close').addEventListener('click', () => {
        localStorage.setItem('karriaro_onboarded', '1');
        el.classList.add('hidden');
        el.innerHTML = '';
    });
}

// ── Fix 3: Follow-Up Reminders anzeigen ──
function showReminders() {
    const due = checkReminders();
    if (!due.length) return;
    // Banner oben in den Results-Bereich
    const banner = document.createElement('div');
    banner.className = 'card';
    banner.style.cssText = 'border-left:3px solid var(--accent);margin:80px auto 0;max-width:680px;padding:16px 20px';
    banner.innerHTML = `
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--accent);margin-bottom:6px">Follow-Up fällig (${due.length})</div>
        ${due.slice(0, 3).map(r => `<div class="stat-row"><span class="stat-label">${r.name || r.domain} — Tag ${r.touchDay}</span><span class="stat-value">Seit ${r.daysSince} Tagen</span></div>`).join('')}
    `;
    document.querySelector('nav').after(banner);
}

// Export for use in orchestration modules
export { abort, selectVariant, checkDrift };
