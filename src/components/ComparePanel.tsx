import { useMapStore } from '../store/mapStore'
import { compareRegions } from '../lib/dataClient'
import { formatValue } from '../lib/colors'
import { useEffect, useState } from 'react'
import type { Manifest } from '../lib/types'

interface ComparePanelProps {
  manifest: Manifest
}

export function ComparePanel({ manifest }: ComparePanelProps) {
  const filters = useMapStore((state) => state.filters)
  const compareRegionsList = useMapStore((state) => state.compareRegions)
  const removeCompareRegion = useMapStore((state) => state.removeCompareRegion)
  const clearCompareRegions = useMapStore((state) => state.clearCompareRegions)
  const [rows, setRows] = useState<Array<{ regionId: string; points: Array<{ period: string; value: number | null }> }>>([])

  useEffect(() => {
    if (compareRegionsList.length === 0) {
      setRows([])
      return
    }
    void compareRegions(
      compareRegionsList.map((item) => item.regionId),
      filters,
    ).then(setRows)
  }, [compareRegionsList, filters])

  if (compareRegionsList.length === 0) return null

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-slate-900">Compare regions</h2>
        <button type="button" onClick={clearCompareRegions} className="text-xs text-slate-500 hover:text-slate-800">
          Clear
        </button>
      </div>
      <p className="mt-1 text-xs text-slate-500">Click map regions to add up to 3 locations.</p>
      <div className="mt-4 space-y-3">
        {rows.map((row) => (
          <div key={row.regionId} className="rounded-xl bg-slate-50 p-3">
            <div className="flex items-center justify-between">
              <div className="font-medium text-slate-800">{row.regionId}</div>
              <button
                type="button"
                onClick={() => removeCompareRegion(row.regionId)}
                className="text-xs text-slate-500 hover:text-slate-800"
              >
                Remove
              </button>
            </div>
            <div className="mt-2 grid gap-1 text-xs text-slate-600">
              {row.points.map((point) => (
                <div key={point.period} className="flex justify-between gap-3">
                  <span>{manifest.period_labels[point.period as keyof typeof manifest.period_labels] ?? point.period}</span>
                  <span className="font-medium text-slate-800">
                    {point.value == null ? '—' : formatValue(point.value, filters.unit)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
