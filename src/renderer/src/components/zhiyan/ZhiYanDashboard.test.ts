import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { NormalizedThread } from '../../agent/types'
import { getRecentDashboardThreads, ZhiYanDashboard } from './ZhiYanDashboard'

const noop = vi.fn()

function dashboard(overrides: Partial<Parameters<typeof ZhiYanDashboard>[0]> = {}) {
  return createElement(ZhiYanDashboard, {
    onOpenSyllabus: noop,
    onOpenPptGen: noop,
    onOpenPaperPolish: noop,
    onOpenLiterature: noop,
    onOpenReviewWriting: noop,
    onOpenGrantWriting: noop,
    onOpenTextbook: noop,
    onOpenBioinformatics: noop,
    onOpenChat: noop,
    onOpenWrite: noop,
    ...overrides
  })
}

function thread(
  id: string,
  title: string,
  updatedAt: string,
  extra: Partial<NormalizedThread> = {}
): NormalizedThread {
  return {
    id,
    title,
    updatedAt,
    model: 'auto',
    mode: 'agent',
    workspace: 'J:\\workspace',
    ...extra
  }
}

describe('ZhiYanDashboard recent use', () => {
  it('selects the latest five non-archived conversations', () => {
    const recent = getRecentDashboardThreads([
      thread('old', '旧对话', '2026-06-20T00:00:00.000Z'),
      thread('archived', '已归档', '2026-06-30T00:00:00.000Z', { archived: true }),
      thread('one', '文献解读', '2026-06-29T06:00:00.000Z'),
      thread('two', '教案生成', '2026-06-29T05:00:00.000Z'),
      thread('three', '科研数据分析', '2026-06-29T04:00:00.000Z'),
      thread('four', '综述撰写', '2026-06-29T03:00:00.000Z'),
      thread('five', '自然基金', '2026-06-29T02:00:00.000Z'),
      thread('six', '更早会话', '2026-06-29T01:00:00.000Z')
    ])

    expect(recent.map((item) => item.id)).toEqual(['one', 'two', 'three', 'four', 'five'])
  })

  it('does not render the recent section when there is no history', () => {
    const html = renderToStaticMarkup(dashboard({ recentThreads: [] }))

    expect(html).not.toContain('最近使用')
  })

  it('renders recent conversations before the teaching tools section', () => {
    const html = renderToStaticMarkup(dashboard({
      recentThreads: [
        thread('thread-literature', '文献解读：B 细胞 TLS', '2026-06-29T06:00:00.000Z', {
          projectId: 'teacher-project:literature:abc'
        })
      ],
      onOpenRecentThread: noop
    }))

    expect(html).toContain('最近使用')
    expect(html).toContain('文献解读：B 细胞 TLS')
    expect(html.indexOf('最近使用')).toBeLessThan(html.indexOf('教学工具'))
  })
})
