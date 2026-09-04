#!/usr/bin/env bash
# Rasterise assets/icon.svg into the PWA icon set using macOS `sips`.
# Run after editing the SVG: ./scripts/generate-icons.sh
set -euo pipefail

cd "$(dirname "$0")/.."
SRC=assets/icon.svg
OUT=public/icons
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

mkdir -p "$OUT"

sips -s format png "$SRC" --out "$TMP/full.png" >/dev/null
for size in 192 512; do
  sips -z "$size" "$size" "$TMP/full.png" --out "$OUT/icon-$size.png" >/dev/null
done

# Maskable icons get cropped to a circle by the launcher, so the artwork has to
# sit inside the middle ~80%. Pad it out on a matching background.
sips -z 410 410 "$TMP/full.png" --out "$TMP/inner.png" >/dev/null
sips -p 512 512 --padColor 0F172A "$TMP/inner.png" --out "$OUT/icon-512-maskable.png" >/dev/null

sips -z 180 180 "$TMP/full.png" --out public/apple-touch-icon.png >/dev/null
cp "$SRC" public/favicon.svg

echo "Wrote $OUT/{icon-192,icon-512,icon-512-maskable}.png, public/apple-touch-icon.png, public/favicon.svg"
