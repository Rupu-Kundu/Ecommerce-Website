import { useState } from 'react'
import ProductImage from '../ProductImage'
import ImageLightbox from './ImageLightbox'

const HOVER_ZOOM = 2.2

/** All photos of a product: the main image first, then the gallery photos. */
function productPhotos(product) {
  const photos = []
  if (product.image) photos.push({ src: product.image, alt: product.name })
  for (const img of product.images || []) photos.push({ src: img.image, alt: img.alt_text || product.name })
  return photos
}

/**
 * Product photo gallery: big photo with a magnifier on hover (desktop), thumbnails
 * underneath, and a full-screen zoomable viewer on click/tap.
 */
export default function ProductGallery({ product }) {
  const photos = productPhotos(product)
  const [index, setIndex] = useState(0)
  const [open, setOpen] = useState(false)
  const [lens, setLens] = useState(null) // {x, y} in % while hovering

  if (photos.length === 0) {
    return (
      <div className="aspect-square overflow-hidden rounded-xl">
        <ProductImage product={product} />
      </div>
    )
  }

  const current = photos[Math.min(index, photos.length - 1)]

  return (
    <div className="space-y-3" data-testid="product-gallery">
      <button
        type="button"
        onClick={() => setOpen(true)}
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect()
          setLens({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 })
        }}
        onMouseLeave={() => setLens(null)}
        aria-label={`Zoom in on ${current.alt}`}
        className="group relative block aspect-square w-full cursor-zoom-in overflow-hidden rounded-xl bg-slate-50"
      >
        <img
          src={current.src}
          alt={current.alt}
          className="h-full w-full object-cover transition-transform duration-200"
          style={lens ? { transform: `scale(${HOVER_ZOOM})`, transformOrigin: `${lens.x}% ${lens.y}%` } : undefined}
          data-testid="gallery-main"
        />
        <span className="pointer-events-none absolute bottom-3 right-3 flex items-center gap-1 rounded-full bg-white/90 px-3 py-1.5 text-xs font-semibold text-slate-800 shadow">
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5M11 8v6M8 11h6" />
          </svg>
          <span className="hidden sm:inline">Hover to zoom · click to enlarge</span>
          <span className="sm:hidden">Tap to zoom</span>
        </span>
      </button>

      {photos.length > 1 && (
        <div className="flex gap-2" role="group" aria-label="Product photos">
          {photos.map((p, i) => (
            <button
              key={p.src}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`Show photo ${i + 1} of ${photos.length}`}
              aria-current={i === index}
              className={`h-20 w-20 overflow-hidden rounded-lg border-2 transition ${i === index ? 'border-brand-600' : 'border-slate-200 hover:border-slate-400'}`}
              data-testid="gallery-thumb"
            >
              <img src={p.src} alt="" loading="lazy" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}

      {open && (
        <ImageLightbox images={photos} index={index} onIndexChange={setIndex} onClose={() => setOpen(false)} title={product.name} />
      )}
    </div>
  )
}
