# Setup-Checkliste Outbound-Infrastruktur — Karriaro-Webdesign

**Zeitrahmen:** Tag 0-1 Aufbau (~4 h) · Tag 2-14 Warm-up läuft passiv · Tag 15 Live-Versand-Ready.

**Tag-1-Kosten einmalig:** ~80-95 € (3 Domains à 8-12 € · Smartlead Setup-Fee 0 · Workspace ab Tag 30 abgerechnet).
**Laufende Monatskosten (ab Monat 2):** ~75 € (3 Domains anteilig 3 · 6 Workspace-Inboxen 36 · Smartlead 36).

---

## Schritt 1 — Domain-Auswahl & Registrierung (45 Min)

### Domain-Strategie

**Hauptdomain `karriaro.de` NIEMALS für Cold-Mail benutzen** — Reputationsschutz hat Priorität über Branding.

**3 Sekundär-Domains, Naming-Logik „semantisch verwandt, aber separat":**

| Vorschlag | Argument | Backup-Vorschlag |
|---|---|---|
| `karriaro-mail.de` | Direkter Bezug zum Versand-Zweck | `karriaro-studio.de` |
| `karriaro-werk.de` | „Werk/Werkstatt"-Framing zur Manufaktur-Story | `karriaro-atelier.de` |
| `hello-karriaro.de` | Anglo-freundlich, leicht zu lesen | `team-karriaro.de` |

**Vor Kauf prüfen:**
```bash
whois karriaro-mail.de | grep -i "status\|registrar"
whois karriaro-werk.de | grep -i "status\|registrar"
whois hello-karriaro.de | grep -i "status\|registrar"
```

Oder direkt im Browser: united-domains.de / strato.de / netcup.de.

### Registrar-Empfehlung

**Cloudflare Registrar** (5-9 €/Domain/Jahr, keine Margen, DNS direkt integriert) — falls schon Cloudflare-Konto vorhanden. Sonst:
**United Domains** (DACH, deutscher Support) für `.de` ~10 €/Jahr.

**Nicht:** GoDaddy (hohe Renewal-Preise + DNS-Setup umständlich), Strato (langsame DNS-Propagation).

### Aktion

1. Bei Cloudflare oder United-Domains alle 3 Domains kaufen (~25-30 € einmalig).
2. WHOIS-Privacy aktivieren (in DE über DENIC nicht erlaubt — stattdessen Geschäftsadresse Karriaro nutzen).
3. Auto-Renewal aktivieren.

---

## Schritt 2 — DNS-Records einrichten (60 Min, pro Domain ~20 Min)

**Pro Domain identisch — nur Domain-Namen tauschen.**

### 2a — MX-Records (Google Workspace Mail-Empfang)

```
Type    Name    Value                       Priority    TTL
MX      @       smtp.google.com             1           3600
```

(Google nutzt seit 2024 vereinfachtes Setup mit 1 MX-Eintrag statt 5.)

### 2b — SPF (Sender Policy Framework)

```
Type    Name    Value                                              TTL
TXT     @       v=spf1 include:_spf.google.com -all                3600
```

`-all` (Hard-Fail) statt `~all` (Soft-Fail) — Spam-Filter werten das positiv.

### 2c — DKIM (Domain Keys Identified Mail)

DKIM-Key wird im Google Workspace generiert. Schritt-für-Schritt:

1. Workspace-Admin-Konsole → Apps → Google Workspace → Gmail → DKIM einrichten.
2. „Neuen Datensatz generieren" → 2048 Bit.
3. Google liefert einen TXT-Record im Format:
   ```
   Type    Name                          Value
   TXT     google._domainkey             v=DKIM1; k=rsa; p=MIIBIjANBgkqh…
   ```
4. Diesen TXT-Record im Cloudflare-DNS deiner Domain anlegen.
5. Nach 24 h zurück in Workspace-Admin → „Authentifizierung starten".

### 2d — DMARC (Domain-based Message Authentication)

```
Type    Name    Value                                                                   TTL
TXT     _dmarc  v=DMARC1; p=quarantine; rua=mailto:dmarc@karriaro.de; pct=100; adkim=s; aspf=s  3600
```

**Werte:**
- `p=quarantine` (Mails ohne SPF/DKIM-Pass landen im Spam, werden aber nicht hart abgelehnt — Sicherheitsnetz für die ersten Warm-up-Tage).
- `rua=mailto:dmarc@karriaro.de` — Reports laufen auf Hauptdomain auf (du legst einen Forward an, mehr nicht).
- Nach 30 Tagen sauberer Performance auf `p=reject` upgraden.

### 2e — Verifikation pro Domain

Nach Setup pro Domain testen:
```bash
dig +short TXT karriaro-mail.de | grep spf
dig +short TXT google._domainkey.karriaro-mail.de
dig +short TXT _dmarc.karriaro-mail.de
```

Alle drei müssen Werte zurückgeben. Wenn nicht: 1-4 h DNS-Propagation abwarten.

**Online-Check:** mxtoolbox.com/SuperTool.aspx → SPF, DKIM, DMARC Lookups pro Domain. Alle Tests müssen grün sein.

---

## Schritt 3 — Google Workspace 6 Inboxen aufsetzen (45 Min)

### 3a — Workspace-Account anlegen

1. workspace.google.com → „Loslegen".
2. **Plan:** Business Starter 6 €/Nutzer/Mt (reicht — keine Drive/Meet-Features nötig für Cold-Mail).
3. Erste Domain hinzufügen (karriaro-mail.de). Workspace will Eigentumsverifikation per TXT-Record — Cloudflare-DNS-Eintrag setzen.
4. Erste 2 Inboxen anlegen:
   - `muammer@karriaro-mail.de`
   - `webdesign@karriaro-mail.de`

### 3b — Weitere Domains hinzufügen

Workspace → Domains → „Sekundäre Domain hinzufügen":
- `karriaro-werk.de` → Inboxen `muammer@karriaro-werk.de`, `webdesign@karriaro-werk.de`
- `hello-karriaro.de` → Inboxen `muammer@hello-karriaro.de`, `webdesign@hello-karriaro.de`

**Wichtig:** Pro Domain genau 2 Inboxen (à 30 Mails/Tag = 180 Mails/Tag Cap). Mehr ist nicht sinnvoll, weil 1 Domain mit 4+ Inboxen schneller in Spam-Filter fällt.

### 3c — Inbox-Setup pro Konto

Pro neuer Inbox (10 Min jeweils):
1. Anmelden, Profilbild hochladen (gleiches LinkedIn-Foto Muammer für Konsistenz).
2. **Mail-Signatur** einrichten (im Gmail-Setting):
   ```
   Muammer Kizilaslan
   Karriaro-Webdesign · Webdesign-Manufaktur für DACH-KMU
   karriaro-webdesign.de · muammer@karriaro-mail.de

   Karriaro UG · Schiltach · USt-ID: DE…
   Abmelden: {{unsubscribe}}
   ```
   (Smartlead injiziert `{{unsubscribe}}` automatisch.)
3. **IMAP/SMTP aktivieren:** Gmail-Settings → Weiterleitungs- und POP/IMAP → IMAP aktivieren.
4. **App-Passwort generieren:** Google-Konto → Sicherheit → 2FA aktivieren → App-Passwort für „Smartlead" generieren (16 Zeichen, kopieren).

### 3d — Inbox-Reputation-Vorbereitung (kritisch!)

Vor dem Smartlead-Anschluss pro Inbox manuell 5-10 echte Mails verschicken (an dich selbst, an Hauptdomain, an Freunde, an Bestandskontakte). Google bewertet komplett neue Inboxen mit 0-Mail-History als verdächtig.

Beispiel-Mails:
- „Test-Mail Setup" an dich selbst von jeder neuen Inbox
- 2-3 echte Mails an LinkedIn-Kontakte mit normalem Inhalt
- 1 Abo-Anmeldung bei einem Newsletter (zeigt Google, dass Inbox „benutzt" wird)

Diese organische Aufwärmphase dauert 3-5 Tage parallel zum Smartlead-Warm-up.

---

## Schritt 4 — Smartlead.ai Setup (30 Min)

### 4a — Konto erstellen

1. smartlead.ai → 14 Tage Free Trial (keine Karte nötig für Trial).
2. Plan: **Basic 39 $/Mt** (10 verbundene Mailboxen, 30k Leads, AI-Warm-up inklusive).
3. Workspace-Name: „Karriaro-Outbound".

### 4b — 6 Inboxen verbinden

Pro Inbox in Smartlead:
1. „Add Email Account" → Google.
2. OAuth: anmelden mit jeweiliger Inbox + App-Passwort von Schritt 3c.
3. **Versand-Limits einstellen pro Inbox:**
   - Mails/Tag: 30 (NIEMALS höher in den ersten 60 Tagen)
   - Delay between sends: 90-180 Sekunden (random)
   - Wait between emails: 8 Min (zwischen jedem einzelnen Send)
4. **Warm-up aktivieren:**
   - Daily Warmup Emails: Start 5, Increment 5, Max 30
   - Reply-Rate Ziel: 40 %
   - Sent vs received ratio: 1:1
   - Warm-up tags: business
5. „Save" — Warm-up startet sofort. 14 Tage NICHT für Cold-Mail nutzen.

### 4c — Domain-Authentifizierung in Smartlead

Smartlead → Settings → Domain Authentication → für jede der 3 Domains die DKIM/SPF/DMARC-Verifikation klicken. Alle 9 Records müssen grün sein, bevor Live-Versand erlaubt ist.

### 4d — Click-Tracking-Subdomain (wichtig für Spam-Score)

Statt Smartlead-Default-Tracking-Domain `track.smartlead.ai` eigene Custom-Tracking-Subdomain einrichten:

1. Cloudflare-DNS pro Domain neuen CNAME-Record:
   ```
   Type    Name    Value                       TTL
   CNAME   track   track.smartlead.ai          3600
   ```
2. Smartlead → Custom-Tracking-Domain → `track.karriaro-mail.de` (etc.) hinzufügen.

Das senkt Spam-Score erheblich, weil Empfänger-Mail-Server sehen, dass der Tracking-Link von deiner Domain kommt, nicht von einem generischen 3rd-Party-Tool.

---

## Schritt 5 — Warm-up-Monitoring (Tag 2-14, je 10 Min/Tag)

### Daily-Checks (Smartlead-Dashboard)

Jeden Morgen 10 Min:

| Metrik pro Inbox | Grün | Gelb | Rot |
|---|---|---|---|
| Daily Warmup Mails sent | wie geplant (Tag 1=5, Tag 2=10, …, Tag 6+=30) | -2 von Soll | -5+ von Soll |
| Warm-up Reply-Rate | >40 % | 25-40 % | <25 % → Pause |
| Inbox-Placement | 95 %+ Inbox | 80-95 % | <80 % → Pause |
| Spam-Folder-Rate | <5 % | 5-15 % | >15 % → Pause |

**Wenn Rot pro Inbox:** 7 Tage komplett pausieren, dann mit Tag-1-Volumen (5 Mails) neu starten.

### Wöchentliche Checks (Mo + Do)

1. **mxtoolbox.com Blacklist-Check** — alle 3 Domains gegen 100+ Blacklists prüfen. Keine Einträge erlaubt.
2. **mail-tester.com Test** — von jeder Inbox eine Mail an die mail-tester.com-Adresse senden. Score muss 9/10 oder 10/10 sein. Wenn 8/10 oder weniger: Mail-Header / Body-HTML / Footer prüfen.
3. **Google Postmaster Tools** (postmaster.google.com) — pro Domain einrichten. Liefert nach 1-2 Wochen IP-Reputation und Spam-Rate-Daten direkt von Google.

---

## Schritt 6 — Pre-Live-Verifikation (Tag 14)

**Checklist vor erstem Live-Versand (alle Punkte müssen ✓ sein):**

- ☐ 3 Domains aktiv, alle DNS-Records grün (SPF, DKIM, DMARC, MX)
- ☐ 6 Inboxen Workspace eingerichtet, Profilbilder, Signaturen
- ☐ 6 Inboxen 14 Tage Warm-up durchlaufen, alle bei 30/Tag und 40%+ Warm-Reply-Rate
- ☐ 3 Custom-Tracking-Subdomains (`track.karriaro-mail.de` etc.) in Smartlead verifiziert
- ☐ DMARC steht noch auf `p=quarantine` (NICHT auf `reject` vor Tag 30)
- ☐ Mail-tester.com-Score 9-10/10 pro Inbox
- ☐ Google Postmaster Tools Reputation „High" oder „Medium" pro Domain
- ☐ Impressum & Datenschutzerklärung auf karriaro-webdesign.de aktuell (Footer-Link in jeder Mail)
- ☐ Abmelde-Endpoint auf karriaro-webdesign.de/unsubscribe?id=… funktional
- ☐ Erste ICP-Lead-Liste (50 Stuttgart-Dachdecker) aus Lead-Intelligence v2 gezogen, Apollo-verifiziert
- ☐ Erste 50 Mockups + Deep-Research-Snippets generiert und in Smartlead als CSV-Import vorbereitet

---

## Schritt 7 — Soft-Launch Tag 15 (erste echte Sendung)

**NICHT mit 180 Mails am Tag 15 starten** — eskaliert wird über 7 Tage:

| Tag | Mails/Inbox | Total/Tag | Modus |
|---|---|---|---|
| 15 | 5 | 30 | Soft-Launch, alle 6 Inboxen aktiv |
| 16 | 10 | 60 | |
| 17 | 15 | 90 | |
| 18 | 20 | 120 | |
| 19 | 25 | 150 | |
| 20 | 30 | 180 | Voll-Volumen erreicht |
| 21+ | 30 | 180 | Steady-State |

**Wenn an Tag 15-20 die Bounce-Rate >5 % oder Spam-Reports >0,3 % steigen:** sofort pausieren, 48 h warten, Mail-Body prüfen (HTML-Code, Links, Bilder), neu starten bei Tag-15-Volumen.

---

## Optional — Backup-Warm-up-Booster (Lemwarm)

**Wenn nach Tag 14 eine Inbox nicht über 80% Inbox-Placement kommt:**
- Lemwarm 29 €/Mt zusätzlich auf die betroffene Inbox ankoppeln (parallel zu Smartlead-Warm-up).
- Lemwarm-Pool ist breiter und liefert manchmal die letzten 5-10% Inbox-Rate.

Nur einsetzen, wenn nötig — sonst Geldverschwendung.

---

## Tag-1-Aktions-Reihenfolge (~4 Stunden zusammenhängend)

1. **Min 0-45:** Whois-Checks + 3 Domains kaufen (Cloudflare/UD).
2. **Min 45-105:** DNS-Records (MX, SPF, DMARC) für alle 3 Domains setzen. DKIM kommt später (braucht Workspace).
3. **Min 105-150:** Google Workspace Konto anlegen, erste Domain verifizieren, 2 Inboxen anlegen, DKIM generieren + im DNS eintragen.
4. **Min 150-180:** Weitere 2 Domains in Workspace hinzufügen, 4 weitere Inboxen anlegen, alle DKIM-Records eintragen.
5. **Min 180-210:** Pro Inbox Signatur, Profilbild, App-Passwort. 5-10 manuelle Test-Mails versenden.
6. **Min 210-240:** Smartlead-Konto anlegen, 6 Inboxen verbinden, Warm-up-Config setzen, Custom-Tracking-Subdomains in DNS + Smartlead anlegen.

**Ende Tag 1:** Warm-up läuft. Du tust 2 Wochen lang nichts außer 10 Min/Tag Dashboard-Check.

**Parallel in der Warm-up-Zeit:**
- Tag 2-3: 4-Mail-Cold-Sequenz finalisieren (kommt als nächster Output)
- Tag 4-5: LinkedIn-Profil live (Banner, About, Featured)
- Tag 5-7: Erste LinkedIn-Posts schedulen
- Tag 7-10: ICP-Lead-Liste Stuttgart-Dachdecker im Lead-Intelligence-Tool ziehen, 50 Mockups generieren, in CSV exportieren
- Tag 11-13: ICP-Liste + Mockups in Smartlead-Campaign vorbereiten
- Tag 14: Pre-Live-Verifikations-Checkliste durchgehen

**Tag 15: Erste echte Cold-Mail geht raus.**

---

## Was du JETZT brauchst (Tag 1 Vorbereitung)

- ☐ Cloudflare-Account (sonst United-Domains)
- ☐ Kreditkarte für Workspace + Smartlead-Trial
- ☐ Geschäftsadresse Karriaro (für WHOIS und Impressum)
- ☐ Karriaro-USt-ID (für Mail-Signatur und DSGVO-Footer)
- ☐ Standard-Profilbild (gleiches LinkedIn-Foto Muammer für alle 6 Inboxen)

Wenn alles bereitliegt: ein zusammenhängender 4-h-Block heute Abend oder am Wochenende — dann läuft die Maschine.
