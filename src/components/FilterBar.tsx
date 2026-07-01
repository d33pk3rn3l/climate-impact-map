import { useMapStore } from '../store/mapStore'
import type { Manifest, MetricId, MeasureId, PeriodId, QuantileId, ScenarioId } from '../lib/types'

interface FilterBarProps {
  manifest: Manifest
}

export function FilterBar({ manifest }: FilterBarProps) {
  const filters = useMapStore((state) => state.filters)
  const setFilters = useMapStore((state) => state.setFilters)
  const metric = manifest.metrics.find((item) => item.id === filters.metric) ?? manifest.metrics[0]

  return (
    <section className="rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-sm backdrop-blur">
      <p className="text-sm text-slate-600">
        Show me{' '}
        <Select
          value={filters.metric}
          onChange={(value) => setFilters({ metric: value as MetricId })}
          options={manifest.metrics.map((item) => ({ value: item.id, label: item.label }))}
        />{' '}
        under{' '}
        <Select
          value={filters.scenario}
          onChange={(value) => setFilters({ scenario: value as ScenarioId })}
          options={metric.scenarios.map((scenario) => ({
            value: scenario,
            label: manifest.scenario_labels[scenario] ?? scenario,
          }))}
        />{' '}
        with a{' '}
        <Select
          value={filters.quantile}
          onChange={(value) => setFilters({ quantile: value as QuantileId })}
          options={[
            { value: '0.05', label: '1-in-20 Low' },
            { value: '0.5', label: 'Median' },
            { value: '0.95', label: '1-in-20 High' },
          ]}
        />{' '}
        probability
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        {(['absolute', 'change-from-hist'] as MeasureId[]).map((measure) => (
          <button
            key={measure}
            type="button"
            onClick={() => setFilters({ measure })}
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
              filters.measure === measure
                ? 'bg-orange-500 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            {manifest.measure_labels[measure]}
          </button>
        ))}
      </div>
    </section>
  )
}

function Select({
  value,
  onChange,
  options,
}: {
  value: string
  onChange: (value: string) => void
  options: Array<{ value: string; label: string }>
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="mx-1 rounded-lg border border-orange-200 bg-orange-50 px-2 py-1 text-sm font-semibold text-orange-700"
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  )
}

export function Timeline({ manifest }: FilterBarProps) {
  const filters = useMapStore((state) => state.filters)
  const setFilters = useMapStore((state) => state.setFilters)
  const metric = manifest.metrics.find((item) => item.id === filters.metric) ?? manifest.metrics[0]
  const periods = metric.periods as PeriodId[]

  return (
    <div className="flex flex-wrap gap-2">
      {periods.map((period) => {
        const disabled = filters.measure === 'change-from-hist' && period === '1986-2005'
        return (
          <button
            key={period}
            type="button"
            disabled={disabled}
            onClick={() => setFilters({ period })}
            className={`rounded-full px-4 py-2 text-sm font-medium transition ${
              filters.period === period
                ? 'bg-slate-900 text-white'
                : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50'
            } ${disabled ? 'cursor-not-allowed opacity-40' : ''}`}
          >
            {manifest.period_labels[period]}
          </button>
        )
      })}
    </div>
  )
}
