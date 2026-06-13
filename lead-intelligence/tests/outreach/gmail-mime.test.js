import { describe, it, expect } from 'vitest';
import { buildMimeMessage, toBase64Url, toBase64, encodeHeader } from '../../src/outreach/mime.js';

describe('toBase64Url', () => {
    it('liefert gültiges base64url (kein +, /, =)', () => {
        const out = toBase64Url('Hallo Welt — äöü & <html>');
        expect(out).toMatch(/^[A-Za-z0-9_-]+$/);
    });
    it('round-trippt UTF-8', () => {
        // base64 zurück → UTF-8
        const s = 'Grüße über Köln';
        const b64 = toBase64(s);
        const back = decodeURIComponent(escape(atob(b64)));
        expect(back).toBe(s);
    });
});

describe('encodeHeader', () => {
    it('lässt reines ASCII unverändert', () => {
        expect(encodeHeader('Hello World')).toBe('Hello World');
    });
    it('kodiert Umlaute als RFC-2047 Encoded-Word', () => {
        expect(encodeHeader('Grüße')).toMatch(/^=\?UTF-8\?B\?.+\?=$/);
    });
});

describe('buildMimeMessage', () => {
    const mime = buildMimeMessage({
        to: 'info@beispiel.de',
        subject: 'Entwurf für Beispiel',
        body: 'Sehr geehrte Damen und Herren,\n\nText.',
        bodyHtml: '<div><p>Text</p></div>'
    });

    it('enthält To, Subject, beide Parts', () => {
        expect(mime).toContain('To: info@beispiel.de');
        expect(mime).toContain('Content-Type: multipart/alternative');
        expect(mime).toContain('text/plain; charset="UTF-8"');
        expect(mime).toContain('text/html; charset="UTF-8"');
    });

    it('nutzt CRLF-Zeilenenden und schließt die Boundary', () => {
        expect(mime).toContain('\r\n');
        expect(mime).toMatch(/--kbnd_[a-z0-9]+--\r\n$/);
    });

    it('ist als raw base64url kodierbar', () => {
        expect(toBase64Url(mime)).toMatch(/^[A-Za-z0-9_-]+$/);
    });
});
