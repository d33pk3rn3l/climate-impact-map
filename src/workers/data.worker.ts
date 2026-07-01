import type { MapFilters, Manifest } from '../lib/types'
import { comboKey } from '../lib/types'
import { DATA_BASE } from '../lib/colors'

const F_TO_C = (value: number) => (value - 32) * (5 / 9)

let manifest: Manifest | null = null
let regionIndex = new Map<string, number>()
let regionIds: string[] = []
const comboCache = new Map<string, Float32Array>()

async function loadManifest() {
  const response = await fetch(`${DATA_BASE}/manifest.json`)
  if (!response.ok) throw new Error('Failed to load manifest')
  manifest = (await response.json()) as Manifest
  return manifest
}

async function loadRegions() {
  const response = await fetch(`${DATA_BASE}/regions.json`)
  if (!response.ok) throw new Error('Failed to load regions')
  regionIds = (await response.json()) as string[]
  regionIndex = new Map(regionIds.map((id, idx) => [id, idx]))
}

async function loadCombo(filters: Pick<MapFilters, 'metric' | 'scenario' | 'period' | 'measure'>) {
  const key = comboKey(filters)
  const cached = comboCache.get(key)
  if (cached) return cached

  const relPath = manifest?.combos[key]
  if (!relPath) throw new Error(`Missing combo data for ${key}`)

  const response = await fetch(`${DATA_BASE}/${relPath}`)
  if (!response.ok) throw new Error(`Failed to load ${relPath}`)
  const data = new Float32Array(await response.arrayBuffer())
  comboCache.set(key, data)
  return data
}

function unpackCombo(
  data: Float32Array,
  filters: MapFilters,
): { values: Float32Array; q05: Float32Array; q50: Float32Array; q95: Float32Array } {
  const useCelsius = filters.unit === 'celsius'
  const values = new Float32Array(regionIds.length)
  const q05 = new Float32Array(regionIds.length)
  const q50 = new Float32Array(regionIds.length)
  const q95 = new Float32Array(regionIds.length)

  for (let i = 0; i < regionIds.length; i += 1) {
    const offset = i * 3
    let low = data[offset]
    let mid = data[offset + 1]
    let high = data[offset + 2]
    if (useCelsius) {
      low = F_TO_C(low)
      mid = F_TO_C(mid)
      high = F_TO_C(high)
    }
    q05[i] = low
    q50[i] = mid
    q95[i] = high
    values[i] = filters.quantile === '0.05' ? low : filters.quantile === '0.95' ? high : mid
  }

  return { values, q05, q50, q95 }
}

function valueAtRegion(data: Float32Array, regionId: string, filters: MapFilters): number | null {
  const idx = regionIndex.get(regionId)
  if (idx == null) return null
  const offset = idx * 3
  let value =
    filters.quantile === '0.05' ? data[offset] : filters.quantile === '0.95' ? data[offset + 2] : data[offset + 1]
  if (filters.unit === 'celsius') value = F_TO_C(value)
  return value
}

self.onmessage = async (event: MessageEvent) => {
  const { type, requestId, payload } = event.data as {
    type: string
    requestId: string
    payload?: unknown
  }

  try {
    if (type === 'init') {
      await loadManifest()
      await loadRegions()
      self.postMessage({ type: 'ready', requestId, payload: { manifest, regionIds } })
      return
    }

    if (type === 'valuesForFilters') {
      const filters = payload as MapFilters
      const data = await loadCombo(filters)
      const unpacked = unpackCombo(data, filters)
      self.postMessage({
        type: 'valuesForFilters',
        requestId,
        payload: { ...unpacked, regionIds },
      })
      return
    }

    if (type === 'regionValue') {
      const { regionId, filters } = payload as { regionId: string; filters: MapFilters }
      const data = await loadCombo(filters)
      self.postMessage({
        type: 'regionValue',
        requestId,
        payload: valueAtRegion(data, regionId, filters),
      })
      return
    }

    if (type === 'rankRegions') {
      const { criteria, limit } = payload as {
        criteria: MapFilters & { operator: 'lt' | 'gt'; threshold: number }
        limit: number
      }
      const data = await loadCombo(criteria)
      const results: Array<{ regionId: string; value: number }> = []
      for (const regionId of regionIds) {
        const value = valueAtRegion(data, regionId, criteria)
        if (value == null || Number.isNaN(value)) continue
        const matches = criteria.operator === 'lt' ? value < criteria.threshold : value > criteria.threshold
        if (matches) results.push({ regionId, value })
      }
      results.sort((a, b) => a.value - b.value)
      self.postMessage({ type: 'rankRegions', requestId, payload: results.slice(0, limit) })
      return
    }

    if (type === 'compareRegions') {
      const { regionIds: ids, filters } = payload as { regionIds: string[]; filters: MapFilters }
      const periods = manifest?.metrics.find((metric) => metric.id === filters.metric)?.periods ?? []
      const comboData = await Promise.all(
        periods.map((period) => loadCombo({ ...filters, period })),
      )
      const payloadRows = ids.map((regionId) => ({
        regionId,
        points: periods.map((period, index) => ({
          period,
          value: valueAtRegion(comboData[index]!, regionId, { ...filters, period }),
        })),
      }))
      self.postMessage({ type: 'compareRegions', requestId, payload: payloadRows })
    }
  } catch (error) {
    self.postMessage({
      type: 'error',
      requestId,
      payload: error instanceof Error ? error.message : 'Unknown worker error',
    })
  }
}

export {}
