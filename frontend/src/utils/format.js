const priceFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
})

export function formatPrice(value) {
  const number = Number(value)
  return Number.isFinite(number) ? priceFormatter.format(number) : value
}
