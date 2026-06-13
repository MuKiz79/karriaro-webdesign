import { describe, it, expect, beforeEach } from 'vitest';
import { normalizeDomain, isSuppressed, addSuppression, loadSuppressionLocal } from '../../src/crm/suppression.js';

// Minimaler localStorage-Shim (Vitest läuft in node, kein Browser).
beforeEach(() => {
    const store = new Map();
    globalThis.localStorage = {
        getItem: k => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => store.set(k, String(v)),
        removeItem: k => store.delete(k),
        clear: () => store.clear()
    };
});

describe('normalizeDomain', () => {
    it('lowercased, ohne www., ohne Protokoll/Pfad', () => {
        expect(normalizeDomain('https://WWW.Beispiel.DE/impressum')).toBe('beispiel.de');
        expect(normalizeDomain('www.Test.de')).toBe('test.de');
        expect(normalizeDomain('  Foo.de ')).toBe('foo.de');
    });
});

describe('Suppression-Liste', () => {
    it('addSuppression dedupliziert', async () => {
        await addSuppression('beispiel.de', 'manual');
        await addSuppression('beispiel.de', 'opt_out');
        expect(loadSuppressionLocal().size).toBe(1);
    });

    it('isSuppressed ist case-insensitive auf die Domain', async () => {
        await addSuppression('Example.DE');
        expect(isSuppressed('example.de')).toBe(true);
        expect(isSuppressed('https://www.example.de/kontakt')).toBe(true);
        expect(isSuppressed('andere.de')).toBe(false);
    });

    it('isSuppressed nutzt ein vorab geladenes Set (synchron)', async () => {
        await addSuppression('a.de');
        const set = loadSuppressionLocal();
        expect(isSuppressed('a.de', set)).toBe(true);
        expect(isSuppressed('b.de', set)).toBe(false);
    });

    it('leere/ungültige Domain wird ignoriert', async () => {
        const res = await addSuppression('');
        expect(res.ok).toBe(false);
        expect(loadSuppressionLocal().size).toBe(0);
    });
});
