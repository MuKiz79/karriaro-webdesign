/**
 * Sprint 82 — SSRF-Guard Tests fuer safe-fetch.js
 *
 * Pure Node:test (Node 18+ built-in).
 * Run: `node --test functions/test/safe-fetch.test.js`
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
    safeFetch,
    assertPublicHost,
    resolvePublicAddress,
    isPrivateIPv4,
    isPrivateIPv6
} = require('../lib/safe-fetch.js');

// ────────────────────────────────────────────────────────────────
// isPrivateIPv4
// ────────────────────────────────────────────────────────────────

test('isPrivateIPv4: loopback 127.x.x.x blocked', () => {
    assert.equal(isPrivateIPv4('127.0.0.1'), true);
    assert.equal(isPrivateIPv4('127.255.255.255'), true);
});

test('isPrivateIPv4: RFC1918 10.x blocked', () => {
    assert.equal(isPrivateIPv4('10.0.0.1'), true);
    assert.equal(isPrivateIPv4('10.255.255.255'), true);
});

test('isPrivateIPv4: RFC1918 172.16-31 blocked', () => {
    assert.equal(isPrivateIPv4('172.16.0.1'), true);
    assert.equal(isPrivateIPv4('172.31.255.255'), true);
    assert.equal(isPrivateIPv4('172.15.0.1'), false);
    assert.equal(isPrivateIPv4('172.32.0.1'), false);
});

test('isPrivateIPv4: RFC1918 192.168.x.x blocked', () => {
    assert.equal(isPrivateIPv4('192.168.1.1'), true);
});

test('isPrivateIPv4: link-local 169.254.x.x blocked (AWS-Metadata!)', () => {
    assert.equal(isPrivateIPv4('169.254.169.254'), true);
    assert.equal(isPrivateIPv4('169.254.0.1'), true);
});

test('isPrivateIPv4: 0.x.x.x blocked', () => {
    assert.equal(isPrivateIPv4('0.0.0.0'), true);
});

test('isPrivateIPv4: CGNAT 100.64-127.x blocked', () => {
    assert.equal(isPrivateIPv4('100.64.0.1'), true);
    assert.equal(isPrivateIPv4('100.127.255.255'), true);
    assert.equal(isPrivateIPv4('100.63.0.1'), false);
});

test('isPrivateIPv4: multicast 224+ blocked', () => {
    assert.equal(isPrivateIPv4('224.0.0.1'), true);
    assert.equal(isPrivateIPv4('255.255.255.255'), true);
});

test('isPrivateIPv4: public IPs allowed', () => {
    assert.equal(isPrivateIPv4('8.8.8.8'), false);
    assert.equal(isPrivateIPv4('1.1.1.1'), false);
    assert.equal(isPrivateIPv4('142.250.185.78'), false);
});

test('isPrivateIPv4: malformed treated as private (fail-safe)', () => {
    assert.equal(isPrivateIPv4('not-an-ip'), true);
    assert.equal(isPrivateIPv4('256.256.256.256'), true);
    assert.equal(isPrivateIPv4(''), true);
});

// ────────────────────────────────────────────────────────────────
// isPrivateIPv6
// ────────────────────────────────────────────────────────────────

test('isPrivateIPv6: loopback ::1 blocked', () => {
    assert.equal(isPrivateIPv6('::1'), true);
});

test('isPrivateIPv6: unspecified :: blocked', () => {
    assert.equal(isPrivateIPv6('::'), true);
});

test('isPrivateIPv6: link-local fe80::/10 blocked', () => {
    assert.equal(isPrivateIPv6('fe80::1'), true);
});

test('isPrivateIPv6: unique-local fc/fd blocked', () => {
    assert.equal(isPrivateIPv6('fc00::1'), true);
    assert.equal(isPrivateIPv6('fd00::1'), true);
});

test('isPrivateIPv6: multicast ff blocked', () => {
    assert.equal(isPrivateIPv6('ff02::1'), true);
});

test('isPrivateIPv6: IPv4-mapped private blocked', () => {
    assert.equal(isPrivateIPv6('::ffff:127.0.0.1'), true);
    assert.equal(isPrivateIPv6('::ffff:169.254.169.254'), true);
});

test('isPrivateIPv6: public IPv6 allowed', () => {
    assert.equal(isPrivateIPv6('2001:db8::1'), false);
    assert.equal(isPrivateIPv6('2606:4700:4700::1111'), false);
});

// ────────────────────────────────────────────────────────────────
// assertPublicHost (sync IP-Host-Path, no DNS needed)
// ────────────────────────────────────────────────────────────────

test('assertPublicHost: rejects 127.0.0.1', async () => {
    await assert.rejects(() => assertPublicHost('127.0.0.1'), /SSRF/);
});

test('assertPublicHost: rejects 169.254.169.254 (AWS-Metadata)', async () => {
    await assert.rejects(() => assertPublicHost('169.254.169.254'), /SSRF/);
});

test('assertPublicHost: rejects [::1]', async () => {
    await assert.rejects(() => assertPublicHost('::1'), /SSRF/);
});

test('assertPublicHost: rejects empty hostname', async () => {
    await assert.rejects(() => assertPublicHost(''), /SSRF/);
});

test('assertPublicHost: accepts public IPv4 8.8.8.8', async () => {
    await assertPublicHost('8.8.8.8'); // should not throw
});

// ────────────────────────────────────────────────────────────────
// safeFetch — Protocol-Whitelist
// ────────────────────────────────────────────────────────────────

test('safeFetch: rejects file:// protocol', async () => {
    await assert.rejects(() => safeFetch('file:///etc/passwd'), /SSRF/);
});

test('safeFetch: rejects gopher:// protocol', async () => {
    await assert.rejects(() => safeFetch('gopher://127.0.0.1:25'), /SSRF/);
});

test('safeFetch: rejects javascript: protocol', async () => {
    await assert.rejects(() => safeFetch('javascript:alert(1)'), /SSRF/);
});

test('safeFetch: rejects invalid URL', async () => {
    await assert.rejects(() => safeFetch('not a url'), /SSRF/);
});

test('safeFetch: rejects http://127.0.0.1', async () => {
    await assert.rejects(() => safeFetch('http://127.0.0.1/'), /SSRF/);
});

test('safeFetch: rejects http://169.254.169.254 (AWS-Metadata)', async () => {
    await assert.rejects(() => safeFetch('http://169.254.169.254/latest/meta-data/'), /SSRF/);
});

test('safeFetch: rejects http://[::1]/', async () => {
    await assert.rejects(() => safeFetch('http://[::1]/'), /SSRF/);
});

test('safeFetch: rejects http://10.0.0.1', async () => {
    await assert.rejects(() => safeFetch('http://10.0.0.1/admin'), /SSRF/);
});

test('safeFetch: rejects host that resolves to private IP', async () => {
    // localhost resolves to 127.0.0.1 via OS hosts-file
    await assert.rejects(() => safeFetch('http://localhost/'), /SSRF/);
});

// ────────────────────────────────────────────────────────────────
// resolvePublicAddress (Sprint 179 — liefert die zu PINNENDE IP)
// ────────────────────────────────────────────────────────────────

test('resolvePublicAddress: literale public IPv4 → {address, family:4}', async () => {
    assert.deepEqual(await resolvePublicAddress('8.8.8.8'), { address: '8.8.8.8', family: 4 });
});

test('resolvePublicAddress: private/link-local literal → SSRF', async () => {
    await assert.rejects(() => resolvePublicAddress('127.0.0.1'), /SSRF/);
    await assert.rejects(() => resolvePublicAddress('169.254.169.254'), /SSRF/);
    await assert.rejects(() => resolvePublicAddress('10.0.0.1'), /SSRF/);
    await assert.rejects(() => resolvePublicAddress('::1'), /SSRF/);
});

test('resolvePublicAddress: empty hostname → SSRF', async () => {
    await assert.rejects(() => resolvePublicAddress(''), /SSRF/);
});

test('resolvePublicAddress: host der auf private IP aufloest → SSRF (localhost)', async () => {
    await assert.rejects(() => resolvePublicAddress('localhost'), /SSRF/);
});
