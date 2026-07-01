#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
GEOJSON="$ROOT/data/processed/regions.geojson"
OUT_PMTILES="$ROOT/public/data/regions.pmtiles"
TIPPECANOE="${TIPPECANOE:-$HOME/.local/bin/tippecanoe}"

mkdir -p "$ROOT/data/processed" "$ROOT/public/data"

node "$ROOT/scripts/topo_to_geojson.mjs"

"$TIPPECANOE" \
  -o "$OUT_PMTILES" \
  -zg \
  --drop-densest-as-needed \
  --extend-zooms-if-still-dropping \
  --force \
  -l regions \
  -y hierid \
  -y ISO \
  "$GEOJSON"

echo "Wrote $OUT_PMTILES"
