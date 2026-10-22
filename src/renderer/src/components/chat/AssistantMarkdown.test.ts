import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AssistantMarkdown, loadStreamdownAssistant } from './AssistantMarkdown'

const REPLY = [
  '不过在动笔之前，我需要了解几个关键信息：',
  '',
  '1. **怎么称呼你？**（姓名或职称，比如“王老师”）',
  '2. **研究方向是什么？**（比如肿瘤免疫、生物信息学）'
].join('\n')

function render(): string {
  return renderToStaticMarkup(createElement(AssistantMarkdown, { text: REPLY, streaming: false }))
}

describe('AssistantMarkdown', () => {
  it('shows the reply as plain text with its line breaks until the renderer has loaded', () => {
    const html = render()

    expect(html).toContain('data-markdown-pending')
    expect(html).toContain('whitespace-pre-wrap')
  })

  it('renders bold text next to Chinese punctuation and numbered lists once the renderer has loaded', async () => {
    await loadStreamdownAssistant()
    const html = render()

    expect(html).not.toContain('data-markdown-pending')
    expect(html).toContain('data-streamdown="ordered-list"')
    expect(html).toContain('data-streamdown="strong">怎么称呼你？</span>')
    expect(html).not.toContain('**')
  })
})
