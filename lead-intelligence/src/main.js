/**
 * Lead Intelligence v2 — Entry Point
 * Initialisiert Config, Firebase Auth, Event Listeners, Router
 */

import { config, loadConfig, saveConfig } from './config.js';
import { state } from './state.js';
import { loadCloudSettings, saveCloudSettings } from './crm/settings.js';
import { checkReminders } from './crm/reminders.js';
import { loadAutoScanConfig, saveAutoScanConfig, isAutoScanDue, getNewLeads } from './crm/auto-scan.js';
import { runSingleCheck } from './orchestration/single-check.js';
import { runBatchSearch } from './orchestration/batch-search.js';
import { runScanner, requestNotificationPermissionOnGesture } from './orchestration/scanner.js';
import { renderCRM } from './ui/render-crm.js';

// ── Config laden ──
loadConfig();

// ── DOM Ready ──
document.addEventListener('DOMContentLoaded', () => {
    initTabs();
    initButtons();
    initAuth();
    checkOnboarding();
    checkAutoScanAlerts();
});

// ── Auto-Scan Alert ──
function checkAutoScanAlerts() {
    const newLeads = getNewLeads();
    if (newLeads.length === 0) return;
    const banner = document.createElement('div');
    banner.className = 'card card-success';
    banner.style.cssText = 'margin:80px auto 0;max-width:680px;padding:16px 20px;cursor:pointer';
    banner.innerHTML = `<div class="section-label-accent">${newLeads.length} neue Leads gefunden</div><div class="metric-desc">Klicke um sie im CRM zu sehen</div>`;
    banner.addEventListener('click', () => { banner.remove(); showCRM(); });
    document.querySelector('nav').after(banner);
}

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

// ── URL History ──
const URL_HISTORY_KEY = 'karriaro_url_history';
function addToHistory(url) {
    const history = JSON.parse(localStorage.getItem(URL_HISTORY_KEY) || '[]');
    const filtered = history.filter(u => u !== url);
    filtered.unshift(url);
    localStorage.setItem(URL_HISTORY_KEY, JSON.stringify(filtered.slice(0, 10)));
    renderUrlHistory();
}
function renderUrlHistory() {
    const input = document.getElementById('url-input');
    if (!input) return;
    const history = JSON.parse(localStorage.getItem(URL_HISTORY_KEY) || '[]');
    let dl = document.getElementById('url-history-list');
    if (!dl) {
        dl = document.createElement('datalist');
        dl.id = 'url-history-list';
        input.parentNode.appendChild(dl);
        input.setAttribute('list', 'url-history-list');
    }
    dl.innerHTML = history.map(u => `<option value="${u}">`).join('');
}

// ── Button Events ──
function initButtons() {
    // Analyze (+ URL History)
    document.getElementById('btn-analyze')?.addEventListener('click', () => {
        const url = document.getElementById('url-input')?.value.trim();
        if (url) addToHistory(url.startsWith('http') ? url : 'https://' + url);
        runSingleCheck();
    });

    // Batch
    document.getElementById('btn-batch')?.addEventListener('click', () => {
        requestNotificationPermissionOnGesture();
        runBatchSearch();
    });

    // Scanner
    document.getElementById('btn-scanner')?.addEventListener('click', () => {
        requestNotificationPermissionOnGesture();
        runScanner();
    });

    // Abort
    document.getElementById('btn-abort')?.addEventListener('click', () => abort());
    document.getElementById('btn-abort-progress')?.addEventListener('click', () => abort());

    // Enter keys
    document.getElementById('url-input')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const url = e.target.value.trim();
            if (url) addToHistory(url.startsWith('http') ? url : 'https://' + url);
            runSingleCheck();
        }
    });
    document.getElementById('batch-query')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') runBatchSearch();
    });
    document.getElementById('scanner-city')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') runScanner();
    });

    // Keyboard shortcut: Cmd/Ctrl+Enter anywhere → analyze current mode
    document.addEventListener('keydown', (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            e.preventDefault();
            if (state.mode === 'single') runSingleCheck();
            else if (state.mode === 'batch') runBatchSearch();
            else if (state.mode === 'scanner') runScanner();
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

    // URL History laden
    renderUrlHistory();
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
        const autoScan = loadAutoScanConfig();
        const field = (id, label, value, placeholder, hint) =>
            `<label>${label}</label><input type="text" id="${id}" value="${value || ''}" placeholder="${placeholder}">${hint ? `<div class="hint">${hint}</div>` : ''}`;

        panel.innerHTML = `
            <h3>API-Konfiguration</h3>
            ${field('cfg-psi-key', 'Google PageSpeed API Key', config.psiKey, 'AIza...', 'Kostenlos unter console.cloud.google.com')}
            ${field('cfg-fn-url', 'Cloud Function URL', config.fnUrl, 'https://us-central1-projekt.cloudfunctions.net')}

            <h3 class="settings-divider">Mein Profil (SuperPrompt)</h3>
            <div class="hint" style="margin-bottom:12px">Diese Daten werden in Pitches und E-Mail-Vorlagen verwendet.</div>

            ${field('cfg-name', 'Mein Name', p.name, 'Muammer Kizilaslan')}
            ${field('cfg-company', 'Mein Unternehmen', p.company, 'Karriaro Webdesign')}
            ${field('cfg-role', 'Meine Rolle', p.role, 'Gründer & Webdesigner')}
            ${field('cfg-services', 'Meine Leistungen', p.services, 'Handcodierte Websites, SEO, BFSG-Compliance')}
            ${field('cfg-price', 'Preisbereich', p.priceRange, '990-1.990€ einmalig, kein Abo')}
            ${field('cfg-target', 'Meine Zielgruppe', p.targetGroup, 'Lokale Unternehmen (Handwerk, Gastronomie, Ärzte, Makler)')}
            ${field('cfg-usp', 'Mein USP', p.usp, 'Kein Baukasten, kein Template. Handcodiert, in 2 Wochen fertig.')}
            ${field('cfg-location', 'Mein Standort', p.location, 'Schwarzwald / Ortenau')}
            ${field('cfg-portfolio', 'Referenz-Projekte', p.portfolio, 'karriaro-webdesign.de, Spedition Kolbe')}
            <label>Tonalität</label>
            <select id="cfg-tone"><option value="professionell" ${p.tone==='professionell'?'selected':''}>Professionell</option><option value="freundlich" ${p.tone==='freundlich'?'selected':''}>Freundlich</option><option value="direkt" ${p.tone==='direkt'?'selected':''}>Direkt</option></select>

            <button class="btn-primary" style="margin-top:16px;width:100%" id="btn-save-settings">Speichern</button>

            <h3 class="settings-divider">Auto-Scan & Alerts</h3>
            <div class="hint" style="margin-bottom:12px">Automatische Lead-Suche in deiner Region. Ergebnisse erscheinen im CRM.</div>
            <label>Such-Queries (eine pro Zeile)</label>
            <textarea id="cfg-autoscan-queries" rows="4" style="width:100%;padding:10px;font-size:13px;font-family:var(--font);border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg);color:var(--text);resize:vertical" placeholder="Friseur Offenburg&#10;Zahnarzt Lahr&#10;Restaurant Ortenau">${(autoScan.queries || []).join('\n')}</textarea>
            <label>Mindest-Score für Alerts</label>
            <input type="number" id="cfg-autoscan-minscore" value="${autoScan.minScore || 50}" min="0" max="100">
            <label>Mitbewerber-Domains (eine pro Zeile)</label>
            <textarea id="cfg-competitor-watch" rows="2" style="width:100%;padding:10px;font-size:13px;font-family:var(--font);border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg);color:var(--text);resize:vertical" placeholder="andere-agentur.de">${(autoScan.competitorDomains || []).join('\n')}</textarea>

            <div class="settings-info">
                <div class="section-label" style="margin-top:20px">Status</div>
                <div class="metric-desc">API-Key: ${config.psiKey ? '✓ Konfiguriert' : '✗ Fehlt'}</div>
                <div class="metric-desc">Cloud Functions: ${config.fnUrl ? '✓ Konfiguriert' : '✗ Fehlt (KI-Analyse deaktiviert)'}</div>
                <div class="metric-desc">Profil: ${p.name ? '✓ ' + p.name : '✗ Nicht ausgefüllt'}</div>
                <div class="metric-desc">Auto-Scan: ${autoScan.queries?.length > 0 ? `✓ ${autoScan.queries.length} Queries konfiguriert` : '✗ Nicht konfiguriert'}</div>
            </div>
        `;
        document.getElementById('btn-save-settings').addEventListener('click', () => {
            config.psiKey = document.getElementById('cfg-psi-key').value.trim();
            config.fnUrl = document.getElementById('cfg-fn-url').value.trim().replace(/\/$/, '');
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
            saveCloudSettings();
            // Auto-Scan speichern
            const queries = document.getElementById('cfg-autoscan-queries').value.split('\n').map(q => q.trim()).filter(Boolean);
            const competitors = document.getElementById('cfg-competitor-watch').value.split('\n').map(q => q.trim()).filter(Boolean);
            const minScore = parseInt(document.getElementById('cfg-autoscan-minscore').value) || 50;
            saveAutoScanConfig({ ...loadAutoScanConfig(), queries, competitorDomains: competitors, minScore, enabled: queries.length > 0 });
            panel.classList.add('hidden');
        });
    }
}

// ── CRM ──
async function showCRM() {
    
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
                    Finde Leads die wirklich konvertieren — mit Bayesianischer Statistik,
                    Monte-Carlo-Simulation und KI-Analyse.<br><br>
                    <strong>3 Modi:</strong><br>
                    <strong>Einzel-Check</strong> — Eine URL analysieren (Score, Funnel, Pitch)<br>
                    <strong>Batch-Suche</strong> — "Friseur Köln" → 10 Leads auf einmal<br>
                    <strong>Branchen-Scanner</strong> — Welche Branche hat das meiste Potenzial?<br><br>
                    <strong>Was du bekommst:</strong><br>
                    Lead-Score · BFSG-Compliance · Signal-Stacking · KI-Branchenanalyse ·
                    Konkurrenz-Vergleich · Pitch-Vorlagen · CRM mit Pipeline<br><br>
                    <strong>Tipp:</strong> Trage zuerst unter "Einstellungen" deinen API-Key + Cloud Function URL ein.
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
export { abort };
