import { useState } from 'react'
import type { Manifest } from '../lib/types'
import { useMapStore } from '../store/mapStore'
import { rankRegions } from '../lib/dataClient'
import { formatValue, serializeHashFilters } from '../lib/colors'

interface RankPanelProps {
  manifest: Manifest
}

export function RankPanel({ manifest: _manifest }: RankPanelProps) {
  const filters = useMapStore((state) => state.filters)
  const rankResults = useMapStore((state) => state.rankResults)
  const setRankResults = useMapStore((state) => state.setRankResults)
  const [operator, setOperator] = useState<'lt' | 'gt'>('lt')
  const [threshold, setThreshold] = useState('85')

  const runRank = async () => {
    const parsed = Number(threshold)
    if (Number.isNaN(parsed)) return
    const results = await rankRegions({ ...filters, operator, threshold: parsed }, 20)
    setRankResults(results)
  }

  const shareShortlist = () => {
    const params = new URLSearchParams(serializeHashFilters(filters).replace('#', ''))
    params.set('shortlist', rankResults.map((item) => item.regionId).join(','))
    const url = `${window.location.origin}${import.meta.env.BASE_URL}${window.location.pathname}#${params.toString()}`
    void navigator.clipboard.writeText(url)
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-900">Where should I move?</h2>
      <p className="mt-1 text-xs text-slate-500">Rank impact regions against a climate threshold.</p>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="text-xs text-slate-600">
          Threshold
          <input
            value={threshold}
            onChange={(event) => setThreshold(event.target.value)}
            className="mt-1 block w-28 rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
          />
        </label>
        <select
          value={operator}
          onChange={(event) => setOperator(event.target.value as 'lt' | 'gt')}
          className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
        >
          <option value="lt">below</option>
          <option value="gt">above</option>
        </select>
        <button
          type="button"
          onClick={() => void runRank()}
          className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white"
        >
          Rank regions
        </button>
        {rankResults.length > 0 && (
          <button type="button" onClick={shareShortlist} className="rounded-lg bg-orange-500 px-3 py-1.5 text-sm font-medium text-white">
            Copy shortlist link
          </button>
        )}
      </div>
      {rankResults.length > 0 && (
        <ol className="mt-4 space-y-2 text-sm text-slate-700">
          {rankResults.map((item, index) => (
            <li key={item.regionId} className="flex justify-between rounded-lg bg-slate-50 px-3 py-2">
              <span>
                {index + 1}. {item.regionId}
              </span>
              <span className="font-medium">{formatValue(item.value, filters.unit)}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
