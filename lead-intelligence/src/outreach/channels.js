/**
 * Kanal-Outputs — verwandelt das Outreach-Paket (buildOutreachPack) in Texte für
 * weitere Kanäle. Welcher Kanal zulässig ist, entscheidet das Kontakt-Gate
 * (outreach/kontakt-grundlage.js); jeder Builder hier bekommt dessen Prüfung und
 * liefert ohne erlaubte Prüfung KEINEN Nachrichtentext:
 *
 *   • Werbebrief (Post) — ohne Einwilligung zulässig, solange kein Widerspruch
 *     vorliegt; der Widerspruchshinweis steht im Brief.
 *   • Anruf-Leitfaden   — nur mit konkretem, vorher dokumentiertem Anlass aus der
 *     Sphäre des Betriebs (Anfrage oder Bestandskunde); das Risiko einer
 *     Fehleinschätzung trägt der Anrufer.
 *   • LinkedIn/XING     — braucht wie E-Mail eine vorherige ausdrückliche
 *     Einwilligung; kein Ausweichkanal. Hier nur als Antwort auf eine Anfrage.
 *   • Pitch-Mail        — wie jede E-Mail nur mit Grundlage und Pflichtteil.
 *
 * Reine Builder (kein DOM) → leicht testbar. Quelle = `data` (Single-Check-Result)
 * + `pack` (buildOutreachPack). Reuse statt Neubau.
 * @module outreach/channels
 */
import { config, absender, PREIS_EINSTIEG, ABMELDUNG } from '../config.js';
import { complianceBlock } from '../strategy/compliance.js';
import { datumDe } from '../crm/leads.js';
import { normalisiereEmail } from '../crm/consents.js';

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
    const a = absender(p);
    return {
        name: a.name,
        company: a.firma,
        location: p.location || '',
        portfolio: a.web,
        email: a.email,
        anschrift: a.anschrift
    };
}
function gesperrt(pruefung, kanal) {
    if (!pruefung) return { erlaubt: false, grund: 'Kontaktgrundlage noch nicht geprüft.' };
    if (pruefung.kanal !== kanal) return { erlaubt: false, grund: 'Die Prüfung gilt für einen anderen Kanal.' };
    // Bei Sperrliste/Werbewiderspruch hilft keine Grundlage — dort kein Einwilligungs-Rechtshinweis.
    if (!pruefung.erlaubt) return { erlaubt: false, grund: pruefung.grund, rechtshinweis: pruefung.gesperrt ? null : pruefung.rechtshinweis };
    return null;
}
// Branche → die eingebauten Werkzeuge, die in der Pitch-Mail genannt werden
// (knapp, ehrlich; gleiche Logik wie die generierte Seite).
function toolsClauseFor(branche) {
    const b = String(branche || '').toLowerCase();
    if (/makler|immobil/.test(b)) return 'eine Sofort-Wertermittlung, eine Objekt-Galerie und ein Marktbarometer';
    if (/arzt|praxis|zahn|thera|medizin/.test(b)) return 'eine Online-Terminanfrage und eine klare Leistungsübersicht';
    if (/anwalt|kanzlei|recht|steuer/.test(b)) return 'eine diskrete Erstanfrage und eine klare Leistungsübersicht';
    if (/restaurant|gastro|café|cafe|hotel/.test(b)) return 'eine Tisch-/Reservierungsanfrage und eine ansprechende Speisekarte';
    if (/friseur|beauty|kosmet|spa/.test(b)) return 'eine Online-Terminanfrage und eine Stil-Galerie';
    if (/dach|sanit|elektr|handwerk|maler|bau|tischler|schreiner/.test(b)) return 'ein Foto-Anfrage-Werkzeug und ein Angebots-Assistent';
    return 'ein Anfrage-Assistent und eine klare Leistungsübersicht';
}

/** Einstieg der Pitch-Mail passend zur Grundlage — keine Kaltakquise-Formel. */
function pitchEinstieg(pruefung, s, biz) {
    if (pruefung.grundlage === 'doi') {
        return `vielen Dank, dass Sie uns erlaubt haben, Ihnen Hinweise zu Ihrer Website zu senden. Mein Name ist ${s.name} von ${s.company} — wir bauen handcodierte Websites für das KI-Zeitalter.`;
    }
    if (pruefung.grundlage === 'anfrage') {
        return `vielen Dank für Ihre Anfrage. Mein Name ist ${s.name} von ${s.company} — wir bauen handcodierte Websites für das KI-Zeitalter, und für ${biz} haben wir uns die Website genauer angesehen.`;
    }
    return `hier meldet sich ${s.name} von ${s.company}. Wir haben uns die Website von ${biz} noch einmal genauer angesehen.`;
}

/**
 * Pitch-Mail im Avenius-Register — verweist auf die GENERIERTE, teilbare
 * Pitch-Seite. Ohne erlaubte E-Mail-Prüfung kein Text (die Seite selbst darf
 * trotzdem erzeugt werden).
 *
 * @param {object} data
 * @param {string} pitchUrl
 * @param {object|null} pruefung  pruefeMailErlaubnis(..., {kanal:'email'})
 * @returns {{erlaubt:boolean, grund?:string, subject:string|null, body:string|null,
 *           textKern?:string, pflichtteil?:object, recipientEmail:string|null, listUnsubscribe?:object}}
 */
export function buildPitchEmail(data, pitchUrl, pruefung = null) {
    const sperre = gesperrt(pruefung, 'email');
    if (sperre) return { ...sperre, subject: null, body: null, recipientEmail: null };

    const s = sender();
    const biz = businessName(data);
    const person = recipientPerson(data);
    const branche = data?.companyProfile?.branche || data?.place?.primaryTypeDisplayName?.text || data?.place?.primaryType || '';
    const city = (data?.place?.formattedAddress || '').split(',').pop()?.trim() || 'Ihrer Region';
    const rating = data?.place?.rating;
    const reviews = data?.place?.userRatingCount;
    // Bei Double-Opt-In ist der Impressums-Inhaber nicht zwingend die einwilligende Person.
    const greeting = person && pruefung.grundlage !== 'doi' ? `Sehr geehrte/r ${person},` : 'Sehr geehrte Damen und Herren,';

    const substanz = (rating && reviews)
        ? `${biz} gehört mit ${String(rating).replace('.', ',')} Sternen aus rund ${reviews} Bewertungen zu den gut bewerteten Adressen in ${city}. Das ist Substanz, die man online sehen sollte.`
        : `${biz} hat sich in ${city} eine echte Reputation erarbeitet — Substanz, die man online sehen sollte.`;

    const textKern = [
        greeting,
        '',
        pitchEinstieg(pruefung, s, biz),
        '',
        substanz,
        '',
        'Was online davon zu sehen ist, wird dem noch nicht ganz gerecht. Deshalb haben wir Ihnen nicht beschrieben, wie es aussehen könnte, sondern einen ersten Entwurf gebaut — als unverbindliche Gesprächsgrundlage:',
        '',
        pitchUrl,
        '',
        `Entscheidend ist nicht das Aussehen allein — die Seite arbeitet mit: ${toolsClauseFor(branche)}. Werkzeuge, die Ihnen Anfragen bringen, nicht nur ein neues Gewand.`,
        '',
        'Vor allem ist sie auf das vorbereitet, was gerade beginnt: Immer mehr Menschen fragen heute nicht Google, sondern ChatGPT oder Perplexity. Damit diese KI-Assistenten Sie verstehen und empfehlen können, haben wir Ihr Haus maschinenlesbar hinterlegt — daran arbeiten heute die wenigsten.',
        '',
        `Wir sind eine kleine Manufaktur — kein Baukasten, jede Seite ein handcodiertes Unikat. Der Entwurf ist unverbindlich und gehört Ihnen als Gesprächsgrundlage: erst der Entwurf, dann Ihre Entscheidung. Eine solche Seite ist ein einmaliges Projekt, kein Abo — je nach Umfang ${PREIS_EINSTIEG}.`,
        '',
        'Hätten Sie Zeit für ein kurzes Telefonat?',
        '',
        'Mit besten Grüßen',
        s.name,
        `${s.company} — handcodierte Websites für das KI-Zeitalter`
    ].join('\n');

    const cb = complianceBlock(config.profile, pruefung);
    const recipientEmail = pruefung.grundlage === 'doi'
        ? pruefung.empfaenger
        : (pruefung.empfaenger || normalisiereEmail(data?.contactData?.allEmails?.[0]) || normalisiereEmail(data?.contactData?.email) || null);

    return {
        erlaubt: true,
        subject: `Ein Entwurf für ${biz} — als Gesprächsgrundlage`,
        textKern,
        pflichtteil: { text: cb.text, html: cb.html },
        body: textKern + cb.text,
        recipientEmail,
        listUnsubscribe: cb.listUnsubscribe,
        grundlage: pruefung
    };
}

function esc(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Anruf-Leitfaden — nur mit Anlass (Anfrage oder Bestandskunde).
 * @param {object} data
 * @param {object} pack
 * @param {object|null} pruefung  pruefeMailErlaubnis(..., {kanal:'anruf'})
 * @returns {{erlaubt:boolean, grund?:string, biz?, phone?, anlass?, opener?, problems?:string[], offer?, objections?:Array<{q,a}>, nachDemGespraech?:string}}
 */
export function buildCallSheet(data, pack, pruefung = null) {
    const sperre = gesperrt(pruefung, 'anruf');
    if (sperre) return sperre;
    const s = sender();
    const person = recipientPerson(data);
    const args = topArgs(pack, 3);
    const anrede = person ? `, ${person}` : '';
    const datum = datumDe(pruefung.datum);
    const opener = pruefung.grundlage === 'anfrage'
        ? `Guten Tag${anrede}, mein Name ist ${s.name} von ${s.company}. Sie hatten uns${datum ? ` am ${datum}` : ''} angefragt — dazu rufe ich an. Passt es gerade?`
        : `Guten Tag${anrede}, hier ist ${s.name} von ${s.company}. Ich melde mich wegen Ihrer Website — passt es gerade?`;
    return {
        erlaubt: true,
        biz: businessName(data),
        phone: data?.place?.nationalPhoneNumber || data?.place?.internationalPhoneNumber || '— keine Nummer —',
        anlass: pruefung.grund,
        opener,
        problems: args.map(a => a.short || a.text).filter(Boolean),
        offer: 'Sie sehen zuerst einen kostenfreien Entwurf Ihrer neuen Seite — erst der Entwurf, dann Ihre Entscheidung.',
        objections: [
            { q: '„Keine Zeit / kein Interesse."', a: 'Verstehe, dann halte ich Sie nicht länger auf. Vielen Dank für Ihre Zeit.' },
            { q: '„Was kostet das?"', a: `Eine handcodierte Seite ${PREIS_EINSTIEG}, einmalig, kein Abo. Sie sehen zuerst einen kostenfreien Entwurf — erst der Entwurf, dann Ihre Entscheidung.` },
            { q: '„Haben schon jemanden / machen wir selbst."', a: 'Gut möglich, dass das gut passt. Dann danke ich Ihnen für das Gespräch.' }
        ],
        // Art. 21 Abs. 4 DSGVO: spätestens bei der ersten Kommunikation, getrennt von
        // den übrigen Informationen.
        widerspruch: 'Im Gespräch ausdrücklich sagen: Sie können der Nutzung Ihrer Daten für Werbung jederzeit widersprechen — ein kurzes Wort genügt, dann melden wir uns nicht mehr.',
        nachDemGespraech: 'Sagt der Betrieb „kein Interesse", tragen Sie ihn als abgemeldet ein — dann wird er über keinen Kanal mehr kontaktiert.'
    };
}

/**
 * LinkedIn/Xing 1:1 — nur als Antwort auf eine Anfrage.
 * @param {object} data
 * @param {object} pack
 * @param {object|null} pruefung  pruefeMailErlaubnis(..., {kanal:'linkedin'})
 * @returns {{erlaubt:boolean, grund?:string, connect?:string, message?:string}}
 */
export function buildLinkedIn(data, pack, pruefung = null) {
    const sperre = gesperrt(pruefung, 'linkedin');
    if (sperre) return sperre;
    const s = sender();
    const biz = businessName(data);
    const arg = topArgs(pack, 1)[0];
    return {
        erlaubt: true,
        connect: `Guten Tag, danke für Ihre Anfrage zu ${biz} — gern vernetzen wir uns dazu.`,
        message: `Guten Tag,\n\nvielen Dank für Ihre Anfrage. ${arg?.text || `Ich habe mir die Website von ${biz} angesehen.`}\n\nWenn Sie mögen, sehen Sie zuerst einen kostenfreien Entwurf — erst der Entwurf, dann Ihre Entscheidung.\n\nBeste Grüße\n${s.name}\n${s.portfolio}\n\nSie können der Nutzung Ihrer Daten für Werbung jederzeit widersprechen (Art. 21 Abs. 2 DSGVO) — eine kurze Antwort genügt.`
    };
}

/**
 * Vollstaendiges, druckfertiges A4-Werbebrief-Dokument (komplettes HTML inkl.
 * Print-CSS) — fuer ein eigenes Druck-Fenster. Mockup-Bild eingebettet, wenn
 * vorhanden (data.mockup.svgDataUrl), sonst die Mockup-Headline als Text.
 * Ob gedruckt werden darf (Sperrliste, Werbewiderspruch), prüft der Aufrufer
 * mit pruefeMailErlaubnis(..., {kanal:'brief'}).
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
    const widerspruch = `Sie können der Verwendung Ihrer Daten für Werbung jederzeit widersprechen (Art. 21 Abs. 2 DSGVO) — formlos per E-Mail an ${ABMELDUNG.email} oder per Post an ${s.company}, ${s.anschrift}. Wir schreiben Ihnen dann nicht mehr.`;

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
  .widerspruch { margin-top: 10mm; font-size: 9pt; color: #555; }
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
  <p>Wenn Sie mögen, zeige ich Ihnen in einem kurzen Gespräch, wie Ihre neue Website aussehen könnte — handcodiert, ${esc(PREIS_EINSTIEG)}, einmalig und ohne Abo. Eine kurze Antwort genügt, ganz ohne Verpflichtung.</p>
  <div class="signature">
    <p>Mit freundlichen Grüßen</p>
    <p class="name">${esc(s.name)}</p>
    <p>${esc(s.company)} · <span class="accent">${esc(s.portfolio)}</span></p>
  </div>
  <p class="widerspruch">${esc(widerspruch)}</p>
</body></html>`;
}
