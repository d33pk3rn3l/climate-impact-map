import type { MapFilters, Manifest, RegionValues } from '../lib/types'
import { comboKey, TEMP_METRICS } from '../lib/types'
import { DATA_BASE, quantileColumn } from '../lib/colors'

type DataRow = {
  region_id: string
  metric: string
  scenario: string
  period: string
  measure: string
  q05: number
  q50: number
  q95: number
  q05_c?: number
  q50_c?: number
  q95_c?: number
}

type StoredValues = RegionValues & { q05_c?: number; q50_c?: number; q95_c?: number }

type ComboStore = Map<string, Map<string, StoredValues>>

let manifest: Manifest | null = null
let regionIndex = new Map<string, number>()
let regionIds: string[] = []
let comboStore: ComboStore = new Map()

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

async function loadParquet() {
  const response = await fetch(`${DATA_BASE}/values.parquet`)
  if (!response.ok) throw new Error('Failed to load values.parquet')
  const buffer = await response.arrayBuffer()
  const { parquetReadObjects } = await import('hyparquet')
  const rows = (await parquetReadObjects({
    file: buffer,
    columns: [
      'region_id',
      'metric',
      'scenario',
      'period',
      'measure',
      'q05',
      'q50',
      'q95',
      'q05_c',
      'q50_c',
      'q95_c',
    ],
  })) as DataRow[]

  comboStore = new Map()
  for (const row of rows) {
    const key = comboKey({
      metric: row.metric as MapFilters['metric'],
      scenario: row.scenario as MapFilters['scenario'],
      period: row.period as MapFilters['period'],
      measure: row.measure as MapFilters['measure'],
    })
    if (!comboStore.has(key)) comboStore.set(key, new Map())
    comboStore.get(key)!.set(row.region_id, {
      q05: row.q05,
      q50: row.q50,
      q95: row.q95,
      ...(row.q05_c != null ? { q05_c: row.q05_c, q50_c: row.q50_c, q95_c: row.q95_c } : {}),
    })
  }
}

function readValue(record: StoredValues, column: string, quantile: MapFilters['quantile']) {
  const value = record[column as keyof StoredValues]
  if (typeof value === 'number') return value
  return quantile === '0.05' ? record.q05 : quantile === '0.95' ? record.q95 : record.q50
}

function valueForRegion(regionId: string, filters: MapFilters): number | null {
  const key = comboKey(filters)
  const values = comboStore.get(key)?.get(regionId)
  if (!values) return null
  const column = quantileColumn(filters.quantile, filters.unit, filters.metric)
  return readValue(values, column, filters.quantile)
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
      await loadParquet()
      self.postMessage({ type: 'ready', requestId, payload: { manifest, regionIds } })
      return
    }

    if (type === 'valuesForFilters') {
      const filters = payload as MapFilters
      const key = comboKey(filters)
      const entries = comboStore.get(key)
      const values = new Float32Array(regionIds.length)
      const q05 = new Float32Array(regionIds.length)
      const q50 = new Float32Array(regionIds.length)
      const q95 = new Float32Array(regionIds.length)
      const column = quantileColumn(filters.quantile, filters.unit, filters.metric)
      const useCelsius = filters.unit === 'celsius' && TEMP_METRICS.has(filters.metric)

      if (entries) {
        for (const [regionId, record] of entries.entries()) {
          const idx = regionIndex.get(regionId)
          if (idx == null) continue
          const extended = record
          const low = useCelsius ? extended.q05_c ?? record.q05 : record.q05
          const mid = useCelsius ? extended.q50_c ?? record.q50 : record.q50
          const high = useCelsius ? extended.q95_c ?? record.q95 : record.q95
          const primary = readValue(extended, column, filters.quantile)
          values[idx] = primary
          q05[idx] = low
          q50[idx] = mid
          q95[idx] = high
        }
      }

      self.postMessage({
        type: 'valuesForFilters',
        requestId,
        payload: {
          values,
          q05,
          q50,
          q95,
          regionIds,
        },
      })
      return
    }

    if (type === 'regionValue') {
      const { regionId, filters } = payload as { regionId: string; filters: MapFilters }
      self.postMessage({
        type: 'regionValue',
        requestId,
        payload: valueForRegion(regionId, filters),
      })
      return
    }

    if (type === 'rankRegions') {
      const { criteria, limit } = payload as {
        criteria: MapFilters & { operator: 'lt' | 'gt'; threshold: number }
        limit: number
      }
      const key = comboKey(criteria)
      const entries = comboStore.get(key)
      const results: Array<{ regionId: string; value: number }> = []
      if (entries) {
        for (const [regionId, record] of entries.entries()) {
          const column = quantileColumn(criteria.quantile, criteria.unit, criteria.metric)
          const resolved = readValue(record, column, criteria.quantile)
          const matches =
            criteria.operator === 'lt' ? resolved < criteria.threshold : resolved > criteria.threshold
          if (matches) results.push({ regionId, value: resolved })
        }
      }
      results.sort((a, b) => a.value - b.value)
      self.postMessage({ type: 'rankRegions', requestId, payload: results.slice(0, limit) })
      return
    }

    if (type === 'compareRegions') {
      const { regionIds: ids, filters } = payload as { regionIds: string[]; filters: MapFilters }
      const periods = manifest?.metrics.find((metric) => metric.id === filters.metric)?.periods ?? []
      const payloadRows = ids.map((regionId) => ({
        regionId,
        points: periods.map((period) => ({
          period,
          value: valueForRegion(regionId, { ...filters, period }),
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
