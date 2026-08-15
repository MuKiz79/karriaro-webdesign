/**
 * localStorage-Stub für Node — MUSS vor jedem Import von src/-Modulen
 * installiert sein (scan-cache.js u. a. lesen lazy aus localStorage).
 * In-Memory, leer: die Probe kennt bewusst weder den Places-Cache noch die
 * known-Liste des Founders — das wird im Report deklariert.
 */
export function installLocalStorageStub() {
    if (globalThis.localStorage) return;
    const m = new Map();
    globalThis.localStorage = {
        getItem: (k) => (m.has(k) ? m.get(k) : null),
        setItem: (k, v) => { m.set(String(k), String(v)); },
        removeItem: (k) => { m.delete(k); },
        clear: () => { m.clear(); },
        key: (i) => [...m.keys()][i] ?? null,
        get length() { return m.size; }
    };
}
