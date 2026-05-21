/**
 * Concurrency-Helper — limitiert parallele Promise-Ausführung.
 *
 * Statt Promise.all(items.map(worker)) (= alle parallel, kann Quota-Limits
 * sprengen) wird worker(item) auf max `limit` gleichzeitige Calls gedrosselt.
 * Worker-Fehler werden via .catch(() => null) absorbiert — Aufrufer filtert
 * null aus dem Ergebnis raus oder geht im Worker selbst defensiv vor.
 *
 * @template T, R
 * @param {T[]} items
 * @param {number} limit  max gleichzeitige Calls
 * @param {(item: T) => Promise<R>} worker
 * @returns {Promise<R[]>}  Ergebnisse in items-Reihenfolge, null bei Worker-Fehler
 */
export async function runWithConcurrency(items, limit, worker) {
    const results = new Array(items.length);
    const queue = items.map((item, idx) => ({ item, idx }));
    const running = new Set();

    async function spawn() {
        const next = queue.shift();
        if (!next) return;
        const p = Promise.resolve()
            .then(() => worker(next.item))
            .catch(() => null)
            .then(value => {
                results[next.idx] = value;
                running.delete(p);
            });
        running.add(p);
    }

    while (queue.length > 0 || running.size > 0) {
        while (running.size < limit && queue.length > 0) await spawn();
        if (running.size > 0) await Promise.race(running);
    }
    return results;
}
