import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { NormalizedThread } from '../../agent/types'
import {
  dashboardActionCardMatches,
  filterDashboardActionCards,
  getDashboardTaskRecommendations,
  getRecentDashboardThreads,
  ZhiYanDashboard
} from './ZhiYanDashboard'

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

describe('ZhiYanDashboard quick search', () => {
  const cards = [
    {
      title: '制作课件 PPT',
      description: '上传教材 PDF，自动生成教学课件',
      keywords: ['课件', 'PPT', '教材', 'PDF']
    },
    {
      title: '文献阅读',
      description: '文献精读、关键图解读和组会汇报 PPT 制作',
      keywords: ['文献', '论文', 'PDF', '精读']
    },
    {
      title: '科研数据分析',
      description: '基于整理后数据生成 bulk 和单细胞可视化分析',
      keywords: ['数据', '分析', '单细胞', 'RNA-seq']
    }
  ]

  it('matches cards by direct keywords and natural demand text', () => {
    expect(dashboardActionCardMatches(cards[0], 'PPT')).toBe(true)
    expect(dashboardActionCardMatches(cards[1], '帮我读一篇论文')).toBe(true)
    expect(dashboardActionCardMatches(cards[2], '单细胞数据')).toBe(true)
    expect(dashboardActionCardMatches(cards[0], '单细胞数据')).toBe(false)
  })

  it('filters dashboard action cards without backend calls', () => {
    expect(filterDashboardActionCards(cards, 'PDF').map((card) => card.title)).toEqual([
      '制作课件 PPT',
      '文献阅读'
    ])
    expect(filterDashboardActionCards(cards, 'RNA-seq').map((card) => card.title)).toEqual([
      '科研数据分析'
    ])
  })

  it('renders the lightweight search input below the greeting', () => {
    const html = renderToStaticMarkup(dashboard())

    expect(html).toContain('输入关键词搜索功能，或直接描述需求…')
    expect(html.indexOf('输入关键词搜索功能，或直接描述需求…')).toBeLessThan(html.indexOf('教学工具'))
  })

  it('positions the writing capability as a free writing desk', () => {
    const html = renderToStaticMarkup(dashboard())

    expect(html).toContain('自由写作台')
    expect(html).toContain('自由草稿、长文编辑、局部润色和 DOCX/PDF 导出')
  })
})

describe('ZhiYanDashboard task recommendations', () => {
  it('recommends a concrete next task from recent research work without hiding direct entries', () => {
    const recommendations = getDashboardTaskRecommendations([
      thread('literature', 'TLS 文献精读', '2026-07-15T08:00:00.000Z', {
        projectId: 'teacher-project:literature:tls'
      }),
      thread('analysis', 'B 细胞单细胞分析', '2026-07-15T07:00:00.000Z', {
        projectId: 'teacher-project:bioinformatics:bcell'
      })
    ])

    expect(recommendations).toMatchObject([
      { sourceModuleId: 'literature', targetId: 'review-writing', title: '将文献证据整理成综述' },
      { sourceModuleId: 'bioinformatics', targetId: 'paper-polish', title: '把分析结果整理成论文段落' }
    ])
  })

  it('shows compact next-step recommendations only when usable history exists', () => {
    const withHistory = renderToStaticMarkup(dashboard({
      recentThreads: [thread('grant', '自然基金立项依据', '2026-07-15T08:00:00.000Z', {
        projectId: 'teacher-project:grant-writing:nsfc'
      })],
      onOpenRecentThread: noop
    }))
    const withoutHistory = renderToStaticMarkup(dashboard())

    expect(withHistory).toContain('推荐下一步')
    expect(withHistory).toContain('核验立项依据中的关键文献')
    expect(withHistory.indexOf('推荐下一步')).toBeLessThan(withHistory.indexOf('教学工具'))
    expect(withHistory).toContain('智能教案')
    expect(withHistory).toContain('科研数据分析')
    expect(withoutHistory).not.toContain('推荐下一步')
  })
})
