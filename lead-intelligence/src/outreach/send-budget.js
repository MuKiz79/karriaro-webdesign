/**
 * Versand-Budget — schützt Domain-Reputation & deckelt das UWG-Risiko.
 *
 * Wer im Studio „Alle freigeben" → „Gmail-Entwürfe" klickt, könnte sonst
 * 100 Kalt-Mails auf einmal rausschicken → Spam-Markierung, Reputations-
 * Absturz (auch legitime Mails landen danach im Spam), und bei Kalt-Mail an
 * DE-Firmen UWG-§7-Abmahnrisiko. Dieses Modul empfiehlt ein TÄGLICHES Volumen
 * für individuelle B2B-Mails und wärmt eine (junge) Domain langsam hoch.
 *
 * Es SENDET nichts und blockiert nichts hart — es zählt die pro Tag erstellten
 * Entwürfe (localStorage) und liefert eine Empfehlung; das Gate im UI fragt bei
 * Überschreitung nur nach. Der Gründer entscheidet.
 *
 * Reine Rechenfunktionen (state + Tag injizierbar) → testbar; dünne
 * localStorage-Wrapper darum herum.
 * @module outreach/send-budget
 */

const KEY = 'kz_send_budget';

/**
 * Warmlauf-Rampe: tägliche Obergrenze je nach Anzahl bisheriger AKTIV-Tage
 * (Tage mit ≥1 erstelltem Entwurf). Bewusst konservativ — Kalt-/Erst-Outreach
 * verträgt deutlich weniger als transaktionale Mail. Danach Plateau.
 * Quelle: gängige Domain-Warmup-Praxis (langsam steigern, nicht Burst).
 */
const WARMUP_RAMP = [20, 25, 30, 40, 50];
const PLATEAU = 50;
const KEEP_DAYS = 45;            // alte Tageszähler kappen (Storage klein halten)

/** Lokaler Kalendertag als YYYY-MM-DD (nicht UTC → Zähler kippt zur lokalen Mitternacht). */
export function localDay(d = new Date()) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

/** Anzahl bisheriger Aktiv-Tage VOR `today` (Tage mit ≥1 Entwurf). */
function priorActiveDays(state, today) {
    const counts = state?.counts || {};
    return Object.keys(counts).filter(d => d !== today && counts[d] > 0).length;
}

/** Empfohlene Tagesobergrenze für `today` gemäß Warmlauf-Stufe. */
export function recommendedDailyCap(state, today = localDay()) {
    const stage = priorActiveDays(state, today);
    return stage >= WARMUP_RAMP.length ? PLATEAU : WARMUP_RAMP[stage];
}

/** Heute bereits erstellte Entwürfe. */
export function createdToday(state, today = localDay()) {
    return (state?.counts && state.counts[today]) || 0;
}

/** Heute noch empfohlenes Restvolumen (nie negativ). */
export function remainingToday(state, today = localDay()) {
    return Math.max(0, recommendedDailyCap(state, today) - createdToday(state, today));
}

/** Reiner Reducer: `n` erstellte Entwürfe für `today` verbuchen (+ alte Tage kappen). */
export function recordCreated(state, n, today = localDay()) {
    const counts = { ...(state?.counts || {}) };
    counts[today] = (counts[today] || 0) + Math.max(0, n | 0);
    // Älteste Tage über KEEP_DAYS hinaus entfernen.
    const days = Object.keys(counts).sort();
    while (days.length > KEEP_DAYS) delete counts[days.shift()];
    return { ...state, counts };
}

// ── localStorage-Wrapper ────────────────────────────────────────────────────

function load() {
    try { return JSON.parse(localStorage.getItem(KEY)) || { counts: {} }; }
    catch { return { counts: {} }; }
}
function save(state) {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* Quota → ignorieren */ }
}

/** Aktueller Budget-Status für die UI. */
export function budgetStatus() {
    const today = localDay();
    const state = load();
    return {
        cap: recommendedDailyCap(state, today),
        created: createdToday(state, today),
        remaining: remainingToday(state, today)
    };
}

/** `n` heute erstellte Entwürfe persistieren. */
export function noteCreated(n) {
    if (!n) return;
    save(recordCreated(load(), n));
}
