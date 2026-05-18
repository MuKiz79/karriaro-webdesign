#!/usr/bin/env bash
# Sprint 87 — Sync src/m/* + src/css/mobile.css ins Mobile-Repo
# karriaro-webdesign-mobile (m.karriaro-webdesign.de).
#
# Workflow:
#   1. Im Haupt-Repo: scripts/build-mobile-pages.mjs editieren + ausfuehren
#   2. Dieses Skript laufen lassen → Mobile-Repo bekommt:
#      - alle src/m/*.html (mit Image-Pfaden auf karriaro-webdesign.de absolut)
#      - alle src/m/portfolio/*.html
#      - alle src/m/blog/*.html
#      - src/css/mobile.css
#      - CNAME-File bleibt unangetastet
#   3. Skript fragt vor Push noch einmal Confirmation.

set -euo pipefail

MAIN_REPO="/Users/muammerkizilaslan/Projects/karriaro/webdesign"
MOBILE_REPO="$HOME/Projects/karriaro-webdesign-mobile"
MOBILE_REMOTE="https://github.com/MuKiz79/karriaro-webdesign-mobile.git"

# Mobile-Repo lokal klonen falls noch nicht vorhanden
if [ ! -d "$MOBILE_REPO/.git" ]; then
    echo "→ Clone $MOBILE_REMOTE nach $MOBILE_REPO"
    mkdir -p "$(dirname "$MOBILE_REPO")"
    git clone "$MOBILE_REMOTE" "$MOBILE_REPO"
fi

cd "$MOBILE_REPO"

echo "→ Mobile-Repo refreshen"
git pull origin main --rebase

echo "→ Bestehende HTML + CSS + JS + Mockups-Opt loeschen (CNAME, README, .git bleiben)"
find . -maxdepth 1 -name "*.html" -delete
rm -rf portfolio blog css js images/mockups-opt
mkdir -p portfolio blog css js images/mockups-opt

echo "→ Files aus Haupt-Repo kopieren"
cp "$MAIN_REPO"/src/m/*.html .
cp "$MAIN_REPO"/src/m/portfolio/*.html portfolio/
cp "$MAIN_REPO"/src/m/blog/*.html blog/
# Sprint 91: Generator-Output benoetigt alle Desktop-CSS-Files (tokens, karriaro-tools, mobile-overrides etc.)
# nicht nur mobile.css. Wir spiegeln src/css/ komplett.
cp "$MAIN_REPO"/src/css/*.css css/ 2>/dev/null || true
# Sprint 128: JS-Bundle inklusive m-interactions.js (Mobile-Interaktions-Module)
cp "$MAIN_REPO"/src/js/*.js js/ 2>/dev/null || true
# Sprint 103: Demo-Swiper-Mockup-Bilder optimiert (webp 480/800 + jpg-Fallback)
cp "$MAIN_REPO"/src/images/mockups-opt/*.webp images/mockups-opt/ 2>/dev/null || true
cp "$MAIN_REPO"/src/images/mockups-opt/*.jpg  images/mockups-opt/ 2>/dev/null || true

echo "→ Pfad-Rewrite: /images/ → https://karriaro-webdesign.de/images/"
find . -name "*.html" -print0 | xargs -0 sed -i '' \
    -e 's|src="/images/|src="https://karriaro-webdesign.de/images/|g' \
    -e 's|href="/images/|href="https://karriaro-webdesign.de/images/|g'

echo "→ Pfad-Rewrite UNDO: mockups-opt lokal (Mobile-Repo hat eigene Kopie, Sprint 103)"
find . -name "*.html" -print0 | xargs -0 sed -i '' \
    -e 's|src="https://karriaro-webdesign.de/images/mockups-opt/|src="/images/mockups-opt/|g' \
    -e 's|href="https://karriaro-webdesign.de/images/mockups-opt/|href="/images/mockups-opt/|g'

echo "→ Pfad-Rewrite: /m/ → /"
find . -name "*.html" -print0 | xargs -0 sed -i '' 's|href="/m/|href="/|g'

echo "→ Diff:"
git status --short

read -rp "→ Push? [y/N] " ans
if [ "$ans" = "y" ] || [ "$ans" = "Y" ]; then
    git add .
    git commit -m "Sync Mobile-Pages aus Haupt-Repo $(date +%Y-%m-%d)" 2>/dev/null || echo "(nichts zu committen)"
    git push origin main
    echo "✓ Mobile-Repo aktualisiert. GitHub-Pages-Deploy laeuft."
else
    echo "✗ Push uebersprungen. Aenderungen liegen lokal in $MOBILE_REPO"
fi
