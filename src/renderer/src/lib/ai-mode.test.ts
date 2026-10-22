import { describe, expect, it } from 'vitest'
import { aiModeReasoningEffort } from './ai-mode'

describe('aiModeReasoningEffort', () => {
  it('turns reasoning off in fast mode and uses the deepest reasoning in deep mode', () => {
    expect(aiModeReasoningEffort('fast')).toBe('off')
    expect(aiModeReasoningEffort('deep')).toBe('max')
  })
})
