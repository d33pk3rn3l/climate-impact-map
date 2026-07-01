import { useEffect, useRef, useState } from 'react'
import maplibregl, { type Map, type MapGeoJSONFeature } from 'maplibre-gl'
import { Protocol } from 'pmtiles'
import type { Manifest } from '../lib/types'
import { useMapStore } from '../store/mapStore'
import { fetchValuesForFilters } from '../lib/dataClient'
import { buildColorExpression, formatValue, getPalette } from '../lib/colors'

const protocol = new Protocol()
maplibregl.addProtocol('pmtiles', protocol.tile)

interface MapViewProps {
  manifest: Manifest
}

export function MapView({ manifest }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<Map | null>(null)
  const regionIdsRef = useRef<string[]>([])
  const filters = useMapStore((state) => state.filters)
  const addCompareRegion = useMapStore((state) => state.addCompareRegion)
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
    if (!containerRef.current || mapRef.current) return

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {
          regions: {
            type: 'vector',
            url: `pmtiles://${window.location.origin}${import.meta.env.BASE_URL}data/regions.pmtiles`,
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
              'fill-color': '#cbd5e1',
              'fill-opacity': 0.85,
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

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-left')
    mapRef.current = map

    map.on('mousemove', 'regions-fill', (event) => {
      const feature = event.features?.[0] as MapGeoJSONFeature | undefined
      if (!feature?.id) return
      map.getCanvas().style.cursor = 'pointer'
      const regionId = String(feature.id)
      const values = (feature.state ?? {}) as Record<string, number>
      setHover({
        regionId,
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
      if (!mapRef.current) return
      map.getCanvas().style.cursor = ''
      setHover(null)
    })

    map.on('click', 'regions-fill', (event) => {
      const feature = event.features?.[0]
      if (!feature?.id) return
      const regionId = String(feature.id)
      addCompareRegion({
        regionId,
        label: regionId,
      })
    })

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [addCompareRegion])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    let cancelled = false

    const applyValues = async () => {
      const { values, q05, q50, q95, regionIds } = await fetchValuesForFilters(filters)
      if (cancelled || !mapRef.current) return
      regionIdsRef.current = regionIds

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
      map.setPaintProperty('regions-fill', 'fill-color', buildColorExpression(palette))
      setRange({
        min: Number.isFinite(min) ? min : null,
        max: Number.isFinite(max) ? max : null,
      })
    }

    if (map.isStyleLoaded()) {
      void applyValues()
    } else {
      map.once('load', () => {
        void applyValues()
      })
    }

    return () => {
      cancelled = true
    }
  }, [filters, manifest])

  return (
    <div className="relative h-[68vh] min-h-[420px] overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 shadow-inner">
      <div ref={containerRef} className="absolute inset-0" />
      {hover && (
        <div
          className="pointer-events-none absolute z-10 max-w-xs rounded-xl bg-white p-3 text-sm shadow-lg ring-1 ring-slate-200"
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
