import { describe, it, expect } from 'vitest';
import {
    buildMimeMessage, toBase64Url, toBase64, encodeHeader, formatAdresse,
    listUnsubscribeHeader, baueMailtoHref, bereinigeHeaderWert
} from '../../src/outreach/mime.js';

function decodeEncodedWords(header) {
    // Faltung entfernen, dann jedes Encoded-Word dekodieren und aneinanderhängen
    const worte = header.replace(/\r\n /g, ' ').match(/=\?UTF-8\?B\?([^?]+)\?=/g) || [];
    return worte.map(w => decodeURIComponent(escape(atob(w.slice(10, -2))))).join('');
}

describe('toBase64Url', () => {
    it('liefert gültiges base64url (kein +, /, =)', () => {
        const out = toBase64Url('Hallo Welt — äöü & <html>');
        expect(out).toMatch(/^[A-Za-z0-9_-]+$/);
    });
    it('round-trippt UTF-8', () => {
        const s = 'Grüße über Schiltach';
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
    it('langer Betreff: jedes Encoded-Word ≤ 75 Zeichen, gefaltet, verlustfrei', () => {
        const s = 'Ein Entwurf für Bäckerei Müller & Söhne — als Gesprächsgrundlage für Ihre Überlegungen zur Website';
        const h = encodeHeader(s);
        const worte = h.split('\r\n ');
        expect(worte.length).toBeGreaterThan(1);
        for (const w of worte) expect(w.length).toBeLessThanOrEqual(75);
        expect(decodeEncodedWords(h)).toBe(s);
    });
    it('trennt nie mitten in einem Mehrbyte-Zeichen', () => {
        const s = 'ü'.repeat(50) + '😀'.repeat(10);
        expect(decodeEncodedWords(encodeHeader(s))).toBe(s);
    });
});

describe('Header-Injection', () => {
    it('Zeilenumbrüche in Betreff und Empfänger schleusen keine Header ein', () => {
        const mime = buildMimeMessage({ to: 'a@b.de\r\nBcc: opfer@x.de', subject: 'Hallo\r\nBcc: opfer@x.de', body: 'x' });
        expect(mime).not.toMatch(/\r\nBcc:/);
        expect(bereinigeHeaderWert('a\r\nb\nc')).toBe('a b c');
    });
    it('ungültiger Empfänger ergibt einen leeren To-Header statt Müll', () => {
        const mime = buildMimeMessage({ to: 'kein-empfaenger', subject: 's', body: 'x' });
        expect(mime).toMatch(/^To: \r\n/m);
    });
});

describe('formatAdresse', () => {
    it('ASCII-Name bleibt lesbar', () => {
        expect(formatAdresse({ name: 'Muammer Kizilaslan', email: 'kontakt@karriaro.de' })).toBe('Muammer Kizilaslan <kontakt@karriaro.de>');
    });
    it('Name mit Nicht-ASCII wird kodiert', () => {
        const f = formatAdresse({ name: 'Muammer Kızılaslan', email: 'kontakt@karriaro.de' });
        expect(f).toMatch(/^=\?UTF-8\?B\?.+\?= <kontakt@karriaro\.de>$/);
        expect(decodeEncodedWords(f)).toBe('Muammer Kızılaslan');
    });
    it('Sonderzeichen im ASCII-Namen werden gequotet', () => {
        expect(formatAdresse({ name: 'Karriaro, Webdesign', email: 'k@k.de' })).toBe('"Karriaro, Webdesign" <k@k.de>');
    });
    it('ungültige Adresse → leer', () => {
        expect(formatAdresse({ name: 'X', email: 'nope' })).toBe('');
    });
});

describe('listUnsubscribeHeader', () => {
    it('nur mailto → kein One-Click-Header', () => {
        const h = listUnsubscribeHeader({ mailto: 'mailto:kontakt@karriaro.de?subject=Abmelden', https: null });
        expect(h).toEqual([['List-Unsubscribe', '<mailto:kontakt@karriaro.de?subject=Abmelden>']]);
    });
    it('mailto + https → beide Ziele und List-Unsubscribe-Post', () => {
        const h = listUnsubscribeHeader({ mailto: 'mailto:kontakt@karriaro.de?subject=Abmelden', https: 'https://karriaro-webdesign.de/abmelden?t=abc' });
        expect(h[0]).toEqual(['List-Unsubscribe', '<mailto:kontakt@karriaro.de?subject=Abmelden>, <https://karriaro-webdesign.de/abmelden?t=abc>']);
        expect(h[1]).toEqual(['List-Unsubscribe-Post', 'List-Unsubscribe=One-Click']);
    });
    it('http statt https → kein One-Click (Gegenprobe)', () => {
        const h = listUnsubscribeHeader({ mailto: 'mailto:kontakt@karriaro.de', https: 'http://karriaro-webdesign.de/abmelden?t=abc' });
        expect(h.map(p => p[0])).toEqual(['List-Unsubscribe']);
    });
});

describe('buildMimeMessage', () => {
    const mime = buildMimeMessage({
        to: 'info@beispiel.de',
        subject: 'Entwurf für Beispiel',
        body: 'Sehr geehrte Damen und Herren,\n\nText.',
        bodyHtml: '<div><p>Text</p></div>',
        from: { name: 'Muammer Kizilaslan', email: 'kontakt@karriaro.de' },
        listUnsubscribe: { mailto: 'mailto:kontakt@karriaro.de?subject=Abmelden', https: 'https://karriaro-webdesign.de/abmelden?t=tok' },
        date: new Date('2026-09-10T10:00:00Z')
    });

    it('enthält From, To, Subject, Date, List-Unsubscribe und beide Parts', () => {
        expect(mime).toContain('From: Muammer Kizilaslan <kontakt@karriaro.de>\r\n');
        expect(mime).toContain('To: info@beispiel.de');
        expect(mime).toMatch(/Subject: =\?UTF-8\?B\?/);
        expect(mime).toContain('Date: Thu, 10 Sep 2026 10:00:00 GMT');
        expect(mime).toContain('List-Unsubscribe: <mailto:kontakt@karriaro.de?subject=Abmelden>, <https://karriaro-webdesign.de/abmelden?t=tok>');
        expect(mime).toContain('List-Unsubscribe-Post: List-Unsubscribe=One-Click');
        expect(mime).toContain('Content-Type: multipart/alternative');
        expect(mime).toContain('text/plain; charset="UTF-8"');
        expect(mime).toContain('text/html; charset="UTF-8"');
    });

    it('Header stehen vor der Leerzeile, der Body danach', () => {
        const kopf = mime.split('\r\n\r\n')[0];
        expect(kopf).toContain('List-Unsubscribe-Post');
        expect(kopf).toContain('MIME-Version: 1.0');
    });

    it('ohne from/listUnsubscribe keine leeren Header-Zeilen', () => {
        const m = buildMimeMessage({ to: 'a@b.de', subject: 's', body: 'b' });
        expect(m).not.toMatch(/^From:/m);
        expect(m).not.toMatch(/^List-Unsubscribe/m);
    });

    it('nutzt CRLF-Zeilenenden und schließt die Boundary', () => {
        expect(mime).toContain('\r\n');
        expect(mime).toMatch(/--kbnd_[a-z0-9]+--\r\n$/);
    });

    it('ist als raw base64url kodierbar', () => {
        expect(toBase64Url(mime)).toMatch(/^[A-Za-z0-9_-]+$/);
    });
});

describe('baueMailtoHref', () => {
    const pflicht = '\n—\nMuammer Kizilaslan · Karriaro Webdesign\n\nWiderspruchsrecht: Art. 21 DSGVO.';

    it('kurzer Text passt vollständig', () => {
        const href = baueMailtoHref({ to: 'a@b.de', subject: 'Hallo', kern: 'Text', pflicht });
        expect(decodeURIComponent(href.split('&body=')[1])).toBe('Text' + pflicht);
    });

    it('langer Text: nur der Kern wird gekürzt, der Pflichtteil bleibt vollständig', () => {
        const kern = 'Ä'.repeat(3000);
        const href = baueMailtoHref({ to: 'a@b.de', subject: 'Hallo', kern, pflicht, maxLaenge: 1900 });
        expect(href.length).toBeLessThanOrEqual(1900);
        const body = decodeURIComponent(href.split('&body=')[1]);
        expect(body.endsWith(pflicht)).toBe(true);
        expect(body).toContain('Text gekürzt');
    });

    it('passt nicht einmal der Pflichtteil → null (kein mailto ohne Pflichtteil)', () => {
        expect(baueMailtoHref({ to: 'a@b.de', subject: 's', kern: 'x', pflicht: 'Ü'.repeat(1000), maxLaenge: 500 })).toBeNull();
    });

    it('ohne gültigen Empfänger → null', () => {
        expect(baueMailtoHref({ to: '', subject: 's', kern: 'x', pflicht })).toBeNull();
    });

    it('das trennende @ bleibt wörtlich, Sonderzeichen im lokalen Teil werden kodiert', () => {
        expect(baueMailtoHref({ to: 'a@b.de', subject: 's', kern: 'x' }).startsWith('mailto:a@b.de?subject=')).toBe(true);
        const href = baueMailtoHref({ to: 'x&y?z@b.de', subject: 's', kern: 'x' });
        expect(href.startsWith('mailto:x%26y%3Fz@b.de?subject=')).toBe(true);
        expect(href).not.toContain('%40');
    });
});
