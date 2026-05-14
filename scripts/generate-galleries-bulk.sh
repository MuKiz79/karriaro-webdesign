#!/usr/bin/env bash
# Sprint 18 B-Bulk — Galerien für 6 Branchen (~65 Bilder)
# Friseur (16) · Dachdecker (9) · Praxis (8) · Restaurant (18) · Handwerk (6) · Spedition (8)

set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
[ -f "$REPO_ROOT/.env.local" ] && { set -a; . "$REPO_ROOT/.env.local"; set +a; }
[ -z "${REPLICATE_API_TOKEN:-}" ] && { echo "FEHLER: REPLICATE_API_TOKEN nicht gesetzt."; exit 1; }
OUT_DIR="$REPO_ROOT/src/images"
MODEL="google/imagen-4"

# Format: key|path|aspect|prompt
read -r -d '' ITEMS_RAW <<'EOF' || true
fr-salon-empfang|friseur/salon-empfang.jpg|16:9|Editorial premium hair salon reception area photography, Aveda concept salon Duesseldorf, marble countertop reception desk with brass details, soft warm pendant lighting, aubergine and rose accents, blurred salon interior behind, no people, no text, no readable logos, vogue-inspired premium aesthetic
fr-stuhl-tageslicht|friseur/stuhl-tageslicht.jpg|16:9|Editorial premium hair salon styling chair photography, single styling station with large round mirror in brass frame, natural daylight from window left, marble counter with elegant hair tools, aubergine and rose color palette, blurred salon interior, no people, no text, no logos, vogue-inspired premium aesthetic
fr-wasch-lounge|friseur/wasch-lounge.jpg|16:9|Editorial premium hair salon wash lounge photography, elegant ceramic wash basin with brass fixtures and reclining leather chair, warm low ambient light, aubergine wall, blurred salon interior, no people, no text, no logos, vogue-inspired premium aesthetic
fr-coloration|friseur/coloration.jpg|16:9|Editorial premium hair coloration product detail photography, close-up on Aveda-style color bowl with brush and natural plant-based color pigments on marble surface, warm side light, brass tools, vogue-inspired aesthetic, no people visible, no text, no readable logos
fr-brautstyling|friseur/brautstyling.jpg|16:9|Editorial bridal hair styling detail photography, elegant updo with subtle white flowers and pearl pins, warm soft light, blurred salon mirror with brass frame in background, vogue bridal magazine aesthetic, close-up back of head, no face visible, no text, no logos
fr-sk1-vorher|friseur/profile-sk-1-vorher.jpg|4:5|Editorial salon documentation portrait, German woman in her early forties before hair color treatment, faded uneven highlights with dark roots, natural daylight, neutral salon background, neutral expression, vogue-magazine portrait aesthetic, no text, no logos
fr-sk1-nachher|friseur/profile-sk-1-nachher.jpg|4:5|Editorial salon documentation portrait, same German woman in her early forties after balayage treatment, professionally lightened balayage with seamless blend, natural daylight, neutral salon background, subtle confident smile, vogue-magazine portrait aesthetic, no text, no logos
fr-sk2-analyse|friseur/profile-sk-2-analyse.jpg|4:5|Editorial salon documentation, close-up scalp analysis with magnification tool on healthy hair section parted, natural daylight, neutral background, premium documentation aesthetic, no face visible, no text, no logos
fr-sk2-nachher|friseur/profile-sk-2-nachher.jpg|4:5|Editorial salon documentation portrait, German woman mid-fifties after 8-week scalp treatment with healthy shine restored hair, natural daylight, neutral salon background, subtle satisfied expression, vogue-magazine portrait aesthetic, no text, no logos
fr-sk3-vorher|friseur/profile-sk-3-vorher.jpg|4:5|Editorial salon documentation portrait, German woman in her late forties before cut, long uneven hair with split ends, natural daylight, neutral salon background, neutral expression, vogue-magazine portrait aesthetic, no text, no logos
fr-sk3-nachher|friseur/profile-sk-3-nachher.jpg|4:5|Editorial salon documentation portrait, same German woman in her late forties after structured shoulder-length cut with subtle layers, natural daylight, neutral salon background, confident relaxed expression, vogue-magazine portrait aesthetic, no text, no logos
fr-news-sommer|friseur/news-sommer-trends.jpg|16:9|Editorial summer hair trends magazine cover style photography, abstract composition of light golden hair strands with sun flares, warm summer light, beach hat blurred in background, vogue summer issue aesthetic, no face visible, no text, no logos
fr-news-aveda|friseur/news-aveda.jpg|16:9|Editorial premium plant-based hair color photography, close-up on hand holding color bowl with vibrant natural pigments in various tones on marble surface, warm side light, vogue magazine aesthetic, no text, no readable logos
fr-news-braut|friseur/news-brautsaison.jpg|16:9|Editorial bridal hair magazine photography, close-up detail of intricate braided updo with delicate white flowers, soft natural daylight from window, no face visible, blurred wedding salon background, vogue bridal aesthetic, no text, no logos
fr-video-1|friseur/video-poster-1.jpg|16:9|Editorial documentary portrait of German woman in her mid-forties with shoulder-length brown hair wearing dark apron, calm relaxed expression looking at camera, blurred Aveda concept salon interior with marble and brass details, warm window light, vogue-inspired premium documentary aesthetic, no text, no logos
fr-video-2|friseur/video-poster-2.jpg|16:9|Editorial documentary detail of professional hair styling tutorial setup, close-up on hands working with hair section using ceramic curling iron, blurred salon mirror with warm pendant lights in background, vogue-inspired aesthetic, no face visible, no text, no logos
dd-vorher-1|dachdecker/vorher-1-moos.jpg|16:9|Documentary German residential roof photography, weathered terracotta tiles with heavy moss buildup and discoloration, overcast daylight, before-renovation aesthetic, no people, no text, no logos, authentic documentary style
dd-nachher-1|dachdecker/nachher-1-neueindeckung.jpg|16:9|Documentary German residential roof photography, freshly laid bright terracotta tiles with crisp ridge lines, clean overcast daylight, after-renovation aesthetic, no people, no text, no logos, premium German craftsmanship documentary style
dd-vorher-2|dachdecker/vorher-2-sturm.jpg|16:9|Documentary German residential roof photography, storm damage with several displaced terracotta tiles and visible underlayment, overcast moody daylight, before-repair aesthetic, no people, no text, no logos, authentic documentary style
dd-nachher-2|dachdecker/nachher-2-repariert.jpg|16:9|Documentary German residential roof photography, neatly repaired tile section with seamlessly matched new terracotta tiles, soft daylight, after-repair aesthetic, no people, no text, no logos, premium craftsmanship style
dd-vorher-3|dachdecker/vorher-3-pv-leer.jpg|16:9|Documentary German residential south-facing roof photography, clean terracotta tile surface prepared for solar installation, soft daylight, before-PV aesthetic, no people, no text, no logos
dd-nachher-3|dachdecker/nachher-3-pv-indach.jpg|16:9|Documentary German residential roof photography, integrated in-roof photovoltaic panels seamlessly flush with terracotta tiles, golden hour light, after-PV-installation aesthetic, no people, no text, no logos, premium craftsmanship style
dd-drohne|dachdecker/drohne-poster.jpg|16:9|Aerial drone documentary photography of Stuttgart residential rooftops at golden hour, terracotta tile patterns from above, soft warm light, premium documentary aesthetic, no text, no logos, no readable signs
dd-video-1|dachdecker/video-poster-1.jpg|16:9|Documentary editorial detail of German craftsman hands installing terracotta tile on roof, close-up on hammer and slate cutters, soft daylight, blurred Stuttgart skyline background, no face visible, no text, no logos
dd-video-2|dachdecker/video-poster-2.jpg|16:9|Documentary editorial detail of fresh-cut copper gutter installation on German residential roof, close-up on hands shaping copper with tin snips, soft daylight, premium craftsmanship documentary aesthetic, no face visible, no text, no logos
px-empfang|praxis/empfang.jpg|16:9|Editorial modern medical practice reception area photography, bright minimalist reception desk with soft teal accents and natural plants, warm natural daylight from large windows, blurred waiting area in background, no people, no text, no readable logos, premium healthcare aesthetic
px-warte|praxis/wartezimmer.jpg|16:9|Editorial modern medical practice waiting room photography, comfortable upholstered chairs in soft fabric, large windows with natural daylight, indoor plants, calming neutral palette with teal accents, no people, no text, no logos, premium healthcare magazine aesthetic
px-behand|praxis/behandlungszimmer.jpg|16:9|Editorial modern medical practice exam room photography, clean examination bed with white linen, modern medical equipment on shelf, large window with natural daylight, neutral palette with teal accents, no people, no text, no logos, premium healthcare aesthetic
px-ekg|praxis/ekg-raum.jpg|16:9|Editorial modern medical practice diagnostic room photography, modern ECG monitor on white cart, examination bed with neat white linen, soft daylight, neutral palette with teal accents, no people, no text, no logos, premium healthcare aesthetic
px-labor|praxis/labor.jpg|16:9|Editorial modern medical practice laboratory photography, clean white countertop with modern lab equipment and centrifuge, bright overhead lighting, neutral palette, no people, no text, no logos, premium healthcare aesthetic
px-news-grippe|praxis/news-grippe.jpg|16:9|Editorial medical magazine photography, abstract clean composition of medical vaccination preparation on white surface, glass vials and syringe blurred, soft daylight, neutral palette, premium healthcare magazine aesthetic, no people, no text, no logos
px-news-erk|praxis/news-erkaeltung.jpg|16:9|Editorial medical magazine photography of seasonal cold and wellness theme, ceramic mug with warm tea and lemon on wooden surface, soft autumn daylight from window, blurred home interior background, no people, no text, no logos, premium healthcare magazine aesthetic
px-news-reise|praxis/news-reisemedizin.jpg|16:9|Editorial medical magazine travel medicine theme, abstract composition of vintage globe and modern leather passport wallet on neutral background, soft natural light, premium magazine aesthetic, no people, no text, no readable logos
rs-carpaccio|restaurant/menu-carpaccio.jpg|1:1|Editorial fine dining food photography of colorful beetroot carpaccio plated on dark ceramic plate, microgreens and goat cheese crumbles, top-down angle, warm pendant light from above, premium gastronomy magazine aesthetic, no text, no logos
rs-tatar|restaurant/menu-tatar.jpg|1:1|Editorial fine dining food photography of premium beef tartare with quail egg yolk and chives on dark ceramic plate, three-quarter angle, warm pendant light, premium gastronomy magazine aesthetic, no text, no logos
rs-suppe|restaurant/menu-suppe.jpg|1:1|Editorial fine dining food photography of creamy seasonal pumpkin soup with truffle oil drizzle in dark stoneware bowl, top-down angle, warm pendant light, premium gastronomy magazine aesthetic, no text, no logos
rs-lachs|restaurant/menu-lachs.jpg|1:1|Editorial fine dining food photography of pan-seared salmon fillet with crispy skin on bed of sauteed spinach and lemon foam, dark ceramic plate, three-quarter angle, warm pendant light, premium gastronomy magazine aesthetic, no text, no logos
rs-schmor|restaurant/menu-schmorbraten.jpg|1:1|Editorial fine dining food photography of Bavarian braised beef shoulder with red wine jus and root vegetables on dark ceramic plate, three-quarter angle, warm pendant light, premium gastronomy magazine aesthetic, no text, no logos
rs-schnitzel|restaurant/menu-schnitzel.jpg|1:1|Editorial fine dining food photography of perfectly golden Wiener Schnitzel with lemon wedge and parsley potatoes on white plate, three-quarter angle, warm pendant light, premium gastronomy magazine aesthetic, no text, no logos
rs-risotto|restaurant/menu-risotto.jpg|1:1|Editorial fine dining food photography of creamy saffron risotto with parmesan curls and rosemary on dark ceramic plate, top-down angle, warm pendant light, premium gastronomy magazine aesthetic, no text, no logos
rs-fisch|restaurant/menu-fisch.jpg|1:1|Editorial fine dining food photography of pan-roasted whitefish with herb butter and seasonal vegetables on dark ceramic plate, three-quarter angle, warm pendant light, premium gastronomy magazine aesthetic, no text, no logos
rs-gnocchi|restaurant/menu-gnocchi.jpg|1:1|Editorial fine dining food photography of handmade potato gnocchi in brown butter sage sauce with parmesan on dark ceramic plate, top-down angle, warm pendant light, premium gastronomy magazine aesthetic, no text, no logos
rs-ente|restaurant/menu-ente.jpg|1:1|Editorial fine dining food photography of crispy duck breast slices with red cabbage and dumpling on dark ceramic plate, three-quarter angle, warm pendant light, premium gastronomy magazine aesthetic, no text, no logos
rs-kaiser|restaurant/menu-kaiserschmarrn.jpg|1:1|Editorial fine dining food photography of golden Kaiserschmarrn dusted with powdered sugar and plum compote on dark ceramic plate, three-quarter angle, warm pendant light, premium gastronomy magazine aesthetic, no text, no logos
rs-sorbet|restaurant/menu-sorbet.jpg|1:1|Editorial fine dining food photography of vibrant raspberry sorbet quenelle on dark ceramic plate with fresh raspberries and mint, top-down angle, cool light contrast against dark background, premium gastronomy magazine aesthetic, no text, no logos
rs-haupt|restaurant/galerie-hauptraum.jpg|16:9|Editorial premium fine dining restaurant interior photography of main dining room with warm wood paneling, copper pendant lights, white linen tables, blurred candle warmth, Munich-Schwabing premium aesthetic, no people, no text, no logos
rs-tisch|restaurant/galerie-tisch.jpg|16:9|Editorial premium restaurant table detail photography, white linen tablecloth with silver cutlery, crystal glassware, single candle in brass holder, warm pendant light, gastronomy magazine aesthetic, no people, no text, no logos
rs-wein|restaurant/galerie-weinkarte.jpg|16:9|Editorial premium restaurant wine cellar detail photography, dark wood wine rack with rows of vintage bottles, warm amber accent lighting, gastronomy magazine aesthetic, no people, no text, no readable labels
rs-kueche|restaurant/galerie-kueche.jpg|16:9|Editorial premium fine dining restaurant kitchen photography, stainless steel work surfaces with copper pans hanging, warm pendant light, blurred chefs in background, premium gastronomy aesthetic, no readable text, no logos
rs-terr|restaurant/galerie-terrasse.jpg|16:9|Editorial premium restaurant terrace photography, intimate outdoor dining area with string lights and lanterns, Munich evening atmosphere with subtle blurred city lights, warm cozy palette, gastronomy magazine aesthetic, no people, no text, no logos
rs-detail|restaurant/galerie-detail.jpg|16:9|Editorial premium restaurant interior detail photography, close-up of brass fixture against dark wood paneling, warm pendant glow, gastronomy magazine aesthetic, no text, no readable logos
sn-vorher-1|sanitaer/vorher-1-bad.jpg|16:9|Documentary outdated German bathroom photography before renovation, beige tile from the 1980s with worn fixtures and dated ceramic basin, fluorescent overhead light, neutral palette, no people, no text, no logos, authentic documentary aesthetic
sn-nachher-1|sanitaer/nachher-1-bad.jpg|16:9|Editorial premium modern German bathroom photography after renovation, large-format porcelain tiles in warm gray, walk-in shower with chrome fixtures, floating vanity with single ceramic basin, soft daylight from window, premium handwerker craftsmanship aesthetic, no people, no text, no logos
sn-vorher-2|sanitaer/vorher-2-oelheizung.jpg|16:9|Documentary photography of outdated German residential basement oil heating system from 1990s, weathered green oil tank and old boiler, dim basement lighting, before-replacement aesthetic, no people, no text, no logos, authentic documentary style
sn-nachher-2|sanitaer/nachher-2-waermepumpe.jpg|16:9|Editorial modern photography of new German residential air-source heat pump installation, sleek white outdoor heat pump unit on concrete pad against modern house facade, clean bright daylight, premium handwerker craftsmanship aesthetic, no people, no text, no logos
sn-vorher-3|sanitaer/vorher-3-dach.jpg|16:9|Documentary photography of empty residential south-facing roof prepared for solar installation, clean terracotta tiles, soft daylight, before-PV aesthetic, no people, no text, no logos
sn-nachher-3|sanitaer/nachher-3-pv.jpg|16:9|Editorial premium photography of completed residential photovoltaic installation, sleek black solar panels neatly aligned on terracotta tile roof, golden hour light, after-PV aesthetic, premium craftsmanship, no people, no text, no logos
lo-sattel|spedition/flotte-sattelzug.jpg|16:9|Editorial B2B logistics photography of modern Mercedes-Benz Actros 40-ton semi-truck tractor with white trailer, parked on clean logistics yard at golden hour, side three-quarter view, professional German Mittelstand aesthetic, no people, no text, no readable license plates, no logos
lo-wechsel|spedition/flotte-wechselbruecke.jpg|16:9|Editorial B2B logistics photography of swap-body truck with detachable container body lifted on legs, modern logistics yard, golden hour, professional German Mittelstand aesthetic, no people, no text, no readable license plates, no logos
lo-kuehl|spedition/flotte-kuehl.jpg|16:9|Editorial B2B logistics photography of refrigerated semi-trailer with white insulated body and visible cooling unit, parked at modern German logistics yard, golden hour, professional aesthetic, no people, no text, no readable license plates, no logos
lo-sprinter|spedition/flotte-sprinter.jpg|16:9|Editorial B2B logistics photography of modern Mercedes-Benz Sprinter express delivery van in white, parked at logistics yard, golden hour, professional German Mittelstand aesthetic, no people, no text, no readable license plates, no logos
lo-haenger|spedition/flotte-haenger.jpg|16:9|Editorial B2B logistics photography of jumbo trailer combination truck with two cargo units, modern logistics yard, golden hour, professional German Mittelstand aesthetic, no people, no text, no readable license plates, no logos
lo-container|spedition/flotte-container.jpg|16:9|Editorial B2B logistics photography of container chassis trailer carrying intermodal sea container, modern logistics yard at golden hour, professional German Mittelstand aesthetic, no people, no text, no readable container labels, no logos
lo-adr|spedition/flotte-adr.jpg|16:9|Editorial B2B logistics photography of stainless steel ADR-certified tanker semi-truck for hazardous goods transport, modern logistics yard at golden hour, professional German Mittelstand aesthetic, no people, no text, no readable license plates, no logos
lo-elkw|spedition/flotte-elkw.jpg|16:9|Editorial B2B logistics photography of modern electric Mercedes-Benz eActros heavy-duty truck in white, charging port visible, modern sustainable logistics yard at golden hour, professional German Mittelstand aesthetic, no people, no text, no readable license plates, no logos
EOF

generate_one() {
  local key="$1" out_path="$2" aspect="$3" prompt="$4"
  local full_out="$OUT_DIR/$out_path"
  echo "[start] $key → $out_path ($aspect)"
  local create_response
  create_response=$(curl -s --no-progress-meter "https://api.replicate.com/v1/models/$MODEL/predictions" \
    -H "Authorization: Bearer $REPLICATE_API_TOKEN" -H "Content-Type: application/json" -H "Prefer: wait" \
    -d "$(jq -n --arg prompt "$prompt" --arg ar "$aspect" '{input: {prompt: $prompt, aspect_ratio: $ar, output_format: "jpg", safety_filter_level: "block_only_high"}}')")
  local prediction_id
  prediction_id=$(echo "$create_response" | jq -r '.id // empty' 2>/dev/null)
  [ -z "$prediction_id" ] && { echo "[fail] $key — kein id ($(echo "$create_response" | jq -r '.detail // tostring' | head -c 120))"; return 1; }
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
  [ -z "$output_url" ] && { echo "[fail] $key — timeout"; return 1; }
  curl -s --no-progress-meter -o "$full_out" "$output_url"
  local size
  size=$(stat -f %z "$full_out" 2>/dev/null || stat -c %s "$full_out")
  echo "[done] $key → $out_path ($size bytes)"
}

COUNT=0
echo "$ITEMS_RAW" | while IFS='|' read -r key path aspect prompt; do
  [ -z "$key" ] && continue
  COUNT=$((COUNT+1))
  retries=0
  until generate_one "$key" "$path" "$aspect" "$prompt"; do
    retries=$((retries+1)); [ "$retries" -ge 2 ] && { echo "[abort] $key"; break; }
    echo "[retry $retries/2] $key — warte 12s"; sleep 12
  done
  sleep 6
done
echo "FERTIG ($COUNT Items)."
