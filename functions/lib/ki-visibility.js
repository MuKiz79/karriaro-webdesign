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
// ════════════════════════════════════════════════════════════════════════════

// Technik (gemessen, max 52) + KI-Trainingswissen (LLM-Urteil, max 48) = 0–100, reproduzierbar.
// Gibt null zurück, wenn die Seite NICHT erreichbar war (keine echten Signale) → dann bleibt der
// ehrliche LLM-Score (reines Trainingswissen) bestehen, statt technische Signale zu erfinden.
function kiVisScore(signals, knowledgeLevel) {
    if (!signals || signals.reachable !== true) return null;
    let tech = 0;
    if (signals.hasSchema) tech += 10;
    if (signals.hasLocalBusinessSchema) tech += 12;
    if (signals.hasMetaDescription) tech += 6;
    if (signals.hasLlmsTxt) tech += 10;
    if (signals.hasFaqSchema) tech += 14;            // tech max = 52
    // Trainingswissen (LLM-Urteil, 3-stufig → stabiler als eine freie Zahl). „keine"-Sockel = 10,
    // damit eine technisch komplette Seite (alle Signale grün) nicht je nach keine/vage-Urteil über
    // eine Label-Grenze springt: 52+10=62 und 52+24=76 liegen beide im Band „Solide Basis".
    const know = knowledgeLevel === "solide" ? 48 : knowledgeLevel === "vage" ? 24 : 10; // max 48
    return Math.max(0, Math.min(100, Math.round(tech + know)));
}

function kiVisLabel(score) {
    if (score >= 80) return "Technisch stark — KI-Basis gelegt";
    if (score >= 60) return "Solide Basis — KI-Training noch dünn";
    if (score >= 40) return "Grundlage da — KI-Ausbau nötig";
    return "Für KI noch kaum sichtbar";
}

// Grüne (gemessen vorhandene) Signale dürfen NICHT als Lücke erscheinen — sonst widerspricht der
// „Warum die KI Sie kaum findet"-Block den grünen Chips daneben. Server-seitiges Netz zusätzlich
// zur Prompt-Anweisung: gaps streichen, die ein vorhandenes Signal als fehlend/schwach/„Qualität
// unbekannt" behaupten; Fixes streichen, die ein vorhandenes Signal NEU ergänzen (Verb-gated;
// „optimieren/erweitern" bleibt = legitime Verbesserung des Bestehenden). Mutiert result in place.
function reconcileKiVis(result, signals) {
    if (!result || !signals) return result;
    const present = [];
    if (signals.hasFaqSchema) present.push(/\bfaq/i);
    if (signals.hasSchema) present.push(/\bschema\b|strukturierte daten|json-?ld|markup/i);
    if (signals.hasLocalBusinessSchema) present.push(/localbusiness|local-business/i);
    if (signals.hasMetaDescription) present.push(/meta-?descr|meta-?beschreib/i);
    if (signals.hasLlmsTxt) present.push(/llms\.?txt/i);
    const hits = (txt) => present.some((re) => re.test(txt || ""));
    if (Array.isArray(result.gaps)) {
        result.gaps = result.gaps.filter((g) => !hits((g.gap || "") + " " + (g.why || "")));
    }
    if (Array.isArray(result.fixes)) {
        const addVerb = /(ergänz|hinzufüg|einführ|implementier|einbau|anleg|erstell|aufsetz|nachrüst|fehlt)/i;
        result.fixes = result.fixes.filter((f) => {
            const txt = (f.fix || "") + " " + (f.impact || "");
            // FAQ-Schema ist binär vorhanden → jeder FAQ-Fix ist redundant, egal mit welchem Verb
            // (z.B. „FAQ-Schema für typische Fragen" ohne Verb). Häufigster halluzinierter Fix.
            if (signals.hasFaqSchema && /\bfaq/i.test(txt)) return false;
            // sonst: nur das NEU-Ergänzen eines vorhandenen Signals streichen („optimieren/erweitern" bleibt).
            return !(hits(txt) && addVerb.test(txt));
        });
    }
    return result;
}

module.exports = { kiVisScore, kiVisLabel, reconcileKiVis };
