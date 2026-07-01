import type { MapFilters, Manifest } from '../lib/types'
import { comboKey } from '../lib/types'
import { DATA_BASE } from '../lib/colors'

type WorkerMessage =
  | { type: 'ready'; requestId: string; payload: { manifest: Manifest; regionIds: string[] } }
  | { type: 'valuesForFilters'; requestId: string; payload: { values: Float32Array; regionIds: string[] } }
  | { type: 'regionValue'; requestId: string; payload: number | null }
  | { type: 'compareRegions'; requestId: string; payload: Array<{ regionId: string; points: Array<{ period: string; value: number | null }> }> }
  | { type: 'rankRegions'; requestId: string; payload: Array<{ regionId: string; value: number }> }
  | { type: 'error'; requestId: string; payload: string }

let worker: Worker | null = null
let requestCounter = 0

function getWorker() {
  if (!worker) {
    worker = new Worker(new URL('../workers/data.worker.ts', import.meta.url), { type: 'module' })
  }
  return worker
}

function callWorker<T>(type: string, payload?: unknown): Promise<T> {
  const requestId = `${++requestCounter}`
  const currentWorker = getWorker()

  return new Promise((resolve, reject) => {
    const onMessage = (event: MessageEvent<WorkerMessage>) => {
      if (event.data.requestId !== requestId) return
      currentWorker.removeEventListener('message', onMessage)
      if (event.data.type === 'error') {
        reject(new Error(event.data.payload))
        return
      }
      resolve(event.data.payload as T)
    }
    currentWorker.addEventListener('message', onMessage)
    currentWorker.postMessage({ type, requestId, payload })
  })
}

export async function initDataWorker() {
  return callWorker<{ manifest: Manifest; regionIds: string[] }>('init')
}

export async function fetchValuesForFilters(filters: MapFilters) {
  return callWorker<{
    values: Float32Array
    q05: Float32Array
    q50: Float32Array
    q95: Float32Array
    regionIds: string[]
  }>('valuesForFilters', filters)
}

export async function fetchRegionValue(regionId: string, filters: MapFilters) {
  return callWorker<number | null>('regionValue', { regionId, filters })
}

export async function rankRegions(criteria: MapFilters & { operator: 'lt' | 'gt'; threshold: number }, limit = 25) {
  return callWorker<Array<{ regionId: string; value: number }>>('rankRegions', { criteria, limit })
}

export async function compareRegions(regionIds: string[], filters: MapFilters) {
  return callWorker<Array<{ regionId: string; points: Array<{ period: string; value: number | null }> }>>(
    'compareRegions',
    { regionIds, filters },
  )
}

export function exportCurrentView(
  regionIds: string[],
  values: Float32Array,
  filters: MapFilters,
) {
  const lines = ['region_id,value']
  for (let i = 0; i < regionIds.length; i += 1) {
    const regionId = regionIds[i]
    const value = values[i]
    if (Number.isNaN(value)) continue
    lines.push(`${regionId},${value}`)
  }

  const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${comboKey(filters).replaceAll('|', '_')}.csv`
  anchor.click()
  URL.revokeObjectURL(url)
}

export { DATA_BASE }
