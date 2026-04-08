/**
 * 1. Wayback Machine Freshness Score
 * Nutzt die Internet Archive API um zu erkennen wann eine Website zuletzt geändert wurde
 * API: https://archive.org/wayback/available?url=DOMAIN&timestamp=YYYYMMDD
 */

/**
 * Prüfe wann die Website zuletzt im Wayback Machine archiviert wurde
 * @param {string} url - Website URL
 * @returns {Object} { lastChanged, daysSince, yearsSince, label }
 */
export async function checkFreshness(url) {
    try {
        // Aktuellster Snapshot
        const res = await fetch(`https://archive.org/wayback/available?url=${encodeURIComponent(url)}&timestamp=${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)}`);
        if (!res.ok) return { available: false };
        const data = await res.json();
        const snapshot = data.archived_snapshots?.closest;
        if (!snapshot?.timestamp) return { available: false };

        // Ältester Snapshot (um Domain-Alter zu schätzen)
        const oldRes = await fetch(`https://archive.org/wayback/available?url=${encodeURIComponent(url)}&timestamp=20000101`);
        const oldData = await oldRes.json();
        const oldest = oldData.archived_snapshots?.closest;

        const lastDate = parseWaybackDate(snapshot.timestamp);
        const oldestDate = oldest?.timestamp ? parseWaybackDate(oldest.timestamp) : null;
        const now = new Date();
        const daysSince = Math.round((now - lastDate) / (1000 * 60 * 60 * 24));
        const yearsSince = Math.round(daysSince / 365 * 10) / 10;

        // Wie alt ist die Domain überhaupt?
        const domainAgeDays = oldestDate ? Math.round((now - oldestDate) / (1000 * 60 * 60 * 24)) : null;
        const domainAgeYears = domainAgeDays ? Math.round(domainAgeDays / 365 * 10) / 10 : null;

        // Freshness Score: Wie kürzlich wurde die Seite aktualisiert?
        let freshness, label;
        if (daysSince < 30) { freshness = 'aktuell'; label = 'Letzte Änderung vor weniger als einem Monat'; }
        else if (daysSince < 180) { freshness = 'relativ_aktuell'; label = `Letzte Änderung vor ${Math.round(daysSince / 30)} Monaten`; }
        else if (daysSince < 365) { freshness = 'veraltet'; label = `Letzte Änderung vor ${Math.round(daysSince / 30)} Monaten — wird vernachlässigt`; }
        else if (daysSince < 730) { freshness = 'stark_veraltet'; label = `Seit ${yearsSince} Jahren nicht aktualisiert`; }
        else { freshness = 'aufgegeben'; label = `Seit ${yearsSince} Jahren nicht angefasst — Website ist aufgegeben`; }

        // Pitch-Argument
        const pitchArg = daysSince > 365
            ? `Ihre Website wurde seit ${yearsSince > 1 ? yearsSince + ' Jahren' : Math.round(daysSince / 30) + ' Monaten'} nicht aktualisiert (laut Internet Archive). In dieser Zeit hat sich im Web alles verändert — Google-Algorithmen, Mobile-Nutzung, Barrierefreiheits-Gesetz.`
            : null;

        return {
            available: true,
            lastChanged: lastDate.toISOString().slice(0, 10),
            daysSince,
            yearsSince,
            freshness,
            label,
            domainAgeYears,
            firstSeen: oldestDate?.toISOString().slice(0, 10) || null,
            pitchArg,
            funnelImpact: daysSince > 730 ? 4 : daysSince > 365 ? 3 : daysSince > 180 ? 1 : 0
        };
    } catch (e) {
        return { available: false, error: e.message };
    }
}

function parseWaybackDate(ts) {
    // Format: YYYYMMDDHHmmss
    return new Date(`${ts.slice(0,4)}-${ts.slice(4,6)}-${ts.slice(6,8)}T${ts.slice(8,10)}:${ts.slice(10,12)}:${ts.slice(12,14)}Z`);
}
