import { useMapStore } from '../store/mapStore'

export function UnitToggle() {
  const unit = useMapStore((state) => state.filters.unit)
  const setFilters = useMapStore((state) => state.setFilters)

  return (
    <div className="inline-flex rounded-full bg-white p-1 shadow-sm ring-1 ring-slate-200">
      {(['fahrenheit', 'celsius'] as const).map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => setFilters({ unit: option })}
          className={`rounded-full px-3 py-1 text-sm font-medium ${
            unit === option ? 'bg-orange-500 text-white' : 'text-slate-600'
          }`}
        >
          °{option === 'celsius' ? 'C' : 'F'}
        </button>
      ))}
    </div>
  )
}
