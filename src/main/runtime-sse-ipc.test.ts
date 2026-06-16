import { describe, expect, it } from 'vitest'
import { runtimeSseIpcTestInternals } from './runtime-sse-ipc'

describe('runtime SSE IPC buffering', () => {
  it('rejects incomplete SSE buffers that exceed the configured cap', () => {
    const { appendSseChunkWithLimit, MAX_SSE_BUFFER_CHARS } = runtimeSseIpcTestInternals
    const almostFull = 'x'.repeat(MAX_SSE_BUFFER_CHARS - 1)

    expect(appendSseChunkWithLimit('', 'data: ok')).toBe('data: ok')
    expect(() => appendSseChunkWithLimit(almostFull, 'xx')).toThrow(/sse buffer exceeded/)
  })
})
