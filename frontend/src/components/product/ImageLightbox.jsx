import { useEffect, useRef, useState } from 'react'

const ZOOMS = [1, 2, 3]

/**
 * Full-screen photo viewer. Click/tap the photo (or use + / −) to zoom in, then move the
 * mouse or drag with a finger to look around. ← → switch photos, Esc closes.
 */
export default function ImageLightbox({ images, index, onIndexChange, onClose, title }) {
  const [zoom, setZoom] = useState(1)
  const [origin, setOrigin] = useState({ x: 50, y: 50 })
  const frameRef = useRef(null)
  const closeRef = useRef(null)
  const image = images[index]

  useEffect(() => {
    closeRef.current?.focus()
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden' // no page scrolling behind the viewer
    return () => {
      document.body.style.overflow = previous
    }
  }, [])

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowRight') go(1)
      else if (e.key === 'ArrowLeft') go(-1)
      else if (e.key === '+' || e.key === '=') zoomBy(1)
      else if (e.key === '-') zoomBy(-1)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  })

  function go(step) {
    if (images.length < 2) return
    setZoom(1)
    setOrigin({ x: 50, y: 50 })
    onIndexChange((index + step + images.length) % images.length)
  }

  function zoomBy(step) {
    setZoom((z) => ZOOMS[Math.max(0, Math.min(ZOOMS.length - 1, ZOOMS.indexOf(z) + step))])
  }

  function pointAt(clientX, clientY) {
    const r = frameRef.current.getBoundingClientRect()
    setOrigin({
      x: Math.max(0, Math.min(100, ((clientX - r.left) / r.width) * 100)),
      y: Math.max(0, Math.min(100, ((clientY - r.top) / r.height) * 100)),
    })
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${title} photos`}
      className="fixed inset-0 z-[60] flex flex-col bg-slate-950/95 text-white"
      data-testid="lightbox"
    >
      <div className="flex items-center justify-between gap-2 px-4 py-3">
        <p className="min-w-0 truncate text-sm font-medium">
          {title} <span className="text-slate-400">· {index + 1} / {images.length}</span>
        </p>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => zoomBy(-1)} disabled={zoom === 1} aria-label="Zoom out" className="h-10 w-10 rounded-full text-xl hover:bg-white/10 disabled:opacity-30">−</button>
          <span className="w-12 text-center text-sm tabular-nums" data-testid="zoom-level">{zoom}×</span>
          <button type="button" onClick={() => zoomBy(1)} disabled={zoom === ZOOMS[ZOOMS.length - 1]} aria-label="Zoom in" className="h-10 w-10 rounded-full text-xl hover:bg-white/10 disabled:opacity-30">+</button>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Close photo viewer" className="ml-2 h-10 w-10 rounded-full text-2xl hover:bg-white/10">×</button>
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center px-2 pb-2 sm:px-14">
        <div
          ref={frameRef}
          className={`relative aspect-square h-full max-h-full max-w-full overflow-hidden rounded-lg bg-white touch-none ${zoom > 1 ? 'cursor-zoom-out' : 'cursor-zoom-in'}`}
          onClick={(e) => {
            pointAt(e.clientX, e.clientY)
            setZoom((z) => (z === 1 ? 2 : 1))
          }}
          onMouseMove={(e) => zoom > 1 && pointAt(e.clientX, e.clientY)}
          onTouchMove={(e) => zoom > 1 && pointAt(e.touches[0].clientX, e.touches[0].clientY)}
        >
          <img
            src={image.src}
            alt={image.alt}
            draggable={false}
            className="h-full w-full select-none object-contain transition-transform duration-150"
            style={{ transform: `scale(${zoom})`, transformOrigin: `${origin.x}% ${origin.y}%` }}
          />
        </div>
        {images.length > 1 && (
          <>
            <button type="button" onClick={() => go(-1)} aria-label="Previous photo" className="absolute left-2 top-1/2 h-11 w-11 -translate-y-1/2 rounded-full bg-white/15 text-2xl hover:bg-white/25 sm:left-3">‹</button>
            <button type="button" onClick={() => go(1)} aria-label="Next photo" className="absolute right-2 top-1/2 h-11 w-11 -translate-y-1/2 rounded-full bg-white/15 text-2xl hover:bg-white/25 sm:right-3">›</button>
          </>
        )}
      </div>

      {images.length > 1 && (
        <div className="flex justify-center gap-2 px-4 pb-4">
          {images.map((img, i) => (
            <button
              key={img.src}
              type="button"
              onClick={() => {
                setZoom(1)
                onIndexChange(i)
              }}
              aria-label={`Show photo ${i + 1}`}
              aria-current={i === index}
              className={`h-14 w-14 overflow-hidden rounded-md border-2 ${i === index ? 'border-white' : 'border-transparent opacity-60 hover:opacity-100'}`}
            >
              <img src={img.src} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
      <p className="pb-3 text-center text-xs text-slate-400">Tap the photo to zoom · move or drag to look around</p>
    </div>
  )
}
