import { describe, it, expect } from 'vitest';
import { checkBFSGCompliance } from '../../src/analysis/bfsg-compliance.js';

const mockPsi = (overrides = {}) => ({
    lighthouseResult: {
        audits: {
            'color-contrast': { score: 1 },
            'image-alt': { score: 1 },
            'label': { score: 1 },
            'link-name': { score: 1 },
            'button-name': { score: 1 },
            'html-has-lang': { score: 1 },
            'document-title': { score: 1 },
            'heading-order': { score: 1 },
            'tabindex': { score: 1 },
            'meta-viewport': { score: 1 },
            'target-size': { score: 1 },
            'duplicate-id-active': { score: 1 },
            ...overrides
        },
        categories: { accessibility: { score: 0.95 } }
    }
});

describe('checkBFSGCompliance', () => {
    it('all passing = niedrig risk', () => {
        const result = checkBFSGCompliance(mockPsi());
        expect(result.risk).toBe('niedrig');
        expect(result.criticalFails).toHaveLength(0);
        expect(result.complianceScore).toBeGreaterThanOrEqual(90);
    });

    it('missing color-contrast + image-alt = hoch risk', () => {
        const result = checkBFSGCompliance(mockPsi({
            'color-contrast': { score: 0, details: { items: [{},{},{}] } },
            'image-alt': { score: 0, details: { items: [{}] } }
        }));
        expect(result.risk).toBe('hoch');
        expect(result.criticalFails.length).toBeGreaterThanOrEqual(2);
        expect(result.pitchArg).toBeTruthy();
    });

    it('many failures = kritisch risk', () => {
        const result = checkBFSGCompliance(mockPsi({
            'color-contrast': { score: 0 },
            'image-alt': { score: 0 },
            'label': { score: 0 },
            'link-name': { score: 0 },
            'button-name': { score: 0 },
            'tabindex': { score: 0 },
            'meta-viewport': { score: 0 }
        }));
        expect(result.risk).toBe('kritisch');
        expect(result.fine).toBe('bis 100.000€');
    });

    it('should return funnelImpact', () => {
        const result = checkBFSGCompliance(mockPsi({ 'color-contrast': { score: 0 }, 'image-alt': { score: 0 } }));
        expect(result.funnelImpact).toBeGreaterThan(0);
    });
});
