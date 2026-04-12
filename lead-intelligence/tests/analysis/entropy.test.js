import { describe, it, expect } from 'vitest';
import { calculateEntropy } from '../../src/analysis/entropy.js';

const mockPsi = (urls = [], unusedJs = 0) => ({
    lighthouseResult: {
        audits: {
            'network-requests': { details: { items: urls.map(u => ({ url: u, transferSize: 5000 })) } },
            'unused-javascript': { details: { items: Array(unusedJs).fill({}) } },
            'unused-css-rules': { details: { items: [] } }
        }
    }
});

describe('calculateEntropy', () => {
    it('clean site = low entropy', () => {
        const r = calculateEntropy(mockPsi(['https://example.de/app.js']), { isBaukasten: false });
        expect(r.S).toBeLessThan(0.3);
        expect(r.label).toContain('gepflegt');
    });

    it('many tech signatures + dead code = high entropy', () => {
        const r = calculateEntropy(mockPsi([
            'https://cdn.jquery.com/jquery.js', 'https://cdn.bootstrap.com/bootstrap.js',
            'https://cdn.fontawesome.com/fa.js', 'https://cdn.elementor.com/elem.js',
            'https://cdn.slick.com/slick.js', 'https://cdn.hotjar.com/hj.js',
            ...Array(50).fill('https://example.de/script.js')
        ], 10), { isBaukasten: true, version: '3' });
        expect(r.S).toBeGreaterThan(0.5);
    });

    it('S should be 0-1', () => {
        const r = calculateEntropy(mockPsi([]), {});
        expect(r.S).toBeGreaterThanOrEqual(0);
        expect(r.S).toBeLessThanOrEqual(1);
    });
});
