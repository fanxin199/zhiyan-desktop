import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { FirstRunWelcome } from './FirstRunWelcome'

describe('FirstRunWelcome', () => {
  it('offers the examples or a first sentence', () => {
    const html = renderToStaticMarkup(createElement(FirstRunWelcome, { onDone: vi.fn() }))
    expect(html).toContain('看看示例')
    expect(html).toContain('一句话开始')
  })
})
