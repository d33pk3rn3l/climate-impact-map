import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { feature } from 'topojson-client'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const topoPath = path.join(root, 'data/raw/topo/global-regional.json')
const outPath = path.join(root, 'data/processed/regions.geojson')

const topo = JSON.parse(fs.readFileSync(topoPath, 'utf8'))
const collection = feature(topo, topo.objects.new_shapefile)
const filtered = {
  type: 'FeatureCollection',
  features: collection.features
    .filter((item) => item.properties?.hierid && item.geometry)
    .map((item) => ({
      type: 'Feature',
      properties: { hierid: item.properties.hierid, ISO: item.properties.ISO },
      geometry: item.geometry,
    })),
}

fs.mkdirSync(path.dirname(outPath), { recursive: true })
fs.writeFileSync(outPath, JSON.stringify(filtered))
console.log(`Wrote ${filtered.features.length} features to ${outPath}`)
