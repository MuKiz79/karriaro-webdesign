#!/usr/bin/env bash
# Sprint 18 B-Fix — 6 Friseur-Profile mit korrigiertem aspect_ratio (3:4 statt 4:5)
set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
[ -f "$REPO_ROOT/.env.local" ] && { set -a; . "$REPO_ROOT/.env.local"; set +a; }
OUT_DIR="$REPO_ROOT/src/images"
MODEL="google/imagen-4"

read -r -d '' ITEMS_RAW <<'EOF' || true
fr-sk1-vorher|friseur/profile-sk-1-vorher.jpg|Editorial salon documentation portrait, German woman in her early forties before hair color treatment, faded uneven highlights with dark roots, natural daylight, neutral salon background, neutral expression looking at camera, vogue-magazine portrait aesthetic, no text, no logos
fr-sk1-nachher|friseur/profile-sk-1-nachher.jpg|Editorial salon documentation portrait, same German woman in her early forties after balayage treatment, professionally lightened balayage with seamless blend, natural daylight, neutral salon background, subtle confident smile, vogue-magazine portrait aesthetic, no text, no logos
fr-sk2-analyse|friseur/profile-sk-2-analyse.jpg|Editorial salon documentation, close-up scalp analysis with magnification tool on healthy hair section parted, natural daylight, neutral background, premium documentation aesthetic, no face visible, no text, no logos
fr-sk2-nachher|friseur/profile-sk-2-nachher.jpg|Editorial salon documentation portrait, German woman mid-fifties after 8-week scalp treatment with healthy shine restored hair, natural daylight, neutral salon background, subtle satisfied expression, vogue-magazine portrait aesthetic, no text, no logos
fr-sk3-vorher|friseur/profile-sk-3-vorher.jpg|Editorial salon documentation portrait, German woman in her late forties before cut, long uneven hair with split ends, natural daylight, neutral salon background, neutral expression, vogue-magazine portrait aesthetic, no text, no logos
fr-sk3-nachher|friseur/profile-sk-3-nachher.jpg|Editorial salon documentation portrait, same German woman in her late forties after structured shoulder-length cut with subtle layers, natural daylight, neutral salon background, confident relaxed expression, vogue-magazine portrait aesthetic, no text, no logos
EOF

generate_one() {
  local key="$1" out_path="$2" prompt="$3"
  local full_out="$OUT_DIR/$out_path"
  echo "[start] $key"
  local create_response
  create_response=$(curl -s --no-progress-meter "https://api.replicate.com/v1/models/$MODEL/predictions" \
    -H "Authorization: Bearer $REPLICATE_API_TOKEN" -H "Content-Type: application/json" -H "Prefer: wait" \
    -d "$(jq -n --arg prompt "$prompt" '{input: {prompt: $prompt, aspect_ratio: "3:4", output_format: "jpg", safety_filter_level: "block_only_high"}}')")
  local prediction_id
  prediction_id=$(echo "$create_response" | jq -r '.id // empty')
  [ -z "$prediction_id" ] && { echo "[fail] $key"; return 1; }
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
  [ -z "$output_url" ] && return 1
  curl -s --no-progress-meter -o "$full_out" "$output_url"
  local size; size=$(stat -f %z "$full_out" 2>/dev/null || stat -c %s "$full_out")
  echo "[done] $key → $out_path ($size bytes)"
}

echo "$ITEMS_RAW" | while IFS='|' read -r key path prompt; do
  [ -z "$key" ] && continue
  generate_one "$key" "$path" "$prompt" || true
  sleep 6
done
echo "FERTIG."
