import type { ExpressionSpecification } from 'maplibre-gl'
import type { Manifest, MapFilters, PaletteConfig } from './types'
import { paletteKey } from './types'

export const DATA_BASE = `${import.meta.env.BASE_URL}data`

export function getPalette(manifest: Manifest, filters: MapFilters): PaletteConfig {
  const key = paletteKey(filters.metric, filters.measure)
  const palette = manifest.palettes[key]
  if (!palette) {
    return { bins: [-10, 0, 10, 20, 30, 40, 50], color_palette: ['#2c7bb6', '#abd9e9', '#ffffbf', '#fdae61', '#d7191c'] }
  }
  return palette
}

export function buildColorExpression(
  palette: PaletteConfig,
  property: string = 'value',
): ExpressionSpecification {
  const stops: (string | number)[] = []
  const colors = palette.color_palette
  const bins = palette.bins

  for (let i = 0; i < colors.length; i += 1) {
    const stop = bins[Math.min(i, bins.length - 1)] ?? i
    stops.push(stop, colors[i])
  }

  return ['interpolate', ['linear'], ['coalesce', ['feature-state', property], bins[0] ?? 0], ...stops]
}

export function formatValue(value: number | null | undefined, unit: 'fahrenheit' | 'celsius') {
  if (value == null || Number.isNaN(value)) return '—'
  return `${value.toFixed(1)}°${unit === 'celsius' ? 'C' : 'F'}`
}

export function parseHashFilters(hash: string): Partial<MapFilters> {
  const params = new URLSearchParams(hash.replace(/^#/, ''))
  const partial: Partial<MapFilters> = {}
  const metric = params.get('var')
  const scenario = params.get('rcp')
  const period = params.get('year')
  const measure = params.get('meas')
  const quantile = params.get('prob')
  const unit = params.get('unit')

  if (metric) partial.metric = metric as MapFilters['metric']
  if (scenario) partial.scenario = scenario as MapFilters['scenario']
  if (period) partial.period = period as MapFilters['period']
  if (measure) partial.measure = measure as MapFilters['measure']
  if (quantile) partial.quantile = quantile as MapFilters['quantile']
  if (unit) partial.unit = unit as MapFilters['unit']
  return partial
}

export function serializeHashFilters(filters: MapFilters) {
  const params = new URLSearchParams({
    var: filters.metric,
    rcp: filters.scenario,
    year: filters.period,
    meas: filters.measure,
    prob: filters.quantile,
    unit: filters.unit,
  })
  return `#${params.toString()}`
}
