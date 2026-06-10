#!/usr/bin/env bash
# Sprint 247 — Material-Visualizer der Dachdecker-Demo: 4 ECHTE Material-Renders
# via Flux 1.1 Pro Ultra. Vorher zeigten Eternit/ZinCo die VORHER-Schadensbilder
# der Sanierungs-Galerie (vermoostes Altdach als "Schiefer Tiefschwarz") und
# PREFA/BRAAS unpassende Nachher-Fotos — Bild-Inhalt muss dem Material-Label
# entsprechen (Vertrauens-Regel, Founder-Fund 2026-06-10).
#
# Run: bash scripts/generate-dachdecker-materials.sh   (braucht REPLICATE_API_TOKEN in .env.local)
#      bash scripts/generate-dachdecker-materials.sh eternit   (nur ein Material)

set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
[ -f "$REPO_ROOT/.env.local" ] && { set -a; . "$REPO_ROOT/.env.local"; set +a; }
[ -z "${REPLICATE_API_TOKEN:-}" ] && { echo "FEHLER: REPLICATE_API_TOKEN nicht gesetzt."; exit 1; }
OUT_DIR="$REPO_ROOT/src/images"
MODEL_ENDPOINT="https://api.replicate.com/v1/models/black-forest-labs/flux-1.1-pro-ultra/predictions"

ONLY_KEYS="${*:-}"

# Einheitlicher Look über alle 4 Renders (Serie!): gleiche Architektur-Welt wie
# die bestehenden nachher-Renders, neutrales Tageslicht damit Materialfarben
# ehrlich lesbar sind. Keine Logos (echte Markennamen nur als Stil-Referenz).
ANTI_AI=" Photographed like a premium German roofing company portfolio shot, Canon EOS R5 with 35mm lens, three-quarter aerial view from slightly above, soft overcast daylight with neutral color balance, modern German single-family house with light render facade, crisp realistic material texture filling most of the frame. Constraints: absolutely no text, no logos, no watermarks, no people, no scaffolding, photorealistic, natural color grading."

read -r -d '' ITEMS_RAW <<EOF || true
prefa|dachdecker/material-prefa.jpg|3:2|Roof of a modern German house fully covered with anthracite-grey standing-seam aluminium roofing, long elegant vertical metal seams running down the slope, matte smooth metal surface with subtle light reflections along the seams, clean ridge and slim metal gutter.${ANTI_AI}
braas|dachdecker/material-braas.jpg|3:2|Straight gable roof of a modern German house covered with large flat rectangular concrete roof tiles in matte anthracite grey, perfectly flat planar roof surface with straight ridge line, flat smooth tile profile in precise clean rows (Tegalit style flat tile look), rigid geometric minimalist roofscape, no curved surfaces.${ANTI_AI}
eternit|dachdecker/material-eternit.jpg|3:2|Roof of a German house covered with deep black fibre-cement slate shingles, classic German double-lap slate pattern (Doppeldeckung) of small smooth rectangular shingles with elegant diagonal rhythm, uniform deep matte black color, freshly installed premium slate roof.${ANTI_AI}
zinco|dachdecker/material-zinco.jpg|3:2|Extensive green roof on a modern German flat-roof residential building, low sedum carpet vegetation in fresh green with subtle red-brown accents, neat gravel edge strip along the border, thin substrate build-up visible at the roof edge, healthy well-maintained eco roof.${ANTI_AI}
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

FAILED=0
while IFS='|' read -r key out_path aspect prompt; do
  [ -z "$key" ] && continue
  if [ -n "$ONLY_KEYS" ]; then
    case " $ONLY_KEYS " in *" $key "*) ;; *) continue ;; esac
  fi
  generate_one "$key" "$out_path" "$aspect" "$prompt" || FAILED=$((FAILED + 1))
done <<< "$ITEMS_RAW"

[ "$FAILED" -gt 0 ] && { echo "✗ $FAILED Render(s) fehlgeschlagen"; exit 1; }
echo "✓ Alle Material-Renders generiert."
