#!/usr/bin/env bash
# Sprint 16b — Persona-Foto-Generator via Google Imagen 4 (über Replicate)
#
# Generiert 5 Persona-Fotos (3:4 portrait, höchst-mögliche bei Imagen 4) für die
# Portfolio-Sub-Pages: friseur, dachdecker, praxis, restaurant, sanitaer (Handwerk).
# Überschreibt die FLUX-1.1-Pro-Versionen mit Imagen-4-Versionen — Git-History
# bewahrt die FLUX-Originale falls Rollback nötig.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$REPO_ROOT/.env.local"

if [ -f "$ENV_FILE" ]; then
  set -a; . "$ENV_FILE"; set +a
fi

if [ -z "${REPLICATE_API_TOKEN:-}" ]; then
  echo "FEHLER: REPLICATE_API_TOKEN nicht gesetzt."
  exit 1
fi

OUT_DIR="$REPO_ROOT/src/images"
MODEL="google/imagen-4"

# (branche|pfad|prompt)
read -r -d '' ITEMS_RAW <<'EOF' || true
friseur|friseur/persona.jpg|Editorial portrait photography of a confident German hair salon owner, woman mid-30s with shoulder-length brown hair, wearing elegant dark apron over white shirt, soft warm window light from the right, blurred marble salon interior background with brass mirror details, slight film grain, vogue-inspired premium aesthetic, looking directly at camera with relaxed confident expression, shallow depth of field, no text, no logo, photorealistic, professional headshot style
dachdecker|dachdecker/persona.jpg|Documentary craftsman portrait of a German roofing master in his mid-50s, weathered authentic face with short gray hair and short beard, wearing clean dark work shirt with brand patch, natural overcast daylight, blurred rooftop or workshop background with terracotta tiles visible, confident grounded expression, looking at camera, no text, no logo, photorealistic, documentary photography style
praxis|praxis/persona.jpg|Editorial doctor portrait of a German female general practitioner in her mid-40s, brown hair tied back, wearing pristine white doctor coat over light blouse, modern medical practice background blurred with subtle teal accents, warm authentic expression with slight smile, natural soft daylight, professional medical aesthetic, looking at camera, no text, no logo, no stethoscope visible, photorealistic
restaurant|restaurant/persona.jpg|Editorial chef portrait of a German male executive chef in his mid-50s, salt-and-pepper hair short and neat, wearing classic dark chef jacket buttoned to top, modern fine dining restaurant kitchen background blurred with warm copper highlights, focused authentic expression with slight smile, warm tungsten light from the left, looking at camera, no text, no logo, photorealistic, editorial gastronomy magazine aesthetic
sanitaer|sanitaer/persona.jpg|Documentary craftsman portrait of a German sanitary master in his mid-40s, short brown hair, wearing clean dark blue work polo with embroidered brand, natural daylight, blurred bathroom showroom background with chrome and ceramic visible, confident hands-on expression, slight smile, looking at camera, no text, no logo, photorealistic, trustworthy German handwerker aesthetic
EOF

generate_one() {
  local branche="$1"
  local out_path="$2"
  local prompt="$3"
  local full_out="$OUT_DIR/$out_path"

  echo "[start] $branche → $out_path (Imagen 4)"

  local create_response
  create_response=$(curl -s --no-progress-meter "https://api.replicate.com/v1/models/$MODEL/predictions" \
    -H "Authorization: Bearer $REPLICATE_API_TOKEN" \
    -H "Content-Type: application/json" \
    -H "Prefer: wait" \
    -d "$(jq -n --arg prompt "$prompt" '{input: {prompt: $prompt, aspect_ratio: "3:4", output_format: "jpg", safety_filter_level: "block_only_high"}}')")

  local status
  status=$(echo "$create_response" | jq -r '.status // "error"' 2>/dev/null)
  local prediction_id
  prediction_id=$(echo "$create_response" | jq -r '.id // empty' 2>/dev/null)

  if [ "$status" = "error" ] || [ "$status" = "failed" ] || [ -z "$prediction_id" ]; then
    echo "[fail] $branche — $(echo "$create_response" | jq -r '.detail // .error // tostring' 2>/dev/null | head -c 200)"
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
      echo "[fail] $branche — Status $status: $(echo "$poll" | jq -r '.error // "unknown"')"
      return 1
    fi
    sleep 2
    tries=$((tries + 1))
  done

  if [ -z "$output_url" ] || [ "$output_url" = "null" ]; then
    echo "[fail] $branche — Timeout"
    return 1
  fi

  curl -s --no-progress-meter -o "$full_out" "$output_url"
  local size
  size=$(stat -f %z "$full_out" 2>/dev/null || stat -c %s "$full_out")
  if [ "$size" -lt 15000 ]; then
    echo "[fail] $branche — Datei zu klein ($size bytes)"
    return 1
  fi
  echo "[done] $branche → $out_path ($size bytes)"
  return 0
}

echo "$ITEMS_RAW" | while IFS='|' read -r branche path prompt; do
  [ -z "$branche" ] && continue
  retries=0
  until generate_one "$branche" "$path" "$prompt"; do
    retries=$((retries + 1))
    if [ "$retries" -ge 3 ]; then
      echo "[abort] $branche — 3 Versuche fehlgeschlagen, weiter"
      break
    fi
    echo "[retry $retries/3] $branche — warte 15s"
    sleep 15
  done
  sleep 10
done

echo "FERTIG."
