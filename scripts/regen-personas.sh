#!/usr/bin/env bash
# Sprint 16c — Persona-Regenerierung (nur 2 Branchen)
# Restaurant: Imagen hatte Safety-Filter geblockt (Anime+Fehlertext zurück)
# Sanitär: Marken-Patch + Branche unklar → bessere Sanitär-Visuals

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$REPO_ROOT/.env.local"

if [ -f "$ENV_FILE" ]; then
  set -a; . "$ENV_FILE"; set +a
fi

OUT_DIR="$REPO_ROOT/src/images"
MODEL="google/imagen-4"

read -r -d '' ITEMS_RAW <<'EOF' || true
restaurant|restaurant/persona.jpg|Documentary editorial portrait of a distinguished German master chef in his fifties, gray-streaked short hair, wearing a professional white double-breasted chef jacket with knot buttons, holding a wooden cutting board casually in one hand, standing relaxed in front of a softly out-of-focus modern restaurant kitchen with stainless steel surfaces and warm pendant lighting, natural warm side light, confident calm expression looking directly at the camera, photorealistic documentary photography, premium gastronomy magazine aesthetic, no text on image, no logo visible, no brand patch on clothing
sanitaer|sanitaer/persona.jpg|Documentary editorial portrait of a German master plumber craftsman in his forties, short brown hair, wearing a completely plain dark blue work polo shirt without any logo or patch or brand, holding a chrome pipe wrench casually in his right hand, standing in front of a softly out-of-focus modern bathroom showroom with white ceramic basins, chrome fixtures and visible copper pipes in the background, natural daylight from the left, confident competent expression looking at camera with slight smile, photorealistic documentary photography, trustworthy German craftsman aesthetic, no text on image, no logo, completely plain shirt
EOF

generate_one() {
  local branche="$1"
  local out_path="$2"
  local prompt="$3"
  local full_out="$OUT_DIR/$out_path"

  echo "[start] $branche → $out_path"

  local create_response
  create_response=$(curl -s --no-progress-meter "https://api.replicate.com/v1/models/$MODEL/predictions" \
    -H "Authorization: Bearer $REPLICATE_API_TOKEN" \
    -H "Content-Type: application/json" \
    -H "Prefer: wait" \
    -d "$(jq -n --arg prompt "$prompt" '{input: {prompt: $prompt, aspect_ratio: "3:4", output_format: "jpg", safety_filter_level: "block_only_high"}}')")

  local status prediction_id
  status=$(echo "$create_response" | jq -r '.status // "error"' 2>/dev/null)
  prediction_id=$(echo "$create_response" | jq -r '.id // empty' 2>/dev/null)

  if [ "$status" = "error" ] || [ -z "$prediction_id" ]; then
    echo "[fail] $branche — $(echo "$create_response" | jq -r '.detail // tostring' | head -c 200)"
    return 1
  fi

  local output_url=""
  local tries=0
  while [ -z "$output_url" ] && [ "$tries" -lt 90 ]; do
    local poll
    poll=$(curl -s --no-progress-meter "https://api.replicate.com/v1/predictions/$prediction_id" \
      -H "Authorization: Bearer $REPLICATE_API_TOKEN")
    status=$(echo "$poll" | jq -r '.status' 2>/dev/null)
    if [ "$status" = "succeeded" ]; then
      output_url=$(echo "$poll" | jq -r 'if (.output|type)=="array" then .output[0] else .output end' 2>/dev/null)
      break
    elif [ "$status" = "failed" ] || [ "$status" = "canceled" ]; then
      echo "[fail] $branche — $(echo "$poll" | jq -r '.error // "unknown"')"
      return 1
    fi
    sleep 2
    tries=$((tries + 1))
  done

  [ -z "$output_url" ] || [ "$output_url" = "null" ] && { echo "[fail] $branche — Timeout"; return 1; }

  curl -s --no-progress-meter -o "$full_out" "$output_url"
  local size
  size=$(stat -f %z "$full_out" 2>/dev/null || stat -c %s "$full_out")
  echo "[done] $branche → $out_path ($size bytes)"
  return 0
}

echo "$ITEMS_RAW" | while IFS='|' read -r branche path prompt; do
  [ -z "$branche" ] && continue
  retries=0
  until generate_one "$branche" "$path" "$prompt"; do
    retries=$((retries + 1))
    [ "$retries" -ge 3 ] && { echo "[abort] $branche"; break; }
    echo "[retry $retries/3] $branche — warte 15s"
    sleep 15
  done
  sleep 8
done

echo "FERTIG."
