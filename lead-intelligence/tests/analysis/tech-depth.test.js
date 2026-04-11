import { describe, it, expect } from 'vitest';
import { analyzeTechDepth } from '../../src/analysis/tech-depth.js';

const mockPsi = (urls = []) => ({
    lighthouseResult: {
        audits: {
            'network-requests': {
                details: { items: urls.map(u => ({ url: u, mimeType: 'text/html' })) }
            }
        }
    }
});

describe('analyzeTechDepth', () => {
    it('clean modern site = modern techAge', () => {
        const result = analyzeTechDepth(mockPsi(['https://example.de/style.css']), { cms: null });
        expect(result.techAge).toBe('modern');
        expect(result.obsoleteScore).toBe(0);
    });

    it('old jQuery = high obsolete score', () => {
        const result = analyzeTechDepth(
            mockPsi(['https://cdn.example.de/jquery-1.12.4.min.js']),
            { cms: null }
        );
        expect(result.obsoleteScore).toBeGreaterThanOrEqual(3);
        expect(result.findings.some(f => f.label.includes('jQuery'))).toBe(true);
    });

    it('many WordPress plugins = security risk', () => {
        const plugins = Array.from({length: 20}, (_, i) => `https://site.de/wp-content/plugins/plugin-${i}/style.css`);
        const result = analyzeTechDepth(mockPsi(plugins), { cms: 'WordPress' });
        expect(result.securityRisk).toBeGreaterThan(0);
        expect(result.findings.some(f => f.type === 'plugins')).toBe(true);
    });

    it('old Bootstrap = obsolete', () => {
        const result = analyzeTechDepth(
            mockPsi(['https://cdn.example.de/bootstrap/3.3.7/css/bootstrap.min.css']),
            { cms: null }
        );
        expect(result.findings.some(f => f.label.includes('Bootstrap'))).toBe(true);
        expect(result.obsoleteScore).toBeGreaterThanOrEqual(2);
    });
});
