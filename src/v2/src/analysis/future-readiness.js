/**
 * Zukunfts-Readiness Check 2026
 *
 * Prueft ob eine Website fuer 2026+ geruestet ist.
 * BFSG, KI-Chatbot, Voice Search, Schema.org, Core Web Vitals,
 * Mobile-First, DSGVO-Cookie-Banner.
 *
 * @module analysis/future-readiness
 */

/**
 * Einzelne Zukunfts-Checks mit Gewichtung
 * @type {Array<Object>}
 */
const CHECKS = [
    {
        id: 'bfsg', name: 'BFSG-Compliance (Barrierefreiheit)',
        description: 'Seit Juni 2025 gesetzlich vorgeschrieben. Bussgelder bis 100.000 EUR. Erste Abmahnwellen laufen.',
        stat: '0% der deutschen Websites sind vollstaendig konform (AccessiWay 2025). 96% haben WCAG-Fehler.',
        check: (ws) => ws.a11y >= 80,
        score: (ws) => ws.a11y,
        weight: 3,
        pitch: 'Barrierefreiheit ist keine Option mehr — es ist Gesetz. Ihre Website erreicht ${score}/100. Die ersten Abmahnungen laufen bereits.'
    },
    {
        id: 'chatbot', name: 'KI-Chatbot / Sofort-Antworten',
        description: '87% der Kunden erwarten sofortige Antworten. KI-Chatbots steigern Conversions um 20-30%.',
        stat: '95%+ der lokalen Unternehmen haben keinen Chatbot. Ihr Wettbewerbsvorteil.',
        check: (ws, psiData) => {
            const urls = (psiData?.lighthouseResult?.audits?.['network-requests']?.details?.items || []).map(i => i.url || '').join(' ');
            return /tidio|intercom|drift|crisp|livechat|tawk|hubspot.*chat|zendesk.*chat|freshchat|chatbot|messenger.*plugin/i.test(urls);
        },
        weight: 2,
        pitch: 'Ihr Konkurrent hat einen Chatbot der um 23 Uhr Termine bucht. Sie haben ein Kontaktformular. 87% der Kunden erwarten sofortige Antworten.'
    },
    {
        id: 'voice', name: 'Voice Search Optimierung',
        description: '58% nutzen Sprachsuche fuer lokale Geschaefte. 76% der Sprachsuchen sind "in der Naehe"-Anfragen.',
        stat: '90%+ der lokalen Websites sind nicht fuer Sprachsuche optimiert.',
        check: (ws, psiData) => {
            const urls = (psiData?.lighthouseResult?.audits?.['network-requests']?.details?.items || []).map(i => i.url || '').join(' ');
            return /schema\.org|application\/ld\+json|speakable/i.test(urls) && ws.seo >= 80;
        },
        weight: 2,
        pitch: '"Hey Siri, finde einen ${branche} in der Naehe" — funktioniert das fuer Ihre Website? 58% der Kunden suchen per Stimme.'
    },
    {
        id: 'schema', name: 'Strukturierte Daten (Schema.org)',
        description: 'Websites mit Schema.org bekommen Rich Snippets in Google: Sterne, Preise, Oeffnungszeiten direkt in den Suchergebnissen.',
        stat: '80%+ der lokalen Websites haben kein Schema.org. 40% mehr Klicks mit Rich Snippets.',
        check: (ws, psiData) => {
            const urls = (psiData?.lighthouseResult?.audits?.['network-requests']?.details?.items || []).map(i => i.url || '').join(' ');
            return /schema\.org|application\/ld\+json|structured.*data/i.test(urls);
        },
        weight: 1,
        pitch: 'Ihre Konkurrenz zeigt Sterne, Preise und Oeffnungszeiten direkt in Google. Sie zeigen nur einen blauen Link.'
    },
    {
        id: 'https', name: 'HTTPS-Verschluesselung',
        description: 'Google Chrome zeigt "Nicht sicher" an. Pflicht fuer jede serioese Website.',
        stat: 'Immer noch ~5% der lokalen Websites ohne SSL.',
        check: (ws) => ws.isHttps,
        weight: 3,
        pitch: 'Ihr Browser zeigt "Nicht sicher" — das schreckt jeden zweiten Besucher sofort ab.'
    },
    {
        id: 'speed', name: 'Core Web Vitals (Google-Standard)',
        description: 'Google belohnt schnelle Websites mit besserem Ranking. 24% weniger Abbrueche bei Einhaltung.',
        stat: 'Nur ~33% der Websites bestehen alle Core Web Vitals.',
        check: (ws) => ws.perf >= 75,
        score: (ws) => ws.perf,
        weight: 2,
        pitch: 'Ihre Website besteht Googles Core Web Vitals nicht (${score}/100). Das kostet Sie Ranking-Positionen.'
    },
    {
        id: 'mobile', name: 'Mobile-First Design',
        description: '60%+ des Traffics kommt vom Handy. Google indexiert seit 2021 NUR die Mobile-Version.',
        stat: '~30% der lokalen Websites sind immer noch nicht wirklich mobile-optimiert.',
        check: (ws) => ws.viewport && ws.perf >= 50,
        weight: 2,
        pitch: 'Google bewertet nur noch Ihre Mobile-Version. Die Desktop-Seite ist fuer das Ranking irrelevant.'
    },
    {
        id: 'dsgvo', name: 'DSGVO-konformer Cookie-Banner',
        description: 'Fehlendes oder falsches Cookie-Management kann abgemahnt werden.',
        stat: 'Viele Websites nutzen noch "Alle akzeptieren"-Buttons ohne echte Wahlmoeglichkeit.',
        check: (ws, psiData) => {
            const urls = (psiData?.lighthouseResult?.audits?.['network-requests']?.details?.items || []).map(i => i.url || '').join(' ');
            return /cookiebot|cookieconsent|onetrust|usercentrics|borlabs.*cookie|tarteaucitron|klaro/i.test(urls);
        },
        weight: 1,
        pitch: 'Kein DSGVO-konformer Cookie-Banner erkannt. Das ist ein Abmahnrisiko.'
    }
];

/**
 * Analysiert Zukunfts-Readiness einer Website
 *
 * @param {Object} ws - Website-Score
 * @param {Object} psiData - PageSpeed Insights API Response
 * @returns {{results: Array, passed: Array, failed: Array, criticalFails: Array,
 *            readinessScore: number, label: string, pitchArguments: string[]}}
 */
export function analyzeFutureReadiness(ws, psiData) {
    const results = CHECKS.map(c => {
        const passed = c.check(ws, psiData);
        const currentScore = c.score ? c.score(ws) : null;
        return { ...c, passed, currentScore };
    });

    const passed = results.filter(r => r.passed);
    const failed = results.filter(r => !r.passed);
    const totalWeight = results.reduce((s, r) => s + r.weight, 0);
    const passedWeight = passed.reduce((s, r) => s + r.weight, 0);
    const readinessScore = Math.round((passedWeight / totalWeight) * 100);

    const criticalFails = failed.filter(r => r.weight >= 3);

    return {
        results,
        passed,
        failed,
        criticalFails,
        readinessScore,
        label: readinessScore >= 75 ? 'Zukunftssicher'
            : readinessScore >= 40 ? 'Teilweise bereit'
            : 'Nicht zukunftsfaehig',
        pitchArguments: failed.map(f => {
            let pitch = f.pitch;
            if (f.currentScore !== null) pitch = pitch.replace('${score}', f.currentScore);
            return pitch;
        })
    };
}
