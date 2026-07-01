import { useEffect, useRef, useState } from 'react'
import maplibregl, { type Map, type MapGeoJSONFeature } from 'maplibre-gl'
import type { Manifest } from '../lib/types'
import { useMapStore } from '../store/mapStore'
import { fetchValuesForFilters } from '../lib/dataClient'
import { buildColorExpression, formatValue, getPalette } from '../lib/colors'
import { ensureRegionsPmtiles, pmtilesProtocol, pmtilesSourceUrl } from '../lib/pmtilesMemory'

maplibregl.addProtocol('pmtiles', pmtilesProtocol.tile)

interface MapViewProps {
  manifest: Manifest
}

function waitForLayout(element: HTMLElement) {
  return new Promise<void>((resolve) => {
    const check = () => {
      if (element.clientWidth > 0 && element.clientHeight > 0) {
        resolve()
        return
      }
      requestAnimationFrame(check)
    }
    check()
  })
}

export function MapView({ manifest }: MapViewProps) {
  const shellRef = useRef<HTMLDivElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<Map | null>(null)
  const filters = useMapStore((state) => state.filters)
  const addCompareRegion = useMapStore((state) => state.addCompareRegion)
  const [geometryReady, setGeometryReady] = useState(false)
  const [mapReady, setMapReady] = useState(false)
  const [geometryError, setGeometryError] = useState<string | null>(null)
  const [hover, setHover] = useState<{
    regionId: string
    iso: string
    value: number
    q05: number
    q50: number
    q95: number
    x: number
    y: number
  } | null>(null)
  const [range, setRange] = useState<{ min: number | null; max: number | null }>({ min: null, max: null })

  useEffect(() => {
    let cancelled = false
    void ensureRegionsPmtiles()
      .then(() => {
        if (!cancelled) setGeometryReady(true)
      })
      .catch((error: Error) => {
        if (!cancelled) setGeometryError(error.message)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!geometryReady || !containerRef.current) return

    let disposed = false
    const container = containerRef.current
    let map: Map | null = null

    let cleanupResize: (() => void) | undefined

    const initMap = async () => {
      await waitForLayout(container)
      if (disposed) return

      map = new maplibregl.Map({
        container,
        style: {
          version: 8,
          sources: {
            regions: {
              type: 'vector',
              url: pmtilesSourceUrl(),
              promoteId: 'hierid',
            },
          },
          layers: [
            {
              id: 'regions-fill',
              type: 'fill',
              source: 'regions',
              'source-layer': 'regions',
              paint: {
                'fill-color': '#64748b',
                'fill-opacity': 0.95,
              },
            },
            {
              id: 'regions-outline',
              type: 'line',
              source: 'regions',
              'source-layer': 'regions',
              paint: {
                'line-color': '#ffffff',
                'line-width': 0.2,
                'line-opacity': 0.35,
              },
            },
          ],
        },
        center: [10, 20],
        zoom: 1.3,
        attributionControl: false,
      })

      mapRef.current = map

      const resize = () => {
        if (!disposed && map) map.resize()
      }

      const onLoad = () => {
        resize()
        requestAnimationFrame(resize)
        window.setTimeout(resize, 100)
        if (!disposed) setMapReady(true)
      }

      map.on('load', onLoad)
      map.on('error', (event) => {
        console.error('MapLibre error:', event.error)
      })

      const resizeObserver = new ResizeObserver(() => resize())
      if (shellRef.current) resizeObserver.observe(shellRef.current)
      window.addEventListener('resize', resize)
      cleanupResize = () => {
        resizeObserver.disconnect()
        window.removeEventListener('resize', resize)
      }

      map.on('mousemove', 'regions-fill', (event) => {
        const feature = event.features?.[0] as MapGeoJSONFeature | undefined
        if (!feature?.id || !map) return
        map.getCanvas().style.cursor = 'pointer'
        const values = (feature.state ?? {}) as Record<string, number>
        setHover({
          regionId: String(feature.id),
          iso: String(feature.properties?.ISO ?? ''),
          value: values.value ?? Number.NaN,
          q05: values.q05 ?? Number.NaN,
          q50: values.q50 ?? Number.NaN,
          q95: values.q95 ?? Number.NaN,
          x: event.point.x,
          y: event.point.y,
        })
      })

      map.on('mouseleave', 'regions-fill', () => {
        if (!map) return
        map.getCanvas().style.cursor = ''
        setHover(null)
      })

      map.on('click', 'regions-fill', (event) => {
        const feature = event.features?.[0]
        if (!feature?.id) return
        addCompareRegion({
          regionId: String(feature.id),
          label: String(feature.id),
        })
      })
    }

    void initMap()

    return () => {
      disposed = true
      cleanupResize?.()
      map?.remove()
      mapRef.current = null
      setMapReady(false)
    }
  }, [addCompareRegion, geometryReady])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return

    let cancelled = false

    const applyValues = async () => {
      const { values, q05, q50, q95, regionIds } = await fetchValuesForFilters(filters)
      if (cancelled || !mapRef.current) return

      let min = Number.POSITIVE_INFINITY
      let max = Number.NEGATIVE_INFINITY

      for (let i = 0; i < regionIds.length; i += 1) {
        const value = values[i]
        if (Number.isNaN(value)) continue
        min = Math.min(min, value)
        max = Math.max(max, value)
        map.setFeatureState(
          { source: 'regions', sourceLayer: 'regions', id: regionIds[i] },
          { value, q05: q05[i], q50: q50[i], q95: q95[i] },
        )
      }

      const palette = getPalette(manifest, filters)
      map.setPaintProperty('regions-fill', 'fill-color', buildColorExpression(palette, filters.unit))
      map.resize()
      map.triggerRepaint()
      setRange({
        min: Number.isFinite(min) ? min : null,
        max: Number.isFinite(max) ? max : null,
      })
    }

    if (map.isStyleLoaded() && map.areTilesLoaded()) {
      void applyValues()
    } else {
      map.once('idle', () => {
        void applyValues()
      })
    }

    return () => {
      cancelled = true
    }
  }, [filters, manifest, mapReady])

  if (geometryError) {
    return (
      <div className="flex h-[68vh] min-h-[420px] items-center justify-center rounded-2xl border border-red-200 bg-red-50 text-red-700">
        Failed to load map geometry: {geometryError}
      </div>
    )
  }

  return (
    <div
      ref={shellRef}
      className="map-shell relative h-[68vh] min-h-[420px] w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 shadow-inner"
    >
      <div ref={containerRef} className="absolute inset-0 h-full w-full" />
      {!geometryReady && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-100/80 text-sm text-slate-600">
          Loading map geometry…
        </div>
      )}
      {hover && (
        <div
          className="pointer-events-none absolute z-20 max-w-xs rounded-xl bg-white p-3 text-sm shadow-lg ring-1 ring-slate-200"
          style={{ left: hover.x + 12, top: hover.y + 12 }}
        >
          <div className="font-semibold text-slate-900">{hover.regionId}</div>
          <div className="text-slate-500">{hover.iso}</div>
          <div className="mt-2 font-medium text-orange-600">
            {formatValue(hover.value, filters.unit)}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Range: {formatValue(hover.q05, filters.unit)} – {formatValue(hover.q95, filters.unit)}
          </div>
        </div>
      )}
      <div className="sr-only" aria-live="polite">
        Value range {range.min} to {range.max}
      </div>
    </div>
  )
}
