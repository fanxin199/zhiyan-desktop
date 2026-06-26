import { describe, expect, it } from 'vitest'
import { shouldShowTechnicalMetrics } from './SessionHeader'

describe('SessionHeader technical metrics visibility', () => {
  it('only shows the full technical metrics in the expanded header after opting in', () => {
    expect(shouldShowTechnicalMetrics(true, true)).toBe(false)
    expect(shouldShowTechnicalMetrics(false, false)).toBe(false)
    expect(shouldShowTechnicalMetrics(false, true)).toBe(true)
  })
})
