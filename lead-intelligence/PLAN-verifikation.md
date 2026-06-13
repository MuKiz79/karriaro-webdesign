# Umsetzungsplan — Lead-Verifikations-Schicht

> Status: **Entwurf, noch nichts gebaut.** Erstellt 2026-06-12.
> Ziel: Aus „die Seite sieht alt aus" wird ein belastbares, nachprüfbares
> Lead-Verdikt — und Falsch-Positive (Bot-Wall, Timeout, Cloudflare-Challenge)
> werden nicht mehr als heiße Leads behandelt.

---

## 0. Problem & Leitidee

Das Tool kennt heute **keinen Evidenz-Begriff**: ein nicht messbares Ergebnis
(403-Challenge, leerer 200er, Timeout) fließt genauso in „veraltet → Lead" ein
wie eine echt veraltete Seite. Grep über `src/` nach
`confidence|blocked|verify|inconclusive` → **0 Treffer**.

**Leitidee:** Jedes Alters-/Zustands-Signal bekommt einen **Evidenz-Zustand**
(`gemessen | blockiert | fehler | veraltet-cache`). Ein „veraltet"-Verdikt
gilt erst als **verifiziert**, wenn **≥2 unabhängige, *gemessene* Quellen**
übereinstimmen (Triangulation). Sonst: `vermutet`, `unklar` oder `widerlegt`.

Das Verdikt ist zunächst eine **eigene Schicht neben dem Score** — es verändert
die Score-Zahl nicht (die Signale stecken da schon drin → kein Doppelzählen),
sondern **gated die Empfehlung** und liefert ein **Badge** + eine neue
**CRM-Stufe „qualifiziert"**.

---

## 1. Neue Module

### 1.1 `src/verification/evidence.js`  *(neu)*
Reine Funktionen, keine DOM-/API-Zugriffe.

- `detectBlocked(psiData)` → `{ blocked: bool, reason: string }`
  Erkennt aus den PSI-Daten, ob die Messung wertlos ist:
  - `lighthouseResult.runtimeError` gesetzt,
  - Haupt-Dokument-Status 4xx/5xx (aus `audits['network-requests']`),
  - bekannte Challenge-Marker (Akamai/Cloudflare/„Just a moment") im
    gerenderten Titel/Screenshot-Text,
  - „200 aber leer" (Dokument < N Bytes / kein `<title>`).
  *Übernimmt die Logik aus dem Schwester-Tool `light-audit.js`
  (`detectBlockedResponse`), angepasst auf das PSI-/Lighthouse-Format.*
- `signalState(value, { blocked, fetched })` → `'gemessen' | 'blockiert' | 'fehler'`
  Mappt einen Roh-Wert + Kontext auf einen Evidenz-Zustand.

### 1.2 `src/verification/lead-verification.js`  *(neu)*
Das Herzstück.

```
verifyOutdated({
  techAge,            // analysis/tech-age.js  → era, severity
  wayback,            // analysis/wayback-freshness.js → yearsSince
  contentFreshness,   // analysis/content-freshness.js
  screenshotAnalysis, // Vision: designQuality, „dated"
  footerYear,         // Copyright-Jahr aus PSI-HTML (neuer Mini-Detektor)
  evidence            // Ergebnis aus evidence.js (blocked?)
}) → {
  verdict: 'verifiziert' | 'vermutet' | 'unklar' | 'widerlegt',
  confidence: 0..1,
  agreeing: [{ source, signal }],   // welche Quellen „alt" sagen (gemessen)
  dissenting: [{ source, signal }], // welche „modern" sagen
  evidenceState: 'gemessen' | 'blockiert' | 'fehler',
  note: string                      // Klartext für UI/E-Mail
}
```

**Algorithmus (erste Fassung):**
1. Wenn `evidence.blocked` → `verdict = 'unklar'`, `confidence = 0`, fertig.
   (Niemals einen blockierten Lead anschreiben.)
2. Sammle nur **gemessene** Alters-Signale. „Alt" sagt:
   - `techAge.era ∈ {outdated, abandoned}` oder `techAge.severity ≥ 3`
   - `wayback.yearsSince ≥ 3`
   - `contentFreshness` „stale"
   - `screenshotAnalysis.designQuality ≤ 4` (Vision sagt „dated")
   - `footerYear ≤ aktuellesJahr − 3`
3. `agree = Anzahl gemessener Signale die „alt" sagen`.
   - `agree ≥ 2` → **verifiziert** (`confidence` steigt mit Anzahl/Stärke)
   - `agree == 1` → **vermutet**
   - `agree == 0` und ≥2 Signale sagen „modern" → **widerlegt**
   - sonst (zu wenig gemessen) → **unklar**
4. `note` baut einen Satz: „Verifiziert veraltet: altes CMS (WP 4.x),
   seit 4 Jahren unverändert, Vision: ‚dated'. (3/3 Quellen)".

`verifyReachable(...)` wird hier als **Schnittstellen-Stub** angelegt
(MX/SPF/DKIM/DMARC + Impressum-Mail), aber erst in Phase 2 (A3) gefüllt.

---

## 2. Mini-Detektor (klein, in vorhandenem Modul)

### 2.1 Footer-Copyright-Jahr
In `src/signals/website-score.js` (oder `analysis/content-freshness.js`):
`extractFooterYear(psiData)` zieht das größte 4-stellige Jahr aus dem
gerenderten HTML/Final-Screenshot-Text. Vierte unabhängige Alters-Quelle,
kostenlos (keine neue API).

---

## 3. Einhängen (Wiring)

### 3.1 `src/orchestration/single-check.js`
- Nach `runLocalAnalysis(...)` (≈ Z. 182): `evidence = detectBlocked(psiData)`
  und `verification = verifyOutdated({ ... aus localAnalysis + screenshotAnalysis })`.
- `verification` in `state.lastResult` ablegen (Z. 204 ff.).
- In `renderResult` / `generateExplanation` (Z. 335 ff.):
  - `verdict === 'unklar'` → Kopf **„Befund unsicher — Seite evtl. nicht
    messbar (Bot-Schutz/Timeout). Nicht anschreiben, manuell prüfen."**
    statt „Diesen Lead kontaktieren".
  - `verdict === 'verifiziert'` → Badge **„✓ Verifiziert veraltet (n Quellen)"**
    über der Empfehlung; `note` als Aufhänger in die E-Mail-Argumente.
  - `verdict === 'widerlegt'` → wie schwacher Lead behandeln.

### 3.2 `src/orchestration/scanner.js`
- Nach `scoreLead(...)` pro Lead (≈ Z. 100 ff.): leichtgewichtige Variante
  von `verifyOutdated` (ohne Vision/Wayback, nur PSI-Light + tech-age +
  footerYear) anhängen als `lead.verification`.
- Blockierte/`unklar`-Leads **nicht als heiß listen** — eigener Filter/Badge
  in der Ergebnisliste; Sortierung nutzt `confidence` als Tie-Breaker.

### 3.3 Scoring (bewusst minimal in v1)
`scoreLead` / `composite-score.js` bleiben **unverändert**. Verifikation ist
v1 ein Gate auf die *Empfehlung*, nicht auf die *Zahl* (vermeidet
Doppelzählung). Phase 2: `confidence` als Faktor in den Erwartungswert (EV).

---

## 4. CRM-Stufe „qualifiziert"

- `src/ui/render-crm.js`:
  `STATUSES` → `['alle','neu','qualifiziert','kontaktiert','interessiert','angebot','kunde','verloren']`,
  dazu `STATUS_LABELS.qualifiziert = 'Qualifiziert'`,
  `STATUS_COLORS.qualifiziert = 'var(--accent)'`.
- `src/crm/leads.js`: beim Speichern `verification`-Verdikt mit ablegen
  (Feld `verifyVerdict`, `verifyConfidence`); CSV-Export (Z. 176) um Spalten
  „Verdikt"/„Konfidenz" erweitern.
- `src/crm/stats.js`: Pipeline-Filter (Z. 52) um `'qualifiziert'` ergänzen.
- **Regel:** Nur Leads ab `qualifiziert` werden für Outreach exportiert.
  Verifizierte Leads können per Klick `neu → qualifiziert` wandern; das
  speist später `learning/score-feedback.js`.

---

## 5. Tests (Vitest)

- `tests/verification/evidence.test.js`
  - blockiert: PSI mit `runtimeError` → `blocked:true`
  - 403-Haupt-Dokument → `blocked:true`
  - sauberes PSI → `blocked:false`
- `tests/verification/lead-verification.test.js`
  - 3 gemessene „alt"-Signale → `verifiziert`, confidence hoch
  - 1 Signal → `vermutet`
  - blockiert → `unklar`, confidence 0
  - 2 „modern"-Signale, 0 „alt" → `widerlegt`
  - Mix gemessen/fehler → korrekte Zählung (nur gemessene zählen)
- Fixtures aus echten PSI-Antworten (eine blockierte Domain, eine alte,
  eine moderne) unter `tests/verification/fixtures/`.

---

## 6. Reihenfolge / Phasen

| Phase | Inhalt | Aufwand |
|---|---|---|
| **P1** | `evidence.js` + `detectBlocked` + Footer-Jahr + Tests | klein |
| **P2** | `lead-verification.js` + Tests (reine Logik, kein UI) | mittel |
| **P3** | Wiring single-check + scanner (Badge/Gate) | mittel |
| **P4** | CRM-Stufe „qualifiziert" + Export-Spalten + stats | klein |
| **P5** | (später) Erreichbarkeit `verifyReachable` (A3) | mittel |
| **P6** | (später) `confidence` in EV/Score falten | klein |

P1–P4 = die verifizierbare Erst-Lieferung. P5/P6 separat.

---

## 7. Risiken & Entscheidungen

- **PSI sieht die Seite anders als der Browser.** Google-PSI fetcht
  serverseitig; eine Bot-Wall, die PSI blockt, liefert `runtimeError` oder
  eine Challenge-Screenshot — gut erkennbar. Aber: manche Walls lassen
  Googlebot durch und blocken nur uns. → `detectBlocked` ist heuristisch;
  im Zweifel `unklar` statt `verifiziert` (konservativ = vertrauenswahrend).
- **Wayback ist langsam** (in single-check.js heute bewusst `null`). →
  In v1 Wayback nur im Einzel-Check optional/asynchron; der Scanner
  trianguliert ohne Wayback (tech-age + footerYear + PSI reichen für 2 Quellen).
- **Kein Doppelzählen.** Verifikation gated v1 nur die Empfehlung, nicht die
  Score-Zahl — bewusst, bis P6.
- **Rückwärtskompatibel.** Bestehende CRM-Leads ohne `verifyVerdict` rendern
  als „—/nicht geprüft" (kein Crash, kein Re-Scan-Zwang).

---

## 8. Definition of Done (P1–P4)

- [ ] Blockierte/leere PSI-Ergebnisse erzeugen `unklar`, nie „heißer Lead".
- [ ] „Verifiziert veraltet"-Badge erscheint nur bei ≥2 gemessenen Quellen.
- [ ] Scanner-Liste trennt verifizierte von unklaren Leads sichtbar.
- [ ] CRM hat Stufe „qualifiziert"; nur ab da Outreach-Export.
- [ ] `npm run test` grün inkl. neuer Verifikations-Tests.
- [ ] Keine Änderung an der numerischen Score-Berechnung (v1).
