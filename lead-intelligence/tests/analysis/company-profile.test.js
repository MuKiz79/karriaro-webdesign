import { describe, it, expect } from 'vitest';
import { analyzeCompanyProfile } from '../../src/analysis/company-profile.js';

const mockPsi = (urls = []) => ({
    lighthouseResult: {
        audits: { 'network-requests': { details: { items: urls.map(u => ({ url: u })) } } }
    }
});

describe('analyzeCompanyProfile', () => {
    it('known enterprise = isEnterprise true', () => {
        const result = analyzeCompanyProfile('https://hansgrohe.de', mockPsi(), null);
        expect(result.isEnterprise).toBe(true);
        expect(result.enterpriseWarning).toBeTruthy();
    });

    it('webdesign agency = isCompetitor true', () => {
        const result = analyzeCompanyProfile('https://karriaro-webdesign.de', mockPsi(), null);
        expect(result.isCompetitor).toBe(true);
        expect(result.competitorWarning).toBeTruthy();
    });

    it('normal business = neither', () => {
        const result = analyzeCompanyProfile('https://friseur-mueller.de', mockPsi(), null);
        expect(result.isEnterprise).toBe(false);
        expect(result.isCompetitor).toBe(false);
    });

    it('domain-based industry detection', () => {
        const result = analyzeCompanyProfile('https://zahnarzt-schmidt.de', mockPsi(), null);
        expect(result.branche).toBe('Zahnarztpraxis');
    });

    it('place primaryType overrides domain guess', () => {
        const result = analyzeCompanyProfile('https://example.de', mockPsi(), {
            primaryTypeDisplayName: { text: 'Friseursalon' }
        });
        expect(result.branche).toBe('Friseursalon');
    });

    it('should not match restaurant in URL content', () => {
        const result = analyzeCompanyProfile('https://webdesign-firma.de',
            mockPsi(['https://webdesign-firma.de/referenz-restaurant-roma']), null);
        expect(result.branche).not.toBe('Restaurant');
    });
});
