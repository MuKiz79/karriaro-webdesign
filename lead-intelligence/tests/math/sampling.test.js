import { describe, it } from 'node:test';
import assert from 'node:assert';
import { sampleBeta, sampleGamma, wilsonCI, randn } from '../../src/math/sampling.js';

describe('sampleBeta', () => {
    it('should return values between 0 and 1', () => {
        for (let i = 0; i < 100; i++) {
            const v = sampleBeta(5, 5);
            assert.ok(v >= 0 && v <= 1, `sampleBeta(5,5) returned ${v}`);
        }
    });

    it('mean should converge to a/(a+b)', () => {
        const a = 8, b = 12;
        const expected = a / (a + b);  // 0.4
        let sum = 0;
        const N = 10000;
        for (let i = 0; i < N; i++) sum += sampleBeta(a, b);
        const mean = sum / N;
        assert.ok(Math.abs(mean - expected) < 0.02, `Mean ${mean} should be ~${expected}`);
    });

    it('should handle edge cases', () => {
        assert.ok(sampleBeta(0.5, 0.5) >= 0);  // Small params
        assert.ok(sampleBeta(100, 100) >= 0);   // Large params
        assert.strictEqual(typeof sampleBeta(0, 5), 'number');  // Zero alpha
    });
});

describe('sampleGamma', () => {
    it('should return positive values', () => {
        for (let i = 0; i < 100; i++) {
            assert.ok(sampleGamma(2) > 0);
            assert.ok(sampleGamma(0.5) >= 0);  // shape < 1
        }
    });
});

describe('wilsonCI', () => {
    it('should contain the true proportion', () => {
        const ci = wilsonCI(50, 1000);  // 5% rate
        assert.ok(ci.lower < 0.05 && ci.upper > 0.05);
    });

    it('should be wider for small N', () => {
        const small = wilsonCI(1, 20);
        const large = wilsonCI(50, 1000);
        assert.ok((small.upper - small.lower) > (large.upper - large.lower));
    });

    it('should handle zero successes', () => {
        const ci = wilsonCI(0, 100);
        assert.strictEqual(ci.lower, 0);
        assert.ok(ci.upper > 0);
    });
});

describe('randn', () => {
    it('should have mean ~0', () => {
        let sum = 0;
        const N = 10000;
        for (let i = 0; i < N; i++) sum += randn();
        assert.ok(Math.abs(sum / N) < 0.05);
    });
});
