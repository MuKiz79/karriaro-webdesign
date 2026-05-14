#!/usr/bin/env bash
# Sprint 8 — Bulk-KI-Bild-Generator via Replicate FLUX 1.1 Pro
#
# Liest Prompts aus dem Heredoc unten (branche|pfad|aspect|prompt) und generiert
# jedes Bild ueber die Replicate-API. Bereits vorhandene Bilder (>15 KB) werden
# uebersprungen, damit das Skript reproduzierbar nachladbar bleibt.
#
# Token-Quelle: .env.local im Repo-Root (REPLICATE_API_TOKEN=r8_...).
# Branchen-Stil-Anker werden vor jeden Prompt gesetzt fuer visuelle Konsistenz.
# Parallelisierung: 4 gleichzeitige Predictions per Background-Job.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$REPO_ROOT/.env.local"

if [ -f "$ENV_FILE" ]; then
  # shellcheck disable=SC1090
  set -a; . "$ENV_FILE"; set +a
fi

if [ -z "${REPLICATE_API_TOKEN:-}" ]; then
  echo "FEHLER: REPLICATE_API_TOKEN nicht gesetzt."
  echo "Bitte $ENV_FILE anlegen mit einer Zeile:"
  echo "  REPLICATE_API_TOKEN=r8_xxx"
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "FEHLER: jq nicht installiert. brew install jq"
  exit 1
fi

OUT_DIR="$REPO_ROOT/src/images"
mkdir -p \
  "$OUT_DIR/dachdecker" \
  "$OUT_DIR/friseur" \
  "$OUT_DIR/sanitaer" \
  "$OUT_DIR/praxis" \
  "$OUT_DIR/restaurant" \
  "$OUT_DIR/spedition" \
  "$OUT_DIR/immobilien"

# --- Style-Anker pro Branche (kommt vor jeden Prompt) ---
style_for() {
  case "$1" in
    dachdecker) echo "Documentary German roofing craftmanship photography, natural daylight, authentic weathered materials, no people in frame, no text, photorealistic, premium editorial composition" ;;
    friseur)    echo "Editorial salon photography, Vogue-inspired, soft warm window light, aubergine-rose-burgundy color palette, marble surfaces, brass details, slightly desaturated film tone, premium aesthetic, no people identifiable, no text" ;;
    sanitaer)   echo "Modern German bathroom and heating photography, clean composition, natural daylight, minimal aesthetic, real ceramic and chrome materials, premium fixtures, no people, no text" ;;
    praxis)     echo "Modern German medical practice interior photography, calm clinical aesthetic, soft natural light, light wood and white, contemporary German healthcare design, no people, no text, no signage" ;;
    restaurant) echo "Fine dining food and interior photography, dark moody background, warm tungsten and candlelight, rustic Bavarian-Italian inn ambiance, plated dish hero shot, high detail, no text" ;;
    spedition)  echo "Industrial logistics photography, modern German trucking fleet, clean composition, daylight, professional commercial vehicle, no visible brand logos, no people, no text" ;;
    immobilien) echo "Premium real estate photography, Engel & Voelkers / Architectural Digest aesthetic, golden hour interior, high-end materials, no people, no text" ;;
    coaching)   echo "Editorial workspace photography for premium business coach, anthracite and warm gold palette, soft window light, walnut and leather textures, no people, no text" ;;
    *)          echo "Photorealistic editorial photography, no people, no text" ;;
  esac
}

REPLICATE_URL="https://api.replicate.com/v1/models/black-forest-labs/flux-1.1-pro/predictions"

generate_one() {
  local branche="$1" path="$2" aspect="$3" prompt="$4"
  local full="$OUT_DIR/$path"

  # Skip falls schon da und >15 KB
  if [ -f "$full" ]; then
    local size
    size=$(stat -f%z "$full" 2>/dev/null || stat -c%s "$full" 2>/dev/null || echo 0)
    if [ "${size:-0}" -gt 15000 ]; then
      echo "[skip] $path (${size}B existiert)"
      return 0
    fi
  fi

  local prefix; prefix="$(style_for "$branche")"
  local full_prompt="${prefix}. ${prompt}"

  local body
  body=$(jq -nc \
    --arg p "$full_prompt" \
    --arg a "$aspect" \
    '{input: {prompt: $p, aspect_ratio: $a, output_format: "jpg", output_quality: 92, safety_tolerance: 2, prompt_upsampling: true}}')

  local resp
  resp=$(curl -sS -X POST "$REPLICATE_URL" \
    -H "Authorization: Bearer $REPLICATE_API_TOKEN" \
    -H "Content-Type: application/json" \
    -d "$body")

  local pred_id
  pred_id=$(echo "$resp" | jq -r '.id // empty')
  if [ -z "$pred_id" ]; then
    echo "[FAIL] $path — kein prediction-id" >&2
    echo "       $resp" >&2
    return 1
  fi

  echo "[start] $path  pred=$pred_id"

  local poll output_url="" status=""
  for _ in $(seq 1 90); do
    sleep 2
    poll=$(curl -sS --no-progress-meter -H "Authorization: Bearer $REPLICATE_API_TOKEN" \
      "https://api.replicate.com/v1/predictions/$pred_id" 2>/dev/null)
    status=$(echo "$poll" | jq -r '.status // "unknown"' 2>/dev/null)
    case "$status" in
      succeeded)
        output_url=$(echo "$poll" | jq -r '.output | if type == "array" then .[0] else . end' 2>/dev/null)
        break
        ;;
      failed|canceled)
        echo "[FAIL] $path — status=$status" >&2
        echo "       $(echo "$poll" | jq -r '.error // "no detail"' 2>/dev/null)" >&2
        return 1
        ;;
    esac
  done

  if [ -z "$output_url" ] || [ "$output_url" = "null" ]; then
    echo "[FAIL] $path — timeout" >&2
    return 1
  fi

  curl -sSL -o "$full" "$output_url"
  local size
  size=$(stat -f%z "$full" 2>/dev/null || stat -c%s "$full" 2>/dev/null || echo 0)
  if [ "${size:-0}" -lt 5000 ]; then
    echo "[FAIL] $path — Datei zu klein ($size B)" >&2
    rm -f "$full"
    return 1
  fi
  echo "[ok] $path → ${size}B"
}

# --- Items: branche|pfad|aspect|prompt --------------------------------------

read -r -d '' ITEMS_RAW <<'EOF' || true
# DACHDECKER (9)
dachdecker|dachdecker/drohne-poster.jpg|16:9|Aerial drone view of a Stuttgart residential roof, terracotta red clay tiles in even neat rows, blue sky, late afternoon shadows, partial view of dormer windows and brick chimney
dachdecker|dachdecker/vorher-1-moos.jpg|1:1|Close-up of weathered old roof tiles heavily covered in green moss and dark lichen, gray gloomy day, signs of age and decades of neglect
dachdecker|dachdecker/nachher-1-neueindeckung.jpg|1:1|Same roof angle after restoration, clean new dark anthracite-gray clay tiles in perfect even rows, freshly mortared ridge, daylight clarity
dachdecker|dachdecker/vorher-2-sturm.jpg|1:1|Storm-damaged residential roof, several broken and missing terracotta tiles, blue tarp visible underneath, debris around the gutter, overcast sky
dachdecker|dachdecker/nachher-2-repariert.jpg|1:1|Fully repaired German roof with matching new clay tiles, neat geometry, restored copper gutter, bright daylight
dachdecker|dachdecker/vorher-3-pv-leer.jpg|1:1|Empty south-facing residential roof with traditional red clay tiles, prepared for solar installation, no panels yet
dachdecker|dachdecker/nachher-3-pv-indach.jpg|1:1|Same roof now fitted with sleek black integrated in-roof photovoltaic panels flush with the tile line, modern premium installation
dachdecker|dachdecker/video-poster-1.jpg|16:9|Cinematic close-up of a skilled craftsman's hands placing a clay tile on a wood roof batten, golden hour light, documentary photography
dachdecker|dachdecker/video-poster-2.jpg|16:9|Wide cinematic landscape of a Stuttgart neighborhood with restored rooftops in evening sun, vineyards on hills, warm sunset light

# SANITAER (6)
sanitaer|sanitaer/vorher-1-bad.jpg|1:1|Old 1980s German bathroom with dated yellow tiles, worn ceramic fixtures, dim lighting, lived-in but tired
sanitaer|sanitaer/nachher-1-bad.jpg|1:1|Same bathroom fully renovated with modern matte black fixtures, large-format light gray tiles, walk-in shower, premium chrome details, bright daylight
sanitaer|sanitaer/vorher-2-oelheizung.jpg|1:1|German cellar room with old beige oil-fired heating boiler, large green oil tank, dusty pipes, weathered service stickers
sanitaer|sanitaer/nachher-2-waermepumpe.jpg|1:1|Same cellar with a sleek modern heat pump unit, clean white casing, neatly insulated copper pipes, organized installation
sanitaer|sanitaer/vorher-3-dach.jpg|1:1|Bare south-facing residential roof with terracotta tiles, prepared for solar, no panels yet, clear daylight
sanitaer|sanitaer/nachher-3-pv.jpg|1:1|Same roof now covered with sleek black PV panels in a neat grid, integrated mounting, modern German installation

# PRAXIS (8)
praxis|praxis/empfang.jpg|3:2|Modern Munich medical practice reception, light oak counter, acrylic logo letters faintly visible, plants, warm afternoon light, calm welcoming atmosphere
praxis|praxis/wartezimmer.jpg|3:2|Calm waiting area with light wood benches, upholstered cushions in muted dusty blue, reading lamp, small bookshelf, large window with sheer curtains
praxis|praxis/behandlungszimmer.jpg|3:2|Bright examination room with light wood medical bench, modern blood pressure unit on the wall, framed botanical print, calm aesthetic, uncluttered
praxis|praxis/ekg-raum.jpg|3:2|ECG examination room with sleek modern monitor on rolling cart, examination bed with crisp white linen, light wood cabinetry, soft daylight
praxis|praxis/labor.jpg|3:2|Small in-house lab corner with light gray countertop, centrifuge and microscope, neat instrument tray, clinical yet warm
praxis|praxis/news-grippe.jpg|4:3|Editorial flat-lay: clear glass of water, lemon slice, fresh ginger root, modern thermometer, soft handkerchief, calm warm light
praxis|praxis/news-erkaeltung.jpg|4:3|Cozy autumn flat-lay: warm tea cup, honey jar with wooden dipper, cinnamon sticks, knit fabric corner, soft window light
praxis|praxis/news-reisemedizin.jpg|4:3|Travel medicine flat-lay: vaccination card, German passport, vintage compass, small travel atlas, soft daylight

# SPEDITION (8)
spedition|spedition/flotte-sattelzug.jpg|4:3|Modern white Mercedes-Benz Actros 40-ton semi-truck parked at a German logistics terminal, clean side profile, daylight, no visible brand logos
spedition|spedition/flotte-wechselbruecke.jpg|4:3|Swap-body truck with detachable container unit, modern German logistics fleet, clean composition, daylight
spedition|spedition/flotte-kuehl.jpg|4:3|Refrigerated truck with cooling unit on top, clean white body, parked at distribution center, daylight, no logos
spedition|spedition/flotte-sprinter.jpg|4:3|Modern white Mercedes-style Sprinter express delivery van, clean composition, urban logistics setting, daylight
spedition|spedition/flotte-haenger.jpg|4:3|Curtain-sider trailer truck combination, modern German logistics fleet, side profile, daylight
spedition|spedition/flotte-container.jpg|4:3|Container chassis truck with a 40-foot shipping container, port-style logistics yard, neat composition, daylight
spedition|spedition/flotte-adr.jpg|4:3|Specialised hazardous goods (ADR) tanker truck with orange placards, professional industrial logistics, daylight
spedition|spedition/flotte-elkw.jpg|4:3|Modern electric truck with charging cable, sleek aerodynamic design, clean industrial logistics setting, sustainable mobility, daylight

# IMMOBILIEN (3)
immobilien|immobilien/video-poster-1.jpg|16:9|Cinematic still of premium Stuttgart villa exterior at golden hour, light limestone facade, manicured garden, large windows, architectural digest aesthetic
immobilien|immobilien/video-poster-2.jpg|16:9|Cinematic interior still of luxury German loft, herringbone parquet, designer pendant lighting, large window with warm afternoon light, premium minimalism
immobilien|immobilien/video-poster-3.jpg|16:9|Cinematic still of premium kitchen island with marble countertop, brass tap, designer pendant, soft afternoon light, architectural digest style

# FRISEUR (16)
friseur|friseur/salon-empfang.jpg|16:9|Editorial salon reception area, polished marble counter with brass details, Aveda-style product display wall in warm botanical tones, soft afternoon window light, hardwood floor, plant accent
friseur|friseur/stuhl-tageslicht.jpg|3:2|Single sculpted styling chair beside floor-to-ceiling window, large mirror, brass arm details, marble counter with neatly arranged scissors, soft daylight
friseur|friseur/wasch-lounge.jpg|3:2|Wash lounge with two reclined backwash stations in deep aubergine leather, ambient lighting, eucalyptus plants, calm spa-like atmosphere
friseur|friseur/coloration.jpg|3:2|Hands-only view mixing color in a brass bowl beside salon counter, glass bottles of botanical hair products, golden marble surface, premium feeling
friseur|friseur/brautstyling.jpg|3:2|Backstage bridal styling moment, hands arranging a delicate hair pin on an updo, soft natural window light, white silk fabric, no face visible
friseur|friseur/profile-sk-1-vorher.jpg|1:1|Hairbrush full of split-end mid-length hair on a marble surface, before-treatment frustration mood, soft morning light
friseur|friseur/profile-sk-1-nachher.jpg|1:1|Same brush now clean with glossy healthy hair strand, after-treatment glow, same lighting
friseur|friseur/profile-sk-2-analyse.jpg|1:1|Scalp analysis tool extended over a sectioned hairline, brass instrument, marble surface, scientific yet editorial
friseur|friseur/profile-sk-2-nachher.jpg|1:1|Healthy scalp visible through carefully parted hair, no inflammation, soft natural light
friseur|friseur/profile-sk-3-vorher.jpg|1:1|Overgrown untidy mid-length blonde hair section being held before cutting, neutral background
friseur|friseur/profile-sk-3-nachher.jpg|1:1|Same hair after a precise shaped cut, fresh blunt ends, polished editorial finish
friseur|friseur/news-sommer-trends.jpg|4:3|Editorial summer hair trend mood shot: sun-kissed blonde balayage strand on marble, eucalyptus and light gold tones
friseur|friseur/news-aveda.jpg|4:3|Aveda full-spectrum color line of glass bottles in warm botanical hues, marble counter, soft window light
friseur|friseur/news-brautsaison.jpg|4:3|Bridal hair accessories on white silk: delicate pearl pin, fresh white peonies, brass mirror corner, soft window light
friseur|friseur/video-poster-1.jpg|16:9|Cinematic still of editorial salon interior at golden hour, soft window light, marble and brass, premium aesthetic
friseur|friseur/video-poster-2.jpg|16:9|Cinematic still of hands working at a styling chair, scissors mid-cut, soft focus, premium editorial film tone

# RESTAURANT (18)
restaurant|restaurant/menu-carpaccio.jpg|1:1|Beef carpaccio plated minimally on dark slate, thin slices with rocket leaves, parmesan curls, olive oil sheen, candlelight ambience
restaurant|restaurant/menu-tatar.jpg|1:1|Steak tatar quenelle on dark plate with quail egg yolk, capers, onion brunoise, sourdough toast, moody candlelight
restaurant|restaurant/menu-suppe.jpg|1:1|Clear consomme in a vintage porcelain bowl with delicate herbs floating, dark wood table, warm tungsten light
restaurant|restaurant/menu-lachs.jpg|1:1|Pan-seared salmon fillet on dark plate, seasonal vegetables, beurre blanc drizzle, fine dining presentation, warm light
restaurant|restaurant/menu-schmorbraten.jpg|1:1|Rich braised beef cheek on dark plate, glossy reduction sauce, root vegetable garnish, rustic Bavarian fine dining
restaurant|restaurant/menu-schnitzel.jpg|1:1|Classic Wiener Schnitzel, golden crispy crust, lemon wedge, parsley sprig, lingonberry compote, candlelit table
restaurant|restaurant/menu-risotto.jpg|1:1|Saffron risotto in a deep plate, parmesan shavings, micro herbs, glossy texture, warm tungsten light
restaurant|restaurant/menu-fisch.jpg|1:1|Whole seared char fish on dark plate, lemon wedges, herb butter, fine-dining plating, candlelight
restaurant|restaurant/menu-gnocchi.jpg|1:1|Handmade gnocchi with sage butter and parmesan, deep dark plate, browned sage leaves, warm intimate light
restaurant|restaurant/menu-ente.jpg|1:1|Sliced duck breast with cherry sauce, red cabbage, seasonal garnish, dark elegant plating, candlelit
restaurant|restaurant/menu-kaiserschmarrn.jpg|1:1|Traditional Kaiserschmarrn dessert, fluffy torn pancake pieces with powdered sugar, plum compote on the side, vintage pan, warm light
restaurant|restaurant/menu-sorbet.jpg|1:1|Elegant scoop of berry sorbet in a chilled crystal coupe, edible flower garnish, dark moody background
restaurant|restaurant/galerie-hauptraum.jpg|16:9|Restaurant main dining room interior, exposed wooden beams, candlelit tables, antique chandeliers, dark wood paneling, warm intimate atmosphere
restaurant|restaurant/galerie-tisch.jpg|4:3|Beautifully set restaurant table, crisp linen tablecloth, polished crystal glasses, candle, fresh flowers, fine porcelain, intimate light
restaurant|restaurant/galerie-weinkarte.jpg|4:3|Leather-bound wine menu on dark wood table, glass of red wine beside it, candlelight, atmospheric
restaurant|restaurant/galerie-kueche.jpg|16:9|Pristine professional restaurant kitchen interior, polished stainless steel, copper pots hanging, gas range, plating station, dramatic side light
restaurant|restaurant/galerie-terrasse.jpg|16:9|Restaurant terrace at golden hour, vine-covered pergola, candlelit tables with linen, intimate outdoor dining, warm summer evening
restaurant|restaurant/galerie-detail.jpg|4:3|Detail shot of restaurant interior: brass candle holder with lit candle, edge of antique mirror, dark wood table corner, warm intimate light

# COACHING (1 — Hauptseite-Switcher Bonus)
coaching|coaching-lehmann-mockup.jpg|16:9|Editorial workspace for a premium business coach: walnut desk with leather journal, brass pen, single white orchid stem, anthracite-and-gold color palette, soft window light, no people, no text
EOF

# --- Filter (optional) ----------------------------------------------------
# Aufruf: ./generate-images.sh dachdecker friseur
# Ohne Argumente werden alle Branchen generiert.
FILTER=""
if [ "$#" -gt 0 ]; then
  FILTER="$*"
fi

passes_filter() {
  if [ -z "$FILTER" ]; then return 0; fi
  for f in $FILTER; do
    if [ "$1" = "$f" ]; then return 0; fi
  done
  return 1
}

# --- Loop sequenziell -----------------------------------------------------
# Replicate-Free-Tier limitiert auf 6 Requests/Min mit Burst 1. Mit
# Payment-Method hochgehoben — bis dahin: ein-nach-dem-anderen mit retry
# bei 429 (Rate-Limit).

while IFS='|' read -r branche path aspect prompt; do
  case "$branche" in ''|'#'*) continue ;; esac
  if ! passes_filter "$branche"; then continue; fi

  retries=0
  until generate_one "$branche" "$path" "$aspect" "$prompt"; do
    retries=$((retries + 1))
    if [ "$retries" -gt 3 ]; then
      echo "[give-up] $path nach $retries Retries" >&2
      break
    fi
    echo "[retry $retries] warte 15s wegen Rate-Limit oder Fehler..." >&2
    sleep 15
  done
done <<< "$ITEMS_RAW"

echo ""
echo "DONE. Output in $OUT_DIR/"
