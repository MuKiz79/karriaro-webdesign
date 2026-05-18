#!/usr/bin/env bash
# Sprint 19 — Headless-Chrome-Screenshots der 7 Portfolio-Sub-Page-Heros
# Ersetzt die GPT-generierten Persona-Karten in src/images/*-mockup.jpg

set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SRC_DIR="$REPO_ROOT/src"
OUT_DIR="$SRC_DIR/images"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
PORT=8765

if [ ! -x "$CHROME" ]; then
  echo "FEHLER: Google Chrome nicht gefunden unter $CHROME"
  exit 1
fi

# Port-Konflikt prüfen, weiter suchen falls belegt
while lsof -nP -iTCP:$PORT -sTCP:LISTEN >/dev/null 2>&1; do
  PORT=$((PORT + 1))
  if [ "$PORT" -gt 8780 ]; then
    echo "FEHLER: kein freier Port 8765-8780"; exit 1
  fi
done
echo "Server-Port: $PORT"

# HTTP-Server starten
(cd "$SRC_DIR" && python3 -m http.server $PORT >/dev/null 2>&1) &
SERVER_PID=$!
trap "kill $SERVER_PID 2>/dev/null || true" EXIT
sleep 1

# Format: page-slug|mockup-output-jpg
PAGES=(
  "immobilien-makler|immobilien-stadtmakler-mockup.jpg"
  "friseur-salon|friseur-mueller-mockup.jpg"
  "dachdecker-meisterbetrieb|dachdecker-meister-mockup.jpg"
  "praxis-weber|praxis-weber-mockup.jpg"
  "restaurant-template|gastro-hirsch-mockup.jpg"
  "meisterbetrieb-mueller|handwerk-mueller-mockup.jpg"
  "spedition-schwaben|logistik-schwaben-mockup.jpg"
  "coaching-lehmann|coaching-lehmann-mockup.jpg"
)

for spec in "${PAGES[@]}"; do
  page="${spec%|*}"
  out="${spec#*|}"
  TMP=$(mktemp -d)
  # Sprint 120 — Mobile-Portfolio-Pages (/m/portfolio/) statt Desktop (/portfolio/)
  URL="http://localhost:$PORT/m/portfolio/$page.html"
  echo "[start] $page → $out"

  # Sprint 120 — iPhone-Mockup-im-Phone: 393×600 logical @ 2x retina (786×1200 PNG)
  # Page rendert MOBILE-Breakpoint (viewport 393px) → echte Mobile-Hero-Darstellung
  # mit nativer Headline-Größe. Im Card displayed bei ~350×534 → near-1×-Scale.
  "$CHROME" --headless --disable-gpu --hide-scrollbars \
    --virtual-time-budget=5000 \
    --window-size=393,600 \
    --force-device-scale-factor=2 \
    --screenshot="$TMP/s.png" \
    "$URL" 2>/dev/null

  if [ ! -f "$TMP/s.png" ]; then
    echo "[fail] $page — Screenshot nicht erstellt"
    rm -rf "$TMP"
    continue
  fi

  sips -s format jpeg -s formatOptions 95 "$TMP/s.png" --out "$OUT_DIR/$out" >/dev/null 2>&1

  # Defensive Höhen-Sicherung — falls Chrome viewport-clip ignoriert
  # (Versionsabhängig). Auf macOS Darwin 25.4+ ist sips -c upper-left-anchored.
  H=$(sips -g pixelHeight "$OUT_DIR/$out" 2>/dev/null | tail -1 | awk '{print $2}')
  if [ -n "$H" ] && [ "$H" -gt 1200 ]; then
    echo "[crop] $page — Chrome capture H=$H > 1200, sips-Fallback aktiv"
    sips -c 1200 786 "$OUT_DIR/$out" --out "$OUT_DIR/$out" >/dev/null 2>&1
  fi

  size=$(stat -f %z "$OUT_DIR/$out" 2>/dev/null || stat -c %s "$OUT_DIR/$out")
  echo "[done] $page → $out ($size bytes)"
  rm -rf "$TMP"
done

echo "FERTIG."
