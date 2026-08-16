/**
 * Stadt-Scanner — Lead-Workspace.
 *
 * Vom Branchen-Aggregat zum konkreten Lead. Die UI ist nicht mehr "Friseure
 * sind 38% interessant", sondern "Friseur Mueller, Score 78, hier kaufen".
 *
 * Pipeline:
 *  1. searchPlaces(branche+stadt, 20) parallel fuer alle 18 Branchen.
 *     (20 = Backend-Max pro Anfrage; mehr Tiefe = auch die vernachlaessigten
 *      Seiten jenseits der prominentesten Top-Treffer, die gute Sites haben.)
 *  2. Pre-Filter: nur Places mit websiteUri, OPERATIONAL, userRatingCount>=5,
 *     keine Enterprise/Konkurrenz-Domain.
 *  3. PSI-Light pro qualifiziertem Place mit Concurrency-Limit 8.
 *  4. scoreLead() mit Light-Inputs (kein KI-Call) — der Score ist eine
 *     erste Sortierhilfe; Tiefe Analyse passiert auf Klick im Single-Check.
 *  5. Output: flache Lead-Liste mit Filter-/Sort-State im URL-Hash.
 */
import { state } from '../state.js';
import { config } from '../config.js';
import { fetchPageSpeed } from '../api/pagespeed.js';
import { searchPlaces } from '../api/places.js';
import { detectTech } from '../signals/tech-detect.js';
import { detectGoogleAds } from '../signals/google-ads.js';
import { detectJobSignals } from '../signals/job-signal.js';
import { adEvidence, jobSignals } from '../api/cloud-functions.js';
import { deriveJobOpenings } from '../signals/employer-match.js';
import { analyzeDigitalFootprint } from '../signals/digital-footprint.js';
import { extractWebsiteScore } from '../signals/website-score.js';
import { scoreLead } from '../scoring/lead-scorer.js';
import { computeOpportunity } from '../scoring/opportunity.js';
import { applyFilters, hasBuySignal, isReachable } from './lead-filters.js';
import { setRating, getAllRatings, getRatingStats } from '../learning/lead-ratings.js';
import { extractFeatures, trainRatingModel, predictLeads, blendRanks } from '../learning/rating-model.js';
import { assessBuyingIntent } from '../analysis/buying-intent.js';
import { computePeerPressure } from '../analysis/peer-pressure.js';
import { analyzeTechAge } from '../analysis/tech-age.js';
import { seasonalTriggerFor } from '../analysis/trigger-events.js';
import { siteLooksModern } from '../analysis/claim-verify.js';
import { analyzeScreenshot } from '../api/cloud-functions.js';
import { checkEnterpriseDB } from '../priors/enterprise-db.js';
import { saveLead } from '../crm/leads.js';
import { buildPitchInputs } from '../strategy/pitch-inputs.js';
import { openStudio } from '../ui/render-outreach.js';
import { showAggregateReport } from '../ui/render-aggregate.js';
import { runWithConcurrency } from '../lib/concurrency.js';
import { pickDistricts } from '../data/stadtteile.js';
import { getCachedPlaces, setCachedPlaces, countUncached, getCachedScore, setCachedScore, getCachedVision, setCachedVision, PLACES_COST_USD, deriveReviewRecency, getCachedAdEvidence, setCachedAdEvidence } from '../api/scan-cache.js';
import { getAlreadyKnown } from '../crm/known.js';
import { escapeHtml } from '../lib/escape-html.js';
import { saveSearch } from '../crm/saved-searches.js';

const BRANCHES = [
    { key: 'dentist',           q: 'Zahnarzt',          name: 'Zahnärzte' },
    { key: 'hair_salon',        q: 'Friseur',           name: 'Friseure' },
    { key: 'restaurant',        q: 'Restaurant',        name: 'Restaurants' },
    { key: 'auto_repair',       q: 'KFZ Werkstatt',     name: 'KFZ-Werkstätten' },
    { key: 'beauty_salon',      q: 'Kosmetikstudio',    name: 'Kosmetikstudios' },
    { key: 'physiotherapist',   q: 'Physiotherapie',    name: 'Physiotherapie' },
    { key: 'lawyer',            q: 'Rechtsanwalt',      name: 'Rechtsanwälte' },
    { key: 'real_estate_agency',q: 'Immobilienmakler',  name: 'Immobilienmakler' },
    { key: 'hotel',             q: 'Hotel',             name: 'Hotels' },
    { key: 'plumber',           q: 'Sanitär Heizung',   name: 'Sanitärbetriebe' },
    { key: 'electrician',       q: 'Elektriker',        name: 'Elektrobetriebe' },
    { key: 'veterinary_care',   q: 'Tierarzt',          name: 'Tierärzte' },
    { key: 'gym',               q: 'Fitnessstudio',     name: 'Fitnessstudios' },
    { key: 'moving_company',    q: 'Umzugsunternehmen', name: 'Umzugsfirmen' },
    { key: 'car_dealer',        q: 'Autohaus',          name: 'Autohäuser' },
    { key: 'bakery',            q: 'Bäckerei',          name: 'Bäckereien' },
    { key: 'florist',           q: 'Blumenladen',       name: 'Floristen' },
    { key: 'cafe',              q: 'Cafe',              name: 'Cafés' }
];
const BRANCH_BY_TYPE = Object.fromEntries(BRANCHES.map(b => [b.key, b]));

const PLACES_PER_BRANCH = 20;
const PSI_CONCURRENCY = 8;
// 8 deckt sich mit dem valueMult-0x-Gate in opportunity.js (kein Lead, der den
// Eingang passiert, wird allein an der Review-Zahl genullt); Velocity braucht ≥2 datierte Reviews.
const MIN_REVIEWS = 8;
// Tiefen-Suche: zusätzlich pro Branche in N Stadtteilen suchen (bricht den
// Prominenz-Bias). Tiefen-Stufen zentral definiert (Modal + Default leiten sich
// daraus ab). Gedrosselt gegen das Places-Rate-Limit (30/60s im Backend).
const DEPTH_TIERS = [
    { label: 'Schnell · stadtweit', districts: 0 },
    { label: 'Mittel · + 3 Stadtteile', districts: 3 },
    { label: 'Tief · + 6 Stadtteile', districts: 6 }
];
const DISTRICTS_PER_SCAN = Math.max(...DEPTH_TIERS.map(t => t.districts));
const SEARCH_CONCURRENCY = 2; // niedriger → schont das 30/60s-Backend-Limit

// searchPlaces mit Backoff-Retries gegen Rate-Limit (Tiefen-Scan feuert viele Suchen).
async function searchPlacesRetry(q, max) {
    const waits = [3000, 6000];
    for (let i = 0; ; i++) {
        try { return await searchPlaces(q, max); }
        catch {
            if (i >= waits.length) return null;
            await new Promise(r => setTimeout(r, waits[i]));
        }
    }
}

// Stadt-weite + Stadtteil-Suchen pro Branche, mit Branchen-Index (für deterministisches Dedup).
function buildQueriesFor(city, districts) {
    const out = [];
    BRANCHES.forEach((b, bi) => {
        out.push({ branch: b, bi, q: `${b.q} ${city}` });
        for (const st of districts) out.push({ branch: b, bi, q: `${b.q} ${city} ${st}` });
    });
    return out;
}

// Kosten-Bestätigung mit Tiefen-Wahl. Cache-Treffer sind gratis, neue Suchen ~0,04 $.
// Liefert das gewählte Stadtteil-Array oder null (Abbruch).
function confirmScanCost(city) {
    return new Promise(resolve => {
        const all = pickDistricts(city, DISTRICTS_PER_SCAN);
        const opts = DEPTH_TIERS.map(t => {
            const districts = all.slice(0, t.districts);
            const qs = buildQueriesFor(city, districts).map(x => x.q);
            const newN = countUncached(qs);
            return { label: t.label, districts, total: qs.length, newN, costUsd: +(newN * PLACES_COST_USD).toFixed(2) };
        });

        const el = document.createElement('div');
        el.className = 'scan-cost-overlay';
        el.innerHTML = `
            <div class="scan-cost-card">
                <p class="hero-eyebrow">Region-Scan · ${escapeHtml(city)}</p>
                <h2 class="scan-cost-title">Wie tief soll gesucht werden?</h2>
                <p class="scan-cost-sub">Jede Google-Suche kostet ~0,04 $. Bereits gecachte Gebiete sind <strong>gratis</strong>, PageSpeed ist immer kostenlos. Mehrere Läufe füllen den Cache — Wiederholungen werden günstiger.</p>
                <div class="scan-cost-opts">
                    ${opts.map((o, i) => `
                        <button class="scan-cost-opt${i === 1 ? ' recommended' : ''}" data-i="${i}">
                            <span class="sco-label">${escapeHtml(o.label)}</span>
                            <span class="sco-meta">${o.total} Suchen · ${o.newN} neu${o.newN < o.total ? ` · ${o.total - o.newN} gratis (Cache)` : ''}</span>
                            <span class="sco-cost">${o.costUsd === 0 ? 'gratis' : '≈ ' + o.costUsd.toFixed(2) + ' $'}</span>
                        </button>`).join('')}
                </div>
                <button class="scan-cost-cancel" data-cancel>Abbrechen</button>
            </div>`;
        document.body.appendChild(el);
        const close = (val) => { el.remove(); resolve(val); };
        el.querySelectorAll('.scan-cost-opt').forEach(b => b.addEventListener('click', () => close(opts[+b.dataset.i].districts)));
        el.querySelector('[data-cancel]').addEventListener('click', () => close(null));
        el.addEventListener('click', (e) => { if (e.target === el) close(null); });
    });
}

let lastResults = []; // letzte Scanner-Ausgabe — fuer Filter/Sort ohne Re-Run
let lastCity = '';

export async function runScanner() {
    const city = document.getElementById('scanner-city').value.trim();
    if (!city) return;
    if (!config.fnUrl) { showError('Scanner braucht Cloud Function URL.'); return; }

    // Kosten-Bestätigung mit Tiefen-Wahl (Cache-Treffer gratis). Abbruch → raus.
    const districts = await confirmScanCost(city);
    if (districts === null) return;

    state.aborted = false;
    document.getElementById('btn-scanner').disabled = true;
    showProgress(0, `Bitte diesen Tab offen lassen — Scan läuft...`);

    // Phase 1: Suche (Stadt + gewählte Stadtteile), Cache-first, gedrosselt.
    // Gegen bereits gespeicherte/abgelehnte Leads gefiltert; Dedup erfolgt
    // deterministisch NACH allen Suchen (race-frei), nicht im Worker.
    const queries = buildQueriesFor(city, districts);
    const known = getAlreadyKnown();
    showProgress(6, districts.length
        ? `① Suche in ${districts.length + 1} Gebieten × ${BRANCHES.length} Branchen (${queries.length} Suchen)…`
        : `① Geschäfte in allen Branchen suchen…`);

    const raw = [];
    let qDone = 0;
    await runWithConcurrency(queries, SEARCH_CONCURRENCY, async ({ branch, bi, q }) => {
        if (state.aborted) return;
        const cached = getCachedPlaces(q);
        const res = cached ? { places: cached } : await searchPlacesRetry(q, PLACES_PER_BRANCH);
        if (!cached && res?.places) {
            setCachedPlaces(q, res.places);
            // Frische Places tragen reviews[] aber noch keine abgeleitete reviewRecency →
            // hier ableiten, damit der FRISCHE Pfad identisch zum gecachten scort.
            for (const fp of res.places) { if (!fp.reviewRecency) fp.reviewRecency = deriveReviewRecency(fp.reviews); }
        }
        for (const p of (res?.places || [])) {
            if (!p.websiteUri) continue;
            if ((p.userRatingCount || 0) < MIN_REVIEWS) continue;
            if (p.businessStatus && p.businessStatus !== 'OPERATIONAL') continue;
            let host;
            try { host = new URL(p.websiteUri).hostname.replace(/^www\./, ''); } catch { continue; }
            if (known.has(host)) continue;
            const ent = checkEnterpriseDB(host);
            if (ent.isEnterprise || ent.isCompetitor) continue;
            raw.push({ branch, bi, host, place: p });
        }
        qDone++;
        showProgress(6 + Math.round((qDone / queries.length) * 22), `① Suche … ${qDone}/${queries.length} Gebiete · ${raw.length} Treffer`);
    });
    if (state.aborted) { hideProgress(); document.getElementById('btn-scanner').disabled = false; return; }

    // Deterministisches Dedup: niedrigster Branchen-Index gewinnt (stabile Zuordnung,
    // unabhängig vom Netzwerk-Race der parallelen Suchen).
    const seen = new Set();
    const candidates = [];
    for (const c of raw.sort((a, b) => a.bi - b.bi)) {
        if (seen.has(c.host)) continue;
        seen.add(c.host);
        candidates.push({ branch: c.branch, place: c.place });
    }

    if (candidates.length === 0) {
        hideProgress();
        document.getElementById('btn-scanner').disabled = false;
        renderEmpty(city);
        return;
    }

    // Phase 3: PSI-Light pro Lead, Concurrency-Limit
    showProgress(30, `③ Analyse von ${candidates.length} Geschäften (parallel)...`);
    const leads = [];
    let done = 0;
    await runWithConcurrency(candidates, PSI_CONCURRENCY, async (cand) => {
        if (state.aborted) return;
        const { branch, place } = cand;
        try {
            const domainKey = hostnameOf(place.websiteUri);
            // Score-Cache: PSI nur holen, wenn nicht gecacht (spart Zeit + Quota).
            let ws, tech, screenshot = null, adIntent = null, jobIntent = null, footprint = null;
            const cs = getCachedScore(domainKey);
            if (cs) { ws = cs.ws; tech = cs.tech; adIntent = cs.adIntent; jobIntent = cs.jobIntent || null; footprint = cs.footprint || null; }
            else {
                const psi = await fetchPageSpeed(place.websiteUri);
                ws = extractWebsiteScore(psi);
                tech = detectTech(psi);
                screenshot = psi?.lighthouseResult?.audits?.['final-screenshot']?.details?.data || null;
                // Ad-Intent GRATIS aus denselben PSI-Network-Requests (kein Extra-Call):
                // schaltet der Betrieb Google-/Meta-Anzeigen? → bewiesener Spender + Pitch-Hook.
                const ga = detectGoogleAds(psi);
                const fp = analyzeDigitalFootprint(psi);
                const signals = [...ga.signals, ...(fp.hasFbPixel ? ['Meta-Pixel (Facebook-Werbung)'] : [])];
                adIntent = { active: ga.active || fp.hasFbPixel, signals };
                adIntent.googleAds = ga;      // volle Evidenz für assessBuyingIntent
                footprint = fp;
                // Job-Signal ebenfalls gratis aus denselben PSI-Requests: stellt der
                // Betrieb ein? = Wachstum + Personalbudget = zweites Kaufsignal.
                jobIntent = detectJobSignals(psi);
                setCachedScore(domainKey, ws, tech, adIntent, jobIntent, footprint);
            }
            const techAge = analyzeTechAge(tech, {});
            const buyingIntent = buildBuyingIntent({ adIntent, footprint, jobIntent, place });
            // Transparente Vor-Bewertung (gratis): Badness × Liveness × Wert × Branche × Kaufsignal.
            const opp = computeOpportunity({ ws, tech, place, websiteUri: place.websiteUri, techAge, reviewRecency: place.reviewRecency, adIntent, jobIntent, buyingIntent, seasonal: seasonalTriggerFor(place.primaryType) });
            // conversionRate/EV aus dem Funnel-Modell für CRM-Kontinuität (nicht als Hauptscore).
            const result = scoreLead(ws, tech, place, null, null);
            leads.push({
                key: `${branch.key}::${place.websiteUri}`,
                branch,
                place,
                domain: hostnameOf(place.websiteUri),
                websiteUri: place.websiteUri,
                name: place.displayName?.text || hostnameOf(place.websiteUri),
                rating: place.rating || null,
                reviews: place.userRatingCount || 0,
                address: place.formattedAddress || null,
                primaryType: place.primaryType || branch.key,
                ws,
                tech,
                leadScore: opp.opportunity,            // Hauptscore = Opportunity (Founder-facing)
                opportunity: opp.opportunity,
                badnessScore: opp.badnessScore,
                businessStrength: opp.businessStrength,
                reasons: opp.reasons,
                looksAlreadyGood: opp.looksAlreadyGood,
                hardStructural: opp.hardStructural,
                scoreCap: opp.scoreCap,                // 69er-Deckel — gilt auch nach Peer (F13)
                adIntent,                              // {active, signals, googleAds} — Pitch-Hook + Recompute
                jobIntent,                             // {isHiring, signals} — zweites Kaufsignal
                footprint,                             // für Recompute der Kaufsignal-Achse
                buyingIntent,                          // volle Evidenz-Summe (11+ Signale) — UI + Pitch
                buySignal: opp.buySignal,              // {adActive, hiring, proven, tier, mult} — Filter/Sortierung
                conversionRate: result.conversionRate || 0,
                expectedValue: result.expectedValue || 0,
                isBaukasten: !!tech.isBaukasten,
                cms: tech.cms || null,
                version: tech.version || null,
                // Screenshot nur für aussichtsreiche Treffer halten (Stufe-2-Vision, Speicher-schonend).
                _screenshot: opp.opportunity >= 45 ? screenshot : null
            });
        } catch (err) {
            // Schweigend ignorieren — vermutlich PSI-Quota oder unreachable Site.
            // Nicht in der Liste, kein Score.
        }
        done++;
        const pct = 30 + Math.round((done / candidates.length) * 65);
        showProgress(pct, `③ ${done}/${candidates.length} analysiert...`);
    });

    // Stufe 2a: statischer Werbe-Nachweis für die Top-N.
    // Die PSI-Ad-Erkennung ist auf deutschen Seiten blind (empirisch 0/5 echte
    // Werbetreibende), weil Ad-Tags im GTM-Container liegen und erst nach dem
    // Cookie-Banner feuern. Der adEvidence-Endpoint liest Quelltext + Container
    // statisch. Bewusst NUR für aussichtsreiche Treffer: pro Lead ein HTML- plus
    // bis zu drei Container-Fetches — der teuerste Schritt im Scanner.
    // Läuft VOR dem Bild-Check, damit dessen Neuberechnung das aktualisierte
    // adIntent mitnimmt (sonst ginge die Vision-Dämpfung verloren).
    if (!state.aborted) {
        // 60 statt 15: das Kaufsignal entscheidet ueber die Rangfolge, also darf es
        // nicht fuer 95% der Treffer ungeprueft als "nicht vorhanden" gelten. Die
        // Schwelle faellt von 45 auf 35, weil ein gefundener Werbetreibender genau
        // dort nach oben springt, wo er vorher unsichtbar blieb. Server-Limit 240/h,
        // Ergebnisse 7 Tage client- und 168 h serverseitig gecacht.
        // Der Aufruf liefert seit 2026-07-26 VIER Signalklassen aus derselben
        // Seiten-Abholung: Werbe-Tags, bezahlte Werkzeuge, Pflegezustand und
        // Kontaktwege. Deshalb auch Leads einbeziehen, deren Werbung schon
        // erkannt ist — deren Erreichbarkeit kennen wir sonst nie.
        const AD_EVIDENCE_TOP_N = 60;
        const adCands = leads.filter(l => l.opportunity >= 35)
            .sort((a, b) => b.opportunity - a.opportunity).slice(0, AD_EVIDENCE_TOP_N);
        if (adCands.length) {
            // 2026-08-15/16 (F14, Verifikations-Befund f): Die echte Stellenzahl
            // lief bisher NUR im Einzel-Check — im Scan war jobOpenings fest null,
            // Hiring zählte damit nie als bewiesener Käufer (hiring_page 10 statt
            // hiring 26; kontrafaktisch bis zu +32 Score entgangen). Jetzt EINE
            // Jobsuche je Branche×Stadt (nicht je Betrieb): die Jobsuche-v6 kennt
            // keine Arbeitgeber-Direktsuche mehr, die Zuordnung macht
            // deriveJobOpenings über die firma-Liste. ≤18 Calls je Scan hält das
            // 90/h-Limit auch für zwei Städte; retries 0, damit ein Fehlversuch
            // das Budget nicht doppelt kostet — Ausfall heißt nur: Signal heute
            // ungeprüft, nie eine erfundene Zahl.
            const jobBranchKeys = [...new Set(adCands.map(l => l.branch.key))];
            const jobsByBranch = new Map();
            await runWithConcurrency(jobBranchKeys, 2, async (bk) => {
                if (state.aborted) return;
                const b = BRANCH_BY_TYPE[bk];
                const r = await jobSignals({ was: b?.q || bk, wo: city, size: 100, retries: 0 }).catch(() => null);
                if (r?.ok) jobsByBranch.set(bk, r);
            });

            let aDone = 0;
            await runWithConcurrency(adCands, 3, async (l) => {
                if (state.aborted) return;
                let ev = getCachedAdEvidence(l.domain);
                if (!ev) {
                    ev = await adEvidence({ url: l.websiteUri }).catch(() => null);
                    if (ev?.ok) setCachedAdEvidence(l.domain, ev);
                }
                const clean = !!(ev?.ok && !ev.blocked);
                const e = clean ? ev.adEvidence : null;
                // Ehrlichkeits-Flag: "geprueft und nichts gefunden" ist etwas anderes
                // als "nie geprueft". Nur ein sauberer Scan (kein WAF-Block) zaehlt.
                l.adChecked = !!e;
                l.adBlocked = !!(ev?.ok && ev.blocked);
                // Ketten-Schutz + Namens-Matching übernimmt deriveJobOpenings —
                // dieselbe Ableitung wie im Einzel-Check (employer-match.js).
                const { openings } = deriveJobOpenings(jobsByBranch.get(l.branch.key) || null, l.name, city);
                l.jobOpenings = openings > 0 ? openings : null;
                // Ein WAF-Block stoppt die Neuberechnung nur, wenn auch das
                // Job-Signal leer ist — offene Stellen sind vom Block unabhängig.
                if (!clean && !l.jobOpenings) { aDone++; showProgress(95, `④ Seiten-Check ${aDone}/${adCands.length}…`); return; }

                if (clean) {
                    l.siteEvidence = {
                        paidTools: ev.paidTools || null,
                        careSignals: ev.careSignals || null,
                        contactPaths: ev.contactPaths || null
                    };
                    // F15 (2026-08-16): CMS-Version aus dem Quelltext (Generator-
                    // Meta / wp-includes-?ver) — NUR Lücken füllen, die PSI-
                    // Erkennung hat Vorrang. Erst mit Version trägt das EOL-Signal
                    // (hartes Strukturzeichen) im Scan überhaupt.
                    const tv = ev.techVersion;
                    if (tv?.version && !l.tech.version && (!l.tech.cms || l.tech.cms === tv.cms)) {
                        l.tech = { ...l.tech, cms: l.tech.cms || tv.cms, version: tv.version };
                        l.cms = l.tech.cms; l.version = l.tech.version;
                    }
                    if (e && (e.googleAds?.found || e.metaPixel?.found || e.microsoftAds?.found)) {
                        const sig = [];
                        if (e.googleAds?.found) sig.push(e.googleAds.confidence === 'aktiv' ? 'Google Ads aktiv' : 'Google Ads konfiguriert (GTM-Container)');
                        if (e.metaPixel?.found) sig.push(e.metaPixel.confidence === 'aktiv' ? 'Meta-Pixel aktiv' : 'Meta-Pixel konfiguriert (GTM-Container)');
                        if (e.microsoftAds?.found) sig.push('Microsoft Ads');
                        // googleAds-Form beibehalten, damit assessBuyingIntent dieselbe
                        // Evidenz liest wie beim ersten Durchlauf.
                        l.adIntent = { active: true, signals: sig, googleAds: { ...(l.adIntent?.googleAds || {}), signals: sig, active: true } };
                        if (e.metaPixel?.found) l.footprint = { ...(l.footprint || {}), hasFbPixel: true, fbPixelSource: e.metaPixel.source };
                    }
                }
                // IMMER neu rechnen — auch ohne Werbefund tragen Werkzeuge,
                // Pflegezustand, Kontaktwege und Stellenzahl jetzt zum Score bei.
                l.buyingIntent = buildBuyingIntent({
                    adIntent: l.adIntent, footprint: l.footprint, jobIntent: l.jobIntent,
                    place: l.place, siteEv: l.siteEvidence || null, jobOpenings: l.jobOpenings
                });
                const re = computeOpportunity({
                    ws: l.ws, tech: l.tech, place: l.place, websiteUri: l.websiteUri,
                    techAge: analyzeTechAge(l.tech, {}), reviewRecency: l.place.reviewRecency,
                    adIntent: l.adIntent, jobIntent: l.jobIntent, buyingIntent: l.buyingIntent,
                    contactPaths: l.siteEvidence?.contactPaths || null,
                    seasonal: seasonalTriggerFor(l.place.primaryType)
                });
                l.opportunity = re.opportunity; l.leadScore = re.opportunity;
                l.badnessScore = re.badnessScore; l.reasons = re.reasons;
                l.hardStructural = re.hardStructural; l.buySignal = re.buySignal;
                l.scoreCap = re.scoreCap;
                aDone++;
                showProgress(95 + Math.round((aDone / adCands.length) * 1), `④ Seiten-Check ${aDone}/${adCands.length}…`);
            });
        }
    }

    // Stufe 2: günstige Vision-Verfeinerung der Top-N (aus dem schon vorhandenen
    // PSI-Screenshot) — fängt "modern aber langsam" ab, bevor du teuer reingehst.
    if (!state.aborted) {
        const VISION_TOP_N = 25;
        const visionCands = leads.filter(l => l.opportunity >= 45)
            .sort((a, b) => b.opportunity - a.opportunity).slice(0, VISION_TOP_N);
        if (visionCands.length && config.fnUrl) {
            let vDone = 0;
            await runWithConcurrency(visionCands, 3, async (l) => {
                if (state.aborted) return;
                let vision = getCachedVision(l.domain);
                if (!vision && l._screenshot) {
                    vision = await analyzeScreenshot(l._screenshot).catch(() => null);
                    if (vision) setCachedVision(l.domain, vision);
                }
                if (vision) {
                    const modern = siteLooksModern(vision);
                    if (modern === true) {
                        // Softened (F0): eine Lead mit hartem Strukturzeichen (Baukasten/EOL/
                        // no-mobile/no-SSL) hat einen echten Relaunch-Fall, den ein modernes
                        // AUSSEHEN nicht löscht (SEO/Perf/Scaling-Decke bleibt) → ×1.0, nur nicht
                        // mehr „veraltet". Eine Lead, deren Badness NUR Perf/Visuelles war, hat
                        // nichts mehr zu verkaufen, sobald sie modern wirkt → ×0.45.
                        const mod = (l.hardStructural || 0) >= 1 ? 1.0 : 0.45;
                        l.opportunity = Math.max(0, Math.min(100, Math.round(l.opportunity * mod)));
                        l.leadScore = l.opportunity; l.reasons.push('Bild: modern');
                    } else if (modern === false) {
                        // Veraltet = harter Relaunch-Trigger → mit visionOutdated:true neu rechnen
                        // (zählt zu hardStructural, Konvergenz-Schranke greift sauber statt blind ×1.15).
                        const re = computeOpportunity({ ws: l.ws, tech: l.tech, place: l.place, websiteUri: l.websiteUri, techAge: analyzeTechAge(l.tech, {}), reviewRecency: l.place.reviewRecency, adIntent: l.adIntent, jobIntent: l.jobIntent, buyingIntent: l.buyingIntent, contactPaths: l.siteEvidence?.contactPaths || null, seasonal: seasonalTriggerFor(l.place.primaryType), visionOutdated: true });
                        l.opportunity = re.opportunity; l.leadScore = re.opportunity;
                        l.badnessScore = re.badnessScore; l.reasons = re.reasons; l.hardStructural = re.hardStructural;
                        l.scoreCap = re.scoreCap;
                        if (!l.reasons.includes('Bild: veraltet')) l.reasons.push('Bild: veraltet');
                    }
                }
                vDone++;
                showProgress(96 + Math.round((vDone / visionCands.length) * 3), `④ Bild-Check Top ${vDone}/${visionCands.length}…`);
            });
        }
    }
    // Stufe 3: Wettbewerbsdruck — der einzige Schritt ohne jeden API-Call.
    // Bewusst GANZ AM ENDE: alle Recomputes (Werbe-Evidenz, Bild-Check) sind
    // durch, sonst würde der Aufschlag von einer späteren Neuberechnung
    // stillschweigend überschrieben.
    if (!state.aborted && leads.length) {
        const pressure = computePeerPressure(leads);
        for (const l of leads) {
            const p = pressure.get(l.domain);
            if (!p || p.mult === 1.0) continue;
            l.peerPressure = p;
            l.opportunity = Math.max(0, Math.min(100, Math.round(l.opportunity * p.mult)));
            // 2026-08-15 (Verifikations-Befund d2): Der Aufschlag lief NACH den
            // 69er-Deckeln und hob gedeckelte Leads auf 75 — in Karlsruhe standen
            // SECHS der Top-10 nur dadurch über der HOT-Schwelle. Wettbewerbsdruck
            // ist ein Verstärker, kein Ersatz für ein hartes Strukturzeichen →
            // die Invariante gilt auch hier. (Alte gespeicherte Scans ohne
            // scoreCap-Feld bleiben unverändert — null deckelt nicht.)
            if (l.scoreCap) l.opportunity = Math.min(l.opportunity, l.scoreCap);
            l.leadScore = l.opportunity;
            if (p.chip && !l.reasons.includes(p.chip)) l.reasons.push(p.chip);
        }
    }

    for (const l of leads) delete l._screenshot; // Speicher freigeben

    hideProgress();
    document.getElementById('btn-scanner').disabled = false;
    if (state.aborted) return;

    leads.sort((a, b) => b.leadScore - a.leadScore);
    lastResults = leads;
    refreshRatingModel(leads);   // gelernte Achse vor dem ersten Rendern bereitstellen
    lastCity = city;
    // Ergebnis persistieren (Reopen ohne API). _screenshot ist hier schon geloescht.
    // Schwere place-Felder (Review-Texte/Fotos vom FRISCHEN Pfad) fuer die Persistenz
    // strippen — Anzeige/Studio/saveLead brauchen sie nicht (sie lesen place.rating/
    // userRatingCount/primaryType/reviewRecency/...), spart ~10× Speicher pro Lauf.
    // Die LIVE-leads bleiben unangetastet. Speichern darf den Lauf NIE blockieren.
    if (leads.length) {
        try {
            const slim = leads.map(l => l.place
                ? { ...l, place: { ...l.place, reviews: undefined, photos: undefined } }
                : l);
            saveSearch({ kind: 'scan', label: city, city, payload: slim });
        } catch { /* Persistenz darf den Scan nie abbrechen */ }
    }
    persistFilters({}); // setze URL-Hash auf default
    renderLeadWorkspace(city, leads, getActiveFilters());

    notifyDone(`Scan fertig: ${leads.length} Leads gefunden, ${leads.filter(l => l.leadScore >= 60).length} mit Score ≥60`);
}

/**
 * Oeffnet einen gespeicherten Region-Scan WIEDER — ohne Places/PSI-Call.
 * Setzt die modul-privaten lastResults/lastCity und rendert den Workspace neu;
 * dadurch sind Filter, "📨 Beste → Outreach-Studio" und "Tiefe Analyse" identisch
 * verdrahtet wie nach einem frischen Lauf (bindWorkspaceEvents laeuft im Render).
 * @param {{label?:string, city?:string, payload:Array}} entry  Record aus saved-searches
 * @returns {boolean} ob geoeffnet wurde
 */
export function reopenScan(entry) {
    if (!entry || !Array.isArray(entry.payload)) return false;
    lastResults = entry.payload;
    refreshRatingModel(lastResults);
    lastCity = entry.city || entry.label || '';
    persistFilters({});                       // URL-Hash auf default → frischer Filterzustand
    renderLeadWorkspace(lastCity, lastResults, getActiveFilters());
    return true;
}

// runWithConcurrency lebt jetzt in lib/concurrency.js und wird von batch-search.js mitgenutzt.

/**
 * Kaufsignal-Achse für einen Scan-Lead — dieselbe Evidenz-Summe, die bisher
 * nur nach dem Klick auf „Tiefe Analyse" lief.
 *
 * Nutzt ausschließlich Daten, die im Scan ohnehin vorliegen (PSI-Footprint,
 * Ad-Erkennung, Job-Signal, Bewertungs-Frische) plus die optionale Seiten-
 * Evidenz aus dem adEvidence-Endpoint. KEIN zusätzlicher Netz-Zugriff.
 */
function buildBuyingIntent({ adIntent, footprint, jobIntent, place, siteEv = null, jobOpenings = null }) {
    return assessBuyingIntent({
        googleAds: adIntent?.googleAds || (adIntent ? { signals: adIntent.signals || [], active: !!adIntent.active } : null),
        footprint,
        jobSignal: jobIntent,
        // 2026-08-15 (F14): echte Stellenzahl kommt seit dem Seiten-Check-Pass
        // auch im Scan an (Top-60, deriveJobOpenings). Pass 1 hat sie noch nicht
        // → null = „ungeprüft", nie eine erfundene Zahl.
        jobOpenings,
        reviewRecency: place?.reviewRecency || null,
        paidTools: siteEv?.paidTools || null,
        careSignals: siteEv?.careSignals || null
    });
}

// Trainingsstand der Bewertungs-Achse. Wird nach jedem Klick neu gerechnet
// (bei n<=300 sind das Millisekunden) und speist Sortierung + Kopfzeile.
let trained = null;
let uncertainty = new Map();

function refreshRatingModel(leads) {
    try {
        trained = trainRatingModel();
        const p = predictLeads(leads || [], trained);
        uncertainty = new Map([...p].map(([d, v]) => [d, Math.abs(v - 0.5)]));
    } catch (e) {
        console.warn('Bewertungs-Modell konnte nicht trainiert werden:', e?.message || e);
        trained = null; uncertainty = new Map();
    }
}

function hostnameOf(url) {
    try { return new URL(url).hostname.replace(/^www\./, ''); }
    catch { return url; }
}

// ─────────── Filter / Sort State (URL-Hash) ───────────

function getActiveFilters() {
    const h = new URLSearchParams(location.hash.replace(/^#/, ''));
    return {
        minScore: parseInt(h.get('min') || '0', 10),
        branch:   h.get('branch') || 'all',
        sort:     h.get('sort') || 'score',
        baukasten: h.get('baukasten') === '1',
        // Kaufsignal-Filter: nur Betriebe, die nachweislich Geld fuer Kundengewinnung
        // ausgeben (Anzeigen) oder wachsen (stellen ein). Das ist die Achse, die
        // ueber „will der Inhaber erneuern?" entscheidet — vorher war sie zwar
        // berechnet, aber weder filter- noch sortierbar (bei 281 Treffern unauffindbar).
        buy:      h.get('buy') === '1',
        // Erreichbarkeit: blendet aus, was NACHWEISLICH keinen Kontaktweg hat.
        // Ungeprüfte Leads bleiben sichtbar (siehe isReachable).
        reach:    h.get('reach') === '1',
        // Nur noch nicht bewertete zeigen — der schnellste Weg zu Menge.
        unrated:  h.get('unrated') === '1'
    };
}

function persistFilters(updates) {
    const current = getActiveFilters();
    const next = { ...current, ...updates };
    const h = new URLSearchParams();
    if (next.minScore > 0) h.set('min', String(next.minScore));
    if (next.branch && next.branch !== 'all') h.set('branch', next.branch);
    if (next.sort && next.sort !== 'score') h.set('sort', next.sort);
    if (next.baukasten) h.set('baukasten', '1');
    if (next.buy) h.set('buy', '1');
    if (next.reach) h.set('reach', '1');
    if (next.unrated) h.set('unrated', '1');
    const str = h.toString();
    location.hash = str ? '#' + str : '';
}

// ─────────── Render ───────────

function renderLeadWorkspace(city, leads, filters) {
    // Bewertung und Modell-Unsicherheit AUF das Lead hydrieren, bevor gefiltert
    // wird. So bleibt orchestration/lead-filters.js pure und DOM-/Store-frei —
    // die dortigen Tests gelten unveraendert.
    const ratings = getAllRatings();
    for (const l of leads) {
        l.urteil = ratings[l.domain]?.rating || null;   // NICHT `rating` — das ist die Google-Note
        l.uncertainty = uncertainty.get(l.domain) ?? null;
    }
    // Gelernte Rangfolge einmischen — NUR wenn das Gate sie freigegeben hat.
    // Gemischt wird im Rang-Raum: Score (0–100) und Wahrscheinlichkeit (0–1)
    // haben unterschiedliche Skalen, ein direkter Mittelwert waere bedeutungslos.
    // ⚠️ NUR die Standard-Sortierung ersetzen. Waehlt der Founder ausdruecklich
    // „A–Z" oder „Kaufsignal zuerst", darf das Modell ihm nicht dazwischenfunken.
    const misch = (!filters.sort || filters.sort === 'score') ? blendRanks(leads, trained) : new Map();
    const filtered = misch.size
        ? applyFilters(leads, filters).sort((a, b) => (misch.get(a.domain) ?? 0) - (misch.get(b.domain) ?? 0))
        : applyFilters(leads, filters);
    const total = leads.length;
    const hot = leads.filter(l => l.leadScore >= 70).length;
    const warm = leads.filter(l => l.leadScore >= 50 && l.leadScore < 70).length;
    const cold = leads.length - hot - warm;
    const buyers = leads.filter(hasBuySignal).length;
    const unreachable = leads.filter(l => !isReachable(l)).length;
    const unbewertet = leads.filter(l => !l.urteil).length;

    // Branchen-Filter-Liste — nur die Branchen, die echte Leads haben
    const branchCounts = {};
    for (const l of leads) branchCounts[l.branch.key] = (branchCounts[l.branch.key] || 0) + 1;
    const branchOptions = BRANCHES.filter(b => branchCounts[b.key] > 0)
        .sort((a, b) => branchCounts[b.key] - branchCounts[a.key]);

    let html = `
        <div class="ws-header">
            <div class="ws-title">
                <h2>Leads in ${escapeHtml(city)}</h2>
                <div class="ws-stats">
                    <span><strong>${filtered.length}</strong> ${filtered.length === total ? 'Treffer' : 'gefiltert von ' + total}</span>
                    <span class="ws-stat-hot">🔥 ${hot} hot</span>
                    <span class="ws-stat-warm">⚠ ${warm} warm</span>
                    <span class="ws-stat-cold">○ ${cold} cold</span>
                    <span class="ws-stat-rate" id="ws-rate-stat" title="Ihre Bewertungen — Grundlage des Lernens">${ratingHeaderText()}</span>
                    <span class="ws-stat-buy" title="Betriebe, die nachweislich Geld für Kundengewinnung ausgeben oder einstellen">💸 ${buyers} mit Kaufsignal</span>
                </div>
            </div>
            <button class="ws-aggregate-btn" data-action="aggregate" title="Voranalyse: welche Branchen in dieser Stadt am meisten werbende, schwache, erreichbare Betriebe haben">🎯 Voranalyse</button>
            <button class="ws-studio-btn" data-action="open-studio" title="Die besten sichtbaren Leads (Score ≥ 50) ins Outreach-Studio übernehmen — je ein personalisierter Pitch + Mockup">📨 Beste → Outreach-Studio</button>
        </div>

        <div class="ws-toolbar">
            <div class="ws-pills" data-pill-group="minScore">
                <button class="ws-pill${filters.minScore === 0 ? ' active' : ''}" data-min="0">Alle Scores</button>
                <button class="ws-pill${filters.minScore === 50 ? ' active' : ''}" data-min="50">≥ 50</button>
                <button class="ws-pill${filters.minScore === 60 ? ' active' : ''}" data-min="60">≥ 60</button>
                <button class="ws-pill${filters.minScore === 70 ? ' active' : ''}" data-min="70">≥ 70 (hot)</button>
            </div>
            <div class="ws-pills" data-pill-group="baukasten">
                <button class="ws-pill${filters.baukasten ? ' active' : ''}" data-baukasten="${filters.baukasten ? '0' : '1'}">${filters.baukasten ? '✓ ' : ''}Baukasten-only</button>
            </div>
            <div class="ws-pills" data-pill-group="unrated">
                <button class="ws-pill${filters.unrated ? ' active' : ''}" data-unrated="${filters.unrated ? '0' : '1'}" title="Nur Betriebe, die Sie noch nicht bewertet haben">${filters.unrated ? '✓ ' : ''}unbewertet (${unbewertet})</button>
            </div>
            <div class="ws-pills" data-pill-group="reach">
                <button class="ws-pill${filters.reach ? ' active' : ''}" data-reach="${filters.reach ? '0' : '1'}" title="Blendet Betriebe aus, bei denen die Prüfung keinen Kontaktweg gefunden hat (ungeprüfte bleiben sichtbar)">${filters.reach ? '✓ ' : ''}✉ erreichbar${unreachable ? ` (−${unreachable})` : ''}</button>
            </div>
            <div class="ws-pills" data-pill-group="buy">
                <button class="ws-pill${filters.buy ? ' active' : ''}" data-buy="${filters.buy ? '0' : '1'}" title="Nur Betriebe mit bewiesenem Kaufsignal — schaltet Anzeigen oder stellt ein">${filters.buy ? '✓ ' : ''}💸 nur Kaufsignal (${buyers})</button>
            </div>
            <div class="ws-select-wrap">
                <select class="ws-select" data-action="branch">
                    <option value="all"${filters.branch === 'all' ? ' selected' : ''}>Alle Branchen (${total})</option>
                    ${branchOptions.map(b => `<option value="${b.key}"${filters.branch === b.key ? ' selected' : ''}>${escapeHtml(b.name)} (${branchCounts[b.key]})</option>`).join('')}
                </select>
                <select class="ws-select" data-action="sort">
                    <option value="score"${filters.sort === 'score' ? ' selected' : ''}>Sort: Score ↓</option>
                    <option value="buy"${filters.sort === 'buy' ? ' selected' : ''}>Sort: Kaufsignal zuerst</option>
                    <option value="uncertain"${filters.sort === 'uncertain' ? ' selected' : ''}${trained?.besser ? '' : ' disabled'}>Sort: am unsichersten (lehrreichste)</option>
                    <option value="reviews"${filters.sort === 'reviews' ? ' selected' : ''}>Sort: Reviews ↓</option>
                    <option value="perf"${filters.sort === 'perf' ? ' selected' : ''}>Sort: Performance ↑</option>
                    <option value="name"${filters.sort === 'name' ? ' selected' : ''}>Sort: A-Z</option>
                </select>
            </div>
        </div>

        <div class="ws-list">
            ${filtered.length === 0
                ? `<div class="ws-empty">Mit den aktuellen Filtern keine Leads. <button class="ws-link" data-action="reset-filters">Filter zurücksetzen</button></div>`
                : filtered.map(renderLeadCard).join('')}
        </div>
    `;

    const el = document.getElementById('batch-results');
    const warVerborgen = el.classList.contains('hidden');
    el.innerHTML = html;
    el.classList.remove('hidden');
    // Nur beim ERSTEN Aufbau nach oben springen. Bei jedem Filterklick zu
    // scrollen riss den Founder aus der Liste — und beim Bewerten waere es
    // unbenutzbar (auch wenn der Bewertungsklick selbst nicht neu rendert).
    if (warVerborgen) el.scrollIntoView({ behavior: 'smooth', block: 'start' });

    bindWorkspaceEvents(el);
}

/**
 * Ein Satz über den Lernstand — bewusst in der Kopfzeile und nicht versteckt:
 * der Founder muss jederzeit sehen, ob das Modell die Rangfolge gerade
 * mitbestimmt oder ob die reine Heuristik sortiert.
 */
function ratingHeaderText() {
    const st = getRatingStats();
    if (!st.total) return '👍 noch keine Bewertung';
    const kern = `👍 ${st.up} · 👎 ${st.down}${st.skip ? ` · 🤷 ${st.skip}` : ''}`;
    if (trained?.besser) return `${kern} — Modell aktiv (${Math.round(trained.lambda * 100)} %)`;
    if (trained?.status === 'einseitig') return `${kern} — zu einseitig zum Lernen`;
    return `${kern} — ${Math.max(0, 40 - st.trainierbar)} bis zum Lernstart`;
}

function updateRatingHeader(el) {
    const n = el.querySelector('#ws-rate-stat');
    if (n) n.textContent = ratingHeaderText();
}

function renderEmpty(city) {
    const el = document.getElementById('batch-results');
    el.innerHTML = `
        <div class="ws-empty-block">
            <h2>Keine Leads in ${escapeHtml(city)} gefunden</h2>
            <p>Möglich: keine Geschäfte mit Website + ≥${MIN_REVIEWS} Bewertungen + nicht-Enterprise.</p>
            <p>Versuchen Sie eine andere Stadt oder eine größere Stadt im Umland.</p>
        </div>`;
    el.classList.remove('hidden');
}

function renderLeadCard(l) {
    const scoreClass = l.leadScore >= 70 ? 'hot' : l.leadScore >= 50 ? 'warm' : 'cold';
    // Begründungs-Chips: zeigen transparent, WARUM der Lead so bewertet ist.
    // "Bild: modern" ist der Grund fürs Abwerten → gedämpft markiert.
    const reasons = (l.reasons || []).map(r => {
        const muted = /Bild: modern/i.test(r) ? ' ws-chip-muted' : '';
        return `<span class="ws-lead-tech${muted}">${escapeHtml(r)}</span>`;
    }).join(' ');

    return `
        <div class="ws-lead ws-lead-${scoreClass}" data-key="${escapeHtml(l.key)}" data-url="${escapeHtml(l.websiteUri)}">
            <div class="ws-lead-score">${l.leadScore}</div>
            <div class="ws-lead-body">
                <div class="ws-lead-line1">
                    <span class="ws-lead-name">${escapeHtml(l.name)}</span>
                    <span class="ws-lead-domain"><a href="${escapeHtml(l.websiteUri)}" target="_blank" rel="noopener" data-no-bubble>${escapeHtml(l.domain)}</a></span>
                </div>
                <div class="ws-lead-line2">
                    <span class="ws-lead-branch">${escapeHtml(l.branch.name)}</span>
                    ${reasons}
                </div>
                ${l.address ? `<div class="ws-lead-line3">${escapeHtml(l.address)}</div>` : ''}
            </div>
            <div class="ws-lead-actions">
                <div class="ws-rate" title="Würden Sie diesen Betrieb anrufen?">
                    <button class="ws-rate-btn${l.urteil === 'up' ? ' active up' : ''}" data-rate="up" title="Würde ich anrufen" aria-label="Würde ich anrufen">👍</button>
                    <button class="ws-rate-btn${l.urteil === 'skip' ? ' active skip' : ''}" data-rate="skip" title="Weiß ich nicht" aria-label="Weiß ich nicht">🤷</button>
                    <button class="ws-rate-btn${l.urteil === 'down' ? ' active down' : ''}" data-rate="down" title="Würde ich nicht anrufen" aria-label="Würde ich nicht anrufen">👎</button>
                </div>
                <button class="ws-btn ws-btn-primary" data-action="analyze">Tiefe Analyse →</button>
                <button class="ws-btn" data-action="save">✚ CRM</button>
            </div>
        </div>
    `;
}

let wsController = null;

function bindWorkspaceEvents(el) {
    // ⚠️ `#batch-results` wird nie ersetzt, nur sein innerHTML — ohne Abbruch der
    // alten Listener feuerten nach fuenf Filterklicks fuenf identische Handler
    // (und ein Bewertungsklick haette fuenf Firestore-Schreibvorgaenge ausgeloest).
    // Muster wie in ui/render-crm.js:47 und ui/render-outreach.js:37.
    wsController?.abort();
    wsController = new AbortController();
    const signal = wsController.signal;

    el.addEventListener('click', async (e) => {
        // Filter-Pills
        const pill = e.target.closest('.ws-pill');
        if (pill) {
            const group = pill.closest('.ws-pills')?.dataset.pillGroup;
            if (group === 'minScore') {
                persistFilters({ minScore: parseInt(pill.dataset.min, 10) });
            } else if (group === 'baukasten') {
                persistFilters({ baukasten: pill.dataset.baukasten === '1' });
            } else if (group === 'buy') {
                persistFilters({ buy: pill.dataset.buy === '1' });
            } else if (group === 'reach') {
                persistFilters({ reach: pill.dataset.reach === '1' });
            } else if (group === 'unrated') {
                persistFilters({ unrated: pill.dataset.unrated === '1' });
            }
            renderLeadWorkspace(lastCity, lastResults, getActiveFilters());
            return;
        }

        // ── Bewertung: „wuerde ich anrufen?" ──
        // Bewusst VOR dem .ws-lead-Fallback, sonst faellt der Klick in
        // „Tiefe Analyse" durch. Und bewusst OHNE Rerender: renderLeadWorkspace
        // baut die ganze Liste neu auf — die Scroll-Position waere weg.
        const rateBtn = e.target.closest('[data-rate]');
        if (rateBtn) {
            const card = rateBtn.closest('.ws-lead');
            const l = lastResults.find(x => x.key === card?.dataset.key);
            if (!l) return;
            const wert = rateBtn.dataset.rate;
            const res = await setRating(l.domain, wert, {
                features: extractFeatures(l), score: l.leadScore, key: l.key, city: lastCity
            });
            l.urteil = res.rating;
            // Nur die drei Knoepfe dieser Karte umschalten.
            card.querySelectorAll('[data-rate]').forEach(b => {
                const an = res.rating !== null && b.dataset.rate === res.rating;
                b.classList.toggle('active', an);
                b.classList.toggle('up', an && res.rating === 'up');
                b.classList.toggle('down', an && res.rating === 'down');
                b.classList.toggle('skip', an && res.rating === 'skip');
            });
            refreshRatingModel(lastResults);
            updateRatingHeader(el);
            if (!res.firestoreSynced) showError('Bewertung nur lokal gespeichert (kein Sync).');
            return;
        }

        // Reset
        if (e.target.dataset.action === 'reset-filters') {
            persistFilters({ minScore: 0, branch: 'all', sort: 'score', baukasten: false, buy: false, reach: false, unrated: false });
            renderLeadWorkspace(lastCity, lastResults, getActiveFilters());
            return;
        }

        // Beste sichtbare Leads → Outreach-Studio (je personalisierter Pitch + Mockup).
        // pitchInputs (inkl. Ad-Intent-Hook) aus den Scan-Daten anhängen — die Deep-Lane
        // re-generiert Mockups für die Top-Treffer (ratenbegrenzt, wie aus dem CRM).
        // Voranalyse: verdichtet den ganzen Scan zu „welche Branche lohnt" → Klick filtert.
        if (e.target.dataset.action === 'aggregate') {
            showAggregateReport(lastResults, lastCity, (branchKey) => {
                persistFilters({ branch: branchKey });
                renderLeadWorkspace(lastCity, lastResults, getActiveFilters());
            });
            return;
        }

        if (e.target.dataset.action === 'open-studio') {
            const top = applyFilters(lastResults, getActiveFilters()).filter(l => l.leadScore >= 50).slice(0, 15);
            if (!top.length) { showError('Keine Leads mit Score ≥ 50 — erst einen Scan mit stärkeren Treffern.'); return; }
            openStudio(top.map(l => ({ ...l, pitchInputs: buildPitchInputs(l) })));
            return;
        }

        // Lead-Action: Tiefe Analyse → in Single-Check uebernehmen
        const lead = e.target.closest('.ws-lead');
        if (!lead) return;
        if (e.target.dataset.noBubble != null) return;

        const action = e.target.dataset.action;
        const websiteUri = lead.dataset.url;
        const leadData = lastResults.find(x => x.key === lead.dataset.key);

        if (action === 'save') {
            if (!leadData) return;
            await saveLead(leadData.domain, websiteUri, {
                name: leadData.name,
                type: leadData.primaryType,
                perf: leadData.ws?.perf, seo: leadData.ws?.seo, a11y: leadData.ws?.a11y,
                cms: leadData.cms, isBaukasten: leadData.isBaukasten,
                leadScore: leadData.leadScore, conversionRate: leadData.conversionRate,
                expectedValue: leadData.expectedValue,
                reviews: leadData.reviews, rating: leadData.rating,
                source: 'scanner_workspace',
                // Magerer Pitch-Blob (PSI-Light: nur ws/tech/place, kein deep/bfsg/mockup).
                pitchInputs: buildPitchInputs(leadData)
            });
            const btn = e.target;
            btn.textContent = '✓ Gespeichert';
            btn.disabled = true;
            return;
        }

        // Default: zum Single-Check wechseln + auto-analyze
        const urlInput = document.getElementById('url-input');
        if (urlInput) urlInput.value = websiteUri;
        // Switch to single tab
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelector('[data-tab="single"]')?.classList.add('active');
        document.getElementById('input-single')?.classList.remove('hidden');
        document.getElementById('input-batch')?.classList.add('hidden');
        document.getElementById('input-scanner')?.classList.add('hidden');
        document.getElementById('btn-analyze')?.click();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }, { signal });

    el.addEventListener('change', (e) => {
        if (e.target.dataset.action === 'branch') {
            persistFilters({ branch: e.target.value });
            renderLeadWorkspace(lastCity, lastResults, getActiveFilters());
        } else if (e.target.dataset.action === 'sort') {
            persistFilters({ sort: e.target.value });
            renderLeadWorkspace(lastCity, lastResults, getActiveFilters());
        }
    }, { signal });
}

// escapeHtml kommt zentral aus lib/escape-html.js (Import oben).

function showProgress(pct, t) { document.getElementById('progress').classList.remove('hidden'); document.getElementById('progress-fill').style.width = pct+'%'; document.getElementById('progress-text').textContent = t; }
function hideProgress() { document.getElementById('progress').classList.add('hidden'); }
function showError(t) { document.getElementById('error-text').textContent = t; document.getElementById('error').classList.remove('hidden'); }

function notifyDone(msg) {
    const origTitle = document.title;
    document.title = '✅ ' + msg;
    setTimeout(() => { document.title = origTitle; }, 5000);
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        try { new Notification('Lead Intelligence', { body: msg }); } catch {}
    }
}

export function requestNotificationPermissionOnGesture() {
    if (typeof Notification === 'undefined') return;
    if (Notification.permission === 'granted' || Notification.permission === 'denied') return;
    try { Notification.requestPermission(); } catch {}
}
