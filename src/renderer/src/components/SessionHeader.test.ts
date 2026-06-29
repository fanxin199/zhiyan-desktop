import { describe, expect, it } from 'vitest'
import { formatTeacherProjectLabel, shouldShowTechnicalMetrics } from './SessionHeader'

describe('SessionHeader technical metrics visibility', () => {
  it('only shows the full technical metrics in the expanded header after opting in', () => {
    expect(shouldShowTechnicalMetrics(true, true)).toBe(false)
    expect(shouldShowTechnicalMetrics(false, false)).toBe(false)
    expect(shouldShowTechnicalMetrics(false, true)).toBe(true)
  })
})

describe('SessionHeader project label', () => {
  it('formats teacher project labels for compact session context', () => {
    expect(formatTeacherProjectLabel({
      id: 'teacher-project:syllabus',
      name: '移植免疫',
      type: 'teaching',
      lastUsedAt: '2026-06-29T00:00:00.000Z'
    })).toBe('教案 · 移植免疫')
    expect(formatTeacherProjectLabel({
      id: 'teacher-project:literature',
      name: 'B 细胞综述',
      type: 'research',
      lastUsedAt: '2026-06-29T00:00:00.000Z'
    })).toBe('科研 · B 细胞综述')
  })
})
