/**
 * Lead Intelligence v2 — Entry Point
 * Initialisiert Config, Firebase Auth, Event Listeners, Router
 */

import { config, loadConfig, saveConfig } from './config.js';
import { state } from './state.js';
import { loadCloudSettings, saveCloudSettings } from './crm/settings.js';
import { checkReminders } from './crm/reminders.js';
import { SEQUENCE_STEPS } from './templates/sequences.js';
import { openStudio } from './ui/render-outreach.js';
import { loadAutoScanConfig, saveAutoScanConfig, isAutoScanDue, getNewLeads } from './crm/auto-scan.js';
import { runSingleCheck } from './orchestration/single-check.js';
import { runBatchSearch, reopenBatch } from './orchestration/batch-search.js';
import { runScanner, requestNotificationPermissionOnGesture, reopenScan } from './orchestration/scanner.js';
import { renderCRM, cleanupInboundListener } from './ui/render-crm.js';
import { renderSetupGate } from './ui/setup-gate.js';
import { showRegionRadar } from './ui/render-radar.js';
import { listSearches, getSearch, deleteSearch, relativeAge } from './crm/saved-searches.js';
import { escapeHtml } from './lib/escape-html.js';

// ── Config laden ──
loadConfig();

// ── DOM Ready ──
document.addEventListener('DOMContentLoaded', () => {
    initFinderCards();
    initButtons();
    initAuth();
    checkOnboarding();
    checkAutoScanAlerts();
    renderSetupGate();
    initSavedSearches();   // Host + delegierte Klicks + Event-Abo (einmalig)
    showView('finden');    // ruft renderSavedSearches() ueber den finden-Zweig
});

// ── Workflow-Router ──
// Eine Reise statt Tabs+Nav-Chaos: Finden → Pipeline → Outreach → Einstellungen.
const VIEW_CONTAINER = { finden: 'hero', pipeline: 'crm-view', outreach: 'outreach-view', einstellungen: 'settings-panel' };
const ALL_VIEW_IDS = ['hero', 'crm-view', 'outreach-view', 'settings-panel'];
const TRANSIENT_IDS = ['results', 'batch-results', 'error', 'loading', 'progress'];

function showView(name) {
    if (!VIEW_CONTAINER[name]) name = 'finden';
    ALL_VIEW_IDS.forEach(id => document.getElementById(id)?.classList.add('hidden'));
    // Ergebnis-/Lade-Container nur beim Verlassen von "Finden" wegblenden.
    if (name !== 'finden') TRANSIENT_IDS.forEach(id => document.getElementById(id)?.classList.add('hidden'));
    document.getElementById(VIEW_CONTAINER[name])?.classList.remove('hidden');
    document.querySelectorAll('.nav-btn[data-view]').forEach(b => b.classList.toggle('nav-active', b.dataset.view === name));
    state.view = name;
    if (name === 'finden') renderSavedSearches();   // "Zuletzt gefunden"-Liste aktuell halten
    if (name === 'pipeline') renderCRM();
    if (name === 'outreach') renderOutreachLanding();
    if (name === 'einstellungen') openSettings();
}

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

// ── Finder-Methoden-Auswahl (Klartext-Karten statt Tabs) ──
// Wechselt nur die Such-Methode innerhalb von "Finden"; blendet Ergebnisse NICHT weg.
function initFinderCards() {
    const cards = document.querySelectorAll('.finder-card');
    const inputs = {
        single: document.getElementById('input-single'),
        batch: document.getElementById('input-batch'),
        scanner: document.getElementById('input-scanner')
    };

    cards.forEach(card => {
        card.addEventListener('click', () => {
            const mode = card.dataset.tab;
            state.mode = mode;   // wird von Cmd+Enter gelesen

            cards.forEach(c => c.classList.toggle('active', c === card));
            Object.entries(inputs).forEach(([key, el]) => {
                el?.classList.toggle('hidden', key !== mode);
            });
        });
    });
}

// ── Gespeicherte Suchen ("Zuletzt gefunden") ──
// Host-Container EINMAL ans Ende von #hero haengen (nicht in TRANSIENT_IDS → wird
// beim View-Wechsel nicht geleert und ueberlebt #batch-results-Overwrites). EIN
// delegierter Klick-Handler (ueberlebt Re-Renders → kein Doppel-Bind). Re-Render bei
// jedem Speichern/Loeschen via window-Event aus crm/saved-searches.js (kein Import
// von main dort → kein Zyklus).
function initSavedSearches() {
    const hero = document.getElementById('hero');
    if (hero && !document.getElementById('saved-searches')) {
        const box = document.createElement('div');
        box.id = 'saved-searches';
        box.className = 'saved-searches hidden';
        hero.appendChild(box);
        box.addEventListener('click', onSavedClick);
    }
    window.addEventListener('kz:searches-changed', renderSavedSearches);
}

function renderSavedSearches() {
    const box = document.getElementById('saved-searches');
    if (!box) return;
    const items = listSearches();   // nur Meta (ohne payload), neueste zuerst
    if (!items.length) { box.classList.add('hidden'); box.innerHTML = ''; return; }
    box.classList.remove('hidden');
    box.innerHTML = `
        <p class="hero-eyebrow saved-eyebrow">Zuletzt gefunden</p>
        <ul class="saved-list">
            ${items.map(e => {
                const kindLabel = e.kind === 'scan' ? 'Region-Scan' : 'Stadt-Suche';
                return `
                <li class="saved-row">
                    <button class="saved-open" data-id="${escapeHtml(e.id)}">
                        <span class="saved-main">
                            <span class="saved-label">${escapeHtml(e.label || '—')}</span>
                            <span class="saved-meta">${kindLabel} · ${e.count} Lead${e.count === 1 ? '' : 's'} · ${escapeHtml(relativeAge(e.at))}</span>
                        </span>
                    </button>
                    <button class="saved-delete" data-del="${escapeHtml(e.id)}" title="Lauf löschen" aria-label="Löschen">✕</button>
                </li>`;
            }).join('')}
        </ul>`;
}

function onSavedClick(e) {
    const del = e.target.closest('[data-del]');
    if (del) { deleteSearch(del.dataset.del); renderSavedSearches(); return; }
    const open = e.target.closest('.saved-open');
    if (!open) return;
    const entry = getSearch(open.dataset.id);
    if (!entry) { renderSavedSearches(); return; }   // schema-veraltet/geloescht → still neu rendern
    // KEIN API-Call. Sicherstellen, dass #hero sichtbar ist (Finden); der Reopen-
    // Render entfernt .hidden an #batch-results und scrollt selbst hin.
    if (state.view !== 'finden') showView('finden');
    const ok = entry.kind === 'scan' ? reopenScan(entry) : reopenBatch(entry);
    if (!ok) { deleteSearch(entry.id); renderSavedSearches(); }   // korruptes Record → wegraeumen, nie crashen
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
        if (!ensureAccess()) return;
        const url = document.getElementById('url-input')?.value.trim();
        if (url) addToHistory(url.startsWith('http') ? url : 'https://' + url);
        runSingleCheck();
    });

    // Batch
    document.getElementById('btn-batch')?.addEventListener('click', () => {
        if (!ensureAccess()) return;
        requestNotificationPermissionOnGesture();
        runBatchSearch();
    });

    // Scanner
    document.getElementById('btn-scanner')?.addEventListener('click', () => {
        if (!ensureAccess()) return;
        requestNotificationPermissionOnGesture();
        runScanner();
    });


    // Regionen-Radar: welche Stadt lohnt? (live Stellen-Aktivität) → füllt das Stadt-Feld.
    document.getElementById('btn-radar')?.addEventListener('click', () => {
        if (!ensureAccess()) return;
        showRegionRadar((city) => {
            const inp = document.getElementById('scanner-city');
            if (inp) { inp.value = city; inp.focus(); }
        });
    });

    // Abort
    document.getElementById('btn-abort')?.addEventListener('click', () => abort());
    document.getElementById('btn-abort-progress')?.addEventListener('click', () => abort());

    // Enter keys
    document.getElementById('url-input')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            if (!ensureAccess()) return;
            const url = e.target.value.trim();
            if (url) addToHistory(url.startsWith('http') ? url : 'https://' + url);
            runSingleCheck();
        }
    });
    document.getElementById('batch-query')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { if (!ensureAccess()) return; runBatchSearch(); }
    });
    document.getElementById('scanner-city')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { if (!ensureAccess()) return; runScanner(); }
    });

    // Keyboard shortcut: Cmd/Ctrl+Enter anywhere → analyze current mode
    document.addEventListener('keydown', (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            e.preventDefault();
            if (!ensureAccess()) return;
            if (state.mode === 'single') runSingleCheck();
            else if (state.mode === 'batch') runBatchSearch();
            else if (state.mode === 'scanner') runScanner();
        }
    });

    // Nav buttons — Workflow-Views via data-view, Auth separat.
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (btn.dataset.view) { showView(btn.dataset.view); return; }
            if (btn.dataset.action === 'auth') toggleAuth();
        });
    });

    // URL History laden
    renderUrlHistory();
}

// ── Zugriffsschutz (Login-Gate) ──
// Internes Werkzeug: nur das Founder-Konto schaltet die Oberfläche frei.
// Das Overlay #access-gate ist per HTML default-sichtbar (kein Aufblitzen des
// Tools), wird nur für die erlaubte E-Mail entfernt.
const ALLOWED_EMAILS = ['muammer.kizilaslan@gmail.com'];
let accessGranted = false;   // nur true für das freigeschaltete Konto → Aktionen erlaubt

function renderAccessGate(stateName, user) {
    accessGranted = (stateName === 'ok');
    const gate = document.getElementById('access-gate');
    if (!gate) return;
    if (stateName === 'ok') { gate.classList.add('hidden'); gate.innerHTML = ''; return; }
    gate.classList.remove('hidden');
    if (stateName === 'error') {
        gate.innerHTML = `
            <div class="access-card">
                <p class="hero-eyebrow">Anmeldung nicht verfügbar</p>
                <h1>Bitte Seite neu laden</h1>
                <p class="access-text">Der Anmeldedienst konnte nicht geladen werden (Netzwerk/Blocker). Bitte laden Sie die Seite neu.</p>
                <button class="btn-primary" id="gate-reload">Neu laden</button>
            </div>`;
        document.getElementById('gate-reload')?.addEventListener('click', () => location.reload());
    } else if (stateName === 'login') {
        gate.innerHTML = `
            <div class="access-card">
                <p class="hero-eyebrow">Interner Bereich</p>
                <h1>Lead Intelligence</h1>
                <p class="access-text">Dieses Werkzeug ist privat. Bitte mit dem berechtigten Google-Konto anmelden.</p>
                <button class="btn-primary" id="gate-signin">Mit Google anmelden</button>
            </div>`;
        document.getElementById('gate-signin')?.addEventListener('click', signIn);
    } else if (stateName === 'denied') {
        gate.innerHTML = `
            <div class="access-card">
                <p class="hero-eyebrow">Kein Zugriff</p>
                <h1>Dieses Konto ist nicht freigeschaltet</h1>
                <p class="access-text">Angemeldet als <strong>${user?.email || ''}</strong>. Dieses Werkzeug ist einem anderen Konto vorbehalten.</p>
                <button class="btn-primary" id="gate-signout">Abmelden</button>
            </div>`;
        document.getElementById('gate-signout')?.addEventListener('click', () => window.__firebase?.fns.signOut(window.__firebase.auth));
    }
}

async function signIn() {
    if (!window.__firebase) return;
    const provider = new window.__firebase.fns.GoogleAuthProvider();
    await window.__firebase.fns.signInWithPopup(window.__firebase.auth, provider);
}

// Aktionen (Scanner/Batch/Single) nur für das freigeschaltete Konto — verhindert,
// dass ein nicht-autorisierter Besucher über Buttons/Cmd+Enter bezahlte API-Calls auslöst.
function ensureAccess() {
    if (accessGranted) return true;
    renderAccessGate(state.user ? 'denied' : 'login', state.user);
    return false;
}

// ── Auth ──
// Wartet kurz auf das (separat per gstatic-Modul gesetzte) window.__firebase,
// bevor es aufgibt — sonst bliebe das Gate bei langsamem CDN fälschlich auf 'login'.
function initAuth(retries = 25) {
    if (!window.__firebase) {
        if (retries > 0) { setTimeout(() => initAuth(retries - 1), 150); return; }
        renderAccessGate('error'); return;
    }
    window.__firebase.fns.onAuthStateChanged(window.__firebase.auth, (user) => {
        state.user = user;

        // Zugriffs-Gate ZUERST — entscheidet, ob die Oberfläche überhaupt sichtbar wird.
        if (!user) { renderAccessGate('login'); }
        else if (!ALLOWED_EMAILS.includes((user.email || '').toLowerCase())) { renderAccessGate('denied', user); }
        else { renderAccessGate('ok'); }

        const btn = document.getElementById('auth-btn');
        if (user) {
            btn.textContent = user.email.split('@')[0];
            btn.classList.add('logged-in');
            // Fix 1: Settings aus Firestore laden — danach Setup-Banner neu bewerten.
            loadCloudSettings().then(() => renderSetupGate());
            // Fix 3: Reminders prüfen
            showReminders();
        } else {
            btn.textContent = 'Anmelden';
            btn.classList.remove('logged-in');
            // Sign-Out: Firestore-Listener für Inbound-Hot-Leads abbauen,
            // sonst läuft er mit alten Credentials weiter.
            cleanupInboundListener();
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
// Wird von showView('einstellungen') aufgerufen; Sichtbarkeit steuert der Router.
function openSettings() {
    const panel = document.getElementById('settings-panel');
    {
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
            ${field('cfg-price', 'Preisbereich', p.priceRange, '1.290-3.990€ einmalig, kein Abo')}
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
            // Direkte cloudfunctions.net-URLs würden CORS brechen → auf den Same-Origin-Proxy /api normalisieren.
            const fnInput = document.getElementById('cfg-fn-url').value.trim().replace(/\/$/, '');
            config.fnUrl = (fnInput && !fnInput.includes('cloudfunctions.net')) ? fnInput : '/api';
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
            renderSetupGate();
            showView('finden');
        });
    }
}

// ── CRM ── (dünner Alias — Aufrufer wie der Auto-Scan-Banner bleiben gültig)
function showCRM() {
    showView('pipeline');
}

// ── Outreach-Studio Landing (Nav-Einstieg) ──
// Die eigentliche Auswahl passiert im CRM (Häkchen + „✉ Outreach-Studio").
// Sichtbarkeit steuert showView; hier nur der Inhalt.
function renderOutreachLanding() {
    const el = document.getElementById('outreach-view');
    el.innerHTML = `
        <div class="studio-header"><h2 class="studio-title">Outreach-Studio</h2></div>
        <div class="studio-landing card">
            <p>Wählen Sie im CRM die Leads aus (Häkchen) und klicken Sie dort auf <strong>✉ Outreach-Studio</strong>.
            Ohne Häkchen wird die aktuell gefilterte Liste übernommen.</p>
            <p class="metric-desc">Für jeden Lead entsteht ein individueller Entwurf (gemessene Mängel + Tier-Pitch; KI-Tiefe nur für Top-Leads). Versand bleibt assistiert — Sie prüfen & senden selbst.</p>
            <button class="btn-primary" id="btn-outreach-to-crm" style="margin-top:12px">Zum CRM</button>
        </div>`;
    document.getElementById('btn-outreach-to-crm')?.addEventListener('click', showCRM);
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
// Speichert Timestamp statt boolean — nach 7 Tagen wird das Modal erneut
// angezeigt. Hilft Neu-Tab-Routine-Nutzern, die das CRM neu entdecken
// (z.B. neue Settings, neue Modi).
const ONBOARDING_TTL_MS = 7 * 24 * 60 * 60 * 1000;
function checkOnboarding() {
    const raw = localStorage.getItem('karriaro_onboarded');
    const stamp = raw ? parseInt(raw, 10) : 0;
    if (stamp && Date.now() - stamp < ONBOARDING_TTL_MS) return;
    const el = document.getElementById('onboarding');
    el.classList.remove('hidden');
    el.innerHTML = `
        <div style="position:fixed;inset:0;background:rgba(22,32,44,0.45);z-index:200;display:flex;align-items:center;justify-content:center;padding:24px">
            <div style="background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:32px;max-width:500px;width:100%">
                <p class="hero-eyebrow" style="margin-bottom:8px">Willkommen</p>
                <h2 style="font-family:var(--font-display);font-size:1.6rem;font-weight:600;margin-bottom:14px;letter-spacing:-0.01em">So finden Sie lohnende Kunden</h2>
                <p style="color:var(--text);font-size:14px;line-height:1.65;margin-bottom:18px">
                    Die Reise verläuft von links nach rechts in der Navigation:
                </p>
                <p style="color:var(--muted);font-size:14px;line-height:1.7;margin-bottom:20px">
                    <strong style="color:var(--text)">Finden</strong> — eine Website prüfen, eine Stadt absuchen oder eine Region scannen.<br>
                    <strong style="color:var(--text)">Pipeline</strong> — vielversprechende Leads speichern und im Blick behalten.<br>
                    <strong style="color:var(--text)">Outreach</strong> — pro Lead einen individuellen Entwurf erzeugen und assistiert versenden.<br><br>
                    <strong style="color:var(--text)">Zuerst:</strong> Hinterlegen Sie unter „Einstellungen" Ihren PageSpeed-API-Key und die Cloud-Function-URL — sonst laufen die Analysen ins Leere.
                </p>
                <button class="btn-primary" id="btn-onboarding-close" style="width:100%">Verstanden — los geht's</button>
            </div>
        </div>
    `;
    document.getElementById('btn-onboarding-close').addEventListener('click', () => {
        localStorage.setItem('karriaro_onboarded', String(Date.now()));
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
        ${due.slice(0, 3).map(r => `<div class="stat-row"><span class="stat-label">${r.name || r.domain} — Tag ${r.touchDay}</span><span class="stat-value"><button class="crm-btn-export" data-followup-domain="${r.domain}" data-followup-day="${r.touchDay}">Folge-Entwurf</button> · seit ${r.daysSince} Tagen</span></div>`).join('')}
    `;
    // Folge-Entwurf → Studio mit passender touchNumber (Sequenz-Schritt).
    banner.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-followup-domain]');
        if (!btn) return;
        const lead = due.find(r => r.domain === btn.dataset.followupDomain);
        if (!lead) return;
        const idx = SEQUENCE_STEPS.findIndex(s => s.day === parseInt(btn.dataset.followupDay, 10));
        openStudio([lead], { touchNumber: idx >= 0 ? idx + 1 : 1 });
    });
    document.querySelector('nav').after(banner);
}

// Export for use in orchestration modules
export { abort };
