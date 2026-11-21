import { describe, expect, it } from 'vitest'
import { formatDate, formatPrice } from './format'

describe('formatPrice (BDT)', () => {
  it('formats whole taka with thousands separators', () => {
    expect(formatPrice(1500)).toBe('৳1,500')
    expect(formatPrice('12999.00')).toBe('৳12,999')
    expect(formatPrice('107880.00')).toBe('৳107,880')
  })
  it('keeps real decimals and never shows $', () => {
    expect(formatPrice('99.50')).toBe('৳99.5')
    expect(formatPrice(0)).toBe('৳0')
    expect(formatPrice(5)).not.toContain('$')
  })
  it('returns non-numbers unchanged', () => {
    expect(formatPrice('n/a')).toBe('n/a')
  })
})

describe('formatDate', () => {
  it('shows day month year', () => {
    expect(formatDate('2026-11-20T10:00:00Z')).toBe('20 Nov 2026')
  })
})
