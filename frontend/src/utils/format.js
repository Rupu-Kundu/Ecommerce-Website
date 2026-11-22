// All prices in the shop are Bangladeshi Taka (BDT). The backend stores and
// calculates in BDT too, so this only formats — it never converts.
const numberFormatter = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
})

/** 1500 → "৳1,500", "12999.00" → "৳12,999", 99.5 → "৳99.5" */
export function formatPrice(value) {
  const number = Number(value)
  return Number.isFinite(number) ? `৳${numberFormatter.format(number)}` : value
}

/** "2026-11-20T10:00:00Z" → "20 Nov 2026" */
export function formatDate(iso) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

/** Compact money for chart axes/labels: 950 → "৳950", 12900 → "৳12.9K", 4200000 → "৳4.2M" */
export function formatCompactPrice(value) {
  const n = Number(value) || 0
  const abs = Math.abs(n)
  if (abs >= 1e6) return `৳${(n / 1e6).toFixed(abs >= 1e7 ? 0 : 1).replace(/\.0$/, '')}M`
  if (abs >= 1e4) return `৳${(n / 1e3).toFixed(abs >= 1e5 ? 0 : 1).replace(/\.0$/, '')}K`
  return formatPrice(Math.round(n))
}

/** "2026-11-22" → "22 Nov" */
export function formatShortDate(isoDate) {
  const [y, m, d] = isoDate.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}
