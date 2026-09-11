import { describe, it, expect, beforeEach } from 'vitest';
import { checkReminders, dismissReminder, STATUS_OHNE_ERINNERUNG } from '../../src/crm/reminders.js';
import { addSuppression } from '../../src/crm/suppression.js';

const TAG = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-09-10T12:00:00Z');

beforeEach(() => {
    const store = new Map();
    globalThis.localStorage = {
        getItem: k => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => store.set(k, String(v)),
        removeItem: k => store.delete(k),
        clear: () => store.clear()
    };
});

function lead(domain, extra = {}) {
    return { id: domain.replace(/\W/g, '_'), domain, status: 'kontaktiert', contactedAt: NOW - 4 * TAG, ...extra };
}

describe('checkReminders', () => {
    it('kontaktiert, Tag 4 → fällig (Gegenprobe)', () => {
        const due = checkReminders({ leads: [lead('a.de')], now: NOW, gesperrt: new Set() });
        expect(due).toHaveLength(1);
        expect(due[0].touchDay).toBe(4);
    });

    it('keine Erinnerung bei geantwortet, interessiert, angebot, kunde, verloren', () => {
        const leads = [...STATUS_OHNE_ERINNERUNG].map(s => lead(`${s}.de`, { status: s }));
        expect(leads).toHaveLength(5);
        expect(checkReminders({ leads, now: NOW, gesperrt: new Set() })).toHaveLength(0);
    });

    it('keine Erinnerung für gesperrte Domains und Werbewiderspruch', async () => {
        await addSuppression('gesperrt.de', 'opt_out');
        const leads = [lead('gesperrt.de'), lead('w.de', { contactData: { werbewiderspruch: true } }), lead('ok.de')];
        const due = checkReminders({ leads, now: NOW });
        expect(due.map(d => d.domain)).toEqual(['ok.de']);
    });

    it('liest ohne Übergabe aus localStorage', () => {
        localStorage.setItem('karriaro_leads', JSON.stringify([lead('a.de')]));
        expect(checkReminders({ now: NOW })).toHaveLength(1);
    });

    it('unlesbarer localStorage → leere Liste statt Absturz', () => {
        localStorage.setItem('karriaro_leads', '{kaputt');
        expect(checkReminders({ now: NOW })).toEqual([]);
    });
});

describe('dismissReminder', () => {
    it('setzt lastTouchDay am gespeicherten Lead — die Erinnerung verschwindet', async () => {
        localStorage.setItem('karriaro_leads', JSON.stringify([lead('a.de')]));
        expect(checkReminders({ now: NOW })).toHaveLength(1);
        const r = await dismissReminder('a_de', 4);
        expect(r.ok).toBe(true);
        expect(JSON.parse(localStorage.getItem('karriaro_leads'))[0].lastTouchDay).toBe(4);
        expect(checkReminders({ now: NOW })).toHaveLength(0);
    });

    it('ohne Lead-ID oder Tag passiert nichts', async () => {
        expect((await dismissReminder('', 4)).ok).toBe(false);
        expect((await dismissReminder('a_de', 'x')).ok).toBe(false);
    });
});
