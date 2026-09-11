import { describe, it, expect } from 'vitest';
import { buildDatasetSchema, buildArticleSchema } from '../../src/reports/llmo-layer.js';
import { datiereReport } from '../../../scripts/build-reports-batch.mjs';

// 2026-09-11: Die Datenseiten trugen den Messtag (15.08.) als datePublished und
// sitemap-lastmod, erschienen aber erst im September — eine Rückdatierung.

function report(overrides = {}) {
    return {
        slug: 'zahnaerzte-stuttgart-und-karlsruhe',
        brancheKey: 'dentist',
        brancheName: 'Zahnärzte',
        stadtName: 'Stuttgart und Karlsruhe',
        erhebungDate: '2026-08-15',
        erhebungMonth: '2026-08',
        n: 42,
        stats: { perf: { median: 61 } },
        techStack: { WordPress: { count: 20, share: 0.48 } },
        baukasten: { count: 5, share: 0.12 },
        ssl: { missingCount: 1, missingShare: 0.02 },
        stichprobe: { messVon: '2026-08-15', messBis: '2026-08-15' },
        ...overrides
    };
}

describe('JSON-LD: Veröffentlichung ist nicht der Messtag', () => {
    it('Dataset und Article tragen das Veröffentlichungsdatum, die Messung bleibt in temporalCoverage', () => {
        const r = report({ veroeffentlichtAm: '2026-09-11', aktualisiertAm: '2026-09-11' });
        const ds = buildDatasetSchema(r);
        const art = buildArticleSchema(r);
        expect(ds.datePublished).toBe('2026-09-11');
        expect(ds.temporalCoverage).toBe('2026-08');
        expect(art.datePublished).toBe('2026-09-11');
        expect(art.dateModified).toBe('2026-09-11');
    });
    it('Altbestand ohne eigenes Datum fällt auf den Messtag zurück', () => {
        const art = buildArticleSchema(report());
        expect(art.datePublished).toBe('2026-08-15');
        expect(art.dateModified).toBe('2026-08-15');
    });
});

describe('datiereReport', () => {
    it('neuer Report: heute als Veröffentlichung und Aktualisierung', () => {
        const r = datiereReport(report(), { heute: '2026-09-11', alt: null });
        expect(r.veroeffentlichtAm).toBe('2026-09-11');
        expect(r.aktualisiertAm).toBe('2026-09-11');
    });
    it('Neubau derselben Messung behält beide Daten', () => {
        const alt = { veroeffentlichtAm: '2026-09-11', aktualisiertAm: '2026-09-11', stichprobe: { messBis: '2026-08-15' } };
        const r = datiereReport(report(), { heute: '2026-10-01', alt });
        expect(r.veroeffentlichtAm).toBe('2026-09-11');
        expect(r.aktualisiertAm).toBe('2026-09-11');
    });
    it('neue Messung rückt nur die Aktualisierung vor', () => {
        const alt = { veroeffentlichtAm: '2026-09-11', stichprobe: { messBis: '2026-08-15' } };
        const r = datiereReport(report({ stichprobe: { messBis: '2026-09-30' } }), { heute: '2026-10-01', alt });
        expect(r.veroeffentlichtAm).toBe('2026-09-11');
        expect(r.aktualisiertAm).toBe('2026-10-01');
    });
    it('Vorgabe per --veroeffentlicht schlägt heute', () => {
        const r = datiereReport(report(), { vorgabe: '2026-09-12', heute: '2026-09-11', alt: null });
        expect(r.veroeffentlichtAm).toBe('2026-09-12');
        expect(r.aktualisiertAm).toBe('2026-09-12');
    });
});
