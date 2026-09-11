import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { addSuppression } from '../../src/crm/suppression.js';

// Ein belegter Werbewiderspruch (opt_out) darf in Firestore nicht durch einen
// späteren, schwächeren Grund (manuell sperren) überschrieben werden — lokal blieb
// er schon vorher stehen, in der Cloud ging er verloren.
let setDoc;
beforeEach(() => {
    const store = new Map();
    globalThis.localStorage = {
        getItem: k => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => store.set(k, String(v)),
        removeItem: k => store.delete(k),
        clear: () => store.clear()
    };
    setDoc = vi.fn(async () => {});
    globalThis.window = {
        __firebase: {
            auth: { currentUser: { uid: 'u1' } },
            db: {},
            fns: { doc: (db, col, id) => ({ col, id }), setDoc, serverTimestamp: () => 'ts' }
        }
    };
});
afterEach(() => { delete globalThis.window; });

const letzterGrund = () => setDoc.mock.calls.at(-1)[1].reason;

describe('addSuppression — Sperrgrund in Firestore', () => {
    it('opt_out bleibt, wenn danach manuell gesperrt wird', async () => {
        await addSuppression('betrieb.de', 'opt_out');
        expect(letzterGrund()).toBe('opt_out');
        await addSuppression('betrieb.de', 'manual');
        expect(letzterGrund()).toBe('opt_out');
    });

    it('Gegenprobe: ein stärkerer Grund ersetzt einen schwächeren', async () => {
        await addSuppression('betrieb.de', 'manual');
        expect(letzterGrund()).toBe('manual');
        await addSuppression('betrieb.de', 'opt_out');
        expect(letzterGrund()).toBe('opt_out');
    });
});
