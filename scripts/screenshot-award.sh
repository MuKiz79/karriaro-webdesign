#!/usr/bin/env bash
# Sprint 45 — Award-Quality-Screenshots für Submission (German Design Award + CSS Design Awards + Awwwards HM)
#
# Produziert Headless-Chrome-Screenshots der Hauptseite + 7 Sub-Pages in zwei Auflösungen:
# - Desktop: 2880×1800 (Retina, Award-Submission-Format)
# - Mobile: 750×1624 (iPhone-Portrait)
#
# Output: marketing/award-screenshots/{desktop,mobile}/*.png

set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SRC_DIR="$REPO_ROOT/src"
OUT_DIR="$REPO_ROOT/marketing/award-screenshots"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
PORT=8780

mkdir -p "$OUT_DIR/desktop" "$OUT_DIR/mobile"

if [ ! -x "$CHROME" ]; then
  echo "FEHLER: Google Chrome nicht gefunden unter $CHROME"
  exit 1
fi

# Port-Konflikt prüfen
while lsof -nP -iTCP:$PORT -sTCP:LISTEN >/dev/null 2>&1; do
  PORT=$((PORT + 1))
  if [ "$PORT" -gt 8800 ]; then
    echo "FEHLER: kein freier Port 8780-8800"; exit 1
  fi
done
echo "Server-Port: $PORT"

# HTTP-Server starten
(cd "$SRC_DIR" && python3 -m http.server $PORT >/dev/null 2>&1) &
SERVER_PID=$!
trap "kill $SERVER_PID 2>/dev/null || true" EXIT
sleep 1

# Pages: relative URL → output filename
PAGES=(
  "index.html|01-homepage"
  "portfolio/immobilien-makler.html|02-immobilien"
  "portfolio/dachdecker-meisterbetrieb.html|03-dachdecker"
  "portfolio/friseur-salon.html|04-friseur"
  "portfolio/praxis-weber.html|05-praxis"
  "portfolio/restaurant-template.html|06-restaurant"
  "portfolio/meisterbetrieb-mueller.html|07-sanitaer"
  "portfolio/spedition-schwaben.html|08-spedition"
)

# Headless-Chrome-Optionen: lange virtual-time damit Fonts + Lazy-Loading vollständig laden
CHROME_OPTS=(
  --headless
  --disable-gpu
  --hide-scrollbars
  --virtual-time-budget=8000
  --force-color-profile=srgb
)

for spec in "${PAGES[@]}"; do
  page="${spec%|*}"
  name="${spec#*|}"
  URL="http://localhost:$PORT/$page"

  # Desktop 2880×1800 (Retina Award-Format)
  echo "[desktop] $name"
  "$CHROME" "${CHROME_OPTS[@]}" \
    --window-size=2880,1800 \
    --screenshot="$OUT_DIR/desktop/$name.png" \
    "$URL" 2>/dev/null

  # Mobile 750×1624 (iPhone-Portrait, Web Almanac Standard)
  echo "[mobile]  $name"
  "$CHROME" "${CHROME_OPTS[@]}" \
    --window-size=750,1624 \
    --screenshot="$OUT_DIR/mobile/$name.png" \
    "$URL" 2>/dev/null
done

echo ""
echo "FERTIG. Screenshots in $OUT_DIR/"
ls -lh "$OUT_DIR/desktop/" | tail -n +2 | awk '{printf "  desktop/%s — %s\n", $9, $5}'
ls -lh "$OUT_DIR/mobile/" | tail -n +2 | awk '{printf "  mobile/%s  — %s\n", $9, $5}'
