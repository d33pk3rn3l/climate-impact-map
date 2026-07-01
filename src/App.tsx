import { useEffect, useState } from 'react'
import { ComparePanel } from './components/ComparePanel'
import { FilterBar, Timeline } from './components/FilterBar'
import { Legend } from './components/Legend'
import { MapView } from './components/MapView'
import { RankPanel } from './components/RankPanel'
import { UnitToggle } from './components/UnitToggle'
import { exportCurrentView, fetchValuesForFilters, initDataWorker } from './lib/dataClient'
import { useMapStore } from './store/mapStore'

function App() {
  const manifest = useMapStore((state) => state.manifest)
  const ready = useMapStore((state) => state.ready)
  const loading = useMapStore((state) => state.loading)
  const error = useMapStore((state) => state.error)
  const filters = useMapStore((state) => state.filters)
  const setManifest = useMapStore((state) => state.setManifest)
  const setReady = useMapStore((state) => state.setReady)
  const setError = useMapStore((state) => state.setError)
  const hydrateFromUrl = useMapStore((state) => state.hydrateFromUrl)
  const [range, setRange] = useState<{ min: number | null; max: number | null }>({ min: null, max: null })

  useEffect(() => {
    hydrateFromUrl()
    void initDataWorker()
      .then(({ manifest: loadedManifest }) => {
        setManifest(loadedManifest)
        setReady(true)
      })
      .catch((err: Error) => setError(err.message))
  }, [hydrateFromUrl, setError, setManifest, setReady])

  useEffect(() => {
    if (!ready) return
    void fetchValuesForFilters(filters).then(({ values }) => {
      let min = Number.POSITIVE_INFINITY
      let max = Number.NEGATIVE_INFINITY
      for (const value of values) {
        if (Number.isNaN(value)) continue
        min = Math.min(min, value)
        max = Math.max(max, value)
      }
      setRange({
        min: Number.isFinite(min) ? min : null,
        max: Number.isFinite(max) ? max : null,
      })
    })
  }, [filters, ready])

  const onDownload = async () => {
    if (!manifest) return
    const { values, regionIds } = await fetchValuesForFilters(filters)
    exportCurrentView(manifest, regionIds, values, filters)
  }

  const onShare = () => {
    void navigator.clipboard.writeText(window.location.href)
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
      <header className="border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-500">Climate Impact Map</p>
            <h1 className="text-2xl font-semibold text-slate-900">Where should I move?</h1>
          </div>
          <div className="flex items-center gap-2">
            <UnitToggle />
            <button type="button" onClick={onShare} className="rounded-lg bg-white px-3 py-2 text-sm ring-1 ring-slate-200">
              Share
            </button>
            <button
              type="button"
              onClick={() => void onDownload()}
              disabled={!ready}
              className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              Download view
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-4 px-4 py-4 lg:grid-cols-[minmax(0,1fr)_220px]">
        <div className="space-y-4">
          {manifest && <FilterBar manifest={manifest} />}
          {manifest && <Timeline manifest={manifest} />}
          {loading && (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-500">
              Loading climate data…
            </div>
          )}
          {error && (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-700">
              Failed to load data: {error}
            </div>
          )}
          {manifest && ready && <MapView manifest={manifest} />}
          {manifest && <ComparePanel manifest={manifest} />}
          {manifest && <RankPanel manifest={manifest} />}
        </div>

        <div className="space-y-4">
          {manifest && <Legend manifest={manifest} min={range.min} max={range.max} />}
          <section className="rounded-2xl border border-slate-200 bg-white p-4 text-xs leading-relaxed text-slate-600 shadow-sm">
            <p>
              Data from{' '}
              <a href="https://impactlab.org/map/" className="font-medium text-orange-600 hover:underline">
                Climate Impact Lab
              </a>{' '}
              (CC BY 4.0).
            </p>
            <a href="https://impactlab.org/research/" className="mt-2 inline-block font-medium text-slate-800 hover:underline">
              View methodology
            </a>
          </section>
        </div>
      </main>
    </div>
  )
}

export default App
