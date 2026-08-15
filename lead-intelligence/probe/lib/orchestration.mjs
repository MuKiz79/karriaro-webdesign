/**
 * Scanner-getreue Orchestrierung — der Teil von scanner.js, der nicht
 * importierbar ist (DOM-gebunden), hier 1:1 nachgebaut. Referenzzeilen im
 * Kommentar je Block. WICHTIG: Wir messen das IST-Verhalten der App,
 * einschließlich der bekannten Eigenheiten:
 *   · buildBuyingIntent setzt jobOpenings:null (scanner.js:485-495) — Hiring
 *     wird im Scan deshalb NIE „proven". Nicht „korrigieren"!
 *   · adIntent nach adEvidence wird VON HAND gebaut (scanner.js:340-352),
 *     nicht über detectGoogleAds(psi, ev).
 *   · Vision läuft nur für Leads, deren PASS-1-Score ≥45 war (Screenshot-
 *     Retention scanner.js:286) UND die nach Pass 2 in den Top-25 ≥45 stehen.
 *   · Peer-Multiplikator läuft NACH den 69er-Deckeln (scanner.js:416-425).
 *
 * Jeder Pass wird als Snapshot im Lead protokolliert (`passes`), damit der
 * Report jede Platzierung auf Rohfaktoren zurückführen kann — nie auf Chips.
 */
import {
    computeOpportunity, assessBuyingIntent, analyzeTechAge,
    seasonalTriggerFor, computePeerPressure, siteLooksModern
} from './app.mjs';

export function hostnameOf(url) {
    // scanner.js:513-516
    try { return new URL(url).hostname.replace(/^www\./, ''); }
    catch { return url; }
}

/** scanner.js:485-495 — inklusive jobOpenings:null (IST-Verhalten). */
export function buildBuyingIntent({ adIntent, footprint, jobIntent, place, siteEv = null }) {
    return assessBuyingIntent({
        googleAds: adIntent?.googleAds || (adIntent ? { signals: adIntent.signals || [], active: !!adIntent.active } : null),
        footprint,
        jobSignal: jobIntent,
        jobOpenings: null,
        reviewRecency: place?.reviewRecency || null,
        paidTools: siteEv?.paidTools || null,
        careSignals: siteEv?.careSignals || null
    });
}

function clamp100(v) { return Math.max(0, Math.min(100, Math.round(v))); }

function snapshot(pass, lead, opp) {
    return {
        pass,
        opportunity: lead.opportunity,
        badnessScore: opp?.badnessScore ?? lead.badnessScore,
        businessStrength: opp?.businessStrength ?? lead.businessStrength,
        hardStructural: lead.hardStructural,
        demandFactor: opp?.demandFactor ?? null,
        reachFactor: opp?.reachFactor ?? null,
        buySignal: lead.buySignal ? { ...lead.buySignal } : null,
        looksAlreadyGood: opp?.looksAlreadyGood ?? null,
        reasons: [...(lead.reasons || [])]
    };
}

/**
 * Pass 1 — scanner.js:224-286. Erwartet je Kandidat {branch, place, psi:{ws,tech,
 * adIntent,jobIntent,footprint,screenshotKept}}. Gibt Lead-Objekte zurück.
 */
export function pass1({ candidates, month }) {
    const leads = [];
    for (const cand of candidates) {
        const { branch, place, psi } = cand;
        if (!psi || psi.psiStatus === 'failed') continue;   // Silent-Drop wie scanner.js:288-291
        const { ws, tech, adIntent, jobIntent, footprint } = psi;
        const techAge = analyzeTechAge(tech, {});
        const buyingIntent = buildBuyingIntent({ adIntent, footprint, jobIntent, place });
        const opp = computeOpportunity({
            ws, tech, place, websiteUri: place.websiteUri, techAge,
            reviewRecency: place.reviewRecency, adIntent, jobIntent, buyingIntent,
            seasonal: seasonalTriggerFor(place.primaryType, month)
        });
        const lead = {
            key: `${branch.key}::${place.websiteUri}`,
            branch, place,
            domain: hostnameOf(place.websiteUri),
            websiteUri: place.websiteUri,
            name: place.displayName?.text || hostnameOf(place.websiteUri),
            rating: place.rating || null,
            reviews: place.userRatingCount || 0,
            primaryType: place.primaryType || branch.key,
            ws, tech, adIntent, jobIntent, footprint, buyingIntent,
            leadScore: opp.opportunity,
            opportunity: opp.opportunity,
            badnessScore: opp.badnessScore,
            businessStrength: opp.businessStrength,
            reasons: opp.reasons,
            looksAlreadyGood: opp.looksAlreadyGood,
            hardStructural: opp.hardStructural,
            buySignal: opp.buySignal,
            isBaukasten: !!tech.isBaukasten,
            cms: tech.cms || null,
            screenshotKept: !!psi.screenshotKept,   // = Pass-1-opp>=45, in Phase 02 entschieden
            perfKnown: typeof ws?.perf === 'number',
            passes: []
        };
        lead.passes.push(snapshot(1, lead, opp));
        leads.push(lead);
    }
    return leads;
}

/** Auswahl für adEvidence — scanner.js:315-317 (auf Pass-1-Scores). */
export function selectAdCands(leads) {
    return leads.filter(l => l.opportunity >= 35)
        .sort((a, b) => b.opportunity - a.opportunity).slice(0, 60);
}

/**
 * Pass 2 — scanner.js:321-368. `adevMap`: domain → rohe Endpoint-Antwort (oder
 * null bei Fetch-Fehler). Nur Leads mit Eintrag werden angefasst.
 */
export function pass2({ leads, adevMap, month }) {
    for (const l of leads) {
        if (!(l.domain in adevMap)) continue;
        const ev = adevMap[l.domain];
        const clean = !!(ev?.ok && !ev.blocked);
        const e = clean ? ev.adEvidence : null;
        l.adChecked = !!e;
        l.adBlocked = !!(ev?.ok && ev.blocked);
        if (!clean) { l.passes.push(snapshot(2, l, null)); continue; }

        l.siteEvidence = {
            paidTools: ev.paidTools || null,
            careSignals: ev.careSignals || null,
            contactPaths: ev.contactPaths || null
        };
        if (e && (e.googleAds?.found || e.metaPixel?.found || e.microsoftAds?.found)) {
            const sig = [];
            if (e.googleAds?.found) sig.push(e.googleAds.confidence === 'aktiv' ? 'Google Ads aktiv' : 'Google Ads konfiguriert (GTM-Container)');
            if (e.metaPixel?.found) sig.push(e.metaPixel.confidence === 'aktiv' ? 'Meta-Pixel aktiv' : 'Meta-Pixel konfiguriert (GTM-Container)');
            if (e.microsoftAds?.found) sig.push('Microsoft Ads');
            l.adIntent = { active: true, signals: sig, googleAds: { ...(l.adIntent?.googleAds || {}), signals: sig, active: true } };
            if (e.metaPixel?.found) l.footprint = { ...(l.footprint || {}), hasFbPixel: true, fbPixelSource: e.metaPixel.source };
        }
        l.buyingIntent = buildBuyingIntent({
            adIntent: l.adIntent, footprint: l.footprint, jobIntent: l.jobIntent,
            place: l.place, siteEv: l.siteEvidence
        });
        const re = computeOpportunity({
            ws: l.ws, tech: l.tech, place: l.place, websiteUri: l.websiteUri,
            techAge: analyzeTechAge(l.tech, {}), reviewRecency: l.place.reviewRecency,
            adIntent: l.adIntent, jobIntent: l.jobIntent, buyingIntent: l.buyingIntent,
            contactPaths: l.siteEvidence.contactPaths,
            seasonal: seasonalTriggerFor(l.place.primaryType, month)
        });
        l.opportunity = re.opportunity; l.leadScore = re.opportunity;
        l.badnessScore = re.badnessScore; l.reasons = re.reasons;
        l.hardStructural = re.hardStructural; l.buySignal = re.buySignal;
        l.passes.push(snapshot(2, l, re));
    }
    return leads;
}

/** Auswahl für Vision — scanner.js:375-377 (auf Pass-2-Scores). */
export function selectVisionCands(leads) {
    return leads.filter(l => l.opportunity >= 45)
        .sort((a, b) => b.opportunity - a.opportunity).slice(0, 25);
}

/**
 * Pass 3 — scanner.js:381-411. `visionMap`: domain → Vision-Antwort (nur für
 * Leads, deren Screenshot behalten wurde — Retention prüft Phase 04).
 */
export function pass3({ leads, visionMap, month }) {
    for (const l of leads) {
        const vision = visionMap[l.domain];
        if (!vision) continue;
        const modern = siteLooksModern(vision);
        if (modern === true) {
            const mod = (l.hardStructural || 0) >= 1 ? 1.0 : 0.45;
            l.opportunity = clamp100(l.opportunity * mod);
            l.leadScore = l.opportunity; l.reasons.push('Bild: modern');
            l.visionVerdict = 'modern'; l.visionMod = mod;
            l.passes.push(snapshot(3, l, null));
        } else if (modern === false) {
            const re = computeOpportunity({
                ws: l.ws, tech: l.tech, place: l.place, websiteUri: l.websiteUri,
                techAge: analyzeTechAge(l.tech, {}), reviewRecency: l.place.reviewRecency,
                adIntent: l.adIntent, jobIntent: l.jobIntent, buyingIntent: l.buyingIntent,
                contactPaths: l.siteEvidence?.contactPaths || null,
                seasonal: seasonalTriggerFor(l.place.primaryType, month), visionOutdated: true
            });
            l.opportunity = re.opportunity; l.leadScore = re.opportunity;
            l.badnessScore = re.badnessScore; l.reasons = re.reasons; l.hardStructural = re.hardStructural;
            if (!l.reasons.includes('Bild: veraltet')) l.reasons.push('Bild: veraltet');
            l.visionVerdict = 'veraltet';
            l.passes.push(snapshot(3, l, re));
        } else {
            l.visionVerdict = 'unklar';
        }
    }
    return leads;
}

/** Peer-Pressure + Sort — scanner.js:416-434. Läuft NACH allen Deckeln (IST). */
export function peerAndSort({ leads }) {
    const pressure = computePeerPressure(leads);
    for (const l of leads) {
        l.oppBeforePeer = l.opportunity;    // für Matrix d/d2 (Deckel-Prüfung VOR Peer)
        const p = pressure.get(l.domain);
        if (!p || p.mult === 1.0) continue;
        l.peerPressure = { mult: p.mult, peers: p.peers, behindOn: p.behindOn, pitch: p.pitch };
        l.opportunity = clamp100(l.opportunity * p.mult);
        l.leadScore = l.opportunity;
        if (p.chip && !l.reasons.includes(p.chip)) l.reasons.push(p.chip);
    }
    leads.sort((a, b) => b.leadScore - a.leadScore);
    return leads;
}

/** Kompletter Offline-Durchlauf über gespeicherte Phasen-Daten. */
export function scoreAll({ candidates, adevMap = {}, visionMap = {}, month }) {
    const leads = pass1({ candidates, month });
    pass2({ leads, adevMap, month });
    pass3({ leads, visionMap, month });
    return peerAndSort({ leads });
}
