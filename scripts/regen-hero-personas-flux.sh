#!/usr/bin/env bash
# Sprint 21 / 61 — Hero-Persona-Re-Gen via Flux 1.1 Pro Ultra (Replicate)
# Andreas-Niveau Photorealismus + Sprint-61 Hard-Variety:
#   - eigene Seeds pro Persona (latent-space-Variety)
#   - ethnische Archetypen + Face-Anchors (eye/jaw/hair specifics)
#   - Fotograf-Style-Referenzen pro Persona

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

# Format: key|path|aspect|seed|prompt
read -r -d '' ITEMS_RAW <<EOF || true
friseur|friseur/persona.jpg|4:5|19710604|Editorial photorealistic portrait of Laura, a strikingly beautiful Italian-German hair salon owner woman in her early forties of subtle Mediterranean heritage, with warm amber-hazel eyes, defined high cheekbones, full natural lips with a soft natural Cupid's bow, oval face shape, voluminous shoulder-length espresso-brown wavy hair with subtle warm copper highlights, healthy olive-warm skin with no visible cosmetic procedures, minimal natural editorial makeup. Wearing a tailored black canvas hairdresser apron over a soft charcoal merino t-shirt, professional Joewell hair shears in a discreet leather hip holster. Setting: standing inside her premium Düsseldorf-Carlstadt atelier-salon, warm walnut paneled mirror stations softly blurred behind her, vintage Belmont barber chair in bokeh, eucalyptus branch on a console, polished concrete floor. Lighting: warm soft window light from the left, gentle interior bokeh. Mood: refined atelier craftswoman, Ellen von Unwerth fashion-editorial warmth, Monocle-magazine sensibility.${ANTI_AI}
dachdecker|dachdecker/persona.jpg|4:5|19680319|Editorial photorealistic portrait of Thomas, a rugged distinguished German master roofer man in his mid fifties of South-German Swabian heritage, with intense steel-blue eyes framed by deep crow's feet, strong square jawline with a hint of a broken nose, prominent brow ridge, full short pepper-grey hair with darker temples, three-day grey-flecked stubble, weathered tanned complexion with real character lines from outdoor work. Wearing a clean dark navy work vest with very subtle embroidery (logo unreadable and blurred), under it a clean grey work shirt, sturdy grey work trousers, no helmet visible. Setting: standing in front of his family roofing workshop in the Stuttgart hills, aged slate stone facade with real weathered patina behind him, neat stack of natural slate tiles in the foreground for depth. Lighting: warm golden hour late afternoon light from camera left, long natural shadow raster across the slate surface. Mood: dignified third-generation master craftsman, Peter Hurley headshot precision, premium handwork.${ANTI_AI}
praxis|praxis/persona.jpg|4:5|19741128|Editorial photorealistic portrait of Dr. Sarah, a strikingly intelligent Scandinavian-German general practitioner woman in her late forties of subtle Northern-European heritage, with clear ice-blue eyes radiating composure, sharp angular Nordic features with high cheekbones, refined narrow nose, defined collarbone visible, ash-blonde modern pixie-bob hairstyle cropped just below the ears with side-swept fringe, fair healthy skin with subtle natural makeup, thin tortoiseshell-acetate glasses (not metal frame), composed knowing smile. Wearing a clean white doctor coat worn open over a fine dark navy silk blouse, a delicate gold chain, no stethoscope around her neck. Setting: reception of her premium Munich Altbau practice, warm walnut reception counter softly out of focus, a Monstera plant and eucalyptus branch in bokeh, restored ceiling stucco overhead. Lighting: warm soft daylight from a large practice window from camera right, gentle interior bokeh. Mood: trustworthy upscale physician, Annie Leibovitz Vanity-Fair-portrait sensibility, warm yet polished.${ANTI_AI}
restaurant|restaurant/persona.jpg|4:5|19750212|Editorial photorealistic portrait of Andreas, a charismatic handsome Greek-German head chef restaurant owner man in his late forties of subtle Mediterranean heritage, with deep soulful dark-brown eyes, an aquiline nose, strong defined jawline, full well-groomed dark short beard with hints of grey at the chin, dark almost-black hair short on the sides with slightly longer length on top in a clean fade cut, warm olive-tan complexion with real character lines, focused intelligent expression with quiet confidence. Wearing a spotless white double-breasted chef's jacket with rolled-up sleeves revealing toned forearms, a discreet linen service cloth tucked over one shoulder, no toque hat. Setting: standing at the stainless steel pass in a premium Munich-Schwabing restaurant kitchen, stainless steel pass softly out of focus in the foreground, warm overhead heat lamps glowing, two kitchen brigade cooks in soft bokeh suggesting motion behind him. Lighting: warm tungsten kitchen overheads mixed with cool window bounce light from the left. Mood: refined Slow-Food chef-patron, Mario Testino GQ-magazine portrait, premium not theatrical.${ANTI_AI}
sanitaer|sanitaer/persona.jpg|4:5|19720618|Editorial photorealistic portrait of Stefan, a dignified handsome Turkish-German master plumber man in his late forties of subtle Anatolian heritage, with warm dark-brown eyes radiating quiet intelligence, prominent dark eyebrows, a strong defined jawline, three-day dark stubble, short black hair with subtle grey at the temples kept neat and modern, warm olive complexion with healthy character lines, friendly grounded expression with confident competence. Wearing a premium dark navy work overall (Engelbert-Strauss premium cut, no readable branding), a folded measuring tape clipped on his belt, clean visible hands with two fingers naturally interlaced at waist level. Setting: front of his own family workshop in Stuttgart, meticulously ordered workbench softly out of focus behind him, premium hand tools neatly hung on a workshop wall in bokeh, polished concrete floor. Lighting: cool clean daylight from a workshop window mixed with warm workshop overhead light. Mood: premium Mittelstand master, Steve McCurry dignified-portrait sensibility, upscale Handwerk.${ANTI_AI}
spedition|spedition/persona.jpg|4:5|19661014|Editorial photorealistic portrait of Robert, a distinguished Polish-German family-business freight forwarder managing director man in his late fifties of subtle Eastern-European heritage, with sharp pale-blue eyes radiating earned authority, long face with prominent forehead, clean-shaven, completely silver-grey short hair cut short and neat with a subtle receding hairline accepted as part of dignified character, weathered fair-tan skin with refined character lines, calm authoritative expression with subtle smile. Wearing a dark charcoal sport jacket cut with sharp lines but no tie, crisp white shirt with collar open, business smart casual that signals quiet wealth. Setting: gravel yard of his Stuttgart logistics company in front of the brick administrative building, two large freight trucks softly blurred in the background bokeh (one 40-ton tractor unit and one swap-body truck, no readable logos), late afternoon. Lighting: real golden hour sunlight from camera left, long warm side light, soft natural bokeh. Mood: third-generation patriarch, Helmut Newton Monocle-publisher portrait, distinguished but never corporate.${ANTI_AI}
coaching|coaching/persona.jpg|4:5|19810727|Editorial photorealistic portrait of Sarah, a strikingly elegant Russian-German premium business coach woman in her early forties of subtle Slavic heritage, with intense steel-grey eyes radiating quiet authority, high prominent Slavic cheekbones, sharp angular jawline, defined Cupid's-bow lips, rich auburn-chestnut shoulder-length hair styled with a clean side-part and natural movement and subtle waves (not a sleek bob), fair porcelain complexion with subtle editorial makeup, warm yet sovereign expression. Wearing a precisely tailored black blazer over a crisp ivory silk shell top, small discreet pearl ear studs, no other jewelry. Setting: standing in her premium Frankfurt office in the Bockenheim district with floor-to-ceiling windows, the Frankfurt skyline softly blurred in golden hour bokeh behind her, warm window light flooding the room, polished oak floor. Lighting: soft golden hour light from the floor-to-ceiling windows on camera left, real natural depth of field. Mood: discreet top-tier executive coaching for C-level clientele, Annie Leibovitz Vogue-Business-cover sensibility, magazine-cover poise.${ANTI_AI}
EOF

generate_one() {
  local key="$1" out_path="$2" aspect="$3" seed="$4" prompt="$5"
  local full_out="$OUT_DIR/$out_path"
  mkdir -p "$(dirname "$full_out")"

  echo "[start] $key ($aspect, seed=$seed) → $out_path"

  # 1. Prediction starten
  local payload
  payload=$(jq -n --arg p "$prompt" --arg a "$aspect" --argjson s "$seed" '{input: {prompt: $p, aspect_ratio: $a, output_format: "jpg", raw: true, safety_tolerance: 2, seed: $s}}')

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
echo "$ITEMS_RAW" | while IFS='|' read -r key path aspect seed prompt; do
  [ -z "$key" ] && continue

  # Filter falls Argumente übergeben
  if [ -n "$ONLY_KEYS" ]; then
    if ! echo " $ONLY_KEYS " | grep -q " $key "; then
      continue
    fi
  fi

  retries=0
  until generate_one "$key" "$path" "$aspect" "$seed" "$prompt"; do
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
