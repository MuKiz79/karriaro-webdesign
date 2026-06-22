/**
 * Kanal-Outputs — verwandelt das Outreach-Paket (buildOutreachPack) in LEGALE,
 * hochkonvertierende Kanaele statt nur Kalt-Mail (UWG §7: Kalt-Mail/-Anruf an
 * DE-Firmen ohne Einwilligung sind abmahnfaehig):
 *   • Werbebrief (Post)  — rechtlich unkritisch, persoenlich, Mockup eingebettet
 *   • Anruf-Leitfaden    — Telefon + Hook + Gespraechs-/Einwand-Leitfaden
 *   • LinkedIn/Xing 1:1  — kurzer, persoenlicher Erst-Kontakt
 *
 * Reine Builder (kein DOM) → leicht testbar. Quelle = `data` (Single-Check-Result)
 * + `pack` (buildOutreachPack). Reuse statt Neubau.
 * @module outreach/channels
 */
import { config } from '../config.js';

function recipientPerson(data) {
    return data?.contactData?.owner || null;
}
function businessName(data) {
    if (data?.place?.displayName?.text) return data.place.displayName.text;
    if (data?.companyProfile?.name) return data.companyProfile.name;
    try { return new URL(data.url).hostname.replace(/^www\./, ''); } catch { return 'Ihr Unternehmen'; }
}
function topArgs(pack, n) {
    return (pack?.allArgs || []).slice(0, n);
}
function sender() {
    const p = config.profile || {};
    return {
        name: p.name || 'Muammer Kizilaslan',
        company: p.company || 'Karriaro Webdesign',
        location: p.location || '',
        portfolio: p.portfolio || 'karriaro-webdesign.de',
        priceRange: p.priceRange || 'ab 1.290 €'
    };
}
function esc(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Anruf-Leitfaden — Telefon + Hook + Gespraechs-/Einwand-Leitfaden.
 * @returns {{biz, phone, opener, problems:string[], offer, objections:Array<{q,a}>}}
 */
export function buildCallSheet(data, pack) {
    const s = sender();
    const person = recipientPerson(data);
    const args = topArgs(pack, 3);
    return {
        biz: businessName(data),
        phone: data?.place?.nationalPhoneNumber || data?.place?.internationalPhoneNumber || '— keine Nummer —',
        opener: `Guten Tag${person ? ', ' + person : ''}, mein Name ist ${s.name} von ${s.company}. Ich habe mir Ihre Website angeschaut — haben Sie 30 Sekunden?`,
        problems: args.map(a => a.short || a.text).filter(Boolean),
        offer: 'Ich mache Ihnen unverbindlich einen ersten Entwurf Ihrer neuen Seite — kostenlos, ohne Verpflichtung.',
        objections: [
            { q: '„Keine Zeit / kein Interesse."', a: 'Verstehe. Darf ich Ihnen den Entwurf einfach per Post oder E-Mail schicken? Dann sehen Sie in Ruhe, ob es etwas für Sie ist.' },
            { q: '„Was kostet das?"', a: `Eine handcodierte Seite ${s.priceRange}, einmalig, kein Abo. Aber erst kommt der Entwurf — der ist kostenlos.` },
            { q: '„Haben schon jemanden / machen wir selbst."', a: 'Gut möglich, dass Ihre Seite passt. Mein Entwurf ist trotzdem kostenlos — vergleichen Sie einfach, kostet Sie nichts.' }
        ]
    };
}

/**
 * LinkedIn/Xing 1:1 — kurzer Vernetzungs- + Erst-Nachricht-Entwurf (anderes
 * Register als E-Mail: knapp, persoenlich, kein Werbeblock).
 * @returns {{connect:string, message:string}}
 */
export function buildLinkedIn(data, pack) {
    const s = sender();
    const biz = businessName(data);
    const arg = topArgs(pack, 1)[0];
    return {
        connect: `Guten Tag, ich habe mir ${biz} angesehen und hätte einen konkreten Gedanken zu Ihrer Website. Verbinden wir uns gern?`,
        message: `Guten Tag,\n\n${arg?.text || `mir ist an Ihrer Website (${biz}) etwas aufgefallen, das Sie vermutlich Anfragen kostet.`}\n\nIch baue handcodierte Websites für lokale Betriebe. Wenn Sie mögen, mache ich Ihnen unverbindlich einen ersten Entwurf — ohne Verpflichtung. Wäre das interessant?\n\nBeste Grüße\n${s.name}\n${s.portfolio}`
    };
}

/**
 * Vollstaendiges, druckfertiges A4-Werbebrief-Dokument (komplettes HTML inkl.
 * Print-CSS) — fuer ein eigenes Druck-Fenster. Mockup-Bild eingebettet, wenn
 * vorhanden (data.mockup.svgDataUrl), sonst die Mockup-Headline als Text.
 * @returns {string} HTML-Dokument
 */
export function buildLetter(data, pack) {
    const s = sender();
    const person = recipientPerson(data);
    const biz = businessName(data);
    const addrLines = String(data?.place?.formattedAddress || '').split(',').map(x => x.trim()).filter(Boolean);
    const greeting = person ? `Sehr geehrte/r ${person},` : 'Sehr geehrte Damen und Herren,';
    const args = topArgs(pack, 3);
    const opener = args[0]?.text
        || `ich habe mir Ihre Website angeschaut und dabei einige Punkte gefunden, die Sie messbar Anfragen und Sichtbarkeit kosten.`;
    const support = args.slice(1, 3).map(a => a.text);
    const dateStr = new Date().toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' });
    const mockup = data?.mockup?.svgDataUrl
        ? `<figure class="mockup"><img src="${esc(data.mockup.svgDataUrl)}" alt="Entwurf Ihrer neuen Website">${pack?.mockupHeadline ? `<figcaption>Ein erster Entwurf, eigens für Sie: „${esc(pack.mockupHeadline)}"</figcaption>` : ''}</figure>`
        : (pack?.mockupHeadline ? `<p class="mockup-text">Ein erster Entwurf-Gedanke, eigens für Sie: <strong>„${esc(pack.mockupHeadline)}"</strong></p>` : '');

    return `<!doctype html><html lang="de"><head><meta charset="utf-8">
<title>Brief an ${esc(biz)}</title>
<style>
  @page { size: A4; margin: 22mm 20mm; }
  * { box-sizing: border-box; }
  body { font-family: Georgia, 'Times New Roman', serif; color: #16202C; line-height: 1.5; font-size: 11.5pt; max-width: 170mm; margin: 0 auto; padding: 16mm 12mm; }
  .top { display: flex; justify-content: space-between; align-items: flex-start; font-size: 9.5pt; color: #555; }
  .sender strong { color: #16202C; font-size: 11pt; }
  .recipient { margin: 26mm 0 8mm; font-size: 11pt; }
  .recipient .biz { font-weight: bold; }
  .date { text-align: right; margin-bottom: 10mm; font-size: 10pt; color: #555; }
  .subject { font-weight: bold; margin-bottom: 8mm; }
  p { margin: 0 0 4mm; }
  .mockup { margin: 7mm 0; text-align: center; page-break-inside: avoid; }
  .mockup img { max-width: 100%; border: 1px solid #E0DCCF; border-radius: 6px; }
  .mockup figcaption { font-size: 9pt; color: #666; margin-top: 2mm; font-style: italic; }
  .mockup-text { background: #F1EFE7; border-left: 3px solid #C9A24B; padding: 4mm 5mm; }
  .signature { margin-top: 9mm; }
  .signature .name { font-weight: bold; }
  .accent { color: #C9A24B; }
  @media screen { body { box-shadow: 0 2px 24px rgba(0,0,0,.12); margin: 24px auto; background: #fff; } .print-hint { position: fixed; top: 12px; right: 12px; } }
  @media print { .print-hint { display: none; } }
</style></head>
<body>
  <button class="print-hint" onclick="window.print()">Drucken / als PDF speichern</button>
  <div class="top">
    <div class="sender"><strong>${esc(s.company)}</strong><br>${esc(s.name)}${s.location ? '<br>' + esc(s.location) : ''}<br>${esc(s.portfolio)}</div>
  </div>
  <div class="recipient">
    <div class="biz">${esc(biz)}</div>
    ${addrLines.map(l => esc(l)).join('<br>')}
  </div>
  <div class="date">${esc(s.location ? s.location.split(',').pop().trim() + ', den ' : 'Den ')}${esc(dateStr)}</div>
  <div class="subject">Ein Gedanke zu Ihrem Online-Auftritt — mit einem kostenlosen Entwurf</div>
  <p>${esc(greeting)}</p>
  <p>${esc(opener)}</p>
  ${support.map(t => `<p>${esc(t)}</p>`).join('')}
  <p>Damit Sie sehen, was möglich wäre, habe ich mir die Freiheit genommen, Ihnen <strong>unverbindlich einen ersten Entwurf</strong> zu skizzieren:</p>
  ${mockup}
  <p>Wenn Sie mögen, zeige ich Ihnen in einem kurzen Gespräch, wie Ihre neue Website aussehen könnte — handcodiert, ${esc(s.priceRange)}, einmalig und ohne Abo. Eine kurze Antwort genügt, ganz ohne Verpflichtung.</p>
  <div class="signature">
    <p>Mit freundlichen Grüßen</p>
    <p class="name">${esc(s.name)}</p>
    <p>${esc(s.company)} · <span class="accent">${esc(s.portfolio)}</span></p>
  </div>
</body></html>`;
}
