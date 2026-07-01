export type MetricId = 'tas-JJA' | 'tas-DJF' | 'tas-annual'
export type ScenarioId = 'ssp245' | 'ssp370' | 'ssp585'
export type PeriodId = '1986-2005' | '2020-2039' | '2040-2059' | '2080-2099'
export type MeasureId = 'absolute' | 'change-from-hist'
export type QuantileId = '0.05' | '0.5' | '0.95'
export type UnitId = 'fahrenheit' | 'celsius'

export interface MetricConfig {
  id: MetricId
  label: string
  kind: 'climate'
  scenarios: ScenarioId[]
  periods: PeriodId[]
  measures: MeasureId[]
}

export interface PaletteConfig {
  bins: number[]
  color_palette: string[]
}

export interface Manifest {
  version: number
  format: string
  region_count: number
  metrics: MetricConfig[]
  scenario_labels: Record<string, string>
  period_labels: Record<string, string>
  measure_labels: Record<string, string>
  palettes: Record<string, PaletteConfig>
  combos: Record<string, string>
  attribution: {
    source: string
    license: string
    url: string
  }
}

export interface MapFilters {
  metric: MetricId
  scenario: ScenarioId
  period: PeriodId
  measure: MeasureId
  quantile: QuantileId
  unit: UnitId
}

export interface CompareRegion {
  regionId: string
  label: string
}

export interface RankCriteria {
  metric: MetricId
  scenario: ScenarioId
  period: PeriodId
  measure: MeasureId
  quantile: QuantileId
  unit: UnitId
  operator: 'lt' | 'gt'
  threshold: number
}

export const DEFAULT_FILTERS: MapFilters = {
  metric: 'tas-JJA',
  scenario: 'ssp245',
  period: '1986-2005',
  measure: 'absolute',
  quantile: '0.5',
  unit: 'celsius',
}

export const TEMP_METRICS = new Set<MetricId>(['tas-JJA', 'tas-DJF', 'tas-annual'])

export function comboKey(filters: Pick<MapFilters, 'metric' | 'scenario' | 'period' | 'measure'>) {
  return `${filters.metric}|${filters.scenario}|${filters.period}|${filters.measure}`
}

export function paletteKey(metric: MetricId, measure: MeasureId) {
  return `${metric}_${measure}`
}
