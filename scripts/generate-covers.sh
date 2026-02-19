#!/usr/bin/env bash
# Generate book cover images with transparent backgrounds
# Usage: ./scripts/generate-covers.sh [slug]
# If slug given, generates only that cover. Otherwise all 11 works.

set -euo pipefail
cd "$(dirname "$0")/.."

COVERS_DIR="public/covers"
CORPUS_DIR="src/content/corpus"
WIDTH=480
HEIGHT=720

# Color palettes per work slug
# Format: bg_top bg_bottom accent_color
declare -A PALETTES=(
  ["prayers-and-meditations"]="#4A0E1B #1A0008 #D4A547"
  ["gleanings"]="#3D0F1E #160009 #C9973A"
  ["kitab-i-iqan"]="#2B1429 #0E0610 #B8860B"
  ["the-hidden-words"]="#1B2838 #080E18 #C5A55A"
  ["epistle-to-the-son-of-the-wolf"]="#3A1020 #14050C #D4A547"
  ["tablet-of-ahmad"]="#2D1A0E #100A04 #DAB668"
  ["tablet-of-carmel"]="#1A2A1A #080F08 #A8C065"
  ["tablet-of-the-holy-mariner"]="#0E1E2E #040A14 #7BA7C9"
  ["fire-tablet"]="#3D1508 #1A0A03 #E07020"
  ["kitab-i-ahd"]="#2A1535 #0F0818 #9B72CF"
  ["will-and-testament"]="#0E1E3A #040A18 #5B8DC9"
)

# Arabic titles
declare -A ARABIC_TITLES=(
  ["prayers-and-meditations"]="أدعية ومناجاة"
  ["gleanings"]="منتخبات"
  ["kitab-i-iqan"]="كتاب الإيقان"
  ["the-hidden-words"]="كلمات مكنونه"
  ["epistle-to-the-son-of-the-wolf"]="لوح ابن ذئب"
  ["tablet-of-ahmad"]="لوح أحمد"
  ["tablet-of-carmel"]="لوح كرمل"
  ["tablet-of-the-holy-mariner"]="لوح ملّاح القدس"
  ["fire-tablet"]="لوح قد احترق المخلصون"
  ["kitab-i-ahd"]="كتاب عهد"
  ["will-and-testament"]="الواح وصايا"
)

generate_cover() {
  local slug="$1"
  local meta_file="$CORPUS_DIR/$slug/_meta.json"

  if [ ! -f "$meta_file" ]; then
    echo "  SKIP: $meta_file not found"
    return
  fi

  local title author
  title=$(python3 -c "import json; d=json.load(open('$meta_file')); print(d['title'])")
  author=$(python3 -c "import json; d=json.load(open('$meta_file')); print(d['author'])")

  local palette="${PALETTES[$slug]:-#2A1020 #0E0508 #D4A547}"
  local bg_top bg_bottom accent
  bg_top=$(echo "$palette" | cut -d' ' -f1)
  bg_bottom=$(echo "$palette" | cut -d' ' -f2)
  accent=$(echo "$palette" | cut -d' ' -f3)

  local arabic="${ARABIC_TITLES[$slug]:-}"
  local outfile="$COVERS_DIR/$slug.png"

  echo "  Generating: $slug → $outfile"

  # Build the cover in layers
  magick -size ${WIDTH}x${HEIGHT} \
    \( -size ${WIDTH}x${HEIGHT} gradient:"${bg_top}-${bg_bottom}" \) \
    \
    \( -size ${WIDTH}x${HEIGHT} xc:none \
       -fill "${accent}18" \
       -draw "rectangle 0,0 ${WIDTH},4" \
       -draw "rectangle 0,$((HEIGHT-4)) ${WIDTH},${HEIGHT}" \
       -draw "rectangle 0,0 4,${HEIGHT}" \
       -draw "rectangle $((WIDTH-4)),0 ${WIDTH},${HEIGHT}" \
    \) -composite \
    \
    \( -size ${WIDTH}x${HEIGHT} xc:none \
       -fill "${accent}40" \
       -draw "line 40,60 $((WIDTH-40)),60" \
       -draw "line 40,$((HEIGHT-60)) $((WIDTH-40)),$((HEIGHT-60))" \
       -fill "${accent}20" \
       -draw "line 40,64 $((WIDTH-40)),64" \
       -draw "line 40,$((HEIGHT-64)) $((WIDTH-40)),$((HEIGHT-64))" \
    \) -composite \
    \
    \( -size ${WIDTH}x${HEIGHT} xc:none \
       -fill "${accent}" -font "Bodoni-72-Book" \
       -pointsize 12 -gravity North \
       -annotate +0+32 "✦   ✦   ✦" \
       -annotate +0+$((HEIGHT-46)) "✦   ✦   ✦" \
    \) -composite \
    \
    \( -size $((WIDTH-80))x xc:none \
       -fill "${accent}" -font "Bodoni-72-Book" \
       -pointsize 36 -gravity Center \
       -annotate +0+0 "$title" \
    \) -gravity Center -geometry +0-80 -composite \
    \
    \( -size $((WIDTH-80))x xc:none \
       -fill "${accent}BB" -font "Palatino-Roman" \
       -pointsize 18 -gravity Center \
       -annotate +0+0 "$author" \
    \) -gravity Center -geometry +0-20 -composite \
    \
    \( -size $((WIDTH-80))x xc:none \
       -fill "${accent}90" -font ".Geeza-Pro-Interface-Regular" \
       -pointsize 30 -gravity Center \
       -annotate +0+0 "$arabic" \
    \) -gravity Center -geometry +0+50 -composite \
    \
    \( -size $((WIDTH-120))x2 xc:"${accent}50" \) \
    -gravity Center -geometry +0+100 -composite \
    \
    \( -size ${WIDTH}x${HEIGHT} xc:none \
       -fill "${accent}08" \
       -draw "circle $((WIDTH/2)),$((HEIGHT/2)) $((WIDTH/2)),$((HEIGHT/2 + 300))" \
    \) -composite \
    \
    PNG32:"$outfile"

  echo "    Done: $(stat -f%z "$outfile") bytes"
}

# Main
if [ -n "${1:-}" ]; then
  generate_cover "$1"
else
  for dir in "$CORPUS_DIR"/*/; do
    slug=$(basename "$dir")
    generate_cover "$slug"
  done
fi

echo "Covers generated in $COVERS_DIR/"
