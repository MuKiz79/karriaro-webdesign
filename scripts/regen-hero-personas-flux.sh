#!/usr/bin/env bash
# Sprint 21 — Hero-Persona-Re-Gen via Flux 1.1 Pro Ultra (Replicate)
# Andreas-Niveau Photorealismus: natürliche Haut, echte Augen, no AI-glow

set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
[ -f "$REPO_ROOT/.env.local" ] && { set -a; . "$REPO_ROOT/.env.local"; set +a; }
[ -z "${REPLICATE_API_TOKEN:-}" ] && { echo "FEHLER: REPLICATE_API_TOKEN nicht gesetzt."; exit 1; }
OUT_DIR="$REPO_ROOT/src/images"
MODEL_ENDPOINT="https://api.replicate.com/v1/models/black-forest-labs/flux-1.1-pro-ultra/predictions"

# Optional: einzelne Personas via Argument generieren (z.B. `bash regen-hero-personas-flux.sh friseur restaurant`)
ONLY_KEYS="${*:-}"

# Anti-KI Suffix (gilt für alle Prompts)
ANTI_AI=" Photographic style: shot on Canon EOS R5 with 85mm f/1.4 lens, three-quarter portrait, rule of thirds composition, slight off-center framing, natural skin texture with visible pores and real wrinkles, no airbrushing, natural eye reflections, real eyelashes, slight facial asymmetry, soft natural window light, real depth of field bokeh, photorealistic editorial business portrait. Constraints: absolutely no text, no logos, no readable signs, no brand markings, no airbrushed plastic skin, no overly symmetric face, no studio strobe, natural color grading."

read -r -d '' ITEMS_RAW <<EOF || true
friseur|friseur/persona.jpg|4:5|Editorial photorealistic portrait of Laura Müller, a calm professional German hair salon owner woman in her early forties with shoulder-length dark brown straight hair in a simple middle parting, warm friendly expression with subtle natural smile, minimal natural makeup, very small discreet tattoo barely visible on her wrist, no flashy jewelry. Wearing a black canvas hairdresser apron over a plain black t-shirt, professional hair shears in a discreet hip holster. Setting: standing inside her premium boutique hair salon in a major German city (Berlin-Mitte or Düsseldorf-Carlstadt vibe), warm walnut wood paneled mirror stations softly blurred in the background, a vintage Belmont barber chair partially visible in bokeh, a small eucalyptus branch on a console. Lighting: warm soft window light from the left side, gentle bokeh on the salon interior behind her. Mood: confident craft, premium atelier feel, not mass market.${ANTI_AI}
dachdecker|dachdecker/persona.jpg|4:5|Editorial photorealistic portrait of Thomas Berger, a weathered German master roofer man in his mid fifties with short salt-and-pepper hair, weather-beaten tanned skin with real lines and character around the eyes, calm grounded expression, looking directly at the camera with quiet confidence. Wearing a clean dark navy work vest with very subtle embroidery (logo unreadable and blurred), under it a grey work shirt, grey corduroy work trousers, no helmet visible. Setting: standing in front of his family roofing business in a small German town (Münsterland or Schwäbisch-Gmünd vibe), aged slate stone facade with real weathered patina behind him, half-open workshop door softly blurred in bokeh, a neat stack of natural slate tiles in the foreground for depth. Lighting: warm golden hour late afternoon light from camera left, long natural shadow raster across the slate surface. Mood: 3rd generation craftsmanship, honest premium handwork, no marketing gloss.${ANTI_AI}
praxis|praxis/persona.jpg|4:5|Editorial photorealistic portrait of Dr. Sarah Weber, a calm warm German female general practitioner physician in her late forties with medium-blonde shoulder-length hair, discreet thin metal-frame glasses, friendly composed expression with subtle competence smile. Wearing a clean white doctor coat worn unbuttoned and open over a dark navy blouse, a thin delicate gold chain, no stethoscope around her neck. Setting: standing in the reception area of her modern German Altbau practice with a warm walnut wood reception counter softly out of focus, a large Monstera plant and an eucalyptus branch in bokeh, hints of restored ceiling stucco overhead. Lighting: warm soft daylight pouring through a large practice window from camera right, gentle bokeh in the interior. Mood: trustworthy modern doctor, warm but professional, not sterile clinic.${ANTI_AI}
restaurant|restaurant/persona.jpg|4:5|Editorial photorealistic portrait of Andreas Bauer, a German head chef restaurant owner man in his late forties with short brown hair and a neatly trimmed short full beard, sturdy build with real character, focused friendly expression looking at the camera. Wearing a spotless white double-breasted chef's jacket with rolled-up sleeves, a discreet service cloth tucked over one shoulder, no toque hat. Setting: standing at the stainless steel pass in a busy professional restaurant kitchen, stainless steel pass softly out of focus in the foreground, warm overhead heat lamps glowing in the background, two kitchen brigade cooks in soft bokeh suggesting motion behind him. Lighting: warm tungsten kitchen overheads mixed with cool window bounce light from the left. Mood: Swabian traditional Gasthaus with real brigade, honest craft, no star-restaurant theatrics.${ANTI_AI}
sanitaer|sanitaer/persona.jpg|4:5|Editorial photorealistic portrait of Stefan Müller, a German master plumber heating installer man in his late forties with short brown hair, clean-shaven or very short stubble, friendly grounded expression looking directly at the camera with quiet competence. Wearing a premium dark navy work overall (Engelbert-Strauss premium style cut, no readable branding), a folded measuring tape clipped on his belt, clean visible hands with two fingers naturally interlaced at waist level. Setting: standing in front of his own family workshop, a meticulously ordered workbench softly out of focus behind him, premium hand tools neatly hung on a workshop wall in bokeh. Lighting: cool clean daylight from a workshop window mixed with warm workshop overhead light. Mood: premium Mittelstand craftsmanship, punctual master quality, no dirty cliché.${ANTI_AI}
spedition|spedition/persona.jpg|4:5|Editorial photorealistic portrait of Robert Schwaben, a German family-business freight forwarder managing director man in his late fifties with dark hair lightly graying at the temples, calm authoritative expression with subtle smile, looking directly at the camera. Wearing a dark charcoal sport jacket without tie, crisp white shirt with collar open, business smart casual. Setting: standing at the gravel yard of his own logistics company in front of the brick administrative building, two large freight trucks softly blurred in the background bokeh (one 40-ton tractor unit and one swap-body truck, no readable logos), late afternoon. Lighting: real golden hour sunlight from camera left, long warm side light, soft natural bokeh. Mood: third-generation family freight forwarder, personal responsibility, not a faceless corporate logistics group.${ANTI_AI}
coaching|coaching/persona.jpg|4:5|Editorial photorealistic portrait of Sarah Lehmann, a confident German female premium business coach woman in her early forties with sleek straight dark shoulder-length bob hair, subtle natural makeup, warm yet sovereign expression looking directly at the camera. Wearing a tailored black blazer over a crisp ivory silk shell top, small discreet pearl ear studs, no other jewelry. Setting: standing in her premium Frankfurt office in the Bockenheim district with floor-to-ceiling windows, the Frankfurt skyline softly blurred in golden hour bokeh behind her, warm window light flooding the room. Lighting: soft golden hour light from the floor-to-ceiling windows on camera left, real natural depth of field. Mood: discreet Frankfurt top-tier executive coaching, C-level clientele, not self-help industry.${ANTI_AI}
EOF

generate_one() {
  local key="$1" out_path="$2" aspect="$3" prompt="$4"
  local full_out="$OUT_DIR/$out_path"
  mkdir -p "$(dirname "$full_out")"

  echo "[start] $key ($aspect) → $out_path"

  # 1. Prediction starten
  local payload
  payload=$(jq -n --arg p "$prompt" --arg a "$aspect" '{input: {prompt: $p, aspect_ratio: $a, output_format: "jpg", raw: true, safety_tolerance: 2}}')

  local create_response
  create_response=$(curl -s --max-time 60 -X POST "$MODEL_ENDPOINT" \
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

  # 2. Polling falls noch nicht fertig (Prefer: wait=60 hat schon bis zu 60s gewartet)
  local poll_count=0
  while [ "$status" != "succeeded" ] && [ "$status" != "failed" ] && [ "$status" != "canceled" ]; do
    sleep 3
    poll_count=$((poll_count + 1))
    if [ "$poll_count" -gt 40 ]; then
      echo "[fail] $key — timeout (>2 Min Polling)"
      return 1
    fi
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

  # 3. Output URL holen (output kann string oder array sein) + JPG runterladen
  local img_url output_type
  output_type=$(echo "$latest_response" | jq -r '.output | type')
  if [ "$output_type" = "string" ]; then
    img_url=$(echo "$latest_response" | jq -r '.output')
  elif [ "$output_type" = "array" ]; then
    img_url=$(echo "$latest_response" | jq -r '.output[0]')
  else
    echo "[fail] $key — output type unexpected: $output_type"
    return 1
  fi
  [ -z "$img_url" ] || [ "$img_url" = "null" ] && { echo "[fail] $key — keine output-url"; return 1; }

  curl -s --max-time 60 "$img_url" -o "$full_out"
  local size_bytes
  size_bytes=$(stat -f %z "$full_out" 2>/dev/null || stat -c %s "$full_out")
  [ "${size_bytes:-0}" -lt 10000 ] && { echo "[fail] $key — downloaded image too small ($size_bytes bytes)"; return 1; }
  echo "[done] $key → $out_path ($size_bytes bytes)"
}

# Sequenzielle Verarbeitung mit Retry
echo "$ITEMS_RAW" | while IFS='|' read -r key path aspect prompt; do
  [ -z "$key" ] && continue

  # Filter falls Argumente übergeben
  if [ -n "$ONLY_KEYS" ]; then
    if ! echo " $ONLY_KEYS " | grep -q " $key "; then
      continue
    fi
  fi

  retries=0
  until generate_one "$key" "$path" "$aspect" "$prompt"; do
    retries=$((retries + 1))
    if [ "$retries" -ge 2 ]; then
      echo "[abort] $key — nach 2 Retries"
      break
    fi
    echo "[retry $retries/2] $key in 10s …"
    sleep 10
  done
  sleep 2
done

echo "FERTIG."
