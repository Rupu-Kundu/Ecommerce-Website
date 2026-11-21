import { describe, expect, it } from 'vitest'
import { previewShippingCost } from './checkoutService'

const standard = { code: 'standard', cost: '120.00', free_over: '5000.00' }
const express = { code: 'express', cost: '300.00', free_over: null }

describe('previewShippingCost (mirrors the backend rule)', () => {
  it('charges ৳120 standard below ৳5,000', () => {
    expect(previewShippingCost(standard, '4999.00')).toBe(120)
  })
  it('makes standard free at ৳5,000 or more', () => {
    expect(previewShippingCost(standard, '5000.00')).toBe(0)
    expect(previewShippingCost(standard, 14848)).toBe(0)
  })
  it('always charges ৳300 for express', () => {
    expect(previewShippingCost(express, 100000)).toBe(300)
  })
  it('is 0 while no method is loaded', () => {
    expect(previewShippingCost(undefined, 100)).toBe(0)
  })
})
