import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ResizableTextArea } from './ResizableTextArea'

describe('ResizableTextArea', () => {
  it('renders a vertically resizable field with a visible resize marker', () => {
    const html = renderToStaticMarkup(
      createElement(ResizableTextArea, {
        value: '较长的教学内容',
        onChange: () => undefined
      })
    )

    expect(html).toContain('data-resizable-textarea="true"')
    expect(html).toContain('resize-y')
    expect(html).toContain('data-resize-marker="true"')
    expect(html).toContain('overflow-y-auto')
  })
})
