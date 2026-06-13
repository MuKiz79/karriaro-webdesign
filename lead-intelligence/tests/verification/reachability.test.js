import { describe, it, expect } from 'vitest';
import { verifyReachable } from '../../src/verification/reachability.js';

describe('verifyReachable', () => {
    it('persönliche Adresse → reachable, owner durchgereicht', () => {
        const r = verifyReachable({
            contact: { owner: 'Anna Beispiel', quality: 'persönlich', allEmails: ['anna@x.de'] },
            deliverability: { score: 80, spf: true, dkim: true, dmarc: false, label: 'gut' }
        });
        expect(r.reachable).toBe(true);
        expect(r.email).toBe('anna@x.de');
        expect(r.owner).toBe('Anna Beispiel');
        expect(r.deliverability.spf).toBe(true);
        expect(r.deliverability.dmarc).toBe(false);
    });

    it('generische Adresse → reachable mit quality generisch', () => {
        const r = verifyReachable({ contact: { quality: 'generisch', genericEmails: ['info@x.de'] } });
        expect(r.reachable).toBe(true);
        expect(r.quality).toBe('generisch');
        expect(r.email).toBe('info@x.de');
    });

    it('quality none → nicht erreichbar (Gate greift)', () => {
        const r = verifyReachable({ contact: { quality: 'none', allEmails: [] } });
        expect(r.reachable).toBe(false);
        expect(r.evidenceState).toBe('gemessen');
    });

    it('kein Kontakt → Fehler-Evidenz, nicht erreichbar', () => {
        const r = verifyReachable({ contact: null });
        expect(r.reachable).toBe(false);
        expect(r.evidenceState).toBe('fehler');
    });
});
