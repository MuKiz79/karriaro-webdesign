# Motion-System — „Phyllotaxis in Motion"

> **Status:** v1, 2026-06-12. Kinetische Übersetzung der Leitidee
> [„Aus einem Kern wächst alles"](LEITIDEE.md).
> **Verbindlich:** Neue Animationen MÜSSEN die Tokens aus `src/css/tokens.css`
> nutzen (setzt die seit Sprint 144 dokumentierte Easing-Vereinheitlichung fort).
> Migration bestehender Hardcodes: **inkrementell** (siehe §Migration).

## Das Prinzip (ein Satz)

> **Alles entsteht aus einem Punkt und entfaltet sich nach *einer* Regel — nie
> gleitet etwas generisch herein.**

Das ist die Signatur, die ein Juror in fünf Sekunden wiedererkennt. Sie macht aus
„einer Sammlung schöner Effekte" (Splash-FLIP, Hero-Bloom, Goldfaden) **eine
lesbare Sprache**.

## Die fünf Regeln

### 1 — Ein Ursprungs-Prinzip: Keimen, nicht Gleiten
Jedes Element tritt ein, indem es **aus einem Punkt keimt**:
`transform-origin: var(--origin-seed)` + `scale(var(--grow-from))` + `opacity:0`
→ auf `scale(1)`/`opacity:1`. **Nie** `translateX` von außerhalb des Viewports.
Das ist die sichtbare Handschrift.

### 2 — Eine Easing-Familie (genau zwei Kurven)
| Token | Wert | Rolle |
|---|---|---|
| `--ease-grow` | `cubic-bezier(.34,1.56,.64,1)` | **Keimung** — organischer Overshoot (= Splash-Saat) |
| `--ease-settle` | `cubic-bezier(.22,1,.36,1)` | **Beruhigung** — ruhiges Ankommen (= FLIP / opsz-Atem) |

Mehr braucht das System nicht. Alles, was *erscheint*, nutzt `--ease-grow`; alles,
was sich *beruhigt/zählt/übergibt*, nutzt `--ease-settle`.

### 3 — Eine Zeitskala = Fibonacci
`--t-1:90ms · --t-2:150ms · --t-3:240ms · --t-4:390ms · --t-5:630ms`
(Fibonacci-nah). Selbst das **Timing** wird Phyllotaxis — dieselbe Zahlenfamilie
wie die 110 Punkte + Fibonacci-Gold-Indizes des Siegels.

### 4 — Eine Choreografie-Regel: Phyllotaxis-Staffelung
Mehrfach-Reveals (Karten-Grids, Listen, Folios) staffeln in **Phyllotaxis-
Reihenfolge**, nicht in uniformer 50-ms-Kaskade. Quelle ist der `--si`-Index, den
die Splash-Blüte bereits pro Punkt berechnet (`((n-1)/(N-1))`, siehe
`scripts/build-splash.mjs`):
```css
.item { animation-delay: calc(var(--t-2) + var(--si) * var(--t-4)); }
```
Eine Grid „blüht" damit in derselben Spiral-Ordnung auf wie das Logo.

### 5 — Eine Signatur-Übergabe: der FLIP-Morph
Der Splash→Nav-Morph (Shared-Element fliegt, Ebene löst sich auf) ist die Krone —
aber als Einzelfall liest er sich nicht als Sprache. **Mindestens ein zweiter**
Einsatz desselben Musters an einer Schlüsselstelle (Kandidat: Tool-Karte → ihr
Ergebnis), damit FLIP zum **Sprach-Feature** wird, nicht zum One-Off.

## Das Motion-Budget (ebenso wichtig wie die Effekte)

Zurückhaltung ist Teil des Systems und passt zur Leise-Premium-DNA. Bewegung ist

**erlaubt** bei:
- Eintritten (Keimung, einmalig pro Element/Viewport)
- **einer** Signatur-Übergabe (FLIP)
- den Beweis-Count-ups (`--ease-settle`)

**verboten**:
- Hover-Zittern / magnetische Maus-Verfolgung als Dauereffekt
- Parallax-Rauschen
- Dekor-Loops ohne Bedeutung

Ein dokumentiertes Budget ist selbst preiswürdiges Craft — und ein
Award-Exponat (siehe §Exponat).

## reduced-motion

`@media (prefers-reduced-motion: reduce)` (bereits in `index.html` + mehreren
CSS-Dateien aktiv): Keimung → sofort im Endzustand sichtbar (kein Scale/Fade),
FLIP → sauberes Fade, Count-ups → Endwert. **Endzustand nie nur über
`animation-fill-mode` halten** (Splash-Lehre: Glyph wurde sonst geclippt).

## Migration (Ist-Stand → System)

Inventar 2026-06-12 (`grep cubic-bezier src/index.html src/css`):
- `cubic-bezier(0.16,1,0.3,1)` × 13 → war „ease-out"; künftig **`--ease-grow`**
  wo es ein *Eintritt* ist, sonst `--ease-settle`.
- `cubic-bezier(0.22,1,0.36,1)` × 14 → **`--ease-settle`** (schon der Zielwert).
- `cubic-bezier(.34,1.56,.64,1)` × 3 (Splash) → **`--ease-grow`** (schon Zielwert).
- ~8 weitere Einzel-Beziers (Drift) → auf die zwei Kurven zusammenführen.

Regel: **kein neuer Hardcode**; bei jeder Berührung einer Animation auf Token
umstellen. Kein Big-Bang-Refactor (Risiko fürs Live-Verhalten).

## Exponat (für die Award-Einreichung)

Die Token-Definition selbst ist ein Ausstellungsstück: „zwei Kurven, fünf Zeiten,
ein Ursprung, eine Regel" beweist *System* statt Zufall. Für das Einreich-Paket:
ein 1-Seiten-Auszug dieser Datei + ein kurzer Loop, der dieselbe Keimung auf
Logo / Headline / Grid / Übergabe zeigt — vier Orte, eine Bewegung.

## Anwendung & erster Konsument

Observer-getriebene Reveals nutzen den **`.kr-grow`-Modifier** auf bestehenden
`[data-kr-reveal]`-Elementen (transition-basiert, derselbe IntersectionObserver,
der `.is-revealed` schaltet) — kein neuer JS-Pfad:

```html
<li class="… kr-grow" data-kr-reveal style="--si:0.5">…</li>
```
```css
[data-kr-reveal].kr-grow {
  transform: scale(var(--grow-from));
  transform-origin: var(--origin-seed);
  transition: opacity var(--t-5) var(--ease-grow), transform var(--t-5) var(--ease-grow);
  transition-delay: calc(var(--si, 0) * var(--t-4));   /* Phyllotaxis-Staffelung */
}
[data-kr-reveal].kr-grow.is-revealed { transform: scale(1); }
```

**Erster Live-Konsument (2026-06-12):** Sektion „Wie eine Karriaro-Manufaktur
entsteht" (№ 07 · Werkstatt-Logbuch, `index.html`) — die 5 Akte gleiten nicht
mehr (`translateY`), sondern **keimen** aus ihrem Saatpunkt, gestaffelt per `--si`
(0 / .25 / .5 / .75 / 1; `--grow-from:.9` am `<ol>` = premium-sanft). Damit ist
die Werde-Geschichte der Manufaktur selbst die erste sichtbare Einlösung der
Leitidee. Verifiziert (11/11): Keim-scale + `--ease-grow` + Staffelung 0→0.39s +
reduced-motion sofort sichtbar; Smoke 86/0.

> Pro „kein toter Code"-Regel (vgl. tokens.css R.27): die `@keyframes`-Form aus
> Regel 1 wird erst eingeführt, wenn ein **Nicht**-Observer-Konsument sie braucht.

## Token-Referenz

Alle Werte leben in `src/css/tokens.css` (global eingebunden). Siehe dort den
Block „Phyllotaxis-Motion-System".
