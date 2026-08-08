/**
 * Aus den Daumen lernen — Merkmale, Training, Gate, Mischung.
 *
 * Zielgroesse `y`: „den wuerde ich anrufen" (Founder-Entscheid). Kein Fit-Urteil
 * und keine Kaufprognose — Handlungsabsicht. `skip` ist eine Enthaltung.
 *
 * ─── Das Gate ist der Kern ────────────────────────────────────────────────
 * Das gelernte Modell aendert die Rangfolge NUR, wenn es die heutige Heuristik
 * in Leave-one-out-Kreuzvalidierung schlaegt (Metrik AUC — es geht um Rangfolge,
 * nicht um kalibrierte Wahrscheinlichkeiten). Unter MIN_N_FOR_MODEL wird es das
 * nicht schaffen, und dann passiert nichts. Das ist korrektes Verhalten:
 * ein Modell auf 20 Bewertungen waere geraten, nicht gelernt.
 *
 * @module learning/rating-model
 */

import { fitScaler, applyScaler, fitLogistic, predict, auc, looCv } from '../math/logistic.js';
import { getTrainingRows } from './lead-ratings.js';

/** Unter dieser Zahl wird gar nicht erst trainiert. */
export const MIN_N_FOR_MODEL = 40;
/** Beide Klassen muessen ausreichend vertreten sein, sonst lernt man die Basisrate. */
export const MIN_PER_CLASS = 8;
/** Hoechstgewicht des Modells in der Mischung — die Heuristik bleibt immer beteiligt. */
export const MAX_LAMBDA = 0.6;

/**
 * Merkmalsliste in STABILER Reihenfolge — die Matrix-Spalten haengen daran.
 * Wird sie geaendert, muss FEATURE_VERSION in lead-ratings.js hochgezaehlt werden,
 * sonst mischen sich unvergleichbare Vektoren.
 *
 * ⚠️ Jedes optionale Signal bekommt einen eigenen `*_bekannt`-Indikator. Ohne
 * diese Trennung lernt das Modell exakt den Fehler, der am 2026-08-08 an fuenf
 * Stellen repariert wurde: eine Datenluecke als Negativwert.
 */
export const FEATURE_KEYS = [
    'badness', 'staerke', 'hartStrukturell',
    'perf', 'perf_bekannt',
    'bewertungen', 'note', 'note_bekannt',
    'tageSeitBewertung', 'tageSeitBewertung_bekannt',
    'kaufsignalBewiesen', 'kaufsignalScore',
    'werkzeuge', 'werkzeuge_bekannt',
    'pflege', 'pflege_bekannt',
    'persoenlicheMail', 'kontakt_bekannt',
    'wettbewerbsdruck', 'baukasten', 'cmsTot',
    'bedarfsdruck', 'erreichbarkeit', 'branchenWert'
];

// Branchen-Stufe statt 18 One-hot-Spalten: bei n≈200 haette One-hot mehr
// Spalten als verwertbare Daten. Deckt sich mit dealFactor in opportunity.js.
const PREMIUM = new Set(['dentist', 'doctor', 'lawyer', 'real_estate_agency']);
const PROFESSIONAL = new Set(['roofing_contractor', 'plumber', 'electrician', 'moving_company',
    'physiotherapist', 'veterinary_care', 'lodging', 'hotel', 'car_dealer', 'car_repair', 'auto_repair']);
const GASTRO = new Set(['restaurant', 'cafe', 'bakery']);
const RETAIL = new Set(['hair_salon', 'beauty_salon', 'florist', 'gym']);
function branchenWert(t) {
    if (PREMIUM.has(t)) return 1.25;
    if (PROFESSIONAL.has(t)) return 1.10;
    if (GASTRO.has(t)) return 0.68;
    if (RETAIL.has(t)) return 0.82;
    return 0.90;
}

const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const bool01 = v => (v ? 1 : 0);

/**
 * Merkmalsvektor aus einem Scan-Lead. Wird beim KLICK eingefroren, nicht beim
 * Scan — `leadScore`/`badnessScore`/`buySignal` werden im Scanner bis zu dreimal
 * ueberschrieben (Ad-Evidenz, Bild-Check, Wettbewerbsdruck).
 *
 * @param {object} l  Lead-Objekt aus orchestration/scanner.js
 * @returns {Object<string, number>}
 */
export function extractFeatures(l) {
    const ws = l?.ws || {};
    const place = l?.place || {};
    const rr = place.reviewRecency || {};
    const se = l?.siteEvidence || {};

    const perf = num(ws.perf);
    const note = num(place.rating) && place.rating > 0 ? place.rating : null;
    const tage = num(rr.daysSinceLast);
    const werkzeuge = se.paidTools ? (se.paidTools.count || 0) : null;
    const pflege = se.careSignals ? (se.careSignals.caresCount || 0) : null;
    const kontakt = se.contactPaths && se.contactPaths.checked === true ? se.contactPaths : null;

    return {
        badness: num(l?.badnessScore) ?? 0,
        staerke: num(l?.businessStrength) ?? 0,
        hartStrukturell: num(l?.hardStructural) ?? 0,

        perf: perf ?? 0,
        perf_bekannt: bool01(perf !== null),

        bewertungen: num(place.userRatingCount) ?? num(l?.reviews) ?? 0,
        note: note ?? 0,
        note_bekannt: bool01(note !== null),

        tageSeitBewertung: tage ?? 0,
        tageSeitBewertung_bekannt: bool01(tage !== null),

        kaufsignalBewiesen: bool01(l?.buySignal?.proven || l?.buySignal?.adActive || l?.buySignal?.hiring),
        kaufsignalScore: num(l?.buyingIntent?.score) ?? 0,

        werkzeuge: werkzeuge ?? 0,
        werkzeuge_bekannt: bool01(werkzeuge !== null),

        pflege: pflege ?? 0,
        pflege_bekannt: bool01(pflege !== null),

        persoenlicheMail: bool01(kontakt?.hasPersonalMailto),
        kontakt_bekannt: bool01(kontakt !== null),

        wettbewerbsdruck: num(l?.peerPressure?.mult) ?? 1.0,
        baukasten: bool01(l?.isBaukasten),
        cmsTot: bool01(l?.tech?.cms && l?.cmsEolYear),

        bedarfsdruck: num(l?.demandFactor) ?? 1.0,
        erreichbarkeit: num(l?.reachFactor) ?? 1.0,
        branchenWert: branchenWert(place.primaryType || l?.primaryType)
    };
}

/** Merkmals-Objekt → Zeilenvektor in FEATURE_KEYS-Reihenfolge. */
export function toRow(features) {
    return FEATURE_KEYS.map(k => {
        const v = features?.[k];
        return typeof v === 'number' && Number.isFinite(v) ? v : 0;
    });
}

/**
 * Trainiert auf allen bewerteten Leads und prueft ehrlich, ob das Ergebnis die
 * Heuristik schlaegt.
 *
 * @returns {{status:string, n:number, nUp:number, nDown:number,
 *            aucModell:number|null, aucHeuristik:number|null, besser:boolean,
 *            lambda:number, model:object|null, scaler:object|null,
 *            gewichte:Array<{merkmal:string, gewicht:number}>, hinweis:string}}
 */
export function trainRatingModel() {
    const { rows, skipped } = getTrainingRows();
    const n = rows.length;
    const nUp = rows.filter(r => r.y === 1).length;
    const nDown = n - nUp;
    const leer = {
        status: 'zu_wenig', n, nUp, nDown, skipped,
        aucModell: null, aucHeuristik: null, besser: false, lambda: 0,
        model: null, scaler: null, gewichte: [], hinweis: ''
    };

    if (n < MIN_N_FOR_MODEL) {
        return { ...leer, hinweis: `${n} von ${MIN_N_FOR_MODEL} Bewertungen — die Rangfolge bleibt unverändert.` };
    }
    if (nUp < MIN_PER_CLASS || nDown < MIN_PER_CLASS) {
        return {
            ...leer, status: 'einseitig',
            hinweis: `Zu einseitig (${nUp}× hoch, ${nDown}× runter). Es braucht mindestens ${MIN_PER_CLASS} je Seite — sonst lernt das Modell nur, wie oft Sie zustimmen.`
        };
    }

    const X = rows.map(r => toRow(r.features));
    const y = rows.map(r => r.y);

    // Ehrliche Schaetzung: der Skalierer wird IN JEDER Falte neu gebildet.
    const { auc: aucModell } = looCv(X, y, { l2: 1.0, iterations: 1500, lr: 0.5 });

    // Vergleichsmassstab: die heutige Heuristik auf DENSELBEN Leads. `scoreAtRating`
    // ist der Wert, den der Founder beim Klick gesehen hat — der faire Gegner.
    const hScores = rows.map(r => (typeof r.score === 'number' ? r.score : 0));
    const aucHeuristik = auc(
        hScores.filter((_, i) => y[i] === 1),
        hScores.filter((_, i) => y[i] === 0)
    );

    const scaler = fitScaler(X);
    const model = fitLogistic(applyScaler(X, scaler), y, { l2: 1.0, iterations: 1500, lr: 0.5 });

    const gewichte = FEATURE_KEYS
        .map((merkmal, j) => ({ merkmal, gewicht: Math.round(model.w[j] * 1000) / 1000 }))
        .sort((a, b) => Math.abs(b.gewicht) - Math.abs(a.gewicht));

    // Marge statt blossem ">": bei n≈40 schwankt die AUC. Ein Vorsprung von unter
    // 0.03 ist Rauschen und darf die Rangfolge nicht umstellen.
    const besser = aucModell !== null && aucHeuristik !== null && aucModell > aucHeuristik + 0.03;
    const lambda = besser ? Math.min(MAX_LAMBDA, 0.2 + 0.4 * Math.min(1, (n - MIN_N_FOR_MODEL) / 160)) : 0;

    return {
        status: besser ? 'aktiv' : 'nicht_besser',
        n, nUp, nDown, skipped,
        aucModell, aucHeuristik, besser, lambda, model, scaler, gewichte,
        hinweis: besser
            ? `Aktiv: das Modell ordnet besser als die Heuristik (AUC ${aucModell.toFixed(2)} gegen ${aucHeuristik.toFixed(2)}, ${n} Bewertungen). Gewicht in der Rangfolge: ${Math.round(lambda * 100)} %.`
            : `Noch nicht besser als die Heuristik (AUC ${aucModell === null ? '—' : aucModell.toFixed(2)} gegen ${aucHeuristik === null ? '—' : aucHeuristik.toFixed(2)}, ${n} Bewertungen). Die Rangfolge bleibt unverändert.`
    };
}

/** Wahrscheinlichkeit „würde angerufen" je Lead. Ohne Modell überall null. */
export function predictLeads(leads, trained) {
    if (!trained?.model || !trained?.scaler) return new Map();
    const rows = leads.map(l => toRow(extractFeatures(l)));
    const p = predict(applyScaler(rows, trained.scaler), trained.model);
    return new Map(leads.map((l, i) => [l.domain, p[i]]));
}

/**
 * Mischung im RANG-Raum, nicht im Score-Raum: die beiden Zahlen haben
 * unterschiedliche Skalen (0–100 gegen 0–1), ein direkter Mittelwert waere
 * bedeutungslos. Ueber Raenge ist die Mischung wohldefiniert.
 *
 * Gibt eine Map domain → Mischrang zurueck (kleiner = weiter oben).
 */
export function blendRanks(leads, trained) {
    const out = new Map();
    if (!trained?.besser || !trained.lambda) return out;
    const p = predictLeads(leads, trained);
    if (!p.size) return out;

    const rangVon = (arr) => {
        const sortiert = [...arr].sort((a, b) => b.v - a.v);
        const m = new Map();
        sortiert.forEach((x, i) => m.set(x.d, i));
        return m;
    };
    const rH = rangVon(leads.map(l => ({ d: l.domain, v: l.leadScore || 0 })));
    const rM = rangVon(leads.map(l => ({ d: l.domain, v: p.get(l.domain) ?? 0 })));

    for (const l of leads) {
        const a = rH.get(l.domain) ?? 0;
        const b = rM.get(l.domain) ?? 0;
        out.set(l.domain, (1 - trained.lambda) * a + trained.lambda * b);
    }
    return out;
}
