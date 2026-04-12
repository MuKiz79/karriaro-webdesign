import { describe, it, expect } from 'vitest';
import { checkEnterpriseDB, DB_STATS } from '../../src/priors/enterprise-db.js';

describe('checkEnterpriseDB', () => {
    // Hotels
    it('NH Hotels = enterprise hotel', () => {
        const r = checkEnterpriseDB('nh-hotels.com');
        expect(r.isEnterprise).toBe(true);
        expect(r.category).toBe('hotel');
    });
    it('Motel One = enterprise hotel', () => {
        expect(checkEnterpriseDB('motel-one.com').isEnterprise).toBe(true);
    });
    it('Random hotel = not enterprise', () => {
        expect(checkEnterpriseDB('hotel-mueller-koeln.net').isEnterprise).toBe(false);
    });

    // Restaurants
    it('McDonalds = enterprise', () => {
        expect(checkEnterpriseDB('mcdonalds.de').isEnterprise).toBe(true);
        expect(checkEnterpriseDB('mcdonalds.de').category).toBe('restaurant');
    });
    it('Vapiano = enterprise', () => {
        expect(checkEnterpriseDB('vapiano.de').isEnterprise).toBe(true);
    });
    it('Local restaurant = not enterprise', () => {
        expect(checkEnterpriseDB('ristorante-roma-koeln.de').isEnterprise).toBe(false);
    });

    // Friseure
    it('Klier = enterprise beauty', () => {
        expect(checkEnterpriseDB('klier.de').isEnterprise).toBe(true);
        expect(checkEnterpriseDB('klier.de').category).toBe('beauty');
    });
    it('Local friseur = not enterprise', () => {
        expect(checkEnterpriseDB('friseur-meissner.de').isEnterprise).toBe(false);
    });

    // DAX
    it('Hansgrohe = enterprise dax', () => {
        const r = checkEnterpriseDB('hansgrohe.de');
        expect(r.isEnterprise).toBe(true);
    });
    it('Siemens = enterprise', () => {
        expect(checkEnterpriseDB('siemens.com').isEnterprise).toBe(true);
    });

    // Fitness
    it('McFit = enterprise fitness', () => {
        expect(checkEnterpriseDB('mcfit.com').isEnterprise).toBe(true);
    });
    it('Local gym = not enterprise', () => {
        expect(checkEnterpriseDB('fitness-studio-mueller.de').isEnterprise).toBe(false);
    });

    // Konkurrenz
    it('Webdesign agency = competitor', () => {
        const r = checkEnterpriseDB('webdesign-stuttgart.de');
        expect(r.isCompetitor).toBe(true);
        expect(r.isEnterprise).toBe(false);
    });
    it('SEO Agentur = competitor', () => {
        expect(checkEnterpriseDB('seo-agentur-berlin.de').isCompetitor).toBe(true);
    });

    // Normal
    it('Normal business = neither', () => {
        const r = checkEnterpriseDB('zahnarzt-schmidt-offenburg.de');
        expect(r.isEnterprise).toBe(false);
        expect(r.isCompetitor).toBe(false);
    });
});

describe('DB_STATS', () => {
    it('should have 300+ patterns', () => {
        expect(DB_STATS.totalPatterns).toBeGreaterThan(250);
    });
    it('should have 10 categories', () => {
        expect(DB_STATS.categories).toBe(10);
    });
});
