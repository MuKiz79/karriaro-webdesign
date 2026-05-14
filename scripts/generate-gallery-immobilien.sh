#!/usr/bin/env bash
# Sprint 18 B1 — Immobilien-Galerie (6 Bilder)
# 3 Objekt-Fotos + 3 Video-Poster (Verkäufer-Personas)

set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
[ -f "$REPO_ROOT/.env.local" ] && { set -a; . "$REPO_ROOT/.env.local"; set +a; }
[ -z "${REPLICATE_API_TOKEN:-}" ] && { echo "FEHLER: REPLICATE_API_TOKEN nicht gesetzt."; exit 1; }
OUT_DIR="$REPO_ROOT/src/images"
MODEL="google/imagen-4"

read -r -d '' ITEMS_RAW <<'EOF' || true
altbau-west|immobilien/altbau-west.jpg|16:9|Editorial real estate exterior photography of a premium Stuttgart Halbhoehenring sandstone Altbau building from late 19th century, ornate facade with stucco details and tall French windows, golden hour afternoon light, tree-lined upscale residential street, no people visible, no text, no logos, no readable signs, no license plates, premium real estate magazine aesthetic
efh-degerloch|immobilien/efh-degerloch.jpg|16:9|Editorial real estate exterior photography of a premium 1960s modernist single-family home in Stuttgart-Degerloch suburb, clean architectural lines with large windows, mature landscaped garden with hedges, soft afternoon light, no people visible, no text, no logos, no readable signs, no license plates, premium real estate magazine aesthetic
penthouse-mitte|immobilien/penthouse-mitte.jpg|16:9|Editorial real estate interior photography of a premium Stuttgart penthouse living room with floor-to-ceiling windows, modern minimalist Vitra-style furniture in warm neutral tones, Stuttgart city skyline visible through windows at dusk with subtle warm lights, no people visible, no text, no logos, premium real estate magazine aesthetic
video-poster-1|immobilien/video-poster-1.jpg|16:9|Editorial documentary portrait of a friendly German woman seller in her mid-sixties with short gray hair wearing a soft beige cardigan over white blouse, sitting relaxed in her bright Stuttgart-West Altbau living room with warm afternoon light from the side, blurred bookshelves and houseplants in background, authentic warm trustworthy expression looking at camera, premium documentary photography aesthetic, no text, no logo
video-poster-2|immobilien/video-poster-2.jpg|16:9|Editorial documentary portrait of a composed German woman seller in her late sixties with shoulder-length gray hair pinned back wearing a navy blouse with subtle silver brooch, sitting in her Degerloch family home garden patio at golden hour, blurred mature garden background with roses, reserved dignified expression looking at camera, premium documentary photography aesthetic, no text, no logo
video-poster-3|immobilien/video-poster-3.jpg|16:9|Editorial documentary portrait of a thoughtful German man in his mid-fifties with neat short brown hair lightly graying at temples wearing a dark gray sweater over white shirt, sitting at a wooden kitchen table in a inherited Stuttgart family home with vintage details, warm side window light, blurred family-home interior background, calm reflective expression looking at camera, premium documentary photography aesthetic, no text, no logo
EOF

generate_one() {
  local key="$1" out_path="$2" aspect="$3" prompt="$4"
  local full_out="$OUT_DIR/$out_path"
  echo "[start] $key → $out_path"
  local create_response
  create_response=$(curl -s --no-progress-meter "https://api.replicate.com/v1/models/$MODEL/predictions" \
    -H "Authorization: Bearer $REPLICATE_API_TOKEN" -H "Content-Type: application/json" -H "Prefer: wait" \
    -d "$(jq -n --arg prompt "$prompt" --arg ar "$aspect" '{input: {prompt: $prompt, aspect_ratio: $ar, output_format: "jpg", safety_filter_level: "block_only_high"}}')")
  local prediction_id
  prediction_id=$(echo "$create_response" | jq -r '.id // empty' 2>/dev/null)
  [ -z "$prediction_id" ] && { echo "[fail] $key — kein id"; return 1; }
  local output_url="" tries=0
  while [ -z "$output_url" ] && [ "$tries" -lt 90 ]; do
    local poll status
    poll=$(curl -s --no-progress-meter "https://api.replicate.com/v1/predictions/$prediction_id" -H "Authorization: Bearer $REPLICATE_API_TOKEN")
    status=$(echo "$poll" | jq -r '.status' 2>/dev/null)
    if [ "$status" = "succeeded" ]; then output_url=$(echo "$poll" | jq -r 'if (.output|type)=="array" then .output[0] else .output end'); break
    elif [ "$status" = "failed" ] || [ "$status" = "canceled" ]; then echo "[fail] $key — $status"; return 1
    fi
    sleep 2; tries=$((tries+1))
  done
  [ -z "$output_url" ] && { echo "[fail] $key — timeout"; return 1; }
  curl -s --no-progress-meter -o "$full_out" "$output_url"
  local size
  size=$(stat -f %z "$full_out" 2>/dev/null || stat -c %s "$full_out")
  echo "[done] $key → $out_path ($size bytes)"
}

echo "$ITEMS_RAW" | while IFS='|' read -r key path aspect prompt; do
  [ -z "$key" ] && continue
  retries=0
  until generate_one "$key" "$path" "$aspect" "$prompt"; do
    retries=$((retries+1)); [ "$retries" -ge 3 ] && { echo "[abort] $key"; break; }
    echo "[retry $retries/3] $key — warte 15s"; sleep 15
  done
  sleep 8
done
echo "FERTIG."
