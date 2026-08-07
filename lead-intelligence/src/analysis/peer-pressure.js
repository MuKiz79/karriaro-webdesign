/**
 * Wettbewerbsdruck (F12) — das einzige Signal in diesem Werkzeug, das NICHTS kostet.
 *
 * ─── Warum das vorher fehlte ────────────────────────────────────────────────
 * Bei einem Stadt-Scan liegen alle Branchenkollegen samt gemessener Werte bereits
 * im Speicher. Trotzdem wurde jeder Lead isoliert bewertet — „Perf 63, Wix" ohne
 * jeden Bezug dazu, wie die anderen Zahnärzte derselben Stadt dastehen.
 *
 * Der Unterschied ist verkaufsentscheidend: Eine schwache Seite unter lauter
 * schwachen Seiten erzeugt keinen Handlungsdruck — der Inhaber sieht bei der
 * Konkurrenz dasselbe Bild. Eine schwache Seite, während die drei nächsten
 * Wettbewerber mobil optimiert und schnell sind, ist ein sichtbarer Nachteil,
 * der sich in einem Satz belegen lässt.
 *
 * ─── Ehrlichkeit ───────────────────────────────────────────────────────────
 * Der Aufschlag ist bewusst klein (max. ×1.15) und braucht mindestens
 * MIN_PEERS Vergleichsbetriebe. Aus drei Datenpunkten wird kein Urteil über
 * einen Markt abgeleitet. Und es gibt KEINEN Abschlag für den umgekehrten Fall:
 * dass die Konkurrenz auch schlecht ist, macht den Lead nicht schlechter —
 * es macht das Argument nur schwächer.
 *
 * @module analysis/peer-pressure
 */

/** Unter so vielen Vergleichsbetrieben ist die Verteilung nicht aussagekräftig. */
export const MIN_PEERS = 5;

/** Deckel des Aufschlags — Wettbewerbsdruck ist ein Verstärker, kein Hauptsignal. */
export const MAX_PEER_MULT = 1.15;

function median(nums) {
    if (!nums.length) return null;
    const s = [...nums].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Rechnet je Lead aus, wie weit er hinter seinen Branchenkollegen zurückliegt.
 *
 * Mutiert NICHT — gibt eine Map domain→Ergebnis zurück, der Aufrufer entscheidet,
 * was er damit tut.
 *
 * @param {Array<{domain:string, branch:{key:string}, ws:object, badnessScore:number}>} leads
 * @returns {Map<string, {mult:number, chip:string|null, pitch:string|null,
 *                        peers:number, behindOn:string[]}>}
 */
export function computePeerPressure(leads) {
    const out = new Map();
    if (!Array.isArray(leads) || leads.length === 0) return out;

    // Nach Branche gruppieren — verglichen wird nur innerhalb derselben Branche.
    // Ein Zahnarzt konkurriert nicht mit einem Umzugsunternehmen um Sichtbarkeit.
    const byBranch = new Map();
    for (const l of leads) {
        const key = l?.branch?.key;
        if (!key || !l.domain) continue;
        if (!byBranch.has(key)) byBranch.set(key, []);
        byBranch.get(key).push(l);
    }

    for (const [, group] of byBranch) {
        if (group.length < MIN_PEERS) {
            for (const l of group) out.set(l.domain, neutral(group.length));
            continue;
        }
        const perfs = group.map(l => (typeof l.ws?.perf === 'number' ? l.ws.perf : null)).filter(p => p !== null);
        const medPerf = median(perfs);
        const mobileShare = group.filter(l => l.ws?.viewport !== false && l.ws?.viewportMissing !== true).length / group.length;
        const httpsShare = group.filter(l => l.ws?.isHttps !== false).length / group.length;

        for (const l of group) {
            const behindOn = [];
            const peers = group.length - 1;

            // Deutlich langsamer als der Branchen-Median (>=15 Punkte) — 15 ist
            // gross genug, dass Messrauschen im PSI-Lab es nicht erzeugt.
            const perf = typeof l.ws?.perf === 'number' ? l.ws.perf : null;
            const slower = medPerf !== null && perf !== null && (medPerf - perf) >= 15;
            if (slower) behindOn.push('Ladezeit');

            // Nicht mobil, obwohl die klare Mehrheit der Branche es ist.
            const notMobile = l.ws?.viewport === false || l.ws?.viewportMissing === true;
            if (notMobile && mobileShare >= 0.7) behindOn.push('Mobilnutzung');

            // Kein SSL, obwohl die Branche fast durchgängig verschlüsselt.
            const noSsl = l.ws?.isHttps === false;
            if (noSsl && httpsShare >= 0.8) behindOn.push('Verschlüsselung');

            if (behindOn.length === 0) { out.set(l.domain, neutral(group.length)); continue; }

            // Ein Rückstand = leichter Aufschlag, mehrere = voller Deckel.
            const mult = behindOn.length >= 2 ? MAX_PEER_MULT : 1.08;
            out.set(l.domain, {
                mult,
                chip: `📉 hinter der Branche (${behindOn.join(', ')})`,
                pitch: buildPitch(behindOn, group.length, medPerf, perf),
                peers,
                behindOn
            });
        }
    }
    return out;
}

function neutral(groupSize) {
    return { mult: 1.0, chip: null, pitch: null, peers: Math.max(0, groupSize - 1), behindOn: [] };
}

/**
 * Pitch-Satz aus GEMESSENEN Werten — keine Behauptung, keine erfundene Zahl.
 * Der Empfänger kann jeden Bestandteil selbst nachprüfen.
 */
function buildPitch(behindOn, groupSize, medPerf, perf) {
    const n = groupSize - 1;
    if (behindOn.includes('Mobilnutzung')) {
        return `Von ${n} verglichenen Betrieben derselben Branche in dieser Stadt ist Ihre Seite eine der wenigen, die auf dem Smartphone nicht mitspielt.`;
    }
    if (behindOn.includes('Verschlüsselung')) {
        return `Nahezu alle ${n} verglichenen Betriebe derselben Branche liefern ihre Seite verschlüsselt aus — bei Ihrer warnt der Browser.`;
    }
    if (medPerf !== null && perf !== null) {
        return `Im Vergleich mit ${n} Betrieben derselben Branche in dieser Stadt liegt Ihre Seite bei Tempo ${perf} — der Mittelwert liegt bei ${Math.round(medPerf)}.`;
    }
    return null;
}
