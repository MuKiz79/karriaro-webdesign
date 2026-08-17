/**
 * Opportunity-Score — transparente Vor-Bewertung für den Region-Scanner (und
 * die Batch-Suche). Modelliert direkt das, was der Founder sucht:
 *
 *     Opportunity = Website-Schlechtigkeit × Geschäftswert
 *
 * Bewusst NICHT der opake Monte-Carlo-Funnel-Score — sondern erklärbar (jeder
 * Lead trägt seine `reasons`-Chips) und nur aus GRATIS-Signalen (PSI + Places +
 * Tech-Detect). Die teure Tiefenanalyse bleibt dem Klick vorbehalten.
 *
 * @module scoring/opportunity
 */

import { analyzeTechAge } from '../analysis/tech-age.js';

const BAUKASTEN_URL = [
    { re: /\.wixsite\.com|static\.wixstatic/i, name: 'Wix' },
    { re: /\.jimdo\.|jimdofree\.|jimdosite\./i, name: 'Jimdo' },
    { re: /\.squarespace\.com/i, name: 'Squarespace' },
    { re: /\.weebly\.com/i, name: 'Weebly' },
    { re: /\.webnode\./i, name: 'Webnode' },
    { re: /\.wordpress\.com/i, name: 'WordPress.com' },
    { re: /\.strato\.|strato-hosting/i, name: 'Strato' },
    { re: /\.1und1\.de|\.ionos\./i, name: 'IONOS' }
];

/** Baukasten an der URL erkennbar? → Name oder null (gratis, kein Render). */
export function urlBaukasten(url) {
    for (const b of BAUKASTEN_URL) if (b.re.test(url || '')) return b.name;
    return null;
}

// Geschäftswert-Gewicht nach Branche. Premium-Heilberufe/Recht/Immobilien lohnen
// mehr; Low-Value-Branchen bekommen einen ECHTEN <1.0-Abschlag (F2/Rang-Inversion),
// in zwei Stufen nach typischem Projektwert/Marge:
//   • GASTRO (Restaurant/Café/Bäckerei): dünnste Margen, höchste Fluktuation → 0.68
//   • RETAIL/SERVICE (Florist/Salon/Beauty/Gym): niedrig, aber relaunch-würdiger → 0.82
const PREMIUM = new Set(['dentist', 'doctor', 'lawyer', 'real_estate_agency']);
const PROFESSIONAL = new Set(['roofing_contractor', 'plumber', 'electrician', 'moving_company',
    'physiotherapist', 'veterinary_care', 'lodging', 'hotel', 'car_dealer', 'car_repair', 'auto_repair']);
const LOW_VALUE_GASTRO = new Set(['restaurant', 'cafe', 'bakery']);
const LOW_VALUE_RETAIL = new Set(['hair_salon', 'beauty_salon', 'florist', 'gym']);

// KAPAZITAETSGEBUNDENE Branchen: der Engpass ist der Behandlungsstuhl/Termin-Slot,
// NICHT die Website. Ein etablierter Zahnarzt kann zusaetzliche Website-Besucher
// gar nicht in Umsatz verwandeln — er hat keinen Grund, eine neue Seite zu kaufen.
// Ein Anwalt/Makler/Umzugsunternehmen dagegen skaliert direkt mit Anfragen.
// Bewusst NICHT enthalten: lawyer (wirbt aktiv um Mandate), hair_salon/beauty_salon
// (stuhlgebunden, aber nachweislich akquise-hungrig).
const CAPACITY_BOUND = new Set(['dentist', 'doctor', 'veterinary_care', 'physiotherapist']);
function dealFactor(primaryType) {
    if (PREMIUM.has(primaryType)) return 1.25;
    if (PROFESSIONAL.has(primaryType)) return 1.10;
    if (LOW_VALUE_GASTRO.has(primaryType)) return 0.68;
    if (LOW_VALUE_RETAIL.has(primaryType)) return 0.82;
    return 0.90;
}

// Schwelle, ab der ein Betrieb als ETABLIERT gilt (deckungsgleich mit der 1.00-Stufe
// in valueMult). Darunter greift der Bedarfsdruck-Abschlag NICHT: eine junge Praxis
// ohne Patientenstamm sucht sehr wohl Zulauf.
const ESTABLISHED_STRENGTH = 45;

/**
 * Bedarfsdruck (F9) — „will der Betrieb ueberhaupt mehr Kunden?"
 *
 * Der bisherige Score las „laeuft gut" (frische Bewertungen x starker Betrieb =
 * bis 1.56x) als Kaufbereitschaft. Genau falsch herum: viele frische Top-Bewertungen
 * beweisen Zahlungsfaehigkeit UND dass die Website den Betrieb nicht behindert.
 * Empirischer Ausloeser (Founder-Rueckmeldung am Stuttgart-Scan 2026-07-26): zwei
 * ausgebuchte Zahnarztpraxen auf Wix/Jimdo standen mit 92 ueber einem Anwalt (91),
 * der nachweislich Google-Geld auf eine Seite OHNE SSL leitet.
 *
 * Regel bewusst schmal — sie greift nur, wo sie strukturell begruendbar ist:
 * kapazitaetsgebundene Branche UND etabliert UND KEIN Kaufsignal. Sobald der Betrieb
 * Anzeigen schaltet oder einstellt, ist der Wachstumswille bewiesen → kein Abschlag.
 * Damit wird das Kaufsignal INNERHALB der Premium-Heilberufe zur entscheidenden Achse
 * (Spreizung 1.35x statt 0.70x = 1.93x) statt zum schwaechsten Multiplikator.
 *
 * @returns {{factor:number, chip:string|null}}
 */
function demandPressure(primaryType, businessStrength, provenSpender) {
    if (provenSpender) return { factor: 1.0, chip: null };               // Wachstumswille bewiesen
    if (!CAPACITY_BOUND.has(primaryType)) return { factor: 1.0, chip: null };
    if (businessStrength < ESTABLISHED_STRENGTH) return { factor: 1.0, chip: null };
    return { factor: 0.70, chip: '⏸ kein Wachstumssignal' };
}

/**
 * Erreichbarkeit (F11) — ein Lead, den man nicht ansprechen kann, ist kein Lead.
 *
 * Die Erreichbarkeit wurde bisher erst im Outreach-Studio geprueft (verifyReachable
 * in strategy/bulk-outreach.js), also NACH der kompletten Analyse-Investition und
 * ohne jeden Einfluss auf die Rangfolge. Hier fliesst sie mit ein.
 *
 * ⚠️ Ehrlichkeitsregel (wie beim adChecked-Flag): NUR ein tatsaechlich
 * durchgefuehrter Scan darf abwerten. `contactPaths === null` heisst „nicht
 * geprueft" und bleibt strikt neutral — nicht geprueft ist nicht dasselbe wie
 * nicht erreichbar. Der Abschlag ist bewusst mild (0.85): eine Seite ohne
 * mailto/tel im HTML kann ihre Adresse immer noch im Impressum stehen haben.
 *
 * @returns {{factor:number, chip:string|null}}
 */
function reachFactor(contactPaths) {
    if (!contactPaths || contactPaths.checked !== true) return { factor: 1.0, chip: null };
    if (contactPaths.hasMailto || contactPaths.hasTel) return { factor: 1.0, chip: null };
    // Ein Impressum-Link allein ist ein schwacher Hinweis (die Adresse steht dort
    // vielleicht) — deshalb halber Abschlag statt voller.
    if (contactPaths.hasImpressumLink) return { factor: 0.92, chip: null };
    return { factor: 0.85, chip: '✉ kein Kontaktweg gefunden' };
}

/**
 * Kaufsignal-Faktor (F10) — abgestuft statt binaer.
 *
 * Vorher: `adActive ×1.35 · hiring ×1.15`, also zwei grobe Schalter. Die volle
 * Evidenz-Summe aus analysis/buying-intent.js (11 Signale) lief NUR im Einzel-
 * Check — die Rangfolge der Scan-Treffer entstand damit aus ~20 % der
 * verfuegbaren Kaufevidenz.
 *
 * ⚠️ Entscheidend: die Abstufung haengt an AUSGABEN-Evidenz (`isProvenSpender`),
 * nicht am Rohscore. Sonst waere derselbe Fehler wie beim Bedarfsdruck (F9)
 * zurueck: reine Aktivitaets-Signale (frische Bewertungen 14 + Analytics 8 +
 * Kanal-Breite 8 = 30) wuerden die Schwelle reissen und „laeuft gut" erneut als
 * Kaufbereitschaft gelesen. buying-intent.js sagt es selbst: „Reine Aktivitaets-
 * Signale reichen dafuer bewusst NICHT."
 *
 * Ohne `buyingIntent` faellt die Funktion exakt auf die alte Formel zurueck —
 * Bestandsaufrufer (batch-search, Tests) bleiben byte-identisch.
 *
 * @returns {{mult:number, tier:string|null, proven:boolean}}
 */
// Signale, die das livenessGate bereits belohnt — sie duerfen die Stapel-Schwelle
// des Kaufsignals nicht mitentscheiden, sonst zaehlt dieselbe Bewertungs-Frische
// zweimal (einmal ×1.30 im Gate, einmal beim Sprung 1.35 → 1.55).
const LIVENESS_KEYS = new Set(['reviews_fresh', 'reviews_velocity']);

/** Punktsumme der Kaufsignale OHNE die Bewertungs-Signale. */
function spendScore(buyingIntent) {
    return (buyingIntent.signals || [])
        .filter(s => !LIVENESS_KEYS.has(s.key))
        .reduce((sum, s) => sum + (s.weight || 0), 0);
}

function buySignalFactor(buyingIntent, adActive, hiring) {
    if (!buyingIntent) {
        return { mult: (adActive ? 1.35 : 1.0) * (hiring ? 1.15 : 1.0), tier: null, proven: adActive || hiring };
    }
    if (buyingIntent.isProvenSpender) {
        // Gestapelte Evidenz (z.B. Anzeigen + mehrere offene Stellen) zaehlt mehr
        // als ein einzelnes Signal. 1.55 entspricht der alten Kombination
        // adActive×hiring (1.5525) — bewusst kein Sprung nach oben.
        //
        // ⚠️ KORREKTUR 2026-08-08: Die Schwelle lief auf `buyingIntent.score` — und
        // darin stecken `reviews_fresh` (14) + `reviews_velocity` (8). Dieselbe
        // Bewertungs-Frische wird aber oben schon vom livenessGate mit bis zu ×1.30
        // belohnt. Gemessen: Anzeigen(32) + Frische(14) + Analytics(8) + Kanäle(8)
        // = 62 → kippte auf 1.55. Der Kommentar unten behauptete das Gegenteil.
        // Die Schwelle rechnet jetzt auf der AUSGABEN-Evidenz ohne die
        // Bewertungs-Signale — damit stimmt die Nicht-Doppelzählung wirklich.
        return { mult: spendScore(buyingIntent) >= 55 ? 1.55 : 1.35, tier: buyingIntent.tier, proven: true };
    }
    // Werbung wahrscheinlich, aber nicht bewiesen (GTM/Consent-Mode hinter dem
    // Cookie-Banner). Kleiner Aufschlag, KEIN Spender-Status.
    const probable = (buyingIntent.signals || []).some(s => s.key === 'ad_consent_mode' || s.key === 'tag_manager');
    return { mult: probable ? 1.15 : 1.0, tier: buyingIntent.tier, proven: false };
}

/**
 * Liveness aus Review-Recency (F6) → Gate/Multiplikator (0.0 … 1.30). NIE additiv.
 * `reviewRecency` ist der in trimPlace abgeleitete Wert
 * { daysSinceLast:number|null, velocity:number|null, n:number }.
 *
 * ⚠️ KORREKTUR 2026-08-08: Fehlt das Signal (n<2 / kein publishTime), war der
 * Rueckgabewert 0.85 — bei gleichzeitigem Kommentar „NICHT bestrafen". Das war ein
 * Widerspruch mit echter Wirkung: gegen einen Betrieb mit frischen Bewertungen
 * (1.30) lag der Rueckstand bei Faktor 1.53, allein weil Google zu diesem Betrieb
 * keine datierten Bewertungen liefert. Ob `publishTime` in der Places-Antwort
 * steht, ist eine Eigenschaft von GOOGLES Daten, nicht des Betriebs.
 * Jetzt strikt neutral (1.0) — dieselbe Regel, die `reachFactor` und
 * `peer-pressure` schon befolgen: nicht gemessen ≠ negativ gemessen.
 */
function livenessGate(reviewRecency, place) {
    const status = place && place.businessStatus;
    if (status && status !== 'OPERATIONAL') return { factor: 0.0, chip: 'inaktiv (geschlossen)' };
    const rr = reviewRecency || {};
    const d = typeof rr.daysSinceLast === 'number' ? rr.daysSinceLast : null;
    const v = typeof rr.velocity === 'number' ? rr.velocity : null;
    const n = rr.n || 0;
    if (d === null || n < 2) return { factor: 1.0, chip: null };   // unbekannt = neutral
    // Primärachse: Tage seit der jüngsten Bewertung (BrightLocal „73% trauen nur dem
    // letzten Monat" → ~30–45T Frische-Klippe). >18 Mon. still → Nahe-0x-Gate.
    let factor;
    if (d <= 45) factor = 1.30;
    else if (d <= 120) factor = 1.10;
    else if (d <= 270) factor = 0.85;
    else if (d <= 540) factor = 0.42;
    else factor = 0.10;
    // Velocity-Override NUR bei >=3 datierten Reviews UND realer Spanne (spanMonths in
    // deriveReviewRecency bei ~1 Monat gefloort) → ein 2er-Freundes-Burst kann die
    // Velocity nicht aufblasen (Gaming-Fix).
    if (v !== null && n >= 3 && v >= 5 && d <= 180) factor = Math.max(factor, 1.30);
    if (v !== null && v < 0.5 && d > 270) factor = Math.min(factor, 0.25);
    let chip = null;
    if (d <= 45) chip = `aktiv · letzte Bew. ${d}T`;
    else if (d > 540) chip = `inaktiv · ${Math.round(d / 30)} Mon. still`;
    else if (d > 270) chip = `kühl · letzte Bew. ${Math.round(d / 30)} Mon.`;
    return { factor, chip };
}

/**
 * Geschäftswert als gesättigter Multiplikator (0.0 … 1.20) mit 0x-Gate (F2).
 * rating<=3.2 → 0x-Gate (ein nachweislich schlecht bewerteter Betrieb ist kein Lead).
 *
 * ⚠️ KORREKTUR 2026-08-08: `rating === 0` kostete pauschal 55 %. Das war eine
 * ERFUNDENE Strafe — aber der naheliegende Gegen-Fix (voller Multiplikator) wäre
 * schlimmer gewesen, wie der Bestandstest zeigte:
 *   • Der Zweig ist für ein echtes Datenloch UNERREICHBAR — `reviews < 8` gated
 *     vorher schon auf 0. Wer hier ankommt, hat ≥8 Bewertungen UND kein Rating,
 *     also einen widersprüchlichen Datensatz.
 *   • `businessStrength` rechnet in dem Fall mit `rating || 3` — die Stärke-Zahl
 *     ist bereits erfunden. Ein voller Bonus auf eine erfundene Zahl ist kein
 *     „neutral", sondern ein zweiter Fehler.
 * Richtig ist deshalb weder Strafe noch Bonus, sondern eine GRENZE: der Lead
 * rankt normal, kann aber nicht HOT werden, solange sein Ruf nicht überprüfbar
 * ist. Eine Grenze behauptet nichts — ein Multiplikator schon.
 */
function strengthTier(businessStrength) {
    if (businessStrength >= 70) return 1.20;
    if (businessStrength >= 45) return 1.00;
    if (businessStrength >= 25) return 0.85;
    return 0.70;
}

function valueMult(businessStrength, rating, reviews, minReviews) {
    if (reviews < minReviews) return { mult: 0.0, gated: true };
    if (rating > 0 && rating <= 3.2) return { mult: 0.0, gated: true };
    if (rating === 0) return { mult: strengthTier(businessStrength), gated: false, ratingUnknown: true };
    return { mult: strengthTier(businessStrength), gated: false };
}

// Eingangs-/Gate-Schwelle für Bewertungen — identisch zum Scanner-MIN_REVIEWS.
export const MIN_REVIEWS_VALUE = 8;

/**
 * @param {{ws:object, tech:object, place:object, websiteUri?:string, techAge?:object,
 *           reviewRecency?:{daysSinceLast:number|null, velocity:number|null, n:number},
 *           visionOutdated?:boolean, adIntent?:{active:boolean, signals?:string[]},
 *           jobIntent?:{isHiring:boolean, signals?:string[]}}} p
 * @returns {{opportunity:number, badnessScore:number, businessStrength:number,
 *            looksAlreadyGood:boolean, reasons:string[], hardStructural:number,
 *            adIntent:boolean, buySignal:{adActive:boolean, hiring:boolean, mult:number}}}
 */
export function computeOpportunity({ ws = {}, tech = {}, place = {}, websiteUri = '', techAge = null, reviewRecency = null, visionOutdated = false, adIntent = null, jobIntent = null, seasonal = null, buyingIntent = null, contactPaths = null, siteAge = null }) {
    // ⚠️ KORREKTUR 2026-08-08: Ein fehlender PSI-Wert wurde auf 50 defaultet — und
    // 50 liegt unter BEIDEN Perf-Schwellen (<55 → +9 Badness) und unter dem
    // Design-Floor (<70 → Badness mindestens 32). Eine Seite, die PSI gar nicht
    // messen konnte, bekam dadurch Problem-Belege aus dem Nichts. Der Default
    // bleibt für die Anzeige, ist aber als UNGEMESSEN markiert und löst weder
    // Perf-Badness noch den Floor aus.
    const perfKnown = typeof ws.perf === 'number';
    const perf = perfKnown ? ws.perf : 50;
    const isHttps = ws.isHttps !== false;
    const noMobile = ws.viewport === false || ws.viewportMissing === true;
    const ub = urlBaukasten(websiteUri);
    const baukasten = !!tech.isBaukasten || !!ub;
    const ta = techAge || analyzeTechAge(tech, {});
    const reviews = place.userRatingCount || 0;
    const rating = place.rating || 0;

    // ── Badness (0–100): strukturelle Relaunch-Signale = Rückgrat (F3/F4); PSI-Lab-
    //    Perf DEMOTIERT (F0). hardStructural zählt harte Signale für Konvergenz (F1/F7/F8). ──
    let b = 0;
    let hardStructural = 0;
    if (baukasten) { b += 34; hardStructural++; }                 // F4: ~94% zuverlässig
    if (ta.cmsEolYear) { b += 34; hardStructural++; }             // F4: sicherheits-totes EOL-CMS
    else if ((ta.techSeverity || 0) >= 4) { b += 22; hardStructural++; }
    else if ((ta.techSeverity || 0) >= 2) b += 9;                 // weich, KEIN hartes Signal
    if (noMobile) { b += 24; hardStructural++; }                  // F3: nicht-mobil
    if (!isHttps) { b += 22; hardStructural++; }                  // F3: SSL/Vertrauen

    // Perf: gedeckelt & weich (war (100-perf)*0.45 ⇒ bis 45). Nur der Slow-Tail nudged (F0).
    // F16 (2026-08-16): CrUX-Felddaten als Korrektiv. Das Labor simuliert gedrosseltes
    // 4G — die p75-Erfahrung ECHTER Nutzer kann dem widersprechen (zbc.dental: Labor-LCP
    // bis 18,9 s, Feld 2,3 s = FAST). Feld „FAST" halbiert die Labor-Perf-Badness und
    // hebt den Design-Floor auf; „SLOW" bestätigt das Labor (kein Aufschlag — keine
    // neue handgesetzte Zahl, aber ein eigener Chip: von echten Nutzern bestätigt ist
    // das stärkste Perf-Argument im Anschreiben). AVERAGE/keine Daten = neutral.
    const cruxFast = ws.crux?.category === 'FAST';
    const cruxSlow = ws.crux?.category === 'SLOW';
    let perfB = 0;
    if (perfKnown) {
        if (perf < 40) perfB = 14;
        else if (perf < 55) perfB = 9;
        else if (perf < 70) perfB = 5;
        if (cruxFast) perfB = Math.round(perfB * 0.5);
    }
    b += perfB;
    b += Math.max(0, 60 - (ws.seo ?? 60)) * 0.10;
    b += Math.max(0, 60 - (ws.a11y ?? 60)) * 0.10;

    // Design-Relaunch-Floor (F2): CURRENT-Tech ohne hartes Strukturzeichen, aber müder
    // Lab-Profile (perf<70) ist eine legitime Design/Conversion-Relaunch-Lead. Ohne Floor
    // wäre die Badness ~0 → Score 0 → Vision nie erreicht. Schnelle Seiten ausgenommen.
    // ⚠️ `perfKnown` PFLICHT: ohne ihn hebt ein fehlgeschlagener PSI-Lauf (Default 50)
    //    die Badness auf 32, obwohl über die Seite nichts bekannt ist.
    // ⚠️ F16: erleben echte Nutzer die Seite als schnell (CrUX FAST), gibt es keinen
    //    Perf-getragenen Relaunch-Fall — der Floor entfällt, übrige Signale zählen normal.
    if (hardStructural === 0 && perfKnown && perf < 70 && !cruxFast) b = Math.max(b, 32);
    // Badness-Sättigung ab ~46: weitere Flags geben abnehmenden Ertrag — reiner FLAG-COUNT
    // bläst das Produkt nicht linear auf (Multi-Flag-Low-Value kann Single-Flag-Premium nicht
    // davonlaufen), ein starkes Signal allein klärt aber weiter die HOT-Schwelle.
    if (b > 46) b = 46 + (b - 46) * 0.45;
    const badnessScore = Math.min(100, Math.round(b));

    // Visuell veraltet (Vision, Top-N) zählt als hartes Strukturzeichen (F1).
    if (visionOutdated) hardStructural++;

    // ── Geschäftswert (0–100): UNVERÄNDERTE Formel — bleibt für Shape/UI, fließt aber
    //    als gesättigter Multiplikator ein, nicht additiv. ──
    const businessStrength = Math.min(100, Math.round(Math.log2(Math.max(1, reviews)) * (rating || 3) * 3));

    const looksAlreadyGood = perf >= 70 && isHttps && !baukasten && !ta.cmsEolYear
        && (ta.techSeverity || 0) < 2 && hardStructural === 0;

    // ── KAUFSIGNAL-Achse (stärkstes billiges Signal): zahlt für Google-/Meta-Anzeigen
    //    bzw. stellt ein → bewiesener Spender, der Geld in Kundengewinnung steckt UND es
    //    auf eine schlechte Seite leitet. Boost auf eine bereits qualifizierte Lead —
    //    KEIN Junk-Rescue (die Konvergenz-Schranke unten greift weiter, Kaufsignal allein
    //    macht nicht HOT, und das Liveness-Gate killt tote Betriebe weiter).
    //
    //    ⚠️ Bewusst OHNE Bewertungs-Frische: die traegt bereits das livenessGate oben.
    //    Dieselbe Evidenz zweimal zu zaehlen wuerde lebendige Betriebe doppelt belohnen.
    //
    //    ⚠️ Kein Abschlag fuer FEHLENDES Kaufsignal (Neutralwert bleibt 1.0). Das haelt
    //    die kalibrierte 27-Profil-Ground-Truth in tests/scoring/opportunity-tiers.test.js
    //    unberuehrt — die relative Hochstufung der Spender reicht fuer die Sortierung. ──
    const adActive = !!(adIntent && adIntent.active);
    const hiring = !!(jobIntent && jobIntent.isHiring);
    const bs = buySignalFactor(buyingIntent, adActive, hiring);
    const buySignalMult = bs.mult;
    // Saison-Timing (Vor-Saison der Branche = jetzt bauen = rechtzeitig fertig): leichter
    // Boost auf eine qualifizierte Lead — KEIN Junk-Rescue (Konvergenz greift weiter).
    const seasonalActive = !!seasonal;

    // ── Multiplikativer Kern (F2: Matrix von Achsen mit Gates, KEINE gewichtete Summe). ──
    const lg = livenessGate(reviewRecency, place);
    const vm = valueMult(businessStrength, rating, reviews, MIN_REVIEWS_VALUE);
    const dp = demandPressure(place.primaryType, businessStrength, bs.proven);
    const rf = reachFactor(contactPaths);
    // F17 (2026-08-17, Founder-Kriterium): „Wer erst vor kurzem in eine neue
    // Website investiert hat, beauftragt nicht gleich nochmal eine — außer sie
    // hat erhebliche Mängel." Frisch = CMS-Wechsel im Archiv-Fenster (~13 Mon.)
    // ODER Domain jünger als 18 Monate (RDAP). Die MÄNGEL-AUSNAHME hebt den
    // Dämpfer auf: eine neue Seite ohne SSL / ohne Mobile / auf EOL-CMS / mit
    // Veraltet-Verdikt wurde schlecht gekauft — der Inhaber ist ansprechbar.
    // siteAge fehlt (Alt-Cache, Archiv down, nie geprüft) ⇒ neutral 1.0.
    const MONAT_MS = 30 * 86400000;
    const domainJung = typeof siteAge?.domainRegisteredMs === 'number'
        && (Date.now() - siteAge.domainRegisteredMs) < 18 * MONAT_MS;
    const frischInvestiert = siteAge?.relaunchVerdacht === true || domainJung;
    const erheblicheMaengel = !isHttps || noMobile || !!ta.cmsEolYear || visionOutdated;
    const investFactor = frischInvestiert && !erheblicheMaengel ? 0.5 : 1.0;

    let opp = badnessScore * lg.factor * vm.mult * dealFactor(place.primaryType)
        * buySignalMult * dp.factor * rf.factor * investFactor * (seasonalActive ? 1.10 : 1.0);
    if (looksAlreadyGood) opp *= 0.35;

    // Konvergenz-Schranke (F1/F7/F8): ohne >=1 hartes Strukturzeichen nie HOT (gedeckelt
    // unter 70) — eine müde Current-Tech-Premium-Relaunch-Lead bleibt aber WARM.
    if (hardStructural < 1) opp = Math.min(opp, 69);
    // Ruf nicht überprüfbar (Bewertungen vorhanden, aber kein Rating): derselbe
    // Deckel statt einer erfundenen Strafe. Der Lead bleibt sichtbar und rankt
    // nach seinen echten Signalen — er wird nur nicht als Top-Empfehlung geführt.
    if (vm.ratingUnknown) opp = Math.min(opp, 69);
    // 2026-08-15 (Verifikations-Befund d2): Der Deckel wird EXPORTIERT, damit
    // nachgelagerte Multiplikatoren (Peer-Pressure im Scanner) ihn erneut
    // anwenden können. Vorher hob der Peer-Aufschlag gedeckelte 69er auf 75 —
    // in Karlsruhe standen sechs der Top-10 NUR dadurch über der HOT-Schwelle.
    const scoreCap = (hardStructural < 1 || vm.ratingUnknown) ? 69 : null;

    const opportunity = Math.max(0, Math.min(100, Math.round(opp)));

    // ── Begründungs-Chips (Transparenz; Ad-Intent prominent für Founder-Triage) ──
    const reasons = [];
    if (adActive) reasons.push('💸 Anzeigen aktiv');     // bewiesener Spender — zuerst
    if (hiring) reasons.push('📈 stellt ein');           // Wachstum + Personalbudget
    // Bezahlte Werkzeuge sichtbar machen — sonst waere das Signal zwar gemessen
    // und im Score wirksam, in der Liste aber nicht ablesbar (Playbook §2).
    const toolSig = (buyingIntent?.signals || []).find(s => s.key === 'paid_tools');
    if (toolSig) reasons.push(`🧾 ${toolSig.label}`);
    if (seasonalActive) reasons.push('⏰ Saison jetzt');  // Timing-Fenster der Branche
    if (baukasten) reasons.push(ub || tech.cms || 'Baukasten');
    if (ta.cmsEolYear) reasons.push(`${ta.cms} veraltet`);
    reasons.push(`Perf ${perf}`);
    // F16: Die Feld-Lage gehört SICHTBAR neben den Laborwert — sie entscheidet,
    // ob Performance im Anschreiben überhaupt als Argument taugt. „Feld: schnell"
    // ist eine Warnung (Perf-Argument vom Inhaber in einer Minute widerlegbar),
    // „Feld: langsam" ist das stärkste Perf-Argument (echte Nutzer, nicht Labor).
    if (cruxFast && perfKnown && perf < 70) reasons.push('⚡ Feld: schnell (echte Nutzer)');
    else if (cruxSlow) reasons.push('🐌 Feld: langsam (echte Nutzer)');
    // F17: Frisch-Investiert gehört SICHTBAR in die Liste — mit Grund.
    if (frischInvestiert) {
        const grund = siteAge?.relaunchVerdacht === true
            ? `Relaunch < 13 Mon. (${siteAge.cmsThen} → ${siteAge.cmsNow})`
            : 'Domain jünger als 18 Mon.';
        reasons.push(erheblicheMaengel
            ? `🆕 neu, aber mangelhaft — ${grund}`
            : `🆕 frisch investiert — ${grund}`);
    }
    if (!isHttps) reasons.push('kein SSL');
    if (noMobile) reasons.push('nicht mobil');
    if (lg.chip) reasons.push(lg.chip);
    if (dp.chip) reasons.push(dp.chip);   // kapazitätsgebunden + etabliert + kein Kaufsignal
    if (rf.chip) reasons.push(rf.chip);   // geprüft, aber kein Kontaktweg auffindbar
    if (vm.gated) reasons.push('zu kleiner Betrieb');
    reasons.push(rating ? `${reviews}★ (${rating.toFixed(1)})` : `${reviews} Bew.`);

    return {
        opportunity, badnessScore, businessStrength, looksAlreadyGood, reasons, hardStructural,
        // 69 wenn die Konvergenz-Schranke greift (kein hartes Strukturzeichen /
        // Ruf unprüfbar), sonst null. Nachgelagerte Multiplikatoren MÜSSEN den
        // Deckel erneut anwenden — er ist eine Invariante, kein Zwischenschritt.
        scoreCap,
        adIntent: adActive,
        // Eigene Achse fuer UI-Filter/Sortierung ("nur Betriebe, die Geld ausgeben").
        buySignal: {
            adActive, hiring, mult: Math.round(buySignalMult * 100) / 100,
            // `proven` = echtes Geld verlaesst den Betrieb fuer Kundengewinnung.
            // Filter/Sortierung lesen das (orchestration/lead-filters.js).
            proven: bs.proven, tier: bs.tier,
            intentScore: buyingIntent ? buyingIntent.score : null
        },
        // Bedarfsdruck-Faktor (1.0 = kein Abschlag, 0.70 = kapazitaetsgebunden ohne Kaufsignal).
        demandFactor: dp.factor,
        // Erreichbarkeit (1.0 = ok oder ungeprueft, <1 = geprueft ohne Kontaktweg).
        reachFactor: rf.factor,
        // F17: Frisch-Investiert-Daempfer (0.5) — 1.0 bei Maengel-Ausnahme oder ungeprueft.
        investFactor
    };
}
