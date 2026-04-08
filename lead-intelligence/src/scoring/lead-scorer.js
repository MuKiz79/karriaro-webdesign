/**
 * Lead-Scorer — Orchestriert die gesamte Scoring-Pipeline
 *
 * Nimmt ws, tech, place, competitors, footprint
 * → ruft shift-calculator
 * → baut Stages mit conjugateUpdate
 * → ruft runSimulation aus monte-carlo.js
 * → berechnet Kelly, EVOI, Survival
 * → gibt das vollstaendige Ergebnis-Objekt zurueck
 *
 * @module scoring/lead-scorer
 */

import { conjugateUpdate, betaMean, betaVariance } from '../math/beta-update.js';
import { runSimulation } from '../math/monte-carlo.js';
import { calculateKelly } from '../math/kelly.js';
import { calculateEVOI } from '../math/evoi.js';
import { estimateSurvival } from '../math/survival.js';
import { getBranchPrior, SEASONALITY, CHANNELS } from '../priors/branch-priors.js';
import { calculateShifts } from '../signals/shift-calculator.js';
import { clamp } from '../math/sampling.js';

/**
 * Schaetzt die Aktivierungsenergie (Arrhenius) fuer Markov-Rueckfallraten
 *
 * @param {Object} ws - Website-Score
 * @param {Object} tech - Tech-Detection Ergebnis
 * @param {Object|null} place - Google Places Daten
 * @returns {number} Ea (5-80)
 */
function estimateActivationEnergy(ws, tech, place) {
    let Ea = 40;
    if (ws.perf >= 70) Ea += 15;
    if (ws.isHttps && ws.viewport) Ea += 10;
    if (!place) Ea += 15;
    if (!ws.isHttps) Ea -= 20;
    if (!ws.viewport) Ea -= 15;
    if (ws.perf < 30) Ea -= 10;
    if (tech.isBaukasten) Ea -= 10;
    return Math.max(5, Math.min(80, Ea));
}

/**
 * Empfiehlt naechste Aktion basierend auf dem Bottleneck
 *
 * @param {Array} stages - Stage-Ergebnisse mit mean-Werten
 * @param {Object} ws - Website-Score
 * @param {Object} tech - Tech-Detection
 * @param {Object|null} place - Google Places
 * @returns {{action: string, state: string}}
 */
function recommendAction(stages, ws, tech, place) {
    const bn = [...stages].sort((a, b) => a.mean - b.mean)[0];
    if (bn.name === 'Oeffnung') {
        return { action: 'Betreff optimieren — Firmennamen + Euro-Zahl', state: 'Kalt' };
    }
    if (bn.name === 'Interesse') {
        if (!ws.isHttps) return { action: 'SSL-Warnung-Screenshot in die E-Mail', state: 'Kalt' };
        if (!ws.viewport) return { action: 'Mobile-Screenshot zeigen', state: 'Kalt' };
        return { action: 'Umsatzverlust-Zahl in den Betreff', state: 'Kalt' };
    }
    if (bn.name === 'Gespraech') {
        return { action: 'Kostenlosen Entwurf anbieten — senkt Hemmschwelle', state: 'Interessiert' };
    }
    if (bn.name === 'Abschluss') {
        return { action: 'ROI-Argument staerken: "Amortisiert sich in X Monaten"', state: 'Im Gespraech' };
    }
    return { action: 'E-Mail mit Problem-Report senden', state: 'Kalt' };
}

/**
 * Multi-Channel-Optimierung: Waehle den besten Kanal
 *
 * @param {string[]} channels - Verfuegbare Kanaele
 * @param {number} conversionRate - 0-1
 * @param {number} dealSize - EUR
 * @returns {{best: Object|null, all: Array}}
 */
function optimizeChannels(channels, conversionRate, dealSize) {
    const all = channels.map(ch => {
        const data = CHANNELS[ch] || CHANNELS.email;
        const effectiveRate = conversionRate * data.reachRate * data.openRate;
        const ev = effectiveRate * dealSize - data.costHours * 30;
        return { name: data.name, key: ch, effectiveRate, ev: Math.round(ev * 100) / 100, costHours: data.costHours };
    });
    all.sort((a, b) => b.ev - a.ev);
    return { best: all[0] || null, all };
}

/**
 * Hauptfunktion: Vollstaendige Lead-Bewertung
 *
 * @param {Object} ws - Website-Score
 * @param {Object} tech - Tech-Detection Ergebnis
 * @param {Object|null} place - Google Places Daten
 * @param {Array|null} competitors - Konkurrenten
 * @param {Object|null} footprint - Digital Footprint Ergebnis
 * @param {Object|null} revenue - Revenue-Model Ergebnis (optional, wird intern berechnet wenn null)
 * @param {Object|null} epidemicResult - R0-Ergebnis (optional)
 * @returns {Object} Vollstaendiges Lead-Scoring-Ergebnis
 */
export function scoreLead(ws, tech, place, competitors, footprint, revenue = null, epidemicResult = null) {
    const type = place?.primaryType || '_default';
    const branch = getBranchPrior(type);
    const seasonFactor = SEASONALITY.getCurrentFactor();

    // Shifts berechnen
    const shifts = calculateShifts(ws, tech, place, competitors, revenue, footprint);

    // Wissenschaftliche Module: Boost fuer Interesse
    let sciBoost = 0;
    if (tech.isBaukasten) sciBoost += 2;
    if (tech.version) {
        const v = parseInt(tech.version);
        if (v > 0 && v < 6) sciBoost += 3;
    }
    shifts.interest[0] += sciBoost;

    // R0 aus Epidemie-Modul
    const r0 = epidemicResult?.R0 || 1.0;

    // Stages mit Conjugate Beta Update bauen
    const stages = [
        { name: 'Erreichbarkeit', ab: conjugateUpdate(branch.r, shifts.reach[0] - shifts.reach[1]) },
        { name: 'Oeffnung',       ab: conjugateUpdate(branch.o, shifts.open[0] - shifts.open[1]) },
        { name: 'Interesse',      ab: conjugateUpdate(branch.i, shifts.interest[0] - shifts.interest[1]) },
        { name: 'Gespraech',      ab: conjugateUpdate(branch.c, shifts.convo[0] - shifts.convo[1]) },
        { name: 'Angebot',        ab: conjugateUpdate(branch.p, 0) },
        { name: 'Abschluss',      ab: conjugateUpdate(branch.cl, shifts.close[0] - shifts.close[1]) }
    ].map(s => ({ name: s.name, alpha: s.ab[0], beta: s.ab[1] }));

    // Aktivierungsenergie
    const activationEa = estimateActivationEnergy(ws, tech, place);

    // Monte-Carlo Simulation
    const simResult = runSimulation(stages, activationEa, seasonFactor, 2000);

    const conversionRate = simResult.conversionRate;
    const stageResults = simResult.stageResults;
    const bottleneck = simResult.bottleneck;

    // Elastizitaet / Drivers
    const drivers = stageResults.map(s => {
        const base = stageResults.reduce((p, st) => p * (st.mean / 100), 1);
        const boost = stageResults.reduce((p, st) => {
            return p * (st.name === s.name ? Math.min(1, st.mean / 100 * 1.10) : st.mean / 100);
        }, 1);
        const el = base > 0 ? (boost - base) / base : 0;
        return { name: s.name, pct: Math.round(el * 100), value: s.mean };
    });
    const totEl = drivers.reduce((s, d) => s + Math.abs(d.pct), 0);
    drivers.forEach(d => { d.pct = totEl > 0 ? Math.round(Math.abs(d.pct) / totEl * 100) : 17; });
    drivers.sort((a, b) => b.pct - a.pct);

    // Kelly Criterion
    const kellyResult = calculateKelly(conversionRate, branch.ds, branch.tpl, 20, r0);

    // Multi-Channel
    const channelResult = optimizeChannels(branch.ch, conversionRate, branch.ds);

    // EVOI
    const completeness = clamp(
        ([1, place ? 0.8 : 0.2, competitors && competitors.length > 2 ? 0.8 : 0.3, place ? 0.7 : 0.2, 1]
            .reduce((a, b) => a + b, 0) / 5)
    );
    const evoiResult = calculateEVOI(conversionRate, branch.ds, completeness);

    // Survival
    const survivalResult = estimateSurvival(type, simResult.leadScore);

    // Sensitivity
    const sensitivity = [];
    if (!ws.isHttps) {
        sensitivity.push({ factor: 'SSL fehlt', delta: Math.round(conversionRate * 0.3 * 1000) / 10, description: 'SSL-Warnung -> Interesse +30%' });
    }
    if (!ws.viewport) {
        sensitivity.push({ factor: 'Nicht mobilfreundlich', delta: Math.round(conversionRate * 0.2 * 1000) / 10, description: 'Viewport-Fix -> sichtbar' });
    }
    if (tech.isBaukasten) {
        sensitivity.push({ factor: tech.cms, delta: 0, description: 'Strukturelle Limitierung' });
    }
    if (bottleneck.mean < 35) {
        sensitivity.push({ factor: `Engpass: ${bottleneck.name}`, delta: 0, description: `Nur ${bottleneck.mean}%` });
    }
    if (revenue && revenue.roi > 2) {
        sensitivity.push({ factor: 'ROI-Argument', delta: 0, description: `${revenue.roi}x ROI` });
    }
    if (seasonFactor < 0.9) {
        sensitivity.push({ factor: 'Saisonalitaet', delta: 0, description: `Aktueller Monat: ${Math.round(seasonFactor * 100)}% Faktor` });
    }

    const nextAction = recommendAction(stageResults, ws, tech, place);

    // Multi-Touch-Attribution
    const multiTouch = {
        touchpoints: [
            { name: 'Erstansprache', channel: channelResult.best?.name || 'E-Mail', dayOffset: 0 },
            { name: 'Follow-Up', channel: 'E-Mail', dayOffset: 4 },
            { name: 'Social Proof', channel: 'E-Mail', dayOffset: 8 },
            { name: 'Entwurf-Angebot', channel: channelResult.best?.name || 'E-Mail', dayOffset: 12 },
            { name: 'Abschluss-Impuls', channel: 'E-Mail', dayOffset: 18 }
        ],
        cumulativeCR: [
            conversionRate * 0.4,
            conversionRate * 0.6,
            conversionRate * 0.75,
            conversionRate * 0.90,
            conversionRate
        ].map(v => Math.round(v * 1000) / 10)
    };

    return {
        leadScore: simResult.leadScore,
        probability: simResult.leadScore,
        conversionRate: simResult.conversionRatePct,
        ci: simResult.ci,
        ciLow: simResult.ci.lower,
        ciHigh: simResult.ci.upper,
        ciMargin: simResult.ciMargin,
        completeness: Math.round(completeness * 100),
        stages: stageResults,
        bottleneck,
        drivers,
        sensitivity,
        kelly: kellyResult,
        evoi: evoiResult,
        survival: survivalResult,
        channelResult,
        multiTouch,
        nextAction,
        dealSize: branch.ds,
        expectedValue: kellyResult.expectedValue,
        npvTotal: kellyResult.npvTotal,
        timePerLead: branch.tpl,
        seasonFactor: Math.round(seasonFactor * 100),
        r0: Math.round(r0 * 100) / 100,
        activationEa,
        _stages: stages,
        isLearned: false,
        N: simResult.N
    };
}
