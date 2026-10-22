import { describe, expect, it } from 'vitest'
import { routeAutoTitlesThreads } from './thread-title'

describe('routeAutoTitlesThreads', () => {
  it('names threads after the first request on chat and module pages but not on the writing page', () => {
    expect(routeAutoTitlesThreads('chat')).toBe(true)
    expect(routeAutoTitlesThreads('syllabus')).toBe(true)
    expect(routeAutoTitlesThreads('literature')).toBe(true)
    expect(routeAutoTitlesThreads('write')).toBe(false)
  })
})
