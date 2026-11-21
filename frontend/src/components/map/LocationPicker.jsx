import { useEffect, useState } from 'react'
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import { DHAKA } from '../../utils/store'
import { TILE_ATTRIBUTION, TILE_URL, pinIcon } from './leaflet'

const round6 = (n) => Math.round(n * 1e6) / 1e6
const toPoint = ({ lat, lng }) => ({ lat: round6(lat), lng: round6(lng) })

function ClickToPin({ onPick }) {
  useMapEvents({ click: (e) => onPick(toPoint(e.latlng)) })
  return null
}

// Move the map when the pin is set from outside (e.g. "Use my location").
function FollowPin({ value }) {
  const map = useMap()
  useEffect(() => {
    if (value && !map.getBounds().contains([value.lat, value.lng])) map.flyTo([value.lat, value.lng], 16)
  }, [map, value])
  return null
}

/**
 * Optional delivery pin. value: {lat, lng} | null.
 * Tap the map to drop the pin, drag it to adjust, or use the device's location.
 */
export default function LocationPicker({ value, onChange }) {
  const [locating, setLocating] = useState(false)
  const [geoError, setGeoError] = useState('')

  function useMyLocation() {
    if (!navigator.geolocation) {
      setGeoError('Your browser cannot share its location. Tap the map instead.')
      return
    }
    setLocating(true)
    setGeoError('')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false)
        onChange(toPoint({ lat: pos.coords.latitude, lng: pos.coords.longitude }))
      },
      () => {
        setLocating(false)
        setGeoError('Could not get your location (permission denied or unavailable). Tap the map instead.')
      },
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  const center = value || DHAKA

  return (
    <div className="space-y-2" data-testid="location-picker">
      <div className="relative z-0 h-64 overflow-hidden rounded-xl border border-slate-300">
        <MapContainer center={[center.lat, center.lng]} zoom={value ? 16 : 12} scrollWheelZoom={false} className="h-full w-full">
          <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} />
          <ClickToPin onPick={onChange} />
          <FollowPin value={value} />
          {value && (
            <Marker
              position={[value.lat, value.lng]}
              icon={pinIcon()}
              draggable
              eventHandlers={{ dragend: (e) => onChange(toPoint(e.target.getLatLng())) }}
            />
          )}
        </MapContainer>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <button
          type="button"
          onClick={useMyLocation}
          disabled={locating}
          className="rounded-full border border-brand-300 bg-white px-3 py-1.5 font-semibold text-brand-800 hover:bg-brand-50 disabled:opacity-60"
        >
          {locating ? 'Finding you…' : '📍 Use my current location'}
        </button>
        {value && (
          <button type="button" onClick={() => onChange(null)} className="rounded-full px-3 py-1.5 font-medium text-slate-600 hover:bg-slate-100">
            Remove pin
          </button>
        )}
        <span className="text-xs text-slate-500" data-testid="pin-status">
          {value ? `Pinned at ${value.lat.toFixed(5)}, ${value.lng.toFixed(5)} — drag the pin to adjust.` : 'Tap the map to drop a pin at your door.'}
        </span>
      </div>
      {geoError && <p className="text-xs text-amber-700" role="status">{geoError}</p>}
    </div>
  )
}
