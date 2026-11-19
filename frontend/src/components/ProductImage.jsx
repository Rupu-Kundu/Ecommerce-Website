/** Product photo, or a neutral placeholder with the first letter when there's no image. */
export default function ProductImage({ product, className = '' }) {
  if (product.image) {
    return (
      <img
        src={product.image}
        alt={product.name}
        loading="lazy"
        className={`h-full w-full object-cover ${className}`}
      />
    )
  }
  return (
    <div
      aria-label={`${product.name} (no image)`}
      role="img"
      className={`flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 text-4xl font-bold text-slate-400 ${className}`}
    >
      {product.name.charAt(0).toUpperCase()}
    </div>
  )
}
