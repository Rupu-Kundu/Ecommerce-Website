import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// OpenStreetMap tiles: free, no API key. Attribution is required by their licence.
export const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
export const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'

// A CSS pin instead of Leaflet's default PNG marker (whose image paths break in Vite builds).
export function pinIcon(color = '#067358') {
  return L.divIcon({
    className: '',
    html: `<span style="display:block;width:26px;height:26px;border-radius:50% 50% 50% 0;background:${color};transform:rotate(-45deg);border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35)"></span>`,
    iconSize: [26, 26],
    iconAnchor: [13, 26],
  })
}

/** 23.7441, 90.379 → link that opens the spot in Google Maps (works in the app on phones). */
export function directionsUrl(lat, lng) {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
}
