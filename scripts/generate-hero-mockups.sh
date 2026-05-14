#!/usr/bin/env bash
# Sprint 18 A1 — Hero-Switcher-Mockup-Generator (8 Bilder, 16:9 via Imagen 4)
# Konsistenz-Anker: Personen-Beschreibung identisch zu Persona-Heros der Portfolio-Sub-Pages.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$REPO_ROOT/.env.local"
[ -f "$ENV_FILE" ] && { set -a; . "$ENV_FILE"; set +a; }

[ -z "${REPLICATE_API_TOKEN:-}" ] && { echo "FEHLER: REPLICATE_API_TOKEN nicht gesetzt."; exit 1; }

OUT_DIR="$REPO_ROOT/src/images"
MODEL="google/imagen-4"

read -r -d '' ITEMS_RAW <<'EOF' || true
immobilien|immobilien-stadtmakler-mockup.jpg|Editorial mockup-style hero composition for Stuttgart premium real estate website, 16:9 aspect, distinguished German businessman in his early fifties with short gray-flecked hair wearing dark navy blazer over white shirt, standing relaxed in front of an upscale Stuttgart Halbhoehenring building entrance with sandstone facade and dark wooden door, soft afternoon light, blurred upscale residential street background, navy and gold color tones, premium real estate editorial aesthetic, no text, no logo, no readable signs
friseur|friseur-mueller-mockup.jpg|Editorial mockup-style hero composition for premium hair salon Duesseldorf, 16:9 aspect, confident female salon owner in her mid-forties with shoulder-length brown hair and elegant dark apron over white shirt, blurred Aveda concept salon interior with marble countertops, brass mirror details and warm pendant lighting, vogue-inspired premium aesthetic, aubergine and rose color tones, no text, no logo, no readable signs
dachdecker|dachdecker-meister-mockup.jpg|Documentary mockup-style hero composition for German roofing master craftsman website, 16:9 aspect, weathered authentic German roofer master in his early fifties with short gray hair and short gray beard wearing clean dark work shirt, standing on a Stuttgart residential roof with terracotta tiles, soft overcast daylight, blurred Stuttgart skyline background, premium documentary aesthetic, dark and gold tones, no text, no logo, no readable signs, no brand patch
praxis|praxis-weber-mockup.jpg|Editorial mockup-style hero composition for modern medical practice Munich, 16:9 aspect, friendly German female general practitioner in her mid-forties with brown hair tied back wearing pristine white doctor coat over light blouse, blurred modern medical practice interior with subtle teal accents, warm natural daylight, editorial medical magazine aesthetic, blue and warm tones, no text, no logo, no readable signs, no stethoscope visible
gastro|gastro-hirsch-mockup.jpg|Editorial gastronomy magazine mockup-style hero composition for premium Munich restaurant, 16:9 aspect, distinguished German executive chef in his early fifties with salt-and-pepper hair wearing classic white double-breasted chef jacket with knot buttons, blurred fine dining restaurant kitchen with stainless steel surfaces and warm copper pendant lights, holding a wooden cutting board casually, espresso brown and gold tones, no text, no logo, no readable signs
handwerk|handwerk-mueller-mockup.jpg|Documentary mockup-style hero composition for German master plumber business website, 16:9 aspect, trustworthy German sanitary master craftsman in his mid-forties with short brown hair wearing completely plain dark blue work polo without any logo or patch or brand, holding a chrome pipe wrench, blurred modern bathroom showroom with white ceramic basins and chrome fixtures, natural daylight, petrol blue tones, documentary handwerker aesthetic, no text, no logo, completely plain shirt
logistik|logistik-schwaben-mockup.jpg|Editorial B2B logistics mockup-style hero composition for premium German freight forwarding company, 16:9 aspect, no people visible, modern Mercedes-Benz Actros truck fleet at sunrise on a Filderstadt logistics yard, clean industrial composition, warm dawn light, blurred autobahn background, professional German Mittelstand aesthetic, slate gray and orange accents, no text, no logo, no readable signs, no license plates
coaching|coaching-lehmann-mockup.jpg|Editorial business coaching mockup-style hero composition for premium German executive coach, 16:9 aspect, confident German female business coach in her mid-forties with dark hair in a sleek bob wearing minimalist black blazer, sitting at a glass conference table with subtle Frankfurt skyline view through floor-to-ceiling windows, blurred upscale office background, warm afternoon light, editorial business magazine aesthetic, monochrome with subtle warm accents, no text, no logo, no readable signs
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
    -d "$(jq -n --arg prompt "$prompt" '{input: {prompt: $prompt, aspect_ratio: "16:9", output_format: "jpg", safety_filter_level: "block_only_high"}}')")

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
