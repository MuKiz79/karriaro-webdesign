#!/usr/bin/env bash
# Sprint 23 — Friseur-Galerie 8 Frisuren-Editorial-Portraits via Flux 1.1 Pro Ultra

set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
[ -f "$REPO_ROOT/.env.local" ] && { set -a; . "$REPO_ROOT/.env.local"; set +a; }
[ -z "${REPLICATE_API_TOKEN:-}" ] && { echo "FEHLER: REPLICATE_API_TOKEN nicht gesetzt."; exit 1; }
OUT_DIR="$REPO_ROOT/src/images"
MODEL_ENDPOINT="https://api.replicate.com/v1/models/black-forest-labs/flux-1.1-pro-ultra/predictions"

ONLY_KEYS="${*:-}"

ANTI_AI=" Editorial fashion magazine portrait, shot on Canon EOS R5 with 85mm f/1.4 lens, soft natural studio light, slight depth of field, real natural skin texture with visible pores, natural eye reflections, photorealistic hair detail with individual strands visible, premium Düsseldorf-Carlstadt atelier salon background softly out of focus with warm walnut wood panels and a vintage barber chair, monochrome neutral wardrobe in cream or stone-grey. Constraints: absolutely no text, no logos, no readable signs, no brand markings, no airbrushed plastic skin, no overly symmetric face, natural color grading."

read -r -d '' ITEMS_RAW <<EOF || true
long-pixie|friseur/long-pixie.jpg|3:4|Editorial portrait of a confident German woman in her early thirties wearing a cream linen top, looking three-quarter to camera with a subtle composed expression. Hair: edgy long pixie haircut, side-swept volume on top with textured layers, dark chocolate brown, glossy finish, individual strand definition visible.${ANTI_AI}
honey-balayage|friseur/honey-balayage.jpg|3:4|Editorial portrait of a relaxed German woman in her late twenties wearing a soft stone-grey ribbed knit top, head turned slightly to the side to show color depth, calm smile. Hair: long honey-blonde balayage flowing from dark-blonde roots to honey-bright ends, soft beachy waves, glossy reflective surface.${ANTI_AI}
french-bob|friseur/french-bob.jpg|3:4|Editorial portrait of a stylish German woman in her early thirties wearing a cream silk shell top, looking directly at camera with a quiet confident expression. Hair: sharp blunt French bob to the jaw, soft curtain bangs framing the face, glossy dark espresso color, ultra clean cut line.${ANTI_AI}
bridal-updo|friseur/bridal-updo.jpg|3:4|Editorial portrait of an elegant German bride in her late twenties wearing a cream ivory silk slip dress, side-profile view showing the hair detail. Hair: polished elegant low chignon bridal updo at the nape, finished with a few delicate baby's breath flowers tucked in, soft face-framing tendrils.${ANTI_AI}
modern-shag|friseur/modern-shag.jpg|3:4|Editorial portrait of a creative German woman in her early thirties wearing a stone-grey cashmere top, looking three-quarter to camera with a soft smile. Hair: modern shag haircut with curtain bangs, lots of choppy texture, layered chestnut brown with subtle dimensional highlights, lived-in volume.${ANTI_AI}
curtain-bangs|friseur/curtain-bangs.jpg|3:4|Editorial portrait of a poised German woman in her mid thirties wearing a cream knit, looking directly at camera with a serene expression. Hair: sleek long hair with face-framing curtain bangs parting around the eyes, glossy medium dark blonde with subtle dimension, smooth blowout finish.${ANTI_AI}
caramel-highlights|friseur/caramel-highlights.jpg|3:4|Editorial portrait of a confident German woman in her early thirties wearing a stone-grey silk top, hair tossed slightly to one side showing color depth, soft smile. Hair: long hair with caramel highlights woven through a medium chestnut-brown base, brushed-out soft waves with reflective shine.${ANTI_AI}
fade-cut|friseur/fade-cut.jpg|3:4|Editorial portrait of a confident German man in his late twenties wearing a clean cream crewneck sweater, side-profile view showing the haircut transition clearly. Hair: classic mid-fade haircut, very short tapered sides blending into a longer textured top with subtle natural movement, dark brown hair, freshly cut clean lines.${ANTI_AI}
EOF

generate_one() {
  local key="$1" out_path="$2" aspect="$3" prompt="$4"
  local full_out="$OUT_DIR/$out_path"
  mkdir -p "$(dirname "$full_out")"

  echo "[start] $key ($aspect) → $out_path"

  local payload
  payload=$(jq -n --arg p "$prompt" --arg a "$aspect" '{input: {prompt: $p, aspect_ratio: $a, output_format: "jpg", raw: true, safety_tolerance: 2}}')

  local create_response
  create_response=$(curl -s --max-time 90 -X POST "$MODEL_ENDPOINT" \
    -H "Authorization: Bearer $REPLICATE_API_TOKEN" \
    -H "Content-Type: application/json" \
    -H "Prefer: wait=60" \
    -d "$payload")

  local create_err
  create_err=$(echo "$create_response" | jq -r '.detail // .error // empty' 2>/dev/null)
  [ -n "$create_err" ] && { echo "[fail] $key — create: $create_err"; return 1; }

  local prediction_id status latest_response
  prediction_id=$(echo "$create_response" | jq -r '.id // empty')
  status=$(echo "$create_response" | jq -r '.status // empty')
  latest_response="$create_response"
  [ -z "$prediction_id" ] && { echo "[fail] $key — keine prediction-id"; return 1; }

  local poll_count=0
  while [ "$status" != "succeeded" ] && [ "$status" != "failed" ] && [ "$status" != "canceled" ]; do
    sleep 3
    poll_count=$((poll_count + 1))
    if [ "$poll_count" -gt 40 ]; then echo "[fail] $key — timeout"; return 1; fi
    latest_response=$(curl -s --max-time 30 "https://api.replicate.com/v1/predictions/$prediction_id" \
      -H "Authorization: Bearer $REPLICATE_API_TOKEN")
    status=$(echo "$latest_response" | jq -r '.status // empty')
  done

  if [ "$status" != "succeeded" ]; then
    local fail_err
    fail_err=$(echo "$latest_response" | jq -r '.error // "unknown"')
    echo "[fail] $key — status=$status err=$fail_err"
    return 1
  fi

  local img_url output_type
  output_type=$(echo "$latest_response" | jq -r '.output | type')
  if [ "$output_type" = "string" ]; then
    img_url=$(echo "$latest_response" | jq -r '.output')
  elif [ "$output_type" = "array" ]; then
    img_url=$(echo "$latest_response" | jq -r '.output[0]')
  else
    echo "[fail] $key — output type unexpected: $output_type"; return 1
  fi
  [ -z "$img_url" ] || [ "$img_url" = "null" ] && { echo "[fail] $key — keine output-url"; return 1; }

  curl -s --max-time 60 "$img_url" -o "$full_out"
  local size_bytes
  size_bytes=$(stat -f %z "$full_out" 2>/dev/null || stat -c %s "$full_out")
  [ "${size_bytes:-0}" -lt 10000 ] && { echo "[fail] $key — downloaded image too small ($size_bytes bytes)"; return 1; }
  echo "[done] $key → $out_path ($size_bytes bytes)"
}

echo "$ITEMS_RAW" | while IFS='|' read -r key path aspect prompt; do
  [ -z "$key" ] && continue
  if [ -n "$ONLY_KEYS" ]; then
    if ! echo " $ONLY_KEYS " | grep -q " $key "; then continue; fi
  fi
  retries=0
  until generate_one "$key" "$path" "$aspect" "$prompt"; do
    retries=$((retries + 1))
    if [ "$retries" -ge 2 ]; then echo "[abort] $key — nach 2 Retries"; break; fi
    echo "[retry $retries/2] $key in 10s …"; sleep 10
  done
  sleep 2
done

echo "FERTIG."
