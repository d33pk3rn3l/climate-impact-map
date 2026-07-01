import { create } from 'zustand'
import type { CompareRegion, Manifest, MapFilters, RankCriteria } from '../lib/types'
import { DEFAULT_FILTERS } from '../lib/types'
import { parseHashFilters, serializeHashFilters } from '../lib/colors'

interface MapStore {
  manifest: Manifest | null
  ready: boolean
  loading: boolean
  error: string | null
  filters: MapFilters
  compareRegions: CompareRegion[]
  rankResults: Array<{ regionId: string; value: number }>
  rankCriteria: RankCriteria | null
  setManifest: (manifest: Manifest) => void
  setReady: (ready: boolean) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  setFilters: (partial: Partial<MapFilters>) => void
  syncUrl: () => void
  hydrateFromUrl: () => void
  addCompareRegion: (region: CompareRegion) => void
  removeCompareRegion: (regionId: string) => void
  clearCompareRegions: () => void
  setRankResults: (results: Array<{ regionId: string; value: number }>) => void
  setRankCriteria: (criteria: RankCriteria | null) => void
}

function mergeFilters(current: MapFilters, partial: Partial<MapFilters>): MapFilters {
  return {
    metric: partial.metric ?? current.metric,
    scenario: partial.scenario ?? current.scenario,
    period: partial.period ?? current.period,
    measure: partial.measure ?? current.measure,
    quantile: partial.quantile ?? current.quantile,
    unit: partial.unit ?? current.unit,
  }
}

export const useMapStore = create<MapStore>((set, get) => ({
  manifest: null,
  ready: false,
  loading: true,
  error: null,
  filters: { ...DEFAULT_FILTERS },
  compareRegions: [],
  rankResults: [],
  rankCriteria: null,
  setManifest: (manifest) => set({ manifest }),
  setReady: (ready) => set({ ready, loading: !ready }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  setFilters: (partial) => {
    const filters = mergeFilters(get().filters, partial)
    set({ filters })
    get().syncUrl()
  },
  syncUrl: () => {
    const hash = serializeHashFilters(get().filters)
    if (window.location.hash !== hash) {
      window.history.replaceState(null, '', hash)
    }
  },
  hydrateFromUrl: () => {
    const partial = parseHashFilters(window.location.hash)
    if (Object.keys(partial).length > 0) {
      set({ filters: mergeFilters(get().filters, partial) })
    } else {
      get().syncUrl()
    }
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    const shortlist = params.get('shortlist')
    if (shortlist) {
      set({
        compareRegions: shortlist
          .split(',')
          .filter(Boolean)
          .slice(0, 3)
          .map((regionId) => ({ regionId, label: regionId })),
      })
    }
  },
  addCompareRegion: (region) =>
    set((state) => {
      if (state.compareRegions.some((item) => item.regionId === region.regionId)) return state
      if (state.compareRegions.length >= 3) return state
      return { compareRegions: [...state.compareRegions, region] }
    }),
  removeCompareRegion: (regionId) =>
    set((state) => ({
      compareRegions: state.compareRegions.filter((item) => item.regionId !== regionId),
    })),
  clearCompareRegions: () => set({ compareRegions: [] }),
  setRankResults: (rankResults) => set({ rankResults }),
  setRankCriteria: (rankCriteria) => set({ rankCriteria }),
}))
