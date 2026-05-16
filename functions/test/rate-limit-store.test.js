/**
 * Sprint 82 — Tests fuer rate-limit-store.js
 *
 * Testet pure Helper (hashKey, clientIp). checkRateLimit selbst braucht
 * Firestore-Stub und wird in der Integration via Cloud-Function getestet.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { clientIp, hashKey } = require('../lib/rate-limit-store.js');

// ────────────────────────────────────────────────────────────────
// clientIp — X-Forwarded-For-Parsing
// ────────────────────────────────────────────────────────────────

test('clientIp: returns first IP from X-Forwarded-For chain', () => {
    const req = { headers: { 'x-forwarded-for': '203.0.113.1, 10.0.0.1, 172.16.0.1' } };
    assert.equal(clientIp(req), '203.0.113.1');
});

test('clientIp: trims whitespace from XFF entries', () => {
    const req = { headers: { 'x-forwarded-for': '   203.0.113.42   , 10.0.0.1' } };
    assert.equal(clientIp(req), '203.0.113.42');
});

test('clientIp: single IP in XFF', () => {
    const req = { headers: { 'x-forwarded-for': '203.0.113.7' } };
    assert.equal(clientIp(req), '203.0.113.7');
});

test('clientIp: falls back to req.ip when no XFF', () => {
    const req = { ip: '198.51.100.5', headers: {} };
    assert.equal(clientIp(req), '198.51.100.5');
});

test('clientIp: returns "unknown" when nothing available', () => {
    const req = { headers: {} };
    assert.equal(clientIp(req), 'unknown');
});

test('clientIp: handles IPv6 in XFF', () => {
    const req = { headers: { 'x-forwarded-for': '2001:db8::1, 10.0.0.1' } };
    assert.equal(clientIp(req), '2001:db8::1');
});

test('clientIp: empty XFF falls back to req.ip', () => {
    const req = { ip: '198.51.100.9', headers: { 'x-forwarded-for': '' } };
    assert.equal(clientIp(req), '198.51.100.9');
});

// ────────────────────────────────────────────────────────────────
// hashKey — Deterministisch, kollisionsarm
// ────────────────────────────────────────────────────────────────

test('hashKey: same ip+key produces same hash', () => {
    assert.equal(hashKey('1.2.3.4', 'quickAudit'), hashKey('1.2.3.4', 'quickAudit'));
});

test('hashKey: different keys produce different hashes', () => {
    assert.notEqual(hashKey('1.2.3.4', 'quickAudit'), hashKey('1.2.3.4', 'requestAudit'));
});

test('hashKey: different ips produce different hashes', () => {
    assert.notEqual(hashKey('1.2.3.4', 'quickAudit'), hashKey('5.6.7.8', 'quickAudit'));
});

test('hashKey: produces 24-char hex string', () => {
    const h = hashKey('1.2.3.4', 'k');
    assert.equal(h.length, 24);
    assert.match(h, /^[0-9a-f]{24}$/);
});
