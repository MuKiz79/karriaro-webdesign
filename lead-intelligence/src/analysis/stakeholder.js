/**
 * 7. Multi-Stakeholder Erkennung
 * Wer entscheidet? Einzelunternehmer entscheidet sofort, GmbH braucht Vorstandsvorschlag.
 */

export function detectStakeholder(psiData, place) {
    const urls = (psiData?.lighthouseResult?.audits?.['network-requests']?.details?.items || []).map(i => i.url || '').join(' ');
    const finalUrl = psiData?.lighthouseResult?.finalDisplayedUrl || '';

    const signals = {};

    // Rechtsform aus Domain/URL ableiten
    if (/gmbh|mbh/i.test(finalUrl + ' ' + urls)) signals.rechtsform = 'GmbH';
    else if (/gbr|partg/i.test(finalUrl + ' ' + urls)) signals.rechtsform = 'GbR/PartG';
    else if (/ag\.de|\.ag/i.test(finalUrl)) signals.rechtsform = 'AG';
    else signals.rechtsform = 'Unbekannt (wahrscheinlich Einzelunternehmer)';

    // Team-Größe schätzen
    const reviews = place?.userRatingCount || 0;
    let teamSize;
    if (reviews > 200) teamSize = 'Mittel bis groß (10+ Mitarbeiter)';
    else if (reviews > 50) teamSize = 'Klein bis mittel (5-15 Mitarbeiter)';
    else if (reviews > 10) teamSize = 'Klein (2-5 Mitarbeiter)';
    else teamSize = 'Sehr klein (1-3 Mitarbeiter)';

    // Entscheider-Typ
    const isLikelySoloOwner = reviews < 30 && signals.rechtsform.includes('Einzelunternehmer');
    const decisionMaker = isLikelySoloOwner
        ? { type: 'Inhaber direkt', speed: 'schnell', approach: 'Direkt ansprechen — entscheidet allein, keine Abstimmung nötig' }
        : reviews > 100
            ? { type: 'Geschäftsführer oder Marketing-Verantwortlicher', speed: 'langsam', approach: 'Professionelles Angebot mit ROI-Berechnung — wird intern weitergeleitet' }
            : { type: 'Inhaber oder Geschäftsführer', speed: 'mittel', approach: 'Persönlich ansprechen, eventuell mit Ehepartner/Geschäftspartner abstimmen' };

    return {
        rechtsform: signals.rechtsform,
        teamSize,
        decisionMaker,
        isLikelySoloOwner,
        salesCycle: isLikelySoloOwner ? '1-2 Wochen' : reviews > 100 ? '4-8 Wochen' : '2-4 Wochen',
        label: `${decisionMaker.type} · Entscheidung: ${decisionMaker.speed} · ${decisionMaker.approach}`
    };
}
