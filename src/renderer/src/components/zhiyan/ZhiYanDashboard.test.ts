import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { ArtifactListItem } from '@shared/artifact'
import type { NormalizedThread } from '../../agent/types'
import { resumeTargetFor } from '../../lib/resume-artifact'
import {
  ContinueWorkSection,
  continueWorkArtifacts,
  dashboardActionCardMatches,
  filterDashboardActionCards,
  getDashboardTaskRecommendations,
  getRecentDashboardThreads,
  recentThreadFeatureLabel,
  recentThreadTitle,
  ZhiYanDashboard
} from './ZhiYanDashboard'

const noop = vi.fn()

function dashboard(overrides: Partial<Parameters<typeof ZhiYanDashboard>[0]> = {}) {
  return createElement(ZhiYanDashboard, {
    onOpenModule: noop,
    ...overrides
  })
}

function artifact(id: string, updatedAt: string, extra: Partial<ArtifactListItem> = {}): ArtifactListItem {
  return {
    id,
    kind: 'document',
    title: `文稿 ${id}`,
    projectId: null,
    toolId: 'write',
    workspaceRoot: 'J:\\write',
    storage: { type: 'file', path: `J:\\write\\${id}.md` },
    stage: '',
    currentVersion: 1,
    createdAt: updatedAt,
    updatedAt,
    available: true,
    ...extra
  }
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

  it('hides conversations that still carry a placeholder title', () => {
    const recent = getRecentDashboardThreads([
      thread('thr_empty01', '新会话', '2026-06-29T06:00:00.000Z'),
      thread('thr_legacy1', 'New Thread', '2026-06-29T05:00:00.000Z'),
      thread('thr_idfallb', 'thr_idfa', '2026-06-29T04:00:00.000Z'),
      thread('thr_named01', '第八章呼吸系统教案', '2026-06-29T03:00:00.000Z')
    ])

    expect(recent.map((item) => item.id)).toEqual(['thr_named01'])
  })

  it('names recent conversations by task and shows the feature they belong to', () => {
    const literature = thread('lit', '文献阅读 · 精读：Smith2024', '2026-06-29T06:00:00.000Z', {
      projectId: 'teacher-project:literature:abc'
    })
    const syllabus = thread('syl', '智能教案生成：第八章 呼吸系统', '2026-06-29T05:00:00.000Z', {
      projectId: 'teacher-project:syllabus:def'
    })
    const writing = thread('wr', 'Write Assistant', '2026-06-29T04:00:00.000Z')
    const chat = thread('chat', '帮我设计一节翻转课堂', '2026-06-29T03:00:00.000Z')

    expect([literature, syllabus, writing, chat].map(recentThreadTitle)).toEqual([
      '精读：Smith2024',
      '第八章 呼吸系统',
      '写作助手对话',
      '帮我设计一节翻转课堂'
    ])
    expect([literature, syllabus, writing, chat].map(recentThreadFeatureLabel)).toEqual([
      '文献',
      '教案',
      '文稿',
      'AI 助手'
    ])

    const legacyLiterature = thread('old-lit', '你正在处理「文献阅读」模块中的科研任务', '2026-06-26T03:00:00.000Z')
    const legacySyllabus = thread('old-syl', '你是一个高校教学辅助AI，专门为大学教师生成...', '2026-06-16T03:00:00.000Z')
    expect([legacyLiterature, legacySyllabus].map(recentThreadTitle)).toEqual(['文献任务', '教案任务'])
    expect([legacyLiterature, legacySyllabus].map(recentThreadFeatureLabel)).toEqual(['文献', '教案'])

    // A title that only shares its first word with the short feature name keeps it.
    expect(recentThreadTitle(thread('tls', '文献解读：B 细胞 TLS', '2026-06-29T06:00:00.000Z', {
      projectId: 'teacher-project:literature:abc'
    }))).toBe('文献解读：B 细胞 TLS')
    // Conversations of the old paper, review and grant pages belong to 文稿.
    expect(recentThreadFeatureLabel(thread('grant', '自然基金立项依据', '2026-06-29T06:00:00.000Z', {
      projectId: 'teacher-project:grant-writing:nsfc'
    }))).toBe('文稿')
  })
})

describe('ZhiYanDashboard continue last work', () => {
  it('keeps the six latest deliverables whose files are still there', () => {
    const items = [
      artifact('a', '2026-10-20T08:00:00.000Z'),
      artifact('gone', '2026-10-23T08:00:00.000Z', { available: false }),
      ...['b', 'c', 'd', 'e', 'f', 'g'].map((id, index) => artifact(id, `2026-10-2${index}T09:00:00.000Z`))
    ]

    expect(continueWorkArtifacts(items).map((item) => item.id)).toEqual(['g', 'f', 'e', 'd', 'c', 'b'])
  })

  it('shows the title, kind, project, stage, progress and time of each deliverable', () => {
    const html = renderToStaticMarkup(createElement(ContinueWorkSection, {
      artifacts: [
        artifact('slides', '2026-10-22T08:00:00.000Z', {
          kind: 'courseware',
          title: '第八章 呼吸系统',
          toolId: 'ppt-gen',
          storage: { type: 'courseware-project', path: 'J:\\out\\第八章.zhiyan-courseware' },
          stage: '图片审核',
          progress: 0.6
        })
      ],
      locale: 'zh-CN',
      onOpen: noop
    }))

    expect(html).toContain('继续上次的工作')
    expect(html).toContain('第八章 呼吸系统')
    expect(html).toContain('课件 · 未归档')
    expect(html).toContain('图片审核')
    expect(html).toContain('完成 60%')
  })

  it('renders nothing without deliverables, and nothing on the home page until they load', () => {
    expect(renderToStaticMarkup(createElement(ContinueWorkSection, { artifacts: [], locale: 'zh-CN', onOpen: noop }))).toBe('')
    expect(renderToStaticMarkup(dashboard({ onOpenArtifact: noop }))).not.toContain('继续上次的工作')
  })

  it('reopens documents in 文稿, courseware in 课件 and other results in their tool', () => {
    expect(resumeTargetFor(artifact('doc', '2026-10-22T08:00:00.000Z'))).toEqual({ type: 'document' })
    // A lesson plan sent to the writing workspace is a Markdown file there.
    expect(resumeTargetFor(artifact('plan', '2026-10-22T08:00:00.000Z', { kind: 'lesson-plan', toolId: 'syllabus' })))
      .toEqual({ type: 'document' })
    expect(resumeTargetFor(artifact('ppt', '2026-10-22T08:00:00.000Z', {
      kind: 'courseware',
      toolId: 'ppt-gen',
      storage: { type: 'courseware-project', path: 'J:\\out\\a.zhiyan-courseware' }
    }))).toEqual({ type: 'courseware' })
    expect(resumeTargetFor(artifact('report', '2026-10-22T08:00:00.000Z', {
      kind: 'analysis-report',
      toolId: 'bioinformatics',
      storage: { type: 'file', path: 'J:\\analysis\\manifest.json' }
    }))).toEqual({ type: 'tool', toolId: 'bioinformatics' })
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
      description: '基于整理后数据生成批量转录组和单细胞可视化分析',
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

  it('offers one 文稿 card for papers, reviews, grants and everyday writing', () => {
    const html = renderToStaticMarkup(dashboard())

    expect(html).toContain('文稿')
    expect(html).toContain('论文、综述、国自然和日常文稿')
    expect(html).not.toContain('综述撰写')
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
      })]
    }))
    const withoutHistory = renderToStaticMarkup(dashboard())

    expect(withHistory).toContain('推荐下一步')
    expect(withHistory).toContain('核验立项依据中的关键文献')
    expect(withHistory.indexOf('推荐下一步')).toBeLessThan(withHistory.indexOf('教学工具'))
    expect(withHistory).toContain('课件')
    expect(withHistory).toContain('数据分析')
    expect(withoutHistory).not.toContain('推荐下一步')
  })
})
