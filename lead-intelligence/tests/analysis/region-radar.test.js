import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';

// jobSignals mocken — der Radar darf im Test kein Netz anfassen.
vi.mock('../../src/api/cloud-functions.js', () => ({
    jobSignals: vi.fn()
}));

const { jobSignals } = await import('../../src/api/cloud-functions.js');
const { runRegionRadar, RADAR_BRANCHES, MAX_RADAR_CITIES } =
    await import('../../src/analysis/region-radar.js');

beforeEach(() => {
    jobSignals.mockReset();
});

afterAll(() => {
    vi.restoreAllMocks();
});

describe('runRegionRadar', () => {
    it('summiert die Stellen je Stadt und sortiert absteigend', async () => {
        // Stuttgart 10 je Branche, Köln 1 je Branche
        jobSignals.mockImplementation(({ wo }) =>
            Promise.resolve({ ok: true, total: wo === 'Stuttgart' ? 10 : 1 }));

        const rows = await runRegionRadar(['Köln', 'Stuttgart']);
        expect(rows.map(r => r.city)).toEqual(['Stuttgart', 'Köln']);
        expect(rows[0].total).toBe(10 * RADAR_BRANCHES.length);
        expect(rows[0].partial).toBe(false);
    });

    it('fordert retries:0 an — ein Fehlversuch darf das Rate-Limit nicht doppelt belasten', async () => {
        // Das Backend erlaubt 90 Calls/h. Mit retries=1 kostet jeder Fehlversuch
        // zwei davon, und der zweite Radar-Lauf liefe ins Limit.
        jobSignals.mockResolvedValue({ ok: true, total: 3 });
        await runRegionRadar(['Köln']);
        for (const call of jobSignals.mock.calls) {
            expect(call[0].retries).toBe(0);
        }
    });

    it('wertet einen FEHLGESCHLAGENEN Call nicht als „0 Stellen"', async () => {
        // Das ist der gefährliche Fall: nach einem Rate-Limit-Treffer sah eine
        // lebendige Stadt vorher tot aus und wurde falsch abgewertet.
        jobSignals.mockResolvedValue(null);

        const rows = await runRegionRadar(['Köln']);
        expect(rows[0].total).toBe(0);
        expect(rows[0].partial).toBe(true);
        expect(rows[0].unknownCount).toBe(RADAR_BRANCHES.length);
    });

    it('markiert Teil-Ergebnisse, wenn nur einzelne Branchen fehlen', async () => {
        jobSignals.mockImplementation(({ was }) =>
            was === 'Friseur' ? Promise.resolve(null) : Promise.resolve({ ok: true, total: 5 }));

        const rows = await runRegionRadar(['Köln']);
        expect(rows[0].partial).toBe(true);
        expect(rows[0].unknownCount).toBe(1);
        expect(rows[0].total).toBe(5 * (RADAR_BRANCHES.length - 1));
    });

    it('deckelt die Städte-Zahl gegen das Rate-Limit', async () => {
        jobSignals.mockResolvedValue({ ok: true, total: 1 });
        const viele = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
        const rows = await runRegionRadar(viele);
        expect(rows.length).toBe(MAX_RADAR_CITIES);
        expect(jobSignals).toHaveBeenCalledTimes(MAX_RADAR_CITIES * RADAR_BRANCHES.length);
    });

    it('dedupliziert Städte und ignoriert Leereinträge', async () => {
        jobSignals.mockResolvedValue({ ok: true, total: 1 });
        const rows = await runRegionRadar(['Köln', ' Köln ', '', '   ']);
        expect(rows.length).toBe(1);
    });

    it('meldet Fortschritt über alle Calls', async () => {
        jobSignals.mockResolvedValue({ ok: true, total: 1 });
        const seen = [];
        await runRegionRadar(['Köln', 'Mainz'], (done, total) => seen.push([done, total]));
        expect(seen.at(-1)).toEqual([2 * RADAR_BRANCHES.length, 2 * RADAR_BRANCHES.length]);
    });

    it('leere Eingabe ergibt eine leere Liste statt Absturz', async () => {
        expect(await runRegionRadar([])).toEqual([]);
        expect(await runRegionRadar(null)).toEqual([]);
    });
});
