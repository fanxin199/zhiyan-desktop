import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { RevisionResult } from '@shared/artifact-revision'
import { RevisionResultCard, revisionHeadline } from './RevisionResultCard'
import { TextChangeHighlight } from './TextChangeHighlight'

function result(overrides: Partial<RevisionResult> = {}): RevisionResult {
  return {
    newVersion: 3,
    undoVersion: 2,
    summary: '导入改为慢阻肺病例',
    changes: [{ ref: '一、导入', before: '讲述哮喘病例。', after: '讲述慢阻肺病例，提出问题。' }],
    rebased: false,
    discardedOutsideScope: false,
    ...overrides
  }
}

describe('TextChangeHighlight', () => {
  it('marks added text green and removed text struck through', () => {
    const html = renderToStaticMarkup(createElement(TextChangeHighlight, { before: '讲述哮喘病例。', after: '讲述慢阻肺病例。' }))

    expect(html).toContain('<del class="text-ds-danger line-through" data-change="delete">哮喘</del>')
    expect(html).toContain('<ins class="rounded-sm bg-ds-success-soft text-ds-ink no-underline" data-change="insert">慢阻肺</ins>')
    expect(html).toContain('<span>讲述</span>')
  })
})

describe('RevisionResultCard', () => {
  it('says where and how much changed, with keep and undo', () => {
    const html = renderToStaticMarkup(createElement(RevisionResultCard, { result: result(), onKeep: vi.fn(), onUndo: vi.fn() }))

    expect(revisionHeadline(result())).toBe('已修改一、导入，2 处变化')
    expect(html).toContain('已修改一、导入，2 处变化')
    expect(html).toContain('导入改为慢阻肺病例')
    expect(html).toContain('保留')
    expect(html).toContain('撤销')
    expect(html).toContain('查看改动')
  })

  it('explains a rebased change and discarded edits outside the chosen part', () => {
    const html = renderToStaticMarkup(createElement(RevisionResultCard, {
      result: result({ rebased: true, discardedOutsideScope: true }), onKeep: vi.fn(), onUndo: vi.fn()
    }))

    expect(html).toContain('你在提问后改过内容，已按最新内容修改。')
    expect(html).toContain('AI 还改动了所选范围以外的内容，这部分已丢弃。')
  })

  it('has nothing to keep or undo when nothing changed, and reports an undo', () => {
    const unchanged = renderToStaticMarkup(createElement(RevisionResultCard, {
      result: result({ changes: [] }), onKeep: vi.fn(), onUndo: vi.fn()
    }))
    const undone = renderToStaticMarkup(createElement(RevisionResultCard, {
      result: result(), onKeep: vi.fn(), onUndo: vi.fn(), undone: true
    }))

    expect(unchanged).toContain('这部分没有需要修改的地方')
    expect(unchanged).not.toContain('撤销')
    expect(undone).toContain('已撤销这次修改')
    expect(undone).not.toContain('保留')
  })
})
