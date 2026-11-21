const STAR = 'M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6L2.5 9.4l6.6-.8L12 2.5z'

function Star({ fill, className }) {
  // fill: 0..1 (partial stars for averages like 4.3)
  const id = `star-${Math.round(fill * 100)}`
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={id}>
          <stop offset={`${fill * 100}%`} stopColor="#f59e0b" />
          <stop offset={`${fill * 100}%`} stopColor="#e2e8f0" />
        </linearGradient>
      </defs>
      <path d={STAR} fill={`url(#${id})`} />
    </svg>
  )
}

/** Read-only stars. value: 0–5 (decimals allowed); count: number of ratings (optional). */
export default function StarRating({ value, count, size = 'sm', showValue = false }) {
  const cls = size === 'lg' ? 'h-6 w-6' : size === 'md' ? 'h-5 w-5' : 'h-4 w-4'
  const v = Number(value) || 0
  const label = count === 0 || value == null ? 'No ratings yet' : `Rated ${v.toFixed(1)} out of 5${count != null ? ` from ${count} ${count === 1 ? 'rating' : 'ratings'}` : ''}`
  return (
    <span className="inline-flex items-center gap-1" role="img" aria-label={label} data-testid="star-rating">
      <span className="flex">
        {[1, 2, 3, 4, 5].map((n) => (
          <Star key={n} fill={Math.max(0, Math.min(1, v - (n - 1)))} className={cls} />
        ))}
      </span>
      {showValue && value != null && <span className="text-sm font-semibold text-slate-800">{v.toFixed(1)}</span>}
      {count != null && <span className="text-xs text-slate-500">({count})</span>}
    </span>
  )
}

/** Clickable 1–5 star picker (radio group, keyboard friendly). */
export function StarInput({ value, onChange, name = 'rating' }) {
  const words = ['', 'Poor', 'Fair', 'Good', 'Very good', 'Excellent']
  return (
    <fieldset className="flex items-center gap-2">
      <legend className="sr-only">Your rating</legend>
      <span className="flex">
        {[1, 2, 3, 4, 5].map((n) => (
          <label key={n} className="cursor-pointer p-0.5" title={`${n} – ${words[n]}`}>
            <input
              type="radio"
              name={name}
              value={n}
              checked={value === n}
              onChange={() => onChange(n)}
              className="peer sr-only"
              aria-label={`${n} star${n > 1 ? 's' : ''} – ${words[n]}`}
            />
            <svg viewBox="0 0 24 24" className="h-8 w-8 rounded transition peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500" aria-hidden="true">
              <path d={STAR} fill={n <= value ? '#f59e0b' : '#e2e8f0'} />
            </svg>
          </label>
        ))}
      </span>
      <span className="text-sm font-medium text-slate-600">{words[value] || 'Tap a star'}</span>
    </fieldset>
  )
}
