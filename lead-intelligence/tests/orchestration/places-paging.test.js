/**
 * Places-Paging nach Vertrag V7 (2026-09-10): ohne Parameter muss die Anfrage
 * byte-gleich bleiben, jede zusätzliche Seite ist eine bezahlte Anfrage.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { placesSeitenParameter, placesAnfragenAus, PLACES_MAX_PAGES } from '../../src/api/cloud-functions.js';
import { searchPlaces } from '../../src/api/places.js';
import { config } from '../../src/config.js';

describe('placesSeitenParameter', () => {
    it('ohne Angaben oder mit maxPages 1: leeres Objekt (unverändertes Verhalten)', () => {
        expect(placesSeitenParameter()).toEqual({});
        expect(placesSeitenParameter({ maxPages: 1 })).toEqual({});
        expect(placesSeitenParameter({ maxPages: 'x' })).toEqual({});
        expect(placesSeitenParameter({ includeFutureOpening: false })).toEqual({});
    });
    it('begrenzt maxPages auf 1–3', () => {
        expect(placesSeitenParameter({ maxPages: 2 })).toEqual({ maxPages: 2 });
        expect(placesSeitenParameter({ maxPages: 9 })).toEqual({ maxPages: PLACES_MAX_PAGES });
        expect(PLACES_MAX_PAGES).toBe(3);
    });
    it('includeFutureOpening nur bei echtem true', () => {
        expect(placesSeitenParameter({ includeFutureOpening: true })).toEqual({ includeFutureOpening: true });
        expect(placesSeitenParameter({ includeFutureOpening: 'true' })).toEqual({});
    });
});

describe('placesAnfragenAus — tatsächlich abgerechnete Anfragen', () => {
    it('liest pagesFetched, fällt bei älterem Backend auf 1 zurück', () => {
        expect(placesAnfragenAus({ pagesFetched: 2 })).toBe(2);
        expect(placesAnfragenAus({ places: [] })).toBe(1);
        expect(placesAnfragenAus(null)).toBe(1);
        expect(placesAnfragenAus({ pagesFetched: 0 })).toBe(1);
    });
});

describe('searchPlaces — Request-Body', () => {
    const vorher = config.fnUrl;
    afterEach(() => { config.fnUrl = vorher; vi.unstubAllGlobals(); });

    function mitFetch() {
        const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ places: [], pagesFetched: 1 }) }));
        vi.stubGlobal('fetch', fetchMock);
        config.fnUrl = '/api';
        return fetchMock;
    }

    it('ohne Optionen exakt {query, maxResults}', async () => {
        const f = mitFetch();
        await searchPlaces('Friseur Stuttgart', 20);
        expect(JSON.parse(f.mock.calls[0][1].body)).toEqual({ query: 'Friseur Stuttgart', maxResults: 20 });
        expect(f.mock.calls[0][0]).toBe('/api/searchPlaces');
    });

    it('mit Tiefe und Neueröffnungen trägt der Body beide Felder', async () => {
        const f = mitFetch();
        await searchPlaces('Cafe Stuttgart', 20, { maxPages: 2, includeFutureOpening: true });
        expect(JSON.parse(f.mock.calls[0][1].body)).toEqual({ query: 'Cafe Stuttgart', maxResults: 20, maxPages: 2, includeFutureOpening: true });
    });
});
