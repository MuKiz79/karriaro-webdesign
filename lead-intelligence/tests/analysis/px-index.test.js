import { describe, it, expect } from 'vitest';
import { calculatePXIndex } from '../../src/analysis/px-index.js';

const mockWs = (perf = 50) => ({ perf });
const mockPsi = (lcp = 3000, tbt = 500, cls = 0.1) => ({
    lighthouseResult: {
        audits: {
            'largest-contentful-paint': { numericValue: lcp },
            'first-contentful-paint': { numericValue: lcp * 0.6 },
            'total-blocking-time': { numericValue: tbt },
            'cumulative-layout-shift': { numericValue: cls }
        }
    }
});

describe('calculatePXIndex', () => {
    it('fast site = high PX', () => {
        const r = calculatePXIndex(mockWs(90), mockPsi(1500, 100, 0.02));
        expect(r.pxIndex).toBeGreaterThan(60);
    });

    it('slow site = low PX', () => {
        const r = calculatePXIndex(mockWs(20), mockPsi(8000, 2000, 0.5));
        expect(r.pxIndex).toBeLessThan(40);
    });

    it('should have 4 dimensions', () => {
        const r = calculatePXIndex(mockWs(50), mockPsi());
        expect(r.dimensions).toHaveProperty('speed');
        expect(r.dimensions).toHaveProperty('interactivity');
        expect(r.dimensions).toHaveProperty('visual');
        expect(r.dimensions).toHaveProperty('content');
    });

    it('good design should boost visual dimension', () => {
        const withDesign = calculatePXIndex(mockWs(50), mockPsi(), null, { designQuality: 9 });
        const noDesign = calculatePXIndex(mockWs(50), mockPsi(), null, null);
        expect(withDesign.dimensions.visual.score).toBeGreaterThan(noDesign.dimensions.visual.score);
    });
});
