/**
 * Shannon-Entropie / Individualisierungs-Index (Modul W4)
 *
 * Misst wie viel einzigartige Information eine Website hat.
 * Niedrige Shannon-Entropie = Template/Baukasten = guter Lead
 * (Geschaeft ist besser als sein Online-Auftritt).
 *
 * @module analysis/shannon
 */

/**
 * Berechnet den Shannon-Informationsgehalt der Website
 *
 * @param {Object} psiData - PageSpeed Insights API Response
 * @param {Object} tech - Tech-Detection Ergebnis
 * @returns {{H: number, resourceEntropy: number, thirdPartyRatio: number,
 *            templatePenalty: number, imageQuality: number, label: string}}
 */
export function calculateShannon(psiData, tech) {
    const lh = psiData?.lighthouseResult || {};
    const audits = lh.audits || {};

    // Signal 1: Resource-Diversitaet (viele gleiche Typen = Template)
    const netItems = audits['network-requests']?.details?.items || [];
    const mimeTypes = {};
    for (const item of netItems) {
        const mime = item.mimeType || 'unknown';
        const category = mime.includes('image') ? 'image'
            : mime.includes('script') ? 'script'
            : mime.includes('css') ? 'css'
            : mime.includes('font') ? 'font'
            : mime.includes('html') ? 'html'
            : 'other';
        mimeTypes[category] = (mimeTypes[category] || 0) + 1;
    }
    const total = netItems.length || 1;
    let resourceEntropy = 0;
    for (const count of Object.values(mimeTypes)) {
        const p = count / total;
        if (p > 0) resourceEntropy -= p * Math.log2(p);
    }
    // Normalisiere: Max Entropie bei 6 Kategorien = log2(6) = 2.58
    const normalizedResourceEntropy = Math.min(1, resourceEntropy / 2.58);

    // Signal 2: Third-Party vs First-Party Ratio
    const finalUrl = lh.finalDisplayedUrl || '';
    let domain = '';
    try { domain = new URL(finalUrl).hostname; } catch (e) { /* ignore */ }
    const firstParty = netItems.filter(i => i.url && i.url.includes(domain)).length;
    const thirdParty = netItems.length - firstParty;
    const thirdPartyRatio = netItems.length > 0 ? thirdParty / netItems.length : 0;

    // Signal 3: Baukasten-Indikator (Templates haben sehr niedrige Informations-Entropie)
    const templatePenalty = tech.isBaukasten ? 0.7
        : (tech.cms || '').includes('WordPress') ? 0.3
        : 0;

    // Signal 4: Bild-Eigenleistung (eigene Bilder vs Stock)
    const images = netItems.filter(i => (i.mimeType || '').includes('image'));
    const avgImageSize = images.length > 0
        ? images.reduce((s, i) => s + (i.transferSize || 0), 0) / images.length
        : 0;
    const imageQuality = avgImageSize > 50000 ? 0.8
        : avgImageSize > 15000 ? 0.5
        : 0.2;

    // Gesamt Shannon-Informationsgehalt (0-1, NIEDRIG = Template, HOCH = Custom)
    const H = (
        normalizedResourceEntropy * 0.20 +
        (1 - thirdPartyRatio)     * 0.25 +
        (1 - templatePenalty)      * 0.30 +
        imageQuality              * 0.25
    );

    return {
        H: Math.round(H * 100) / 100,
        resourceEntropy: Math.round(normalizedResourceEntropy * 100) / 100,
        thirdPartyRatio: Math.round(thirdPartyRatio * 100),
        templatePenalty,
        imageQuality: Math.round(imageQuality * 100) / 100,
        label: H <= 0.3 ? 'Sehr niedrig — Template/Baukasten, Geschaeft verdient besseren Auftritt'
            : H <= 0.5 ? 'Niedrig — wenig einzigartiger Content'
            : H <= 0.7 ? 'Mittel — teilweise individualisiert'
            : 'Hoch — bereits stark individualisierte Website'
    };
}
