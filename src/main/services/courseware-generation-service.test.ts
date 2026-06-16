import { describe, expect, it, vi } from 'vitest'
import {
  defaultClawSettings,
  defaultKunRuntimeSettings,
  defaultModelProviderSettings,
  defaultScheduleSettings,
  defaultWriteSettings,
  type AppSettingsV1
} from '../../shared/app-settings'
import {
  COURSEWARE_SLIDE_BATCH_SIZE,
  COURSEWARE_SLIDE_BATCH_TIMEOUT_MS,
  COURSEWARE_TIMEOUT_MS,
  generateCoursewareBlueprint,
  generateCoursewareSlides
} from './courseware-generation-service'

function settings(): AppSettingsV1 {
  const provider = defaultModelProviderSettings()
  provider.apiKey = 'sk-test'
  provider.providers[0].apiKey = 'sk-test'
  return {
    version: 1,
    locale: 'zh',
    theme: 'system',
    uiFontScale: 'small',
    provider,
    agents: {
      kun: {
        ...defaultKunRuntimeSettings(),
        model: 'deepseek-chat'
      }
    },
    workspaceRoot: 'C:\\workspace',
    log: { enabled: false, retentionDays: 7 },
    notifications: { turnComplete: true },
    appBehavior: { openAtLogin: false, startMinimized: false, closeToTray: false },
    write: defaultWriteSettings(),
    claw: defaultClawSettings(),
    schedule: defaultScheduleSettings(),
    guiUpdate: { channel: 'stable' }
  }
}

function response(content: string, status = 200): Response {
  return new Response(JSON.stringify({
    choices: [{ message: { content } }]
  }), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}

describe('generateCoursewareBlueprint', () => {
  it('uses a five-minute limit and returns a clear Chinese timeout message', async () => {
    const fetcher = vi.fn().mockRejectedValue(
      new DOMException('The operation was aborted due to timeout', 'TimeoutError')
    )

    const result = await generateCoursewareBlueprint(
      settings(),
      {
        request: {
          sourcePath: 'C:\\books\\immunology.pdf',
          pageStart: 1,
          pageEnd: 60,
          topic: '医学免疫学概论',
          durationMinutes: 90,
          audience: 'undergraduate',
          focus: '',
          includeRecentLiterature: false,
          maxLiteratureResults: 6
        },
        sourceText: '较长的教材内容'
      },
      fetcher
    )

    expect(COURSEWARE_TIMEOUT_MS).toBe(300_000)
    expect(result).toMatchObject({
      ok: false,
      code: 'PROVIDER_ERROR',
      message: '模型生成超过 5 分钟，请缩小教材页码范围或减少预计课件页数后重试。'
    })
  })

  it('repairs invalid model JSON once before returning a validated blueprint', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(response('{"title":"缺少字段"}'))
      .mockResolvedValueOnce(response(JSON.stringify({
        title: 'T 细胞活化',
        audience: 'undergraduate',
        durationMinutes: 90,
        teachingGoal: '解释 T 细胞活化所需信号。',
        sections: [{
          id: 'section-1',
          title: '三信号模型',
          objective: '建立机制主线。',
          summary: '从抗原识别、共刺激和细胞因子展开。',
          slideCount: 8,
          emphasis: ['机制链条'],
          interactionPrompt: '缺少信号 2 会发生什么？',
          visualSuggestion: '三列流程图'
        }]
      })))

    const result = await generateCoursewareBlueprint(
      settings(),
      {
        request: {
          sourcePath: 'C:\\books\\immunology.pdf',
          pageStart: 10,
          pageEnd: 20,
          topic: 'T 细胞活化',
          durationMinutes: 90,
          audience: 'undergraduate',
          focus: '三信号模型',
          includeRecentLiterature: false,
          maxLiteratureResults: 6
        },
        sourceText: '教材内容'
      },
      fetcher
    )

    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(result).toMatchObject({
      ok: true,
      repaired: true,
      blueprint: {
        title: 'T 细胞活化'
      }
    })
  })

  it('retries transient provider failures before returning a blueprint', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response('temporary overload', { status: 502 }))
      .mockResolvedValueOnce(response(JSON.stringify({
        title: 'B cell responses',
        audience: 'undergraduate',
        durationMinutes: 90,
        teachingGoal: 'Explain humoral immune response logic.',
        sections: [{
          id: 'section-1',
          title: 'B cell activation',
          objective: 'Connect antigen recognition to antibody production.',
          summary: 'B cells integrate BCR signaling, helper T cell support, and cytokines.',
          slideCount: 6,
          emphasis: ['BCR', 'Tfh help'],
          interactionPrompt: 'Why does T cell help improve antibody quality?',
          visualSuggestion: 'Left-to-right activation pathway'
        }]
      })))

    const result = await generateCoursewareBlueprint(
      settings(),
      {
        request: {
          sourcePath: 'C:\\books\\immunology.pdf',
          pageStart: 10,
          pageEnd: 20,
          topic: 'B cell responses',
          durationMinutes: 90,
          audience: 'undergraduate',
          focus: '',
          includeRecentLiterature: false,
          maxLiteratureResults: 6
        },
        sourceText: 'Textbook content'
      },
      fetcher
    )

    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(result).toMatchObject({
      ok: true,
      blueprint: {
        title: 'B cell responses'
      }
    })
  })

  it('returns a Chinese validation error after the repair response is still invalid', async () => {
    const fetcher = vi.fn()
      .mockImplementation(async () => response('{"title":"仍然缺少字段"}'))

    const result = await generateCoursewareBlueprint(
      settings(),
      {
        request: {
          sourcePath: 'C:\\books\\immunology.pdf',
          pageStart: 10,
          pageEnd: 20,
          topic: 'T 细胞活化',
          durationMinutes: 90,
          audience: 'graduate',
          focus: '',
          includeRecentLiterature: false,
          maxLiteratureResults: 6
        },
        sourceText: '教材内容'
      },
      fetcher
    )

    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(result).toMatchObject({
      ok: false,
      code: 'INVALID_MODEL_OUTPUT'
    })
    if (!result.ok) expect(result.message).toContain('结构化内容校验失败')
  })
})

describe('generateCoursewareSlides', () => {
  function slide(id: string, sectionId: string) {
    return {
      id,
      sectionId,
      kind: 'content',
      title: `Slide ${id}`,
      bullets: ['Key point'],
      speakerNotes: 'Teaching notes',
      evidenceRefs: []
    }
  }

  function slideInput(sectionCounts: number[]) {
    return {
      request: {
        sourcePath: 'C:\\books\\immunology.pdf',
        pageStart: 1,
        pageEnd: 80,
        topic: 'Medical immunology',
        durationMinutes: 180,
        audience: 'undergraduate' as const,
        focus: '',
        includeRecentLiterature: false,
        maxLiteratureResults: 6
      },
      blueprint: {
        title: 'Medical immunology',
        audience: 'undergraduate' as const,
        durationMinutes: 180,
        teachingGoal: 'Build a coherent immunology framework.',
        sections: sectionCounts.map((slideCount, index) => ({
          id: `section-${index + 1}`,
          title: `Section ${index + 1}`,
          objective: 'Explain the core mechanism.',
          summary: 'Connect recognition, activation, and effector responses.',
          slideCount,
          emphasis: ['Mechanism']
        }))
      },
      sourceText: 'Textbook content '.repeat(10_000)
    }
  }

  it('accepts an object-wrapped slides array for JSON-mode provider compatibility', async () => {
    const fetcher = vi.fn().mockResolvedValue(response(JSON.stringify({
      slides: [{
        id: 'slide-1',
        sectionId: 'section-1',
        kind: 'content',
        title: 'T 细胞活化信号',
        bullets: ['TCR 识别抗原肽-MHC'],
        speakerNotes: '先建立抗原特异性识别主线。',
        evidenceRefs: []
      }]
    })))

    const result = await generateCoursewareSlides(
      settings(),
      {
        request: {
          sourcePath: 'C:\\books\\immunology.pdf',
          pageStart: 10,
          pageEnd: 20,
          topic: 'T 细胞活化',
          durationMinutes: 90,
          audience: 'undergraduate',
          focus: '',
          includeRecentLiterature: false,
          maxLiteratureResults: 6
        },
        blueprint: {
          title: 'T 细胞活化',
          audience: 'undergraduate',
          durationMinutes: 90,
          teachingGoal: '解释 T 细胞活化所需信号。',
          sections: [{
            id: 'section-1',
            title: '三信号模型',
            objective: '建立机制主线。',
            summary: '从抗原识别、共刺激和细胞因子展开。',
            slideCount: 1,
            emphasis: ['机制链条']
          }]
        },
        sourceText: '教材内容'
      },
      fetcher
    )

    expect(result).toMatchObject({
      ok: true,
      value: [{ id: 'section-1-slide-1' }]
    })
  })

  it('caps a 59-slide blueprint at 35 pages and keeps each detailed-content request small', async () => {
    const batchSizes: number[] = []
    const fetcher = vi.fn().mockImplementation(async (_url, init) => {
      const body = JSON.parse(String(init?.body)) as {
        messages: Array<{ content: string }>
      }
      const prompt = body.messages.at(-1)?.content ?? ''
      const tasks = JSON.parse(
        prompt.match(/PAGE_TASKS_JSON=(.+)/)?.[1] ?? '[]'
      ) as Array<{ id: string; sectionId: string; title: string; kind: string }>
      batchSizes.push(tasks.length)
      return response(JSON.stringify({
        slides: tasks.map((task) => ({
          ...slide(task.id, task.sectionId),
          title: task.title,
          kind: task.kind
        }))
      }))
    })

    const result = await generateCoursewareSlides(
      settings(),
      slideInput([8, 8, 8, 8, 8, 8, 8, 3]),
      fetcher
    )

    expect(COURSEWARE_SLIDE_BATCH_SIZE).toBe(3)
    expect(fetcher).toHaveBeenCalledTimes(12)
    expect(Math.max(...batchSizes)).toBeLessThanOrEqual(3)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).toHaveLength(35)
      expect(new Set(result.value.map((item) => item.id)).size).toBe(35)
    }
  })

  it('does not report a placeholder deck as a successful teaching deck when every batch times out', async () => {
    const fetcher = vi.fn().mockRejectedValue(
      new DOMException('The operation was aborted due to timeout', 'TimeoutError')
    )

    const result = await generateCoursewareSlides(
      settings(),
      slideInput([12]),
      fetcher
    )

    expect(COURSEWARE_SLIDE_BATCH_TIMEOUT_MS).toBeGreaterThanOrEqual(90_000)
    expect(result).toMatchObject({
      ok: false,
      code: 'PROVIDER_ERROR'
    })
    if (!result.ok) expect(result.message).toContain('未生成可直接授课的课件')
  })

  it('asks the model for self-contained classroom-ready slide content instead of an outline', async () => {
    let requestBody = ''
    const fetcher = vi.fn().mockImplementation(async (_url, init) => {
      requestBody = String(init?.body)
      const body = JSON.parse(requestBody) as {
        messages: Array<{ content: string }>
        max_tokens: number
      }
      const prompt = body.messages.at(-1)?.content ?? ''
      const tasks = JSON.parse(
        prompt.match(/PAGE_TASKS_JSON=(.+)/)?.[1] ?? '[]'
      ) as Array<{ id: string; sectionId: string; title: string; kind: string }>
      return response(JSON.stringify({
        slides: tasks.map((task) => ({
          ...slide(task.id, task.sectionId),
          title: task.title,
          kind: task.kind
        }))
      }))
    })

    await generateCoursewareSlides(settings(), slideInput([3]), fetcher)

    const body = JSON.parse(requestBody) as {
      messages: Array<{ role: string; content: string }>
      max_tokens: number
    }
    const systemPrompt = body.messages.find((message) => message.role === 'system')?.content ?? ''
    expect(systemPrompt).toContain('可直接投屏授课')
    expect(systemPrompt).toContain('不是教学大纲')
    expect(systemPrompt).toContain('禁止元话语')
    expect(systemPrompt).toContain('完整陈述')
    expect(body.max_tokens).toBeGreaterThanOrEqual(6_000)
  })

  it('limits concurrent model batches to three', async () => {
    let activeRequests = 0
    let maxActiveRequests = 0
    const fetcher = vi.fn().mockImplementation(async (_url, init) => {
      activeRequests += 1
      maxActiveRequests = Math.max(maxActiveRequests, activeRequests)
      await new Promise((resolve) => setTimeout(resolve, 5))
      activeRequests -= 1

      const body = JSON.parse(String(init?.body)) as {
        messages: Array<{ content: string }>
      }
      const prompt = body.messages.at(-1)?.content ?? ''
      const tasks = JSON.parse(
        prompt.match(/PAGE_TASKS_JSON=(.+)/)?.[1] ?? '[]'
      ) as Array<{ id: string; sectionId: string; title: string; kind: string }>
      return response(JSON.stringify({
        slides: tasks.map((task) => ({
          ...slide(task.id, task.sectionId),
          title: task.title,
          kind: task.kind
        }))
      }))
    })

    await generateCoursewareSlides(
      settings(),
      slideInput([8, 8, 8, 8, 3]),
      fetcher
    )

    expect(maxActiveRequests).toBeLessThanOrEqual(3)
  })

  it('uses different textbook excerpts for different slide batches', async () => {
    const excerpts: string[] = []
    const fetcher = vi.fn().mockImplementation(async (_url, init) => {
      const body = JSON.parse(String(init?.body)) as {
        messages: Array<{ content: string }>
      }
      const prompt = body.messages.at(-1)?.content ?? ''
      excerpts.push(prompt.split('教材内容（当前批次对应片段）：\n')[1] ?? '')
      const tasks = JSON.parse(
        prompt.match(/PAGE_TASKS_JSON=(.+)/)?.[1] ?? '[]'
      ) as Array<{ id: string; sectionId: string; title: string; kind: string }>
      return response(JSON.stringify({
        slides: tasks.map((task) => ({
          ...slide(task.id, task.sectionId),
          title: task.title,
          kind: task.kind
        }))
      }))
    })
    const input = slideInput([5, 5, 5])
    input.sourceText = Array.from(
      { length: 4_000 },
      (_, index) => `TEXTBOOK_SEGMENT_${String(index).padStart(4, '0')}`
    ).join('\n')

    await generateCoursewareSlides(settings(), input, fetcher)

    expect(new Set(excerpts).size).toBeGreaterThan(1)
  })

  it('reports a complete placeholder deck while model batches are still running', async () => {
    const progress: Array<{
      completedBatches: number
      totalBatches: number
      slides: unknown[]
    }> = []
    const fetcher = vi.fn().mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5))
      return response('{"slides":[]}')
    })

    await (generateCoursewareSlides as unknown as (
      ...args: [
        AppSettingsV1,
        ReturnType<typeof slideInput>,
        typeof fetch,
        (value: {
          completedBatches: number
          totalBatches: number
          slides: unknown[]
        }) => void
      ]
    ) => Promise<unknown>)(
      settings(),
      slideInput([12]),
      fetcher,
      (value) => progress.push(value)
    )

    expect(progress[0]).toMatchObject({
      completedBatches: 0,
      totalBatches: 4
    })
    expect(progress[0]?.slides).toHaveLength(12)
    expect(progress.at(-1)).toMatchObject({
      completedBatches: 4,
      totalBatches: 4
    })
  })

  it('fills an empty slide response with distinct page tasks without a second request', async () => {
    const fetcher = vi.fn().mockResolvedValue(response('{"slides":[]}'))

    const result = await generateCoursewareSlides(
      settings(),
      slideInput([3]),
      fetcher
    )

    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.repaired).toBe(true)
      expect(result.value).toHaveLength(3)
      expect(new Set(result.value.map((item) => item.title)).size).toBe(3)
      expect(new Set(result.value.map((item) => item.bullets.join('\n'))).size).toBe(3)
      expect(result.value.flatMap((item) => item.bullets).join('\n')).not.toContain('本页聚焦')
      expect(result.value.flatMap((item) => item.bullets).join('\n')).not.toContain('教学目标')
    }
  })

  it('replaces model pages that repeat the same content with distinct planned pages', async () => {
    const fetcher = vi.fn().mockImplementation(async (_url, init) => {
      const body = JSON.parse(String(init?.body)) as {
        messages: Array<{ content: string }>
      }
      const prompt = body.messages.at(-1)?.content ?? ''
      const tasks = JSON.parse(
        prompt.match(/PAGE_TASKS_JSON=(.+)/)?.[1] ?? '[]'
      ) as Array<{ id: string; sectionId: string }>
      return response(JSON.stringify({
        slides: tasks.map((task) => ({
          id: task.id,
          sectionId: task.sectionId,
          kind: 'content',
          title: '完全重复的页面',
          bullets: ['完全相同的内容'],
          speakerNotes: '完全相同的讲稿',
          evidenceRefs: []
        }))
      }))
    })

    const result = await generateCoursewareSlides(
      settings(),
      slideInput([6]),
      fetcher
    )

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(new Set(result.value.map((item) => item.title)).size).toBe(6)
      expect(new Set(result.value.map((item) => item.bullets.join('\n'))).size).toBe(6)
    }
  })

  it('detects repeated content across separate parallel batches', async () => {
    const fetcher = vi.fn().mockImplementation(async (_url, init) => {
      const body = JSON.parse(String(init?.body)) as {
        messages: Array<{ content: string }>
      }
      const prompt = body.messages.at(-1)?.content ?? ''
      const tasks = JSON.parse(
        prompt.match(/PAGE_TASKS_JSON=(.+)/)?.[1] ?? '[]'
      ) as Array<{ id: string; sectionId: string }>
      return response(JSON.stringify({
        slides: tasks.map((task) => ({
          id: task.id,
          sectionId: task.sectionId,
          kind: 'content',
          title: '跨批次重复页面',
          bullets: ['跨批次完全相同的内容'],
          speakerNotes: '跨批次完全相同的讲稿',
          evidenceRefs: []
        }))
      }))
    })

    const result = await generateCoursewareSlides(
      settings(),
      slideInput([12, 12]),
      fetcher
    )

    expect(fetcher).toHaveBeenCalledTimes(8)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(new Set(result.value.map((item) => item.bullets.join('\n'))).size).toBe(24)
    }
  })
})
