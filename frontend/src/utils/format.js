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
