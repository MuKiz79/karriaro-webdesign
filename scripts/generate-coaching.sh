#!/usr/bin/env bash
# Sprint 20 B3 — Coaching-Galerie via GPT-Image-1 (11 Bilder)

set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
[ -f "$REPO_ROOT/.env.local" ] && { set -a; . "$REPO_ROOT/.env.local"; set +a; }
[ -z "${OPENAI_API_KEY:-}" ] && { echo "FEHLER: OPENAI_API_KEY nicht gesetzt."; exit 1; }
OUT_DIR="$REPO_ROOT/src/images"
ENDPOINT="https://api.openai.com/v1/images/generations"
MODEL="gpt-image-1"

read -r -d '' ITEMS_RAW <<'EOF' || true
persona|coaching/persona.jpg|1024x1536|high|Editorial premium portrait photograph. Subject: a confident German female business coach named Sarah Lehmann in her mid-forties with dark hair in a sleek shoulder-length bob, subtle natural makeup, wearing a minimalist black tailored blazer over a crisp white shell top, composed authoritative warm expression with a faint warm smile looking directly at the camera. Setting: standing in a modern upscale Frankfurt office with floor-to-ceiling windows showing a softly blurred Frankfurt skyline view in golden hour. Lighting: warm afternoon side light from the windows camera left. Composition: medium portrait, head and torso visible, slight three-quarter angle, shallow depth of field. Color palette: monochrome blacks and whites with subtle warm window glow. Style: premium business magazine portrait, photorealistic. Constraints: absolutely no text, no logos, no readable signs, natural skin texture.
methoden-karriere|coaching/methoden-karriere.jpg|1536x1024|medium|Editorial premium business desk detail photograph. Subject: NO PEOPLE. Setting: a beautifully crafted dark walnut desk with a high-quality leather notebook, a premium fountain pen, a glass of still water, and a small succulent plant, soft warm afternoon light from a window. Composition: top-down three-quarter angle, rule of thirds. Color palette: monochrome with warm wood tones and subtle gold accents. Style: premium business magazine editorial detail. Constraints: absolutely no text, no logos, no readable labels.
methoden-leadership|coaching/methoden-leadership.jpg|1536x1024|medium|Editorial premium executive meeting room photograph. Subject: NO PEOPLE. Setting: a modern Frankfurt executive meeting room with a long minimalist conference table, four empty designer chairs, large floor-to-ceiling windows showing a softly blurred Frankfurt skyline at dusk with subtle city lights. Lighting: warm interior pendant light with cool outside dusk light through windows. Composition: wide interior with depth into the skyline. Color palette: monochrome with subtle warm pendant glow. Style: premium business magazine architectural photography. Constraints: absolutely no text, no logos, no readable signs outside the windows.
methoden-clevel|coaching/methoden-clevel.jpg|1536x1024|medium|Editorial premium executive office detail photograph. Subject: NO PEOPLE. Setting: a tailored dark suit jacket draped on the back of a leather executive chair, a vintage leather briefcase on the floor nearby, soft warm desk lamp light. Lighting: warm tungsten desk lamp side light. Composition: three-quarter angle, depth of field. Color palette: monochrome with warm leather tones. Style: premium business magazine editorial detail. Constraints: absolutely no text, no logos, no readable labels.
online-erstgespraech|coaching/online-erstgespraech.jpg|1536x1024|medium|Editorial premium home office detail photograph. Subject: NO PEOPLE. Setting: a slim modern laptop on a clean walnut desk showing a softly blurred video call interface on the screen (no readable text), a ceramic mug of coffee nearby, a small plant, warm side window light. Composition: three-quarter angle, depth of field. Color palette: monochrome with warm window light. Style: premium business magazine editorial. Constraints: absolutely no text, no logos, no readable screen content, no readable interface elements.
referenzen-1|coaching/referenzen-1.jpg|1024x1536|medium|Editorial premium business portrait photograph. Subject: a confident German female executive in her mid-forties with shoulder-length brown hair, subtle natural makeup, wearing a tailored dark navy blazer over a crisp white shell, warm composed expression looking at the camera. Setting: blurred upscale office interior with neutral tones. Lighting: warm natural daylight from camera right. Composition: head and torso portrait, slight three-quarter angle. Color palette: monochrome with subtle warm accents. Style: premium business magazine portrait, photorealistic. Constraints: absolutely no text, no logos, natural skin texture.
referenzen-2|coaching/referenzen-2.jpg|1024x1536|medium|Editorial premium business portrait photograph. Subject: a thoughtful German male executive in his late forties with neat short brown hair lightly graying at the temples, clean-shaven, wearing a dark gray fine merino sweater over a white collared shirt, calm reflective expression looking at the camera. Setting: blurred upscale office interior with neutral tones. Lighting: warm natural daylight from camera left. Composition: head and torso portrait, slight three-quarter angle. Color palette: monochrome with subtle warm accents. Style: premium business magazine portrait, photorealistic. Constraints: absolutely no text, no logos, natural skin texture.
referenzen-3|coaching/referenzen-3.jpg|1024x1536|medium|Editorial premium business portrait photograph. Subject: a composed German female executive in her late fifties with elegant silver-gray bob hair, subtle natural makeup, wearing a tailored charcoal blazer over a cream silk blouse, dignified warm expression looking at the camera. Setting: blurred upscale office interior. Lighting: warm natural daylight. Composition: head and torso portrait, slight three-quarter angle. Color palette: monochrome. Style: premium business magazine portrait, photorealistic. Constraints: absolutely no text, no logos, natural skin texture with age character.
news-1|coaching/news-1.jpg|1536x1024|medium|Editorial premium business magazine leadership insights theme photograph. Subject: an abstract composition of a stack of premium business books with a vintage compass and a small brass paperweight on a dark walnut surface, warm side light. Composition: three-quarter angle, depth of field. Color palette: monochrome with warm leather and brass tones. Style: premium business magazine editorial. Constraints: absolutely no text, no readable book titles, no logos.
news-2|coaching/news-2.jpg|1536x1024|medium|Editorial premium business magazine career transition theme photograph. Subject: an abstract composition of an open notebook with handwritten timeline sketches blurred and unreadable, a fountain pen and a small plant on a neutral surface, soft natural light. Composition: top-down angle. Color palette: monochrome. Style: premium business magazine editorial. Constraints: absolutely no text, no readable writing, no logos.
news-3|coaching/news-3.jpg|1536x1024|medium|Editorial premium business magazine C-Level preparation theme photograph. Subject: an abstract composition of a polished leather portfolio case with a few elegant business cards (blank, no readable text), a vintage wristwatch and a glass of water on a dark walnut surface, warm side light. Composition: three-quarter angle. Color palette: monochrome with warm leather tones. Style: premium business magazine editorial. Constraints: absolutely no text, absolutely blank cards no print, no logos.
EOF

generate_one() {
  local key="$1" out_path="$2" size="$3" quality="$4" prompt="$5"
  local full_out="$OUT_DIR/$out_path"
  echo "[start] $key ($size $quality)"
  local response
  response=$(curl -s --no-progress-meter --max-time 180 "$ENDPOINT" \
    -H "Authorization: Bearer $OPENAI_API_KEY" -H "Content-Type: application/json" \
    -d "$(jq -n --arg p "$prompt" --arg s "$size" --arg q "$quality" '{model: "gpt-image-1", prompt: $p, size: $s, quality: $q, n: 1, output_format: "jpeg"}')")
  local err
  err=$(echo "$response" | jq -r '.error.message // empty' 2>/dev/null)
  [ -n "$err" ] && { echo "[fail] $key — $err"; return 1; }
  local b64
  b64=$(echo "$response" | jq -r '.data[0].b64_json // empty' 2>/dev/null)
  [ -z "$b64" ] && { echo "[fail] $key — no b64"; return 1; }
  echo "$b64" | base64 -d > "$full_out"
  local size_bytes
  size_bytes=$(stat -f %z "$full_out" 2>/dev/null || stat -c %s "$full_out")
  echo "[done] $key → $out_path ($size_bytes bytes)"
}

echo "$ITEMS_RAW" | while IFS='|' read -r key path size quality prompt; do
  [ -z "$key" ] && continue
  retries=0
  until generate_one "$key" "$path" "$size" "$quality" "$prompt"; do
    retries=$((retries+1)); [ "$retries" -ge 2 ] && { echo "[abort] $key"; break; }
    echo "[retry $retries/2] $key"; sleep 10
  done
  sleep 3
done
echo "FERTIG."
