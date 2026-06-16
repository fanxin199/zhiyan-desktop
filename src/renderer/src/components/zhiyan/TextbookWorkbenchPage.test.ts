import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { TextbookWorkbenchPage } from './TextbookWorkbenchPage'

describe('TextbookWorkbenchPage', () => {
  it('renders the textbook-specific workflow entry screen', () => {
    const html = renderToStaticMarkup(createElement(TextbookWorkbenchPage))
    expect(html).toContain('data-testid="textbook-ai-parse-format-rules"')
    expect(html).toContain('data-format-rules-panel="auto-parse"')

    expect(html).toContain('教材编写工作台')
    expect(html).toContain('项目设置')
    expect(html).toContain('大纲设计')
    expect(html).toContain('逐节写作')
    expect(html).toContain('检查导出')
    expect(html).toContain('出版社要求')
    expect(html).not.toContain('自然基金撰写')
  })
})
