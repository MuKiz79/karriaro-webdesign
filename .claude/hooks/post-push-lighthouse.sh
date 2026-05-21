#!/bin/bash
# Sprint 141 — Post-Push-Lighthouse-Hook
#
# Trigger: PostToolUse für Bash(git push origin main)
# Action:
#   1. Warte 90s auf GitHub-Pages-Deploy.
#   2. Lighthouse Mobile + Desktop parallel laufen lassen.
#   3. JSON + HTML in award-submissions/.reports/{ISO-Date}.
#   4. Top-Scores in stdout für StatusLine-Display.
#
# Non-blocking: async true in settings.json. Schreibt nur Files, kein
# Edit am Working-Tree.

set -e

PROJECT_ROOT="/Users/muammerkizilaslan/Projects/karriaro/webdesign"
REPORTS_DIR="${PROJECT_ROOT}/award-submissions/.reports"
mkdir -p "$REPORTS_DIR"

DATE_ISO=$(date -u +"%Y%m%dT%H%M%SZ")
LOG_FILE="${REPORTS_DIR}/post-push-${DATE_ISO}.log"

{
    echo "==> Post-Push-Lighthouse-Hook gestartet: ${DATE_ISO}"
    echo "==> Warte 90s auf GitHub-Pages-Deploy..."
    sleep 90

    echo "==> Lighthouse Mobile (m.karriaro-webdesign.de)..."
    npx --yes lighthouse https://m.karriaro-webdesign.de/ \
        --preset=mobile \
        --output=json --output=html \
        --output-path="${REPORTS_DIR}/lighthouse-mobile-${DATE_ISO}" \
        --chrome-flags="--headless" --quiet 2>&1 | tail -5 &
    MOBILE_PID=$!

    echo "==> Lighthouse Desktop (karriaro-webdesign.de)..."
    npx --yes lighthouse https://karriaro-webdesign.de/ \
        --preset=desktop \
        --output=json --output=html \
        --output-path="${REPORTS_DIR}/lighthouse-desktop-${DATE_ISO}" \
        --chrome-flags="--headless" --quiet 2>&1 | tail -5 &
    DESKTOP_PID=$!

    wait $MOBILE_PID
    wait $DESKTOP_PID

    # Score-Extraktion
    if [ -f "${REPORTS_DIR}/lighthouse-mobile-${DATE_ISO}.report.json" ]; then
        MOBILE_JSON="${REPORTS_DIR}/lighthouse-mobile-${DATE_ISO}.report.json"
        PERF=$(jq '.categories.performance.score * 100 | floor' "$MOBILE_JSON" 2>/dev/null || echo "?")
        A11Y=$(jq '.categories.accessibility.score * 100 | floor' "$MOBILE_JSON" 2>/dev/null || echo "?")
        BP=$(jq '.categories["best-practices"].score * 100 | floor' "$MOBILE_JSON" 2>/dev/null || echo "?")
        SEO=$(jq '.categories.seo.score * 100 | floor' "$MOBILE_JSON" 2>/dev/null || echo "?")
        echo "==> Mobile Score → Perf:$PERF · A11y:$A11Y · BP:$BP · SEO:$SEO"
    fi

    echo "==> Reports → ${REPORTS_DIR}/lighthouse-*-${DATE_ISO}.{json,html}"
    echo "==> Fertig: $(date -u +%H:%M:%SZ)"
} >> "$LOG_FILE" 2>&1

echo "Lighthouse-Hook → $LOG_FILE"
