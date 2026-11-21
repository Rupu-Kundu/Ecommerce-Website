import { Suspense, lazy } from 'react'

// Leaflet is ~150 KB, so it's only downloaded on pages that actually show a map.
const Picker = lazy(() => import('./LocationPicker'))
const Viewer = lazy(() => import('./LocationMap'))

function MapPlaceholder({ className = 'h-56' }) {
  return <div className={`animate-pulse rounded-xl bg-slate-100 ${className}`} aria-label="Loading map" />
}

export function LazyLocationPicker(props) {
  return (
    <Suspense fallback={<MapPlaceholder className="h-64" />}>
      <Picker {...props} />
    </Suspense>
  )
}

export function LazyLocationMap(props) {
  return (
    <Suspense fallback={<MapPlaceholder className={props.className} />}>
      <Viewer {...props} />
    </Suspense>
  )
}
