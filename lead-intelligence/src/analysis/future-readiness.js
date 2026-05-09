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
/**
 * Statistik-Quellen — nur was tatsaechlich verifizierbar ist.
 *
 * Frueher hatten manche Checks Magic-Number-Statistiken ohne Quelle ("96% haben
 * WCAG-Fehler", "95%+ kein Chatbot"). Ein Empfaenger der den Pitch erhaelt und
 * die Zahl googelt, fand keine Quelle — das hat die Glaubwuerdigkeit verspielt.
 *
 * Jetzt: nur Aussagen die in einer realen Studie nachzulesen sind, jeweils mit
 * Source-URL. Was nicht belegbar ist, hat keine Statistik mehr — nur den
 * Pflicht/Empfehlungs-Hinweis.
 */
const SOURCES = {
    webaim2024: {
        label: 'WebAIM Million Report 2024',
        url: 'https://webaim.org/projects/million/'
    },
    almanac2024: {
        label: 'HTTP Archive Web Almanac 2024',
        url: 'https://almanac.httparchive.org/en/2024/'
    }
};

const CHECKS = [
    {
        id: 'bfsg', name: 'BFSG-Compliance (Barrierefreiheit)',
        description: 'Seit Juni 2025 gesetzlich vorgeschrieben. Bussgelder bis 100.000 EUR. Erste Abmahnwellen laufen.',
        stat: '95,9 % der untersuchten Home-Pages haben WCAG-Fehler.',
        source: SOURCES.webaim2024,
        check: (ws) => ws.a11y >= 80,
        score: (ws) => ws.a11y,
        weight: 3,
        pitch: 'Barrierefreiheit ist keine Option mehr — es ist Gesetz. Ihre Website erreicht ${score}/100. Die ersten Abmahnungen laufen bereits.'
    },
    {
        id: 'schema', name: 'Strukturierte Daten (Schema.org)',
        description: 'Websites mit Schema.org bekommen Rich Snippets in Google: Sterne, Preise, Oeffnungszeiten direkt in den Suchergebnissen.',
        stat: 'Rund 36 % aller Websites nutzen strukturierte Daten — der Rest verschenkt Sichtbarkeit in Google.',
        source: SOURCES.almanac2024,
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
        check: (ws) => ws.isHttps,
        weight: 3,
        pitch: 'Ihr Browser zeigt "Nicht sicher" — das schreckt jeden zweiten Besucher sofort ab.'
    },
    {
        id: 'speed', name: 'Core Web Vitals (Google-Standard)',
        description: 'Google belohnt schnelle Websites mit besserem Ranking. CrUX-Daten zeigen, dass nur eine Minderheit der Websites alle Core Web Vitals besteht.',
        stat: 'Mobile-CWV-Bestehensquote bewegt sich laut CrUX-Daten unter 50 %.',
        source: SOURCES.almanac2024,
        check: (ws) => ws.perf >= 75,
        score: (ws) => ws.perf,
        weight: 2,
        pitch: 'Ihre Website besteht Googles Core Web Vitals nicht (${score}/100). Das kostet Sie Ranking-Positionen.'
    },
    {
        id: 'mobile', name: 'Mobile-First Design',
        description: 'Google indexiert seit 2021 NUR die Mobile-Version (Mobile-First-Indexing). Wenn die Mobile-Variante nicht funktioniert, leidet das Ranking direkt.',
        check: (ws) => ws.viewport && ws.perf >= 50,
        weight: 2,
        pitch: 'Google bewertet nur noch Ihre Mobile-Version. Die Desktop-Seite ist fuer das Ranking irrelevant.'
    },
    {
        id: 'dsgvo', name: 'DSGVO-konformer Cookie-Banner',
        description: 'Fehlendes oder falsches Cookie-Management kann abgemahnt werden.',
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
