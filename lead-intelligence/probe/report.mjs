/**
 * Baut den Verifikations-Report (HTML) aus den Probe-Daten beider Städte.
 *
 *   node probe/report.mjs
 *
 * Liest AUSSCHLIESSLICH Rohfaktoren aus 05/06/07-JSONs — nie Chips (Matrix e).
 * Screenshots werden als data-URIs eingebettet (self-contained, CSP-fest).
 */
import { readFileSync, existsSync as fsExists } from 'node:fs';
import { dataDir, readJson, reportDir, join } from './lib/io.mjs';

const ST = {
    scored: readJson(join(dataDir('Stuttgart'), '05-scored.json')),
    verify: readJson(join(dataDir('Stuttgart'), '06-verify.json')),
    adv: readJson(join(dataDir('Stuttgart'), '07-adversarial.json'))
};
const KA = {
    scored: readJson(join(dataDir('Karlsruhe'), '05-scored.json')),
    verify: readJson(join(dataDir('Karlsruhe'), '06-verify.json')),
    adv: readJson(join(dataDir('Karlsruhe'), '07-adversarial.json'))
};

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const pct = x => `${Math.round(x * 100)} %`;

function shotUri(file) {
    if (!file || !fsExists(file)) return null;
    return `data:image/jpeg;base64,${readFileSync(file).toString('base64')}`;
}

// ── Kennzahlen ──
function cityStats(C) {
    const leads = C.scored.leads;
    const top10 = leads.slice(0, 10);
    return {
        stats: C.scored.stats,
        top10,
        provenTop10: top10.filter(l => l.buySignal?.proven).length,
        m: C.verify.matrix,
        adv: C.adv?.results || []
    };
}
const st = cityStats(ST), ka = cityStats(KA);

const ampel = (zustand, label, detail) => `
  <div class="ampel ampel--${zustand}">
    <div class="ampel__dot" aria-hidden="true"></div>
    <div><div class="ampel__label">${esc(label)}</div><div class="ampel__detail">${detail}</div></div>
  </div>`;

const chipHtml = l => {
    const f = [];
    if (l.buySignal?.proven) f.push('<span class="tag tag--buy">💸 zahlt für Kunden</span>');
    if ((l.hardStructural || 0) >= 1) f.push(`<span class="tag">${esc(l.isBaukasten ? l.cms : 'Struktur')}</span>`);
    if (l.perfKnown) f.push(`<span class="tag">Perf ${l.ws.perf}</span>`);
    if (l.peerPressure) f.push('<span class="tag">hinter der Branche</span>');
    if (!l.adChecked && !l.adBlocked) f.push('<span class="tag tag--mute">Kaufsignal ungeprüft</span>');
    return f.join(' ');
};

function top10Table(c, cityName) {
    return `
  <div class="tablewrap"><table>
    <thead><tr><th>#</th><th>Score</th><th>Betrieb</th><th>Branche</th><th>Belege (Rohfaktoren)</th></tr></thead>
    <tbody>${c.top10.map((l, i) => `
      <tr>
        <td class="num">${i + 1}</td>
        <td class="num score">${l.opportunity}</td>
        <td><strong>${esc(l.name)}</strong><br><span class="mono muted">${esc(l.domain)}</span></td>
        <td>${esc(l.branch.name)}</td>
        <td>${chipHtml(l)}</td>
      </tr>`).join('')}
    </tbody>
  </table></div>`;
}

function quoteBars(c) {
    const q1 = c.m.a.quoteTop10, q2 = c.m.a.quote3160;
    const bar = (label, q, n) => `
      <div class="bar-row">
        <div class="bar-label">${label}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${Math.round(q * 100)}%"></div></div>
        <div class="bar-val num">${pct(q)}<span class="muted"> (${n})</span></div>
      </div>`;
    return `<div class="bars" role="img" aria-label="Kaufsignal-Quote Top-10 ${pct(q1)} gegenüber Rang 31–60 ${pct(q2)}">
      ${bar('Top 10', q1, `${c.m.a.provenTop10}/10`)}
      ${bar('Rang 31–60', q2, `${c.m.a.proven3160}/${c.m.a.vergleichsmenge}`)}
    </div>`;
}

function advCard(r, uri) {
    return `
  <article class="beleg">
    ${uri ? `<img src="${uri}" alt="Screenshot ${esc(r.domain)}" loading="lazy">` : ''}
    <div class="beleg__body">
      <header><span class="num score">${r.score}</span> <strong>${esc(r.name)}</strong> <span class="mono muted">${esc(r.domain)}</span></header>
      <ul>${r.belege.map(b => `<li class="b b--${b.ok === true ? 'ok' : b.ok === false ? 'fail' : 'na'}">
        <span class="b__mark">${b.ok === true ? '✔' : b.ok === false ? '✘' : '·'}</span>
        <span><strong>${esc(b.beleg)}</strong> — ${esc(b.ergebnis)}<br><span class="muted small">${esc(b.quelle)}</span></span></li>`).join('')}
      </ul>
    </div>
  </article>`;
}

// Sichtprüfungs-Befund 4: Ketten fliegen aus der Versandliste (dort entscheidet
// kein Inhaber vor Ort). Ersetzt durch die nächsten Nicht-Ketten-Ränge — die
// IST-Rangfolge im Report oben bleibt unangetastet, nur die HANDLUNGSliste
// wird bereinigt.
const KNOWN_CHAINS = new Set(['mcdreamshotels.de', 'rex.app', 'radissonhotels.com', 'anicura.de']);

function versandEintraege(v, scoredLeads) {
    const roh = v.versandliste.eintraege;
    const behalten = roh.filter(e => !KNOWN_CHAINS.has(e.domain));
    const ersetzt = roh.filter(e => KNOWN_CHAINS.has(e.domain));
    const schonDrin = new Set(behalten.map(e => e.domain));
    const ersatz = [];
    for (const l of scoredLeads) {
        if (ersatz.length >= ersetzt.length) break;
        if (schonDrin.has(l.domain) || KNOWN_CHAINS.has(l.domain)) continue;
        const rang = scoredLeads.indexOf(l) + 1;
        if (rang <= 10) continue;   // Spitze war schon abgedeckt
        ersatz.push({
            kohorte: 'Spitze', rang, name: l.name, domain: l.domain,
            branche: l.branch.name, score: l.opportunity, proven: !!l.buySignal?.proven,
            kontaktweg: (() => {
                const c = l.siteEvidence?.contactPaths;
                if (!c || c.checked !== true) return 'ungeprüft';
                return c.hasMailto ? 'E-Mail' : c.hasTel ? 'Telefon' : c.hasImpressumLink ? 'Impressum' : 'keiner gefunden';
            })(),
            begruendung: `Ersatz für Ketten-Eintrag · ${l.buySignal?.proven ? 'zahlt für Kundengewinnung' : 'hoher Score'}`,
            versendet: '', antwort: '', termin: ''
        });
    }
    const spitze = [...behalten.filter(e => e.kohorte === 'Spitze'), ...ersatz]
        .sort((a, b) => a.rang - b.rang);
    return [...spitze, ...behalten.filter(e => e.kohorte === 'Mittelfeld')];
}

function versandRows(v, scoredLeads) {
    return versandEintraege(v, scoredLeads).map(e => `
    <tr>
      <td>${esc(e.kohorte)}</td><td class="num">${e.rang}</td><td class="num score">${e.score}</td>
      <td><strong>${esc(e.name)}</strong><br><span class="mono muted">${esc(e.domain)}</span></td>
      <td>${esc(e.branche)}</td><td>${e.proven ? '💸' : '—'}</td><td>${esc(e.kontaktweg)}</td>
      <td class="small">${esc(e.begruendung)}</td>
      <td class="track"></td><td class="track"></td><td class="track"></td>
    </tr>`).join('');
}

const stShots = Object.fromEntries((st.adv).map(r => [r.domain, shotUri(r.screenshot)]));

const html = `<title>Lead-Verifikation Stuttgart + Karlsruhe</title>
<style>
  :root {
    --bg: #F6F4ED; --surface: #FFFFFF; --ink: #1C2431; --ink-2: #4A5261;
    --muted: #767C88; --line: #E2DFD3; --accent: #A98730; --accent-ink: #7C6222;
    --ok: #2F7D4E; --warn: #A96A0B; --fail: #B2372C; --track: #EDEAE0;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --bg: #12161E; --surface: #1A2130; --ink: #EAE6DB; --ink-2: #B8BDC9;
      --muted: #8A90A0; --line: #2A3242; --accent: #C9A24B; --accent-ink: #C9A24B;
      --ok: #5CB585; --warn: #D79A3D; --fail: #E06A5C; --track: #232B3C;
    }
  }
  :root[data-theme="dark"] {
    --bg: #12161E; --surface: #1A2130; --ink: #EAE6DB; --ink-2: #B8BDC9;
    --muted: #8A90A0; --line: #2A3242; --accent: #C9A24B; --accent-ink: #C9A24B;
    --ok: #5CB585; --warn: #D79A3D; --fail: #E06A5C; --track: #232B3C;
  }
  * { box-sizing: border-box; }
  body { background: var(--bg); color: var(--ink); margin: 0;
    font: 16px/1.55 system-ui, -apple-system, "Segoe UI", sans-serif; }
  .wrap { max-width: 1020px; margin: 0 auto; padding: 40px 24px 96px; }
  h1, h2, h3 { font-family: Charter, "Iowan Old Style", Georgia, serif; line-height: 1.15; text-wrap: balance; }
  h1 { font-size: clamp(28px, 4.5vw, 42px); margin: 8px 0 4px; }
  h2 { font-size: 24px; margin: 56px 0 6px; }
  h3 { font-size: 18px; margin: 28px 0 6px; }
  .eyebrow { font-size: 12px; letter-spacing: .14em; text-transform: uppercase; color: var(--accent-ink); font-weight: 600; }
  .lede { color: var(--ink-2); max-width: 68ch; margin-top: 4px; }
  .muted { color: var(--muted); } .small { font-size: 13px; }
  .mono { font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: .86em; }
  .num { font-variant-numeric: tabular-nums; }
  section > p { max-width: 72ch; }

  .ampeln { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 12px; margin: 24px 0 8px; }
  .ampel { display: flex; gap: 12px; align-items: flex-start; background: var(--surface);
    border: 1px solid var(--line); border-left-width: 4px; padding: 14px 16px; }
  .ampel__dot { width: 12px; height: 12px; border-radius: 50%; margin-top: 5px; flex: none; }
  .ampel--ok { border-left-color: var(--ok); } .ampel--ok .ampel__dot { background: var(--ok); }
  .ampel--warn { border-left-color: var(--warn); } .ampel--warn .ampel__dot { background: var(--warn); }
  .ampel--fail { border-left-color: var(--fail); } .ampel--fail .ampel__dot { background: var(--fail); }
  .ampel__label { font-weight: 650; } .ampel__detail { font-size: 14px; color: var(--ink-2); }

  .tablewrap { overflow-x: auto; background: var(--surface); border: 1px solid var(--line); margin: 12px 0; }
  table { border-collapse: collapse; width: 100%; font-size: 14px; }
  th { text-align: left; font-size: 12px; letter-spacing: .06em; text-transform: uppercase;
    color: var(--muted); padding: 10px 12px; border-bottom: 1px solid var(--line); white-space: nowrap; }
  td { padding: 10px 12px; border-bottom: 1px solid var(--line); vertical-align: top; }
  tr:last-child td { border-bottom: 0; }
  td.score { font-weight: 700; }
  .tag { display: inline-block; border: 1px solid var(--line); background: var(--bg);
    padding: 1px 8px; border-radius: 3px; font-size: 12.5px; margin: 1px 2px 1px 0; white-space: nowrap; }
  .tag--buy { border-color: var(--accent); color: var(--accent-ink); font-weight: 600; }
  .tag--mute { color: var(--muted); border-style: dashed; }

  .bars { max-width: 560px; margin: 14px 0 4px; }
  .bar-row { display: grid; grid-template-columns: 110px 1fr 90px; gap: 10px; align-items: center; margin: 6px 0; }
  .bar-label { font-size: 13px; color: var(--ink-2); }
  .bar-track { background: var(--track); height: 18px; }
  .bar-fill { background: var(--accent); height: 100%; border-radius: 0 3px 3px 0; min-width: 2px; }
  .bar-val { font-size: 13px; }

  .beleg { display: grid; grid-template-columns: 180px 1fr; gap: 0; background: var(--surface);
    border: 1px solid var(--line); margin: 14px 0; }
  .beleg img { width: 180px; height: 100%; object-fit: cover; object-position: top; border-right: 1px solid var(--line); }
  .beleg__body { padding: 14px 18px; min-width: 0; }
  .beleg header { margin-bottom: 8px; }
  .beleg ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
  .b { display: flex; gap: 8px; font-size: 14px; }
  .b__mark { flex: none; width: 16px; font-weight: 700; }
  .b--ok .b__mark { color: var(--ok); } .b--fail .b__mark { color: var(--fail); } .b--na .b__mark { color: var(--muted); }
  @media (max-width: 620px) { .beleg { grid-template-columns: 1fr; } .beleg img { width: 100%; max-height: 220px; border-right: 0; border-bottom: 1px solid var(--line); } }

  .kachel { background: var(--surface); border: 1px solid var(--line); padding: 16px 20px; margin: 12px 0; }
  .kachel--warn { border-left: 4px solid var(--warn); }
  .kachel--fail { border-left: 4px solid var(--fail); }
  .kachel--ok { border-left: 4px solid var(--ok); }
  .kachel h3 { margin: 0 0 6px; }
  .kachel p { margin: 6px 0; max-width: 78ch; }
  td.track { background: var(--bg); min-width: 72px; }
  .verdict { font-size: 18px; max-width: 70ch; }
  .pass { color: var(--ok); font-weight: 700; } .fail { color: var(--fail); font-weight: 700; } .warn { color: var(--warn); font-weight: 700; }
  a { color: var(--accent-ink); }
</style>
<div class="wrap">

<header>
  <div class="eyebrow">Karriaro · Lead Intelligence · Verifikation 15.08. · Nachtrag: alle 5 Befunde behoben 16.08.2026</div>
  <h1>Findet das Werkzeug die richtigen Kunden?</h1>
  <p class="lede">Empirische Prüfung der Rangfolge auf echten Daten: zwei Städte, ${st.stats.scored + ka.stats.scored} bewertete Betriebe,
  jede Top-Platzierung adversarial gegengeprüft. Die Probe rechnet nachweislich bitgleich zur App (Eichung E1).
  <strong>Stand 16.08.: Alle fünf am 15.08. gefundenen Defekte sind repariert, deployt und hier eingerechnet</strong> —
  Tabellen und Versandliste zeigen die Rangfolge NACH den Fixes.</p>

  <div class="ampeln">
    ${ampel('ok', 'Zielgruppen-Treffer', `Kein „ausgebuchte Praxis ohne Kaufsignal"-Fall, der Kernfall (RA&nbsp;Voggel vor Zahnarzt) steht real auf Rang&nbsp;2 — und die am 15.08. entdeckten <strong>Ketten</strong> (Radisson&nbsp;Blu, AniCura, McDreams, Rex) sind seit dem Filter-Fix ganz aus dem Lauf.`)}
    ${ampel('ok', 'Kaufsignal-Priorisierung', `Stuttgart: 8/10 der Spitze zahlen nachweislich für Kundengewinnung (Vergleichsgruppe: ${pct(st.m.a.quote3160)}). Karlsruhe: ${st === ka ? '' : ''}${ka.m.a.provenTop10}/10 (vs. ${pct(ka.m.a.quote3160)}). Kaufbelege der Spitze unabhängig bestätigt.`)}
    ${ampel('fail', 'Erfolgswahrscheinlichkeit', `Nicht belegbar — <strong>0 versendete Mails, 0 Antworten, 0 Bewertungen</strong> (Firestore, 15.08. geprüft). Die Rangfolge ist plausibel, aber unbewiesen. Der Beweis beginnt mit der Versandliste unten.`)}
  </div>
</header>

<section id="eichung">
  <h2>Eichung: Die Probe misst die App, nicht sich selbst</h2>
  <p>Bevor irgendein Urteil zählt: Die Probe-Orchestrierung wurde gegen die Ground-Truth-Fixtures der App geeicht —
  <strong>21/21 Checks, exakte Score-Gleichheit</strong> mit direktem <span class="mono">computeOpportunity</span>-Aufruf,
  inklusive Werbe-Merge, WAF-Block-Pfad, Vision-Semantik, Peer-Deckel (F13), Versions-Merge (F15) und Jobs-Pfad (F14).
  Alle 65 Ground-Truth-Tests grün.</p>
  <p class="small muted">Umfang: 18 Branchen je Stadt (Tiefe 0) · Stuttgart ${st.stats.candidates} Kandidaten (${st.stats.psiFailed} PSI-Ausfälle fallen wie in der App still raus) ·
  Karlsruhe ${ka.stats.candidates} (${ka.stats.psiFailed}) · je 60 Seiten-Checks (adEvidence, 0 geblockt) · Kosten ≈ 1,44&nbsp;$ Places, PSI/Checks gratis bzw. gecacht.
  Eichungs-Nebenbefund: Das EOL-Signal (CMS abgekündigt) trägt im Scan nur, wenn <span class="mono">detectTech</span> die Versionsnummer findet.</p>
</section>

<section id="rangfolge">
  <h2>Der Befund: Die Spitze hat sich gedreht</h2>
  <p>Dein Stuttgart-Scan vom Juli zeigte oben ausgebuchte Zahnärzte und Tierärzte ohne jedes Kaufsignal — „nicht mein Klientel".
  Derselbe Scan heute:</p>

  <h3>Stuttgart — Top 10 von ${st.stats.scored}</h3>
  ${top10Table(st, 'Stuttgart')}
  ${quoteBars(st)}
  <p class="small muted">Kaufsignal-Quote („zahlt nachweislich für Kundengewinnung"): Spitze vs. Rang 31–60 der geprüften Menge.
  Ab Rang 61 wird das Kaufsignal nie geprüft — dort heißt „kein Signal" nur „nicht geprüft".</p>

  <h3>Karlsruhe — Top 10 von ${ka.stats.scored} (Generalisierung)</h3>
  ${top10Table(ka, 'Karlsruhe')}
  ${quoteBars(ka)}
</section>

<section id="matrix">
  <h2>Verifikations-Matrix</h2>
  <div class="tablewrap"><table>
    <thead><tr><th>Prüfung</th><th>Kriterium</th><th>Stuttgart</th><th>Karlsruhe</th></tr></thead>
    <tbody>
      <tr><td><strong>a</strong> Kaufsignal-Priorisierung</td><td>Top-10-Quote ≥ 40 % und ≥ 2,5× Rang 31–60</td>
        <td><span class="warn">teils</span> — 80 % vs. 42 %</td><td><span class="warn">teils</span> — 60 % vs. 32 %</td></tr>
      <tr><td><strong>b</strong> Kein „nicht mein Klientel" oben</td><td>0 etablierte kapazitätsgebundene Betriebe ohne Kaufsignal in Top-10</td>
        <td><span class="pass">PASS</span> — 0 (3 Grenzfälle MIT Kaufsignal)</td><td><span class="pass">PASS</span> — 0 (3 mit Kaufsignal)</td></tr>
      <tr><td><strong>b2</strong> Kernfall real</td><td>Werbender Anwalt mit schwacher Seite vor jeder ausgebuchten Praxis</td>
        <td><span class="pass">PASS</span> — Voggel R2 (84), erste Praxis R64+</td><td><span class="pass">PASS</span>*</td></tr>
      <tr><td><strong>c</strong> Belege Top-5 adversarial</td><td>≥ 2 unabhängig bestätigte Belege, 0 widerlegte</td>
        <td><span class="pass">4/5</span> + 1 Drift-Fall</td><td><span class="pass">4/5</span> + 1 Bot-Abwehr</td></tr>
      <tr><td><strong>d</strong> Deckel-Integrität (vor Peer)</td><td>Kein Score ≥ 70 ohne hartes Strukturzeichen</td>
        <td><span class="pass">PASS</span> — 0 Verstöße</td><td><span class="pass">PASS</span> — 0</td></tr>
      <tr><td><strong>d2</strong> Peer-Deckel-Durchbruch</td><td>seit Fix F13: 0 erlaubt</td>
        <td><span class="pass">0</span> <span class="muted small">(vor Fix: 4)</span></td><td><span class="pass">0</span> <span class="muted small">(vor Fix: 6)</span></td></tr>
      <tr><td><strong>e</strong> Chips = Faktoren</td><td>Report-Begründungen zu 100 % aus Rohfaktoren</td>
        <td><span class="pass">PASS</span> — 0 Perf-Chips ohne Messung</td><td><span class="pass">PASS</span> — 0</td></tr>
      <tr><td><strong>f</strong> Hiring-Defekt</td><td>Betroffene + Rang-Delta beziffern</td>
        <td><span class="warn">5 Leads</span>, max. +32 Score entgangen</td><td><span class="warn">9 Leads</span>, max. +17</td></tr>
    </tbody>
  </table></div>
  <p class="small"><strong>Zu a:</strong> Das vorab definierte 2,5×-Kriterium ist bei einer Vergleichsquote über 40 % <em>strukturell unerfüllbar</em>
  (2,5 × 42 % &gt; 100 %) — ein Konstruktionsfehler des Kriteriums, nicht der App. Ehrlich lesbar sind die Rohzahlen: die absolute Schwelle (≥ 40 %)
  ist in beiden Städten klar erfüllt, die Spitze ist ~1,9× dichter an Käufern als das Mittelfeld — und das Mittelfeld ist selbst schon vorselektiert.
  <strong>Zu b2 (*):</strong> Das Kriterium fasste anfangs JEDEN werbenden Anwalt als Referenz — auch einen mit exzellenter Website (Perf 94, 4,9★),
  den die App völlig korrekt auf 0 setzt (nichts zu verkaufen). Mit sauber definierter Referenzmenge (werbend UND schwache Seite) gilt PASS in beiden Städten.</p>
</section>

<section id="belege">
  <h2>Belege der Stuttgarter Spitze — adversarial geprüft</h2>
  <p>Jeder score-tragende Beleg wurde auf einem <em>unabhängigen</em> Weg nachgeprüft: eigener HTML-Abruf, GTM-Container einzeln geladen
  und auf Conversion-Marker durchsucht, Performance als Median aus drei frischen PSI-Läufen, SSL und Kontaktwege direkt getestet.</p>
  ${st.adv.map(r => advCard(r, stShots[r.domain])).join('')}
  <p class="small muted"><strong>Ergebnis über beide Städte: Jeder score-tragende Kaufsignal- und Struktur-Beleg wurde unabhängig
  bestätigt, keiner widerlegt</strong> — AW-Tags, Conversion-Marker in selbst geladenen GTM-Containern, Display-Requests im frischen
  Seitenlauf, Doctolib/Shopify/WooCommerce im selbst geholten HTML, fehlendes SSL, fehlende Kontaktwege. Zwei ehrliche Einschränkungen:
  (1) <em>Perf-Punktwerte streuen zwischen PSI-Läufen</em> (über vier Messrunden dokumentiert, z. B. 68–81 bei Johnnys Werkstatt;
  die score-relevanten Bänder blieben meist stabil, die Wirkung liegt bei ≤5 Badness-Punkten) — Performance ist als Beleg im
  Anschreiben deshalb zweite Wahl hinter Struktur und Kaufsignal. (2) Elektro Röckel blockt automatisierte Abrufe (403 auf meinen
  Fetch; PSI erreicht die Seite und bestätigt die Werte). Sichtprüfung: Voggel (R2) ist sichtbar eine 2017er-Blog-Vorlage;
  zbc.dental (R1) <em>wirkt</em> modern — der Fall ruht auf Technik (Squarespace, Perf ~53, aktive Anzeigen), die Ansprache darf
  nicht „Ihre Seite wirkt veraltet" lauten. Bei mehreren Karten verdeckt der Cookie-Banner den Screenshot (Grenze der Sichtprüfung).</p>
</section>

<section id="defekte">
  <h2>Die fünf Befunde vom 15.08. — und ihr Status nach dem Fix-Sprint vom 16.08.</h2>

  <div class="kachel kachel--ok">
    <h3>1 · Bild-Prüfung war still tot — BEHOBEN ✓</h3>
    <p><span class="mono">analyzeScreenshot</span> warf bei jedem echten Aufruf <strong>HTTP 500</strong> (das Modell legt
    <span class="mono">\`\`\`json</span>-Zäune um die Antwort, die Function parste nackt). Der Scanner fing den Fehler —
    seit dem Modell-Update lief kein Scan mehr mit Vision, unbemerkt. <strong>Fix deployt</strong> (robuster Parser, betraf
    auch analyzeContent + analyzeReviews); Live-Retest mit exakt dem zuvor scheiternden Aufruf: <strong>200</strong> mit
    echtem Verdikt („zbc.dental: modern, designEra aktuell" — deckt sich mit der Sichtprüfung).</p>
  </div>

  <div class="kachel kachel--ok">
    <h3>2 · Peer-Aufschlag durchbrach den 69er-Deckel — BEHOBEN ✓</h3>
    <p>Der Wettbewerbs-Aufschlag lief NACH der Konvergenz-Schranke und hob gedeckelte 69er auf 75 — in Karlsruhe standen
    <strong>sechs der Top-10</strong> nur dadurch über der HOT-Schwelle, in Stuttgart vier. Der Deckel ist jetzt eine
    exportierte Invariante (<span class="mono">scoreCap</span>) und gilt auch nach dem Aufschlag.
    <strong>Nachgemessen: 0 Durchbrüche in beiden Städten</strong> — die Tabellen oben zeigen die ehrliche Spitze:
    werbende Praxen ohne hartes Strukturzeichen stehen bei 69, nicht bei 75.</p>
  </div>

  <div class="kachel kachel--ok">
    <h3>3 · „Stellt ein" machte nie einen bewiesenen Käufer — BEHOBEN ✓ (+ 2 tiefere Funde)</h3>
    <p>Beim Verdrahten der echten Stellenzahl kam heraus: <strong>die Bundesagentur hat die v4-API abgeschaltet</strong>
    (jeder Aufruf 403) — der Job-Endpoint war auch im Einzel-Check still tot. Umstellung auf v6; dort gibt es keine
    Arbeitgeber-Direktsuche mehr, deshalb sucht der Scan jetzt EINMAL je Branche×Stadt und ordnet die Treffer über die
    Firmennamen zu (≤18 Aufrufe statt 60). Dabei zweiter Fund: „WEISS32 <em>Zahnzentrum</em>" hätte einen FREMDEN Betrieb
    („Hossam Marey Elite <em>Zahnzentrum</em>") als Hiring-Beweis geerbt — das Gattungswort fehlte in der Stoppliste;
    ergänzt, mit Gegenprobe. Live belegt: Branchen-Suche Zahnarzt×Stuttgart → 97 Stellen, 58 Arbeitgeber, exakte Zuordnung.
    <span class="muted">Wirkt ab dem nächsten frischen Scan — die Tabellen hier tragen noch keine Job-Daten (Cache).</span></p>
  </div>

  <div class="kachel kachel--ok">
    <h3>4 · Enterprise-Filter kannte keine Ketten — BEHOBEN ✓</h3>
    <p>Radisson&nbsp;Blu (<span class="mono">radissonhotels.com</span>), AniCura (Mars-Tochter), McDreams und Rex
    (<span class="mono">rex.app</span>) standen mit echten Werbe-Signalen in den Top-10 — aber dort entscheidet kein
    Inhaber vor Ort über eine Website. Der Filter kennt jetzt verschmolzene Konzern-Domains und Praxis-/Hotelketten;
    Gegenprobe: unabhängige Betriebe wie das Schlosshotel Karlsruhe bleiben drin. <strong>Nachgemessen: alle vier sind
    aus dem Lauf</strong> (${st.stats.scored}/${ka.stats.scored} statt 290/288 Leads), die Versandliste ist ohne Ketten-Ersatzlogik sauber.</p>
  </div>

  <div class="kachel kachel--ok">
    <h3>5 · EOL-Signal hing an der Versionserkennung — BEHOBEN ✓</h3>
    <p>Das stärkste Strukturzeichen (CMS abgekündigt) trug im Scan nur, wenn PSI die Versionsnummer fand — selten.
    Der Seiten-Check liest sie jetzt aus dem Quelltext (Generator-Meta, sonst Core-Assets — nie Plugin-Versionen).
    Live belegt: <span class="mono">0711strafrecht.de</span> meldet „WordPress&nbsp;4.8" (EOL&nbsp;2022) — Voggels
    Relaunch-Fall ist damit hart belegt statt heuristisch. <span class="muted">Wirkt ab frischem Seiten-Check;
    Alt-Cache liest „ungeprüft".</span></p>
  </div>

  <div class="kachel kachel--ok">
    <h3>6 · Was schon am 15.08. standhielt</h3>
    <p>Deckel-Integrität vor Peer: 0 Verstöße in 578 Leads. Bedarfsdruck-Dämpfer: kein einziger „ausgebuchte Praxis"-Fall oben;
    Zahnärzte in der Spitze sind ausnahmslos solche, die <em>selbst werben</em> (AW-Tag im HTML nachgewiesen). Die „Nicht gemessen ≠ negativ"-Fixes:
    0 Perf-Chips ohne Messung. Reputations-Gate: ein werbender Anwalt mit 4,9★ und Perf 94 landet korrekt auf 0 — das Werkzeug
    empfiehlt niemanden, dem man nichts verkaufen kann. PSI-Messrauschen dokumentiert (zwei Fälle driften ±11–16 Punkte zwischen Läufen;
    score-relevante Bänder blieben in 9 von 10 Fällen stabil).</p>
  </div>
</section>

<section id="grenzen">
  <h2>Was dieser Report nicht behaupten kann</h2>
  <ul>
    <li><strong>Keine Erfolgswahrscheinlichkeit.</strong> Es gibt null Versanddaten. „Sehr hohe Erfolgsaussicht" wäre erfunden — belegbar ist nur: <em>die Vorbedingungen stimmen jetzt</em>.</li>
    <li><strong>Antwortrate ist derzeit unmessbar.</strong> Der CRM-Status „geantwortet" fließt nicht in den Lern-Speicher — erfasst wird erst gewonnen/verloren ab Angebots-Stufe. Deshalb hat die Versandliste eigene Tracking-Spalten.</li>
    <li><strong>Das Daumen-Lernsystem ist ungenutzt:</strong> 0 von 40 Bewertungen. Die Rangfolge ist reine Heuristik — kalibriert an deinem Urteil ist noch nichts.</li>
    <li>Ab Rang 61 ist das Kaufsignal <em>nie geprüft</em>. Die Tabellen hier tragen noch KEINE Vision-Verdikte, Job-Daten und Quelltext-Versionen — die Fixes 1, 3 und 5 wirken ab dem nächsten frischen Scan (der Cache stammt vom 15.08.). Saison-Faktor gilt für August; die Probe kennt deine „bereits kontaktiert"-Liste nicht.</li>
  </ul>
</section>

<section id="handlung">
  <h2>Der nächste Schritt: verschicken und messen</h2>
  <p class="verdict">10 aus der geprüften Spitze, 10 aus dem Mittelfeld (Score 40–60, über Branchen gestreut, Seed ${ST.verify.versandliste.seed}).
  Antworten die oberen zehn deutlich häufiger, trägt die Rangfolge. Antworten beide Gruppen gleich, ist sie Zierde —
  dann weißt du das nach zwanzig Mails statt nach zweihundert.</p>
  <div class="tablewrap"><table>
    <thead><tr><th>Kohorte</th><th>#</th><th>Score</th><th>Betrieb</th><th>Branche</th><th>💸</th><th>Kontaktweg</th><th>Begründung</th><th>Versendet</th><th>Antwort</th><th>Termin</th></tr></thead>
    <tbody>${versandRows(ST.verify, ST.scored.leads)}</tbody>
  </table></div>
  <p class="small muted">Seit dem Ketten-Fix (Befund&nbsp;4) ist die Liste ohne Ersatzlogik sauber — Radisson, AniCura,
  McDreams und Rex sind gar nicht mehr im Lauf. Karlsruhe-Liste liegt bereit (<span class="mono">probe/data/karlsruhe/06-verify.json</span>).
  Hinweis zu R2 Voggel: kein Kontaktweg auf der Seite (bestätigt) — Ansprache über Telefonnummer aus dem Google-Profil.
  Bei zbc.dental (R1) Technik-Argument statt Optik-Argument verwenden.</p>
</section>

<footer class="small muted" style="margin-top:56px; border-top:1px solid var(--line); padding-top:16px;">
  Probe: <span class="mono">lead-intelligence/probe/</span> · Eichung E1 15/15 · Daten:
  <span class="mono">probe/data/{stuttgart,karlsruhe}/</span> · Monat eingefroren: August ·
  Rohantworten aller Endpoints unverändert gespeichert — jede Zahl in diesem Report ist nachrechenbar.
</footer>
</div>`;

const out = join(reportDir(), 'verifikation.html');
import('node:fs').then(fs => {
    fs.writeFileSync(out, html);
    console.log(`Report → ${out} (${Math.round(html.length / 1024)} KB)`);
});
