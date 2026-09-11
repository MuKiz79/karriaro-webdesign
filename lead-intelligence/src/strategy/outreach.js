/**
 * Outreach-Paket: bündelt alles, was zum Erst-Kontakt nötig ist, in
 * einem Objekt — E-Mail, Tech-Alter-Argument, Konkurrenz-Spiegel,
 * BFSG-Hinweis und (sofern verfügbar) Mockup-Vorschlag.
 *
 * Statt "noch eine Funktion" für jede Variante: ein konsolidiertes
 * Outreach-Objekt, das die UI direkt rendern kann und das per Copy /
 * Mailto / CRM-Save weiterverarbeitet wird.
 */

import { config, PREISE, preisText, preisAb } from '../config.js';
import { analyzeTechAge } from '../analysis/tech-age.js';
import { httpsBefund, CHROME_HTTPS_WARNUNG } from '../analysis/trigger-events.js';
import { siteLooksModern } from '../analysis/claim-verify.js';

/**
 * Sprint 46 — 4-Tier-Pricing-Architektur (siehe Memory project_karriaro_webdesign_pricing).
 * Branchen-spezifischer Pricing-Reveal in Mail-3 statt generischem "ab 1.290€".
 * Tier-Mapping basiert auf Marketing-Plan ICP-Zuordnung.
 *
 * 2026-09-10 — Beträge kommen aus config.PREISE (eine Quelle). Entfernt wurden
 * Lieferzeit-Zusagen je Paket, eine Zeitzusage im Care+-Text, ein nicht belegter
 * Provisions-Vergleich und eine Verknappungs-Angabe im Betreff — nichts davon ist
 * belegt, und eine Zusage ohne Deckung gehört nicht in eine Kundennachricht.
 * Care-Preise: wie auf karriaro-webdesign.de (index.html, website-kosten.html).
 */
const TIERS = {
    essential: {
        name: PREISE.essential.name,
        price: preisText(PREISE.essential.betrag),
        priceRange: preisAb('essential'),
        priceRaw: PREISE.essential.betrag,
        care: '99 €/Monat',
        reveal: `Komplett bei ${preisText(PREISE.essential.betrag)} einmalig, danach 99 €/Mt Care optional (Hosting + Backups + Quartals-Update).`,
        // Sprint 50 — Tier-spezifische Subject-Line für Touch 1 (Erstkontakt)
        // 2026-09-11: „EAA-konform" raus — eine Konformitätszusage im Betreff, die
        // weder geprüft noch für jeden Betrieb überhaupt einschlägig ist (§ 5 UWG).
        subjectLine: `Website für {branche} ${preisAb('essential')} — handcodiert`
    },
    professional: {
        name: PREISE.professional.name,
        price: preisText(PREISE.professional.betrag),
        priceRange: preisAb('professional'),
        priceRaw: PREISE.professional.betrag,
        care: '99 €/Monat',
        reveal: `${preisText(PREISE.professional.betrag)} einmalig, danach 99 €/Mt Care optional. Inkl. ein Branchen-Werkzeug-Light (Termin-Widget oder Preis-Rechner) und lokale SEO.`,
        subjectLine: `Branchen-Werkzeug + Website für {branche} — ${preisText(PREISE.professional.betrag)} einmalig`
    },
    premium: {
        name: PREISE.premium.name,
        price: preisText(PREISE.premium.betrag),
        priceRange: preisAb('premium'),
        priceRaw: PREISE.premium.betrag,
        care: '199 €/Monat Care+',
        reveal: `${preisText(PREISE.premium.betrag)} einmalig, danach 199 €/Mt Care+ optional mit SEO-Report.`,
        subjectLine: `Premium-Webdesign + Branchen-KI für {branche} — ${preisText(PREISE.premium.betrag)}`
    },
    'premium-plus': {
        name: PREISE['premium-plus'].name,
        price: preisText(PREISE['premium-plus'].betrag),
        priceRange: preisAb('premium-plus'),
        priceRaw: PREISE['premium-plus'].betrag,
        care: '199 €/Monat Care+',
        reveal: `${preisText(PREISE['premium-plus'].betrag)} einmalig inkl. Mandantenportal mit verschlüsseltem Upload und DSGVO-Compliance-Pflege quartalsweise.`,
        subjectLine: `Anwalt-Pilot: Webdesign für Kanzleien — ${preisText(PREISE['premium-plus'].betrag)}`
    }
};

/**
 * Branchen-Label für {branche}-Platzhalter in subjectLine.
 * Resolution: data.place.types[] → spezifisches Label, sonst tier.default.
 */
const TIER_BRANCHE_LABEL = {
    essential: {
        default: 'Ihren Betrieb',
        byType: {
            hair_salon: 'Ihren Salon', friseur: 'Ihren Salon',
            beauty_salon: 'Ihr Studio', beauty: 'Ihr Studio', nail_salon: 'Ihr Studio',
            cafe: 'Ihr Café', cafe_baeckerei: 'Ihre Bäckerei', bakery: 'Ihre Bäckerei',
            florist: 'Ihre Floristik', florist_de: 'Ihre Floristik',
            gym: 'Ihr Studio', fitness: 'Ihr Studio', spa: 'Ihr Spa',
            restaurant: 'Ihr Restaurant'
        }
    },
    professional: {
        default: 'Ihren Betrieb',
        byType: {
            roofing_contractor: 'Ihren Dachdecker-Betrieb', dachdecker: 'Ihren Dachdecker-Betrieb',
            plumber: 'Ihren Sanitär-Betrieb', klempner: 'Ihren Sanitär-Betrieb',
            electrician: 'Ihren Elektro-Betrieb', elektriker: 'Ihren Elektro-Betrieb',
            moving_company: 'Ihre Spedition', spedition: 'Ihre Spedition', storage: 'Ihre Spedition',
            physiotherapist: 'Ihre Praxis', physio: 'Ihre Praxis',
            veterinary_care: 'Ihre Tierarzt-Praxis', tierarzt: 'Ihre Tierarzt-Praxis',
            lodging: 'Ihr Hotel', hotel: 'Ihr Hotel',
            car_dealer: 'Ihr Autohaus', autohaus: 'Ihr Autohaus',
            car_repair: 'Ihre Werkstatt'
        }
    },
    premium: {
        default: 'Ihre Praxis',
        byType: {
            dentist: 'Ihre Zahnarzt-Praxis', zahnarzt: 'Ihre Zahnarzt-Praxis',
            doctor: 'Ihre Praxis', arzt: 'Ihre Praxis',
            real_estate_agency: 'Ihr Maklerbüro', immobilien: 'Ihr Maklerbüro',
            lawyer: 'Ihre Kanzlei', anwalt: 'Ihre Kanzlei'
        }
    },
    'premium-plus': {
        default: 'Ihre Kanzlei',
        // Premium+ ist Anwalt-Pilot; Subject hat keinen {branche}-Platzhalter,
        // aber Tabelle bleibt der Konsistenz halber.
        byType: { lawyer: 'Ihre Kanzlei', anwalt: 'Ihre Kanzlei' }
    }
};

/**
 * Branchen-Label aus data + tierKey ableiten.
 */
function brancheLabel(tierKey, data) {
    const map = TIER_BRANCHE_LABEL[tierKey];
    if (!map) return 'Ihren Betrieb';
    const types = data?.place?.types || [];
    for (const t of types) {
        if (map.byType[t]) return map.byType[t];
    }
    const deepCat = (data?.deepAssessment?.category || data?.deepResearch?.assessment?.category || '').toLowerCase();
    if (deepCat && map.byType[deepCat]) return map.byType[deepCat];
    return map.default;
}

/**
 * Subject-Line für Touch 1 aus Tier-Template aufbauen.
 * Fällt auf null zurück, wenn kein Tier auflösbar — Caller nutzt dann
 * primaryArg.subjectAlt (bisheriges Verhalten).
 */
function tierSubject(tierKey, data) {
    const tier = TIERS[tierKey];
    if (!tier || !tier.subjectLine) return null;
    return tier.subjectLine.replace('{branche}', brancheLabel(tierKey, data));
}

/**
 * Google-Maps-Typen + Karriaro-Branchen → Tier-Key.
 * Wird durch inferTier() konsumiert.
 */
const CATEGORY_TO_TIER = {
    // Essential (Handwerk, Beauty, Café, Gym)
    'hair_salon': 'essential', 'beauty_salon': 'essential', 'cafe': 'essential',
    'bakery': 'essential', 'florist': 'essential', 'gym': 'essential',
    'spa': 'essential', 'nail_salon': 'essential',
    'friseur': 'essential', 'beauty': 'essential', 'cafe_baeckerei': 'essential',
    'florist_de': 'essential', 'fitness': 'essential',
    // Professional (Bauhandwerk, Logistik, ambulante Heilberufe, Hotel)
    'roofing_contractor': 'professional', 'plumber': 'professional',
    'electrician': 'professional', 'moving_company': 'professional',
    'storage': 'professional', 'physiotherapist': 'professional',
    'veterinary_care': 'professional', 'lodging': 'professional',
    'car_dealer': 'professional', 'car_repair': 'professional',
    'dachdecker': 'professional', 'spedition': 'professional',
    'klempner': 'professional', 'elektriker': 'professional',
    'physio': 'professional', 'tierarzt': 'professional',
    'hotel': 'professional', 'autohaus': 'professional',
    'restaurant': 'essential', // Memory: Restaurant ist Essential (raus aus ICP, aber Page bleibt Essential-Niveau)
    // Premium (Premium-Heilberufe, Premium-B2B)
    'dentist': 'premium', 'doctor': 'premium', 'real_estate_agency': 'premium',
    'lawyer': 'premium',
    'zahnarzt': 'premium', 'arzt': 'premium', 'immobilien': 'premium',
    'anwalt': 'premium'
};

/**
 * Tier aus Daten ableiten. Reihenfolge:
 *   1. profile.forceTier (explizit gesetzt für A/B-Tests)
 *   2. data.tier (explizit im Lead-Record)
 *   3. data.place.types[] match gegen CATEGORY_TO_TIER
 *   4. data.deepAssessment.category match
 *   5. Fallback: 'essential'
 *
 * Pilot-Modus: Anwalt-Leads mit UTM-Variante "premium-plus" bekommen
 * Premium+ 3.990 € statt Premium 2.990 € (siehe Marketing-Plan Hamburg-Anwalt).
 */
function inferTier(data, profile) {
    if (profile?.forceTier && TIERS[profile.forceTier]) return profile.forceTier;
    if (data?.tier && TIERS[data.tier]) return data.tier;
    const types = data?.place?.types || [];
    for (const t of types) {
        if (CATEGORY_TO_TIER[t]) return CATEGORY_TO_TIER[t];
    }
    const deepCat = data?.deepAssessment?.category || data?.deepResearch?.assessment?.category;
    if (deepCat && CATEGORY_TO_TIER[deepCat.toLowerCase()]) return CATEGORY_TO_TIER[deepCat.toLowerCase()];
    return 'essential';
}

/**
 * Höchste Pitch-Schmerzen sortiert. Nicht jeder Eintrag ist immer
 * verfügbar — die Reihenfolge hier ist nach empirischer Pitch-Stärke
 * (B2B Cold Outreach Daten + Karriaro-Erfahrung), nicht nach Severity.
 */
function buildPainArguments(data, techAge) {
    const args = [];
    const ws = data.ws || {};
    const tech = data.tech || {};
    const rev = data.revenue;
    const domain = new URL(data.url).hostname.replace('www.', '');
    const visionModern = siteLooksModern(data.screenshotAnalysis) === true; // Vision: Seite wirkt modern?

    // -2) Ad-Waste — das staerkste Argument ueberhaupt, weil der Empfaenger es
    //     SELBST nachrechnen kann: Er weiss, dass er fuer Klicks zahlt. Wir zeigen
    //     ihm den gemessenen Anteil, der unterwegs verloren geht. Kein Vorwurf,
    //     kein Design-Geschmacksurteil, sondern seine eigene Rechnung.
    //     Steht bewusst vor Security/Deep-Research: die sind stark, aber abstrakt —
    //     dieses hier trifft direkt sein laufendes Budget.
    const adWaste = data.adWaste || null;
    if (adWaste?.active && adWaste.pitch) {
        args.push({
            type: 'ad_waste',
            severity: 5,
            short: adWaste.headline || `${adWaste.lossPct} % der bezahlten Klicks versanden`,
            text: adWaste.pitch,
            subjectAlt: `${domain}: Sie zahlen für Klicks, die nicht ankommen`,
            evidence: (adWaste.drivers || []).map(d => `${d.label}: ${d.pct} %`).join(' · '),
            lossPct: adWaste.lossPct,
            // Ehrlichkeits-Hinweis fuer die UI: ob ein Euro-Betrag ueberhaupt
            // belegbar ist, haengt am bekannten Budget (siehe buying-intent.js).
            assumptionNote: adWaste.assumptionNote
        });
    }

    // -1) Security-Findings — wenn kritisch/hoch, ist das oft der konkreteste,
    //     unwiderruflichste Pitch-Anker. ("Ihr .git-Verzeichnis ist offen.")
    const security = data.security || null;
    if (security?.summary?.topPitch && (security.summary.critical > 0 || security.summary.high > 0)) {
        const top = security.findings.find(f => f.severity >= 4 && f.pitchArg) || security.findings[0];
        if (top) {
            args.push({
                type: 'security',
                severity: top.severity >= 5 ? 5 : 4,
                short: top.title || 'Sicherheits-Risiko',
                text: top.pitchArg || top.evidence,
                subjectAlt: `${domain}: ${top.title}`,
                evidence: top.evidence,
                fixAdvice: top.fixAdvice,
                category: top.category
            });
        }
    }

    // 0) Deep-Research-Schwächen — das stärkste, weil Sonnet das Material gesehen hat.
    //    Wir nehmen die Top-Severity-5-Schwäche als bestes Argument und nutzen
    //    keyPitchAngle als Subject-Default.
    const deep = data.deepAssessment || data.deepResearch?.assessment || null;
    if (deep && Array.isArray(deep.weaknesses) && deep.weaknesses.length > 0) {
        // Verifikations-Tor: unbestätigte CMS-/Versions-/EOL-Behauptungen verwerfen.
        // Das LLM (deepResearch) halluziniert mitunter eine konkrete Version
        // ("WordPress 3.7.1 EOL 2013") — die kommt nur durch, wenn detectTech
        // verlässlich eine alte Core-Version belegt.
        const cmsVerified = (techAge?.techSeverity || 0) >= 4 &&
            (data.tech?.versionConfidence === 'high' || data.tech?.versionConfidence === 'medium');
        const VERSION_CLAIM = /(wordpress|joomla|drupal|magento|typo3)\s*\d+(\.\d+)*|\bEOL\b|keine\s+sicherheitsupdates|veraltet\w*\s+(cms|tech|wordpress)|(cms|tech-?stack)[^.]*veraltet/i;
        const DESIGN_AGE = /veraltet\w*\s+design|altmodisch|nicht\s+(mehr\s+)?zeitgem|design[^.]*(veraltet|alt\b)|aus\s+den\s+(2010|2015)/i;
        const usable = deep.weaknesses.filter(w => {
            const t = `${w.title || ''} ${w.evidence || ''}`;
            if (VERSION_CLAIM.test(t) && !cmsVerified) return false;     // unbestätigte Versions-/EOL-Behauptung
            if (DESIGN_AGE.test(t) && visionModern) return false;        // Vision sagt modern → "Design veraltet" raus
            return true;
        });
        const sorted = usable.sort((a, b) => (b.severity || 0) - (a.severity || 0));
        const top = sorted[0];
        if (top && top.severity >= 4) {
            args.push({
                type: 'deep_research',
                severity: 5,
                short: top.title || 'Ganzheitliche Analyse',
                text: `${top.title}: ${top.evidence || ''}`.trim(),
                subjectAlt: deep.keyPitchAngle || `${domain}: ${top.title}`,
                evidence: top.evidence,
                category: top.category
            });
        }
    }

    // 1) Visueller Mockup-Vorschlag verfuegbar? Staerkster Hebel — der Inhaber
    //    sieht das Bild direkt in der Mail. Industrie-Reply-Rate: 15-25%.
    const visualMockup = data.mockup;
    if (visualMockup?.svgDataUrl && visualMockup?.spec?.hero?.headline) {
        const heroHeadline = visualMockup.spec.hero.headline;
        args.push({
            type: 'visual_mockup',
            severity: 5,
            short: 'Mockup im Anhang',
            text: `Ich habe Ihnen einen visuellen Entwurf einer neuen Seite für ${domain} gemacht — als Bild in dieser E-Mail. Der Vorschlag: "${heroHeadline}". Wenn Ihnen die Richtung gefällt, sprechen wir 15 Minuten über die Umsetzung.`,
            subjectAlt: `Entwurf für ${domain}: ${heroHeadline}`,
            htmlSnippet: visualMockup.htmlSnippet || null,
            svgDataUrl: visualMockup.svgDataUrl
        });
    }

    // 1b) Legacy Mockup-Suggestion (nur Text, kein Bild) — Fallback
    const mockup = data.mockupSuggestion;
    if (!visualMockup?.svgDataUrl && mockup?.headline) {
        args.push({
            type: 'mockup',
            severity: 5,
            short: 'Entwurf liegt vor',
            text: `Ich habe einen Entwurf vorbereitet, wie Ihre neue Seite aussehen könnte: "${mockup.headline}". Schicke ich Ihnen die Vorschau zu?`,
            subjectAlt: `Entwurf für ${domain} — schicke ich Ihnen die Vorschau?`
        });
    }

    // 2) Barrierefreiheit — gemessene Wirkung auf echte Besucher.
    // 2026-08-14: war eine Bußgeld-Drohung („bis ${fine}") ohne jede Prüfung, ob
    // der Betrieb dem BFSG überhaupt unterliegt. severity 5→4: der Hebel ist ohne
    // Rechtsdruck echt, aber schwächer. Der Rechtssatz kommt NUR, wenn die
    // Betroffenheit serverseitig belegt ist (bfsgScore.rechtsHinweis).
    if (data.bfsgScore?.risk === 'kritisch' || data.bfsgScore?.risk === 'hoch') {
        const rh = data.bfsgScore.rechtsHinweis;
        args.push({
            type: 'bfsg',
            severity: rh ? 5 : 4,
            short: `Barrierefreiheit ${data.bfsgScore.complianceScore}%`,
            text: `Ihre Website erfüllt ${data.bfsgScore.complianceScore}% der geprüften WCAG-Kriterien. `
                + `Besucher, die die Schrift vergrößern oder per Tastatur bedienen, kommen an mehreren Stellen nicht weiter.`
                + (rh ? ` ${rh}` : ''),
            subjectAlt: `${domain}: Besucher, die nicht ankommen`
        });
    }

    // 3) Tech-Alter — der vom User gewünschte Anker.
    // Vision-Tor: wirkt die Seite sichtbar modern UND ist das CMS nicht verlässlich
    // alt (kein EOL), dann ist "veraltet" widerlegt → kein tech_age-Argument.
    // 2026-09-11: `eol` ist das vollständige Support-Signal der GEMESSENEN Version
    // (tech-age.js); cmsEolYear gibt es nur, wenn das Datum genau belegt ist.
    const cmsReallyOld = techAge.eol === true || (techAge.techSeverity || 0) >= 4;
    if (techAge.pitchArg && !(visionModern && !cmsReallyOld)) {
        args.push({
            type: 'tech_age',
            severity: techAge.severity,
            short: techAge.cms ? `${techAge.cms}${techAge.majorVersion ? ' ' + techAge.majorVersion + '.x' : ''}` : 'Veraltete Technik',
            text: techAge.pitchArg,
            subjectAlt: techAge.cmsEolYear
                // Genaue Version statt „4.x": die Support-Lage gilt je Version, nicht je Hauptversion.
                ? `${domain}: ${techAge.cms} ${techAge.version || techAge.majorVersion + '.x'} seit ${techAge.cmsEolYear} ohne Sicherheitsupdates`
                : techAge.eol && techAge.eolText
                    ? `${domain}: ${techAge.cms} ${techAge.version || techAge.majorVersion + '.x'} ${techAge.eolText}`
                    : `${domain} läuft auf ${techAge.cms}${techAge.majorVersion ? ' ' + techAge.majorVersion + '.x' : ''}`
        });
    }

    // 4) Konkurrenz-Spiegel
    // 2026-09-10: derselbe Branchen-Filter wie am Pack unten (primaryType) — ohne
    // ihn konnte ein branchenfremder Betrieb als Mitbewerber im Mailtext stehen.
    // Der Satz sagt nur, was gemessen ist (Bewertung und Bewertungszahl); über
    // Gestaltung oder Suchposition der Mitbewerber liegt keine Messung vor.
    const zielTyp = data.place?.primaryType || null;
    const competitors = (data.competitors || []).filter(c =>
        c?.userRatingCount > 30 && c.rating >= 4.0 && (!zielTyp || c?.primaryType === zielTyp)
    ).slice(0, 3);
    if (competitors.length >= 2) {
        const names = competitors.map(c => c.displayName?.text || '—').join(', ');
        args.push({
            type: 'competitors',
            severity: 4,
            short: `${competitors.length} Konkurrenten verglichen`,
            text: `Ihre Mitbewerber ${names} sind bei Google gut bewertet — den Vergleich zeige ich Ihnen gern.`,
            subjectAlt: `${domain}: Vergleich mit ${competitors.length} Konkurrenten`
        });
    }

    // 5) Umsatzverlust-Schätzung (Gate auf 1000€ — passt zum deflationierten Modell
    //    nach Survival-Cap + webLeadShare; identisch zur single-check-Problemliste).
    if (rev?.yearlyLoss > 1000) {
        args.push({
            type: 'revenue',
            severity: 4,
            short: `~${Math.round(rev.yearlyLoss / 1000)}K€ Potenzial (gesch.)`,
            text: `Wir schätzen den jährlichen Umsatzverlust durch Website-Probleme auf rund ${(rev.pitchValue ?? rev.yearlyLoss).toLocaleString('de-DE')} €.`,
            subjectAlt: `${domain}: ungenutztes Umsatzpotenzial`
        });
    }

    // 6) Branchen-Standards-Lücken
    if (data.branchStandards?.missing?.length > 2) {
        const top = data.branchStandards.missing[0];
        args.push({
            type: 'branch',
            severity: 3,
            short: `${data.branchStandards.missing.length} Lücken`,
            text: `Ihrer Branchen-Website fehlen ${data.branchStandards.missing.length} Standard-Features die Kunden ${new Date().getFullYear()} erwarten — z.B. ${top.name}.`,
            subjectAlt: `${domain}: ${data.branchStandards.missing.length} Standard-Features fehlen`
        });
    }

    // 7) Performance / Mobile / SSL
    if (ws.perf < 40) {
        args.push({
            type: 'perf',
            severity: 3,
            short: `Perf ${ws.perf}/100`,
            text: `Google bewertet die Ladegeschwindigkeit mit ${ws.perf}/100 — kostet Sichtbarkeit und Kunden.`,
            subjectAlt: `${domain}: Google-Performance nur ${ws.perf}/100`
        });
    }
    // 2026-09-11: kein „jeder Besucher sieht das" — Chrome warnt nur neue Besucher,
    // und ohne Messung (httpsCheck) ist nur die PSI-Ableitung belegt.
    const hb = httpsBefund(ws, data.httpsCheck);
    if (hb.ohneHttps) {
        args.push({
            type: 'ssl',
            severity: 4,
            short: 'SSL fehlt',
            text: hb.gemessen
                ? `Ihre Seite ist nicht über HTTPS erreichbar. ${CHROME_HTTPS_WARNUNG}.`
                : `Ihre Seite lädt ohne HTTPS — Browser markieren sie als „Nicht sicher".`,
            subjectAlt: `${domain}: Browser markieren Ihre Seite als „Nicht sicher"`
        });
    }
    // Ad-Intent = stärkster Hook (severity 6 → führt): zahlt für Anzeigen, leitet
    // sie aber auf eine schwache Seite. Konkretes Problem aus den Scan-Signalen.
    if (data.adIntent?.active) {
        const problem = ws.viewport === false ? 'auf dem Smartphone bricht'
            : (ws.perf != null && ws.perf < 50) ? 'langsam lädt und Besucher abspringen'
            : tech.isBaukasten ? `auf ${tech.cms || 'einem Baukasten'} läuft und dadurch limitiert ist`
            : ws.isHttps === false ? 'als „nicht sicher" angezeigt wird'
            : 'die bezahlten Besucher nicht überzeugt';
        args.push({
            type: 'adspend',
            severity: 6,
            short: 'Anzeigen + schwache Seite',
            text: `Sie schalten Online-Anzeigen — aber die Seite, auf der Ihre bezahlten Besucher landen, ${problem}. Jeder Klick, den Sie bezahlen, verliert dadurch unnötig Wirkung.`,
            subjectAlt: `${domain}: Sie zahlen für Klicks, die abspringen`
        });
    }

    return args.sort((a, b) => b.severity - a.severity);
}

/**
 * Drei E-Mail-Tonalitäten — A/B-tauglich.
 */
function buildEmail(data, args, primaryArg, supportingArgs, profile, tone = 'professionell', touchNumber = 1) {
    const domain = new URL(data.url).hostname.replace('www.', '');
    const contactPerson = data.contactData?.owner || null;
    const recipientName = contactPerson || data.place?.displayName?.text || domain;
    const firstName = (contactPerson || '').split(' ')[0];

    const senderName = profile.name || 'Muammer Kizilaslan';
    const senderCompany = profile.company || 'Karriaro Webdesign';

    // Sprint 46 — Tier-basierter Pricing-Reveal statt generischem priceRange.
    const tierKey = inferTier(data, profile);
    const tier = TIERS[tierKey];
    // Preis ausschliesslich aus config.PREISE (über TIERS) — der freie Profiltext
    // „Preisbereich" darf keinen veralteten Betrag in eine Mail tragen.
    const priceRange = tier.priceRange;
    const uspTeil = profile.usp ? `, ${profile.usp}` : '';
    const portfolio = profile.portfolio || 'karriaro-webdesign.de';

    // Ohne echten Ansprechpartner: formelle Sammelanrede statt "Sehr geehrte/r <Firmenname>".
    let greeting, closing;
    if (tone === 'freundlich') { greeting = contactPerson ? `Hallo ${firstName},` : `Guten Tag,`; closing = `Herzliche Grüße`; }
    else if (tone === 'direkt') { greeting = contactPerson ? `Guten Tag ${contactPerson},` : `Guten Tag,`; closing = `Mit besten Grüßen`; }
    else { greeting = contactPerson ? `Sehr geehrte/r ${contactPerson},` : `Sehr geehrte Damen und Herren,`; closing = `Mit freundlichen Grüßen`; }

    const supporting = supportingArgs.length > 0
        ? `Auch aufgefallen: ${supportingArgs.slice(0, 2).map(a => a.text).join(' ')}`
        : '';

    // Sprint 46 — Mail-3 (touchNumber=3) bekommt einen tier-spezifischen Pricing-Reveal
    // statt nur generic priceRange. Mail 1 + 2 bleiben preisfrei.
    const pricingReveal = touchNumber >= 3
        ? `\nPreislich konkret für Ihre Branche: ${tier.reveal} Quellcode gehört Ihnen — kein Abo, kein Vendor-Lock-In.\n`
        : '';

    const body = `${greeting}

${primaryArg.text}

${supporting}
${pricingReveal}
Ich baue moderne Websites — handcodiert, ${priceRange} einmalig${uspTeil}.

Darf ich Ihnen zeigen, wie Ihre neue Seite aussehen könnte? Sie sehen zuerst einen kostenfreien Entwurf — erst der Entwurf, dann Ihre Entscheidung.

${closing}
${senderName}
${senderCompany}
${profile.location ? profile.location + '\n' : ''}${portfolio}`.trim();

    // HTML-Variante mit eingebettetem Mockup-Bild (wenn vorhanden) — kann
    // direkt in Gmail/Apple-Mail eingefuegt werden. Empfaenger sieht das Bild
    // ueber dem Text.
    const visualMockup = data.mockup;
    const mockupHtml = visualMockup?.htmlSnippet || '';
    const bodyHtml = `<div style="font-family:-apple-system,Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto;line-height:1.55;color:#14202B">
${mockupHtml ? mockupHtml + '<div style="height:16px"></div>' : ''}<p>${escapeHtmlSafe(greeting)}</p>
<p>${escapeHtmlSafe(primaryArg.text)}</p>
${supporting ? `<p style="color:#6e6e73">${escapeHtmlSafe(supporting)}</p>` : ''}
${touchNumber >= 3 ? `<p style="background:#F8F4ED;border-left:3px solid #8A7B5C;padding:12px 16px;border-radius:6px"><strong>Preislich konkret für Ihre Branche:</strong> ${escapeHtmlSafe(tier.reveal)} Quellcode gehört Ihnen — kein Abo, kein Vendor-Lock-In.</p>` : ''}
<p>Ich baue moderne Websites — handcodiert, ${escapeHtmlSafe(priceRange)} einmalig${escapeHtmlSafe(uspTeil)}.</p>
<p>Darf ich Ihnen zeigen, wie Ihre neue Seite aussehen könnte? Sie sehen zuerst einen kostenfreien Entwurf — erst der Entwurf, dann Ihre Entscheidung.</p>
<p>${escapeHtmlSafe(closing)}<br>${escapeHtmlSafe(senderName)}<br>${escapeHtmlSafe(senderCompany)}${profile.location ? '<br>' + escapeHtmlSafe(profile.location) : ''}<br><a href="https://${escapeHtmlSafe(portfolio)}" style="color:#1A2E40">${escapeHtmlSafe(portfolio)}</a></p>
</div>`;

    // Sprint 50 — Touch 1 nutzt Tier-spezifische Subject-Line (höchster Open-Rate-Hebel),
    // Touch 2+ behält dynamische Argument-Subject aus primaryArg.subjectAlt.
    const tierSubj = touchNumber === 1 ? tierSubject(tierKey, data) : null;
    const subject = tierSubj || primaryArg.subjectAlt;

    return {
        tone,
        subject,
        body,
        bodyHtml,
        hasVisualMockup: !!visualMockup?.svgDataUrl,
        copyText: `Betreff: ${subject}\n\n${body}`,
        wordCount: body.split(/\s+/).length
    };
}

function escapeHtmlSafe(s) {
    if (s == null) return '';
    return String(s).replace(/[<>&"']/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":"&#39;"}[c]));
}

/**
 * Hauptfunktion — produziert ein vollständiges Outreach-Paket.
 */
export function buildOutreachPack(data) {
    const profile = config?.profile || {};
    const techAge = analyzeTechAge(data.tech || {}, data.wayback || {});
    const args = buildPainArguments(data, techAge);

    if (args.length === 0) {
        return {
            available: false,
            reason: 'Keine ausreichenden Schmerz-Signale für ein konkretes Outreach.'
        };
    }

    const primaryArg = args[0];
    const supportingArgs = args.slice(1);

    // Sprint 46 — touchNumber aus data.touchNumber (1-4 für 4-Touch-Sequenz). Default 1 (Mail 1).
    // Mail 3 (touchNumber=3) bekommt einen tier-spezifischen Pricing-Reveal.
    const touchNumber = data?.touchNumber || 1;
    const variants = ['professionell', 'freundlich', 'direkt']
        .map(tone => buildEmail(data, args, primaryArg, supportingArgs, profile, tone, touchNumber));

    const domain = new URL(data.url).hostname.replace('www.', '');
    // Konkurrenz-Spiegel: nur Branchen-Konkurrenten anzeigen (primaryType muss matchen).
    // Ohne diesen Filter kommen Tankstellen/Parkhaus/Event-Zentren als "Konkurrenz" eines
    // Immobilienmaklers — das macht den Pitch unglaubwuerdig.
    const targetType = data.place?.primaryType || null;
    const competitors = (data.competitors || []).filter(c =>
        c?.userRatingCount > 30 &&
        c.rating >= 4.0 &&
        (!targetType || c?.primaryType === targetType)
    ).slice(0, 3);

    return {
        available: true,
        domain,
        // Kein erratener Empfänger: eine info@<domain> ohne Beleg ging früher als
        // Empfänger durch. Ohne gefundene Adresse bleibt er leer, mit Hinweis.
        recipientEmail: data.contactData?.allEmails?.[0] || data.contactData?.emails?.[0] || data.contactData?.genericEmails?.[0] || null,
        recipientHinweis: (data.contactData?.allEmails?.[0] || data.contactData?.emails?.[0] || data.contactData?.genericEmails?.[0])
            ? null
            : 'Keine E-Mail-Adresse gefunden — ohne gefundene Adresse gibt es keinen Empfänger.',
        primaryArg,
        supportingArgs,
        allArgs: args,
        techAge,
        competitors: competitors.map(c => ({
            name: c.displayName?.text || '—',
            rating: c.rating,
            reviews: c.userRatingCount,
            website: c.websiteUri || null
        })),
        bfsgRisk: data.bfsgScore?.risk || null,
        mockupHeadline: data.mockupSuggestion?.headline || null,
        mockupSubline: data.mockupSuggestion?.subline || null,
        variants,
        // Standard-Variante für sofortiges Copy
        primary: variants[0],
        // Score-Werte für CRM-Integration
        leadScore: data.result?.leadScore || 0,
        composite: techAge.composite,
        bestPitchAngle: primaryArg.type
    };
}
