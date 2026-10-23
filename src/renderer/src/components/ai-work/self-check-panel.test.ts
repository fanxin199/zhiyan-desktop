import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { SelfCheckSuggestion } from '@shared/self-check'
import { SelfCheckPanel } from './SelfCheckPanel'

const suggestion: SelfCheckSuggestion = {
  id: 'terms:il2',
  check: 'terms',
  title: 'IL-2 / IL2 写法不一致',
  detail: '统一为“IL-2”。',
  fix: { type: 'replace', edits: [{ find: 'IL2', replace: 'IL-2' }] }
}

describe('SelfCheckPanel', () => {
  it('counts suggestions and offers to accept or ignore each', () => {
    const html = renderToStaticMarkup(createElement(SelfCheckPanel, {
      state: { suggestions: [suggestion], checking: false, unchecked: 0 },
      onAccept: vi.fn()
    }))
    expect(html).toContain('AI 已自查：1 处建议')
    expect(html).toContain('术语一致')
    expect(html).toContain('采纳')
    expect(html).toContain('忽略')
  })

  it('says when nothing was found and when citations could not be looked up', () => {
    const html = renderToStaticMarkup(createElement(SelfCheckPanel, {
      state: { suggestions: [], checking: false, unchecked: 2 },
      onAccept: vi.fn()
    }))
    expect(html).toContain('AI 已自查：没有发现问题')
    expect(html).toContain('有 2 条引用暂时没能联网核验')
  })
})
