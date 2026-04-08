/**
 * Lead Intelligence v2 — Entry Point
 * Initialisiert Config, Firebase Auth, Event Listeners, Router
 */

import { config, loadConfig, saveConfig } from './config.js';
import { state } from './state.js';

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
        panel.innerHTML = `
            <h3>API-Konfiguration</h3>
            <label>Google PageSpeed API Key</label>
            <input type="text" id="cfg-psi-key" value="${config.psiKey}" placeholder="AIza...">
            <div class="hint">Kostenlos unter console.cloud.google.com</div>
            <label>Cloud Function URL</label>
            <input type="text" id="cfg-fn-url" value="${config.fnUrl}" placeholder="https://us-central1-projekt.cloudfunctions.net">
            <div class="hint">Firebase Cloud Function Basis-URL</div>
            <button class="btn-primary" style="margin-top:16px" id="btn-save-settings">Speichern</button>
        `;
        document.getElementById('btn-save-settings').addEventListener('click', () => {
            config.psiKey = document.getElementById('cfg-psi-key').value.trim();
            config.fnUrl = document.getElementById('cfg-fn-url').value.trim().replace(/\/$/, '');
            saveConfig();
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

// ── Onboarding ──
function checkOnboarding() {
    if (!localStorage.getItem('karriaro_onboarded')) {
        // TODO: Phase 7 — Onboarding-Overlay
    }
}

// Export for use in orchestration modules
export { abort };
