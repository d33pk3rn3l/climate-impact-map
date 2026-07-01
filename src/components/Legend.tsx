import type { Manifest } from '../lib/types'
import { useMapStore } from '../store/mapStore'
import { getPalette } from '../lib/colors'
import { formatValue } from '../lib/colors'

interface LegendProps {
  manifest: Manifest
  min: number | null
  max: number | null
}

export function Legend({ manifest, min, max }: LegendProps) {
  const filters = useMapStore((state) => state.filters)
  const palette = getPalette(manifest, filters)

  return (
    <aside className="rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-sm backdrop-blur">
      <h2 className="text-sm font-semibold text-slate-800">Scale</h2>
      <div className="mt-3 h-48 w-8 rounded-full" style={{ background: `linear-gradient(to top, ${palette.color_palette.join(',')})` }} />
      <div className="mt-2 flex h-48 flex-col justify-between text-xs text-slate-600">
        <span>{max != null ? formatValue(max, filters.unit) : '—'}</span>
        <span>{min != null ? formatValue(min, filters.unit) : '—'}</span>
      </div>
    </aside>
  )
}
