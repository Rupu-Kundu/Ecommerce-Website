import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import LocationPicker from './LocationPicker'

// Leaflet needs a real browser; the map itself is checked in the browser tests.
vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }) => <div data-testid="map">{children}</div>,
  TileLayer: () => null,
  Marker: () => <span data-testid="marker" />,
  useMap: () => ({ getBounds: () => ({ contains: () => true }), flyTo: () => {} }),
  useMapEvents: () => null,
}))
vi.mock('./leaflet', () => ({ TILE_URL: '', TILE_ATTRIBUTION: '', pinIcon: () => null }))

describe('LocationPicker', () => {
  afterEach(() => {
    delete navigator.geolocation
  })

  it('uses the device location (rounded to 6 decimals)', () => {
    const onChange = vi.fn()
    navigator.geolocation = {
      getCurrentPosition: (ok) => ok({ coords: { latitude: 23.79371234567, longitude: 90.40661234567 } }),
    }
    render(<LocationPicker value={null} onChange={onChange} />)
    expect(screen.getByTestId('pin-status')).toHaveTextContent('Tap the map')
    expect(screen.queryByTestId('marker')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Use my current location/ }))
    expect(onChange).toHaveBeenCalledWith({ lat: 23.793712, lng: 90.406612 })
  })

  it('explains when location is denied', () => {
    navigator.geolocation = { getCurrentPosition: (_ok, fail) => fail(new Error('denied')) }
    render(<LocationPicker value={null} onChange={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /Use my current location/ }))
    expect(screen.getByRole('status')).toHaveTextContent('Could not get your location')
  })

  it('shows the pin and lets the customer remove it', () => {
    const onChange = vi.fn()
    render(<LocationPicker value={{ lat: 23.7441, lng: 90.379 }} onChange={onChange} />)
    expect(screen.getByTestId('marker')).toBeInTheDocument()
    expect(screen.getByTestId('pin-status')).toHaveTextContent('Pinned at 23.74410, 90.37900')
    fireEvent.click(screen.getByRole('button', { name: 'Remove pin' }))
    expect(onChange).toHaveBeenCalledWith(null)
  })
})
