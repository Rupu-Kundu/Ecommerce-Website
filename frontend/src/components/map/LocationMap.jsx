import { MapContainer, Marker, TileLayer, Tooltip } from 'react-leaflet'
import { TILE_ATTRIBUTION, TILE_URL, directionsUrl, pinIcon } from './leaflet'

/** Read-only map with one pin and a "Get directions" link. */
export default function LocationMap({ lat, lng, label, zoom = 16, className = 'h-56' }) {
  const position = [Number(lat), Number(lng)]
  return (
    <div className="space-y-2" data-testid="location-map">
      <div className={`relative z-0 overflow-hidden rounded-xl border border-slate-200 ${className}`}>
        <MapContainer center={position} zoom={zoom} scrollWheelZoom={false} className="h-full w-full">
          <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} />
          <Marker position={position} icon={pinIcon()}>
            {label && <Tooltip direction="top" offset={[0, -24]} permanent>{label}</Tooltip>}
          </Marker>
        </MapContainer>
      </div>
      <a
        href={directionsUrl(lat, lng)}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:underline"
      >
        Get directions ↗
      </a>
    </div>
  )
}
