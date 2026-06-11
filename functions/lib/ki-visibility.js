// ════════════════════════════════════════════════════════════════════════════
// KI-Sichtbarkeits-Spiegel — evidenzbasierte Score-/Lücken-Logik (Sprint 240).
//
// Vorher waren visibilityScore/scoreLabel/gaps freier LLM-Text: nicht reproduzierbar
// (gleiche Eingabe lieferte 65 und 25), nicht an die gemessenen Signale gekoppelt, und
// die gaps widersprachen den grünen Chips (z.B. „fehlende FAQ", obwohl FAQPage live da war).
//
// Jetzt: Score deterministisch aus GEMESSENEN technischen Signalen (inkl. FAQPage) plus dem
// ehrlichen KI-Trainingswissen (LLM-Urteil knowledgeLevel). Lücken/Fixes werden gegen die
// grünen Signale abgeglichen, damit kein „Mangel" erscheint, den die Chips widerlegen.
//
// Sprint 247: llms.txt KOMPLETT aus Score & Empfehlungen entfernt — kein großes KI-System
// wertet die Datei aus (Knowledge-Base-Doktrin; die FAQ derselben Seite sagt das auch).
//
// Sprint 250: UNTERNEHMENSTYP-bewusst + Bot-Wall. (1) Das LocalBusiness-Schema ist nur für
// LOKALE Betriebe (Friseur, Praxis, Handwerk …) ein Signal. Für Hersteller/Konzerne/globale
// Marken (z.B. Hansgrohe) ist es nicht angebracht — sein Fehlen darf NICHT als Mangel zählen.
// Score-Gewichte daher scope-abhängig (local vs. nicht-local), tech max bleibt 52. (2) Liegt die
// Seite hinter einer Bot-Wall (signals.blocked), sind die Signale ungeprüft → kein Technik-Score
// und keine technischen Mängel (sonst läse „blockiert" fälschlich als „mangelhaft").
// ════════════════════════════════════════════════════════════════════════════

// 'local' = Betrieb mit physischem Einzugsgebiet (LocalBusiness-Schema ist angebracht).
// alles andere (regional/national/global/Hersteller/Online-only) → LocalBusiness ist N/A.
function isLocalScope(scope) {
    return scope === undefined || scope === null || scope === "local";
}

// Technik (gemessen, max 52). Gibt null zurück, wenn die Seite NICHT erreichbar oder blockiert
// war (keine echten Signale) → dann bleibt der ehrliche LLM-Score (reines Trainingswissen).
// scope-abhängig: lokal gewichtet LocalBusiness mit; nicht-lokal verteilt diese Punkte auf die
// universellen Signale (Schema/Meta/FAQ), weil LocalBusiness dort kein sinnvolles Ziel ist.
function kiVisTech(signals, scope) {
    if (!signals || signals.reachable !== true || signals.blocked) return null;
    let tech = 0;
    if (isLocalScope(scope)) {
        if (signals.hasSchema) tech += 12;
        if (signals.hasLocalBusinessSchema) tech += 14;
        if (signals.hasMetaDescription) tech += 8;
        if (signals.hasFaqSchema) tech += 18;            // tech max = 52
    } else {
        // Hersteller/Konzern/globale Marke: LocalBusiness entfällt (14 Pkt umverteilt → +6/+4/+4).
        if (signals.hasSchema) tech += 18;               // Organization/Product-Schema = die Entität
        if (signals.hasMetaDescription) tech += 12;
        if (signals.hasFaqSchema) tech += 22;            // tech max = 52
    }
    return tech;
}

function kiVisKnow(knowledgeLevel) {
    // Trainingswissen (LLM-Urteil, 3-stufig → stabiler als eine freie Zahl). „keine"-Sockel = 10,
    // damit eine technisch komplette Seite (alle Signale grün) nicht je nach keine/vage-Urteil über
    // eine Label-Grenze springt: 52+10=62 und 52+24=76 liegen beide im Band „Solide Basis".
    return knowledgeLevel === "solide" ? 48 : knowledgeLevel === "vage" ? 24 : 10; // max 48
}

function kiVisScore(signals, knowledgeLevel, scope) {
    const tech = kiVisTech(signals, scope);
    if (tech === null) return null;
    return Math.max(0, Math.min(100, Math.round(tech + kiVisKnow(knowledgeLevel))));
}

// Aufschlüsselung fürs UI: beantwortet „warum nicht 100?" ehrlich — die Technik-Hälfte steuert
// die Website, die Wissens-Hälfte wächst nur über externe Erwähnungen + Zeit (Off-Site-Hebel).
// localApplies sagt dem Frontend, ob der LocalBusiness-Chip überhaupt angezeigt werden soll.
function kiVisParts(signals, knowledgeLevel, scope) {
    const tech = kiVisTech(signals, scope);
    if (tech === null) return null;
    return { tech, techMax: 52, know: kiVisKnow(knowledgeLevel), knowMax: 48, localApplies: isLocalScope(scope) };
}

function kiVisLabel(score) {
    if (score >= 80) return "Technisch stark — KI-Basis gelegt";
    if (score >= 60) return "Solide Basis — KI-Training noch dünn";
    if (score >= 40) return "Grundlage da — KI-Ausbau nötig";
    return "Für KI noch kaum sichtbar";
}

// Grüne (gemessen vorhandene) Signale dürfen NICHT als Lücke erscheinen — sonst widerspricht der
// „Warum die KI Sie kaum findet"-Block den grünen Chips daneben. Server-seitiges Netz zusätzlich
// zur Prompt-Anweisung. Streicht: (a) llms.txt IMMER (Doktrin), (b) gaps/fixes über ein bereits
// grünes Signal, (c) bei nicht-lokalem Scope alle LocalBusiness-/„lokale Sichtbarkeit"-Befunde
// (für einen Hersteller kein Mangel), (d) bei Bot-Wall alle technischen Website-Mängel (ungeprüft).
function reconcileKiVis(result, signals, scope) {
    if (!result || !signals) return result;
    const llms = /llms\.?txt/i;
    const localBiz = /localbusiness|local-business|lokale[rsn]? (sichtbarkeit|signale|auffindbarkeit|suche)|standortbezogen|local seo|google[- ]?(unternehmens|business)[- ]?profil/i;
    const techMangel = /schema|strukturierte daten|json-?ld|markup|meta-?descr|meta-?beschreib|\bfaq\b|server-?gerendert|crawl|ladezeit|core web vitals/i;
    const present = [];
    if (signals.hasFaqSchema) present.push(/\bfaq/i);
    // „schema" nur als EIGENSTÄNDIGES Wort werten — NICHT in „LocalBusiness-Schema"/„FAQ-Schema"
    // (sonst streicht ein vorhandenes generisches Schema fälschlich den Mangel eines fehlenden Subtyps).
    if (signals.hasSchema) present.push(/(?<![\w-])schema\b|strukturierte daten|json-?ld|markup/i);
    if (signals.hasLocalBusinessSchema) present.push(/localbusiness|local-business/i);
    if (signals.hasMetaDescription) present.push(/meta-?descr|meta-?beschreib/i);
    const hits = (txt) => present.some((re) => re.test(txt || ""));
    const nonLocal = !isLocalScope(scope);
    const blocked = !!signals.blocked;
    if (Array.isArray(result.gaps)) {
        result.gaps = result.gaps.filter((g) => {
            const txt = (g.gap || "") + " " + (g.why || "");
            if (llms.test(txt)) return false;
            if (nonLocal && localBiz.test(txt)) return false;     // Hersteller: kein lokaler Mangel
            if (blocked && techMangel.test(txt)) return false;    // Bot-Wall: Technik ungeprüft
            return !hits(txt);
        });
    }
    if (Array.isArray(result.fixes)) {
        const addVerb = /(ergänz|hinzufüg|einführ|implementier|einbau|anleg|erstell|aufsetz|nachrüst|fehlt)/i;
        result.fixes = result.fixes.filter((f) => {
            const txt = (f.fix || "") + " " + (f.impact || "");
            if (llms.test(txt)) return false;
            if (nonLocal && localBiz.test(txt)) return false;
            if (blocked && techMangel.test(txt)) return false;
            if (signals.hasFaqSchema && /\bfaq/i.test(txt)) return false;
            return !(hits(txt) && addVerb.test(txt));
        });
    }
    return result;
}

module.exports = { kiVisScore, kiVisParts, kiVisLabel, reconcileKiVis, isLocalScope };
