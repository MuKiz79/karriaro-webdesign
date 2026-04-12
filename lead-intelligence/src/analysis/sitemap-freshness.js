/**
 * #5 Sitemap-Freshness — Content-Aktualität aus sitemap.xml
 *
 * sitemap.xml → <lastmod> zeigt wann jede Seite zuletzt geändert wurde.
 * Genauer als Wayback Machine. Kostenlos. Kein API-Key nötig.
 */

/**
 * Prüft die Sitemap einer Website auf Content-Freshness
 * @param {string} url - Website URL
 * @returns {Object} Freshness-Analyse
 */
export async function checkSitemapFreshness(url) {
    try {
        const origin = new URL(url).origin;
        const sitemapUrls = [
            `${origin}/sitemap.xml`,
            `${origin}/sitemap_index.xml`,
            `${origin}/wp-sitemap.xml` // WordPress
        ];

        let sitemapContent = null;
        for (const sUrl of sitemapUrls) {
            try {
                const res = await fetch(sUrl, {
                    signal: AbortSignal.timeout(5000),
                    headers: { 'User-Agent': 'Mozilla/5.0' }
                });
                if (res.ok) {
                    const text = await res.text();
                    if (text.includes('<urlset') || text.includes('<sitemapindex')) {
                        sitemapContent = text;
                        break;
                    }
                }
            } catch { continue; }
        }

        if (!sitemapContent) return { available: false };

        // Extrahiere <lastmod> Daten
        const lastmods = [...sitemapContent.matchAll(/<lastmod>([^<]+)<\/lastmod>/gi)]
            .map(m => new Date(m[1]))
            .filter(d => !isNaN(d.getTime()))
            .sort((a, b) => b - a);

        if (lastmods.length === 0) return { available: true, hasLastmod: false, label: 'Sitemap ohne Datumsangaben' };

        const newest = lastmods[0];
        const oldest = lastmods[lastmods.length - 1];
        const now = new Date();
        const daysSinceNewest = Math.round((now - newest) / (1000 * 60 * 60 * 24));
        const totalPages = lastmods.length;

        // Wie viele Seiten wurden in den letzten 90 Tagen aktualisiert?
        const recentlyUpdated = lastmods.filter(d => (now - d) < 90 * 24 * 60 * 60 * 1000).length;
        const updateRate = totalPages > 0 ? Math.round(recentlyUpdated / totalPages * 100) : 0;

        let freshness, label;
        if (daysSinceNewest < 30) {
            freshness = 'aktuell';
            label = `Letzte Änderung vor ${daysSinceNewest} Tagen — Website wird aktiv gepflegt`;
        } else if (daysSinceNewest < 180) {
            freshness = 'mäßig';
            label = `Letzte Änderung vor ${Math.round(daysSinceNewest / 30)} Monaten`;
        } else if (daysSinceNewest < 365) {
            freshness = 'veraltet';
            label = `Seit ${Math.round(daysSinceNewest / 30)} Monaten nicht aktualisiert`;
        } else {
            freshness = 'aufgegeben';
            label = `Seit ${Math.round(daysSinceNewest / 365 * 10) / 10} Jahren nicht aktualisiert`;
        }

        return {
            available: true,
            hasLastmod: true,
            newestUpdate: newest.toISOString().slice(0, 10),
            daysSinceNewest,
            totalPages,
            recentlyUpdated,
            updateRate,
            freshness,
            label,
            pitchArg: daysSinceNewest > 180
                ? `Laut Sitemap wurde Ihre Website seit ${Math.round(daysSinceNewest / 30)} Monaten nicht aktualisiert. Nur ${updateRate}% der Seiten wurden in den letzten 3 Monaten geändert.`
                : null,
            funnelImpact: daysSinceNewest > 365 ? 3 : daysSinceNewest > 180 ? 2 : 0
        };
    } catch (e) {
        return { available: false, error: e.message };
    }
}
