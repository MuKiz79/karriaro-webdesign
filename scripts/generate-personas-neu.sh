#!/usr/bin/env bash
# Personas + Werk-Motive fuer die Musterseiten ohne eigenes Bild.
# Rezept identisch zu regen-hero-personas-flux.sh (Flux 1.1 Pro Ultra ueber Replicate):
# eigener Seed je Motiv, ethnischer Archetyp, Gesichts-Anker, Fotograf-Referenz,
# Anti-KI-Suffix. Alle Betriebe sind FIKTIV.
#
# Je Motiv werden ZWEI Varianten (-a / -b, verschiedene Seeds) erzeugt und in einen
# Kurations-Ordner gelegt. Erst der ausgewaehlte Wurf wandert an den Zielpfad —
# ein einzelner Wurf verdeckt sonst eine systematische Schwaeche.
#
# Kosten: rund 0,06 EUR je Bild.
# Aufruf:  bash scripts/generate-personas-neu.sh            (alle)
#          bash scripts/generate-personas-neu.sh kanzlei-a  (einzeln)

set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
[ -f "$REPO_ROOT/.env.local" ] && { set -a; . "$REPO_ROOT/.env.local"; set +a; }
[ -z "${REPLICATE_API_TOKEN:-}" ] && { echo "FEHLER: REPLICATE_API_TOKEN nicht gesetzt."; exit 1; }
OUT_DIR="${KR_PERSONA_OUT:-$REPO_ROOT/.persona-kuration}"
MODEL_ENDPOINT="https://api.replicate.com/v1/models/black-forest-labs/flux-1.1-pro-ultra/predictions"
ONLY_KEYS="${*:-}"

ANTI_AI=" Photographic style: shot on Canon EOS R5 with 85mm f/1.4 lens, three-quarter portrait, rule of thirds composition, slight off-center framing, natural skin texture with visible pores and real wrinkles, no airbrushing, natural eye reflections, real eyelashes, slight facial asymmetry, soft natural window light, real depth of field bokeh, photorealistic editorial business portrait. Constraints: absolutely no text, no logos, no readable signs, no brand markings, no airbrushed plastic skin, no overly symmetric face, no studio strobe, natural color grading."
ANTI_AI_OBJEKT=" Photographic style: shot on Canon EOS R5 with 35mm f/2.8 lens, architectural product photography, natural daylight, real material texture, subtle imperfections, shallow depth of field, photorealistic editorial. Constraints: absolutely no text, no logos, no readable brand markings, no people, no hands, no oversaturated colors, no studio strobe, natural color grading."

# Format: key|path|aspect|seed|prompt
read -r -d '' ITEMS_RAW <<EOF || true
kanzlei-a|kanzlei/persona-a.jpg|4:5|19790412|Editorial photorealistic portrait of Dr. Katharina, a composed German attorney specialising in employment law, woman in her mid forties, with calm grey-green eyes and a direct steady gaze, defined cheekbones, a straight narrow nose, dark blonde hair in a low chignon with a few strands loose, fair skin with real fine lines around the eyes, minimal natural makeup, an expression of measured seriousness with a hint of warmth. Wearing a precisely tailored charcoal wool blazer over a plain white cotton blouse, no jewelry except a slim steel watch. Setting: her law office in a restored Stuttgart Altbau, a wall of bound legal volumes softly out of focus behind her, a heavy oak desk edge in the foreground, tall window with white frame casting long light. Lighting: cool clear north-facing daylight from camera left, restrained contrast. Mood: quiet authority, someone you trust with a difficult letter, Peter Hurley precision without corporate gloss.${ANTI_AI}
kanzlei-b|kanzlei/persona-b.jpg|4:5|19831107|Editorial photorealistic portrait of Dr. Katharina, a composed German attorney specialising in employment law, woman in her late forties of subtle Central-European heritage, with attentive hazel eyes behind thin titanium-rim glasses, a strong jawline, chestnut hair cut to a precise shoulder-length bob, fair skin with genuine character lines, no visible cosmetic procedures, an expression of focused calm. Wearing a deep navy blazer over a soft grey silk shell top, a single thin gold ring. Setting: standing beside a tall Altbau window in her Stuttgart law office, stacks of case files neatly squared on a side table in bokeh, muted olive wall behind. Lighting: soft overcast daylight from a large window camera right, gentle falloff. Mood: reassuring competence, Annie Leibovitz portrait sensibility, editorial not corporate.${ANTI_AI}
steuer-a|steuer/persona-a.jpg|4:5|19701203|Editorial photorealistic portrait of Michael, a grounded German tax adviser man in his early fifties, with attentive dark grey eyes, a broad forehead with a receding hairline accepted naturally, short salt-and-pepper hair, clean-shaven with a strong chin, fair weathered skin with genuine laugh lines, an open pragmatic expression, slight friendly smile. Wearing a soft mid-grey merino cardigan over a light blue oxford shirt with the collar open, no tie, reading glasses folded in his hand. Setting: seated at the meeting table of his small tax practice in a Swabian market town, a wall of neatly labelled ring binders softly out of focus behind him, a warm oak table surface catching light in the foreground. Lighting: warm afternoon daylight from a window camera left, soft shadows. Mood: the adviser small-business owners actually call, approachable and precise, Monocle-magazine warmth.${ANTI_AI}
steuer-b|steuer/persona-b.jpg|4:5|19680925|Editorial photorealistic portrait of Michael, a grounded German tax adviser man in his mid fifties, with steady blue-grey eyes framed by real crow's feet, a square face, neatly trimmed short grey beard, thinning grey hair combed back, fair skin with visible texture, a calm attentive expression conveying discretion. Wearing a dark green fine-corduroy jacket over a plain white shirt, no tie. Setting: standing in the doorway of his tax practice office, a corridor of daylight behind him, a wooden filing cabinet and a green plant in soft bokeh. Lighting: mixed daylight and warm interior light, natural contrast. Mood: trusted family adviser across two generations, Steve McCurry dignity, understated.${ANTI_AI}
zahnarzt-a|zahnarzt/persona-a.jpg|4:5|19850518|Editorial photorealistic portrait of Dr. Julia, a warm and reassuring German dentist woman in her late thirties, with clear light-brown eyes and an unforced genuine smile, softly rounded cheekbones, a small straight nose, dark brown hair tied back low with a few strands framing the face, fair skin with natural texture and subtle freckles across the nose, minimal makeup. Wearing a clean white medical tunic with a mandarin collar over a soft mint-green undershirt, no stethoscope, no gloves, no mask. Setting: her bright modern dental practice, a treatment chair softly out of focus behind her in pale grey and light oak, a large window with sheer curtain flooding the room. Lighting: abundant soft daylight, high-key and calm, very low contrast. Mood: the dentist a nervous patient would actually return to, unhurried and kind, editorial healthcare photography, no clinical coldness.${ANTI_AI}
zahnarzt-b|zahnarzt/persona-b.jpg|4:5|19900226|Editorial photorealistic portrait of Dr. Julia, a warm and reassuring German dentist woman in her early forties of subtle Northern-European heritage, with calm green eyes, high cheekbones, a soft attentive smile that reaches the eyes, ash-brown shoulder-length hair loosely tucked behind one ear, fair skin with real texture, no visible cosmetic procedures. Wearing a clean white practice tunic over a pale blue collar, a slim silver watch. Setting: standing at the reception of her bright dental practice, pale terrazzo counter and light oak panelling softly out of focus, a eucalyptus branch in a simple vase. Lighting: even soft daylight from a large window, airy and low-contrast. Mood: calm competence, warm not clinical, Annie Leibovitz sensibility applied to healthcare.${ANTI_AI}
elektro-a|elektro/wallbox-a.jpg|3:2|19940814|Photorealistic architectural detail photograph of a modern white wall-mounted electric vehicle charging station on the exterior rendered wall of a contemporary German single-family house, matte white housing with a subtle dark faceplate and a neatly coiled black charging cable on a wall hook beside it, clean surface-mounted cable conduit running down to a small grey junction box, immaculate installation with straight lines and even spacing. Foreground left: the rear quarter of a dark grey electric car softly out of focus. Setting: a tidy paved driveway, a strip of clipped lawn, late afternoon. Lighting: warm low sun raking across the rendered wall, long soft shadow of the charging unit, real texture in the render.${ANTI_AI_OBJEKT}
elektro-b|elektro/wallbox-b.jpg|3:2|19871130|Photorealistic architectural detail photograph of a modern anthracite wall-mounted electric vehicle charging station installed on the clean interior wall of a private German garage, dark matte housing with a coiled charging cable on a bracket, tidy surface conduit and a small distribution box above it, exposed light-grey concrete wall with real texture, polished concrete floor. Foreground: the charging port of a car in soft bokeh at the frame edge. Lighting: daylight falling through the open garage door from camera right, cool clean light with a warm exterior spill, real shadow detail.${ANTI_AI_OBJEKT}
EOF

generate_one() {
  local key="$1" out_path="$2" aspect="$3" seed="$4" prompt="$5"
  local full_out="$OUT_DIR/$out_path"
  mkdir -p "$(dirname "$full_out")"
  echo "[start] $key ($aspect, seed=$seed) -> $out_path"

  local payload create_response create_err prediction_id status latest_response
  payload=$(jq -n --arg p "$prompt" --arg a "$aspect" --argjson s "$seed" \
    '{input: {prompt: $p, aspect_ratio: $a, output_format: "jpg", raw: true, safety_tolerance: 2, seed: $s}}')
  create_response=$(curl -s --max-time 90 -X POST "$MODEL_ENDPOINT" \
    -H "Authorization: Bearer $REPLICATE_API_TOKEN" -H "Content-Type: application/json" \
    -H "Prefer: wait=60" -d "$payload")
  create_err=$(echo "$create_response" | jq -r '.detail // .error // empty' 2>/dev/null)
  [ -n "$create_err" ] && { echo "[fail] $key — create: $create_err"; return 1; }
  prediction_id=$(echo "$create_response" | jq -r '.id // empty')
  status=$(echo "$create_response" | jq -r '.status // empty')
  latest_response="$create_response"
  [ -z "$prediction_id" ] && { echo "[fail] $key — keine prediction-id"; return 1; }

  local poll_count=0
  while [ "$status" != "succeeded" ] && [ "$status" != "failed" ] && [ "$status" != "canceled" ]; do
    sleep 3; poll_count=$((poll_count + 1))
    [ "$poll_count" -gt 40 ] && { echo "[fail] $key — timeout"; return 1; }
    latest_response=$(curl -s --max-time 30 "https://api.replicate.com/v1/predictions/$prediction_id" \
      -H "Authorization: Bearer $REPLICATE_API_TOKEN")
    status=$(echo "$latest_response" | jq -r '.status // empty')
  done
  [ "$status" != "succeeded" ] && { echo "[fail] $key — status=$status"; return 1; }

  local img_url output_type
  output_type=$(echo "$latest_response" | jq -r '.output | type')
  if [ "$output_type" = "string" ]; then img_url=$(echo "$latest_response" | jq -r '.output')
  elif [ "$output_type" = "array" ]; then img_url=$(echo "$latest_response" | jq -r '.output[0]')
  else echo "[fail] $key — unerwarteter output-Typ"; return 1; fi
  [ -z "$img_url" ] && { echo "[fail] $key — keine Bild-URL"; return 1; }

  curl -s --max-time 120 -o "$full_out" "$img_url" || { echo "[fail] $key — download"; return 1; }
  local size_bytes
  size_bytes=$(stat -f %z "$full_out" 2>/dev/null || stat -c %s "$full_out")
  [ "${size_bytes:-0}" -lt 10000 ] && { echo "[fail] $key — Bild zu klein ($size_bytes)"; return 1; }
  echo "[done] $key -> $out_path ($size_bytes bytes)"
}

echo "$ITEMS_RAW" | while IFS='|' read -r key path aspect seed prompt; do
  [ -z "$key" ] && continue
  if [ -n "$ONLY_KEYS" ]; then echo " $ONLY_KEYS " | grep -q " $key " || continue; fi
  retries=0
  until generate_one "$key" "$path" "$aspect" "$seed" "$prompt"; do
    retries=$((retries + 1))
    [ "$retries" -ge 2 ] && { echo "[abort] $key"; break; }
    echo "[retry $retries/2] $key in 10s ..."; sleep 10
  done
  sleep 2
done

echo "FERTIG. Kuration liegt in: $OUT_DIR"
