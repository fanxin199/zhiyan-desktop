import { z } from 'zod'
import {
  resolveKunRuntimeSettings,
  type AppSettingsV1
} from '../../shared/app-settings'
import {
  coursewareBlueprintSchema,
  coursewareSlideSpecSchema,
  normalizeCoursewareSlideCounts,
  type CoursewareAudience,
  type CoursewareBlueprint,
  type CoursewareBlueprintGenerationInput,
  type CoursewareGenerationResult,
  type CoursewareSlideGenerationInput,
  type CoursewareSlideGenerationProgress,
  type CoursewareSlideRegenerationInput,
  type SlideSpec
} from '../../shared/courseware'
import { upstreamOpenAiChatCompletionsUrl } from '../../shared/openai-compat-url'
import {
  UNTRUSTED_MATERIAL_INSTRUCTION_ZH,
  wrapUntrustedPromptMaterial
} from '../../shared/prompt-boundary'
import {
  isRetryableHttpStatus,
  RetryableHttpResponseError,
  withProviderRetry
} from './provider-retry'

export const COURSEWARE_TIMEOUT_MS = 300_000
export const COURSEWARE_SLIDE_BATCH_TIMEOUT_MS = 120_000
export const COURSEWARE_SLIDE_BATCH_SIZE = 3
export const COURSEWARE_SLIDE_MAX_CONCURRENCY = 2
const MAX_SOURCE_TEXT_CHARS = 180_000
const MAX_SLIDE_SOURCE_TEXT_CHARS = 12_000

type ChatResponse = {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>
    }
  }>
}

type Message = {
  role: 'system' | 'user'
  content: string
}

type ModelCallOptions = {
  timeoutMs?: number
  maxTokens?: number
}

type SlideTask = {
  id: string
  sectionId: string
  title: string
  kind: SlideSpec['kind']
  purpose: string
  section: CoursewareBlueprint['sections'][number]
  ordinal: number
}

type SlideBatch = {
  index: number
  total: number
  tasks: SlideTask[]
}

type SlideProgressHandler = (progress: CoursewareSlideGenerationProgress) => void

function audienceInstruction(audience: CoursewareAudience): string {
  if (audience === 'graduate') {
    return '面向研究生：增加机制深度、争议点、实验设计、检测方法、替代解释和证据边界。'
  }
  if (audience === 'international') {
    return '面向国际学生：使用清晰英文作为课件主语言，关键专业术语附中英对照，避免中文语境隐含知识。'
  }
  return '面向本科二年级：先讲清主线和概念边界，少堆名词，多用机制链条和临床或实验例子，强调结构、功能与调控之间的关系。'
}

function clipText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text
  const head = Math.floor(maxChars * 0.72)
  const tail = maxChars - head
  return `${text.slice(0, head)}\n\n[中间内容因长度限制省略]\n\n${text.slice(-tail)}`
}

function clipSourceText(text: string): string {
  return clipText(text, MAX_SOURCE_TEXT_CHARS)
}

function contentFromResponse(raw: string): string {
  const parsed = JSON.parse(raw) as ChatResponse
  const content = parsed.choices?.[0]?.message?.content
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content.map((part) => part.text ?? '').join('')
}

function parseJsonValue(content: string): unknown {
  const trimmed = content.trim()
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  const candidate = fenced?.[1]?.trim() ?? trimmed
  try {
    return JSON.parse(candidate)
  } catch {
    const objectStart = candidate.indexOf('{')
    const arrayStart = candidate.indexOf('[')
    const starts = [objectStart, arrayStart].filter((value) => value >= 0)
    if (starts.length === 0) throw new Error('模型没有返回 JSON。')
    const start = Math.min(...starts)
    const objectEnd = candidate.lastIndexOf('}')
    const arrayEnd = candidate.lastIndexOf(']')
    const end = Math.max(objectEnd, arrayEnd)
    if (end <= start) throw new Error('模型返回的 JSON 不完整。')
    return JSON.parse(candidate.slice(start, end + 1))
  }
}

async function callModel(
  settings: AppSettingsV1,
  messages: Message[],
  fetcher: typeof fetch,
  options: ModelCallOptions = {}
): Promise<{ ok: true; content: string } | { ok: false; code: 'MISSING_API_KEY' | 'PROVIDER_ERROR'; message: string }> {
  const runtime = resolveKunRuntimeSettings(settings)
  const timeoutMs = options.timeoutMs ?? COURSEWARE_TIMEOUT_MS
  if (!runtime.apiKey.trim()) {
    return { ok: false, code: 'MISSING_API_KEY', message: '请先在设置中配置模型 API Key。' }
  }

  try {
    const { response, text } = await withProviderRetry(async () => {
      const response = await fetcher(upstreamOpenAiChatCompletionsUrl(runtime.baseUrl), {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${runtime.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: runtime.model,
          messages,
          temperature: 0.2,
          max_tokens: options.maxTokens ?? 12_000,
          response_format: { type: 'json_object' }
        }),
        signal: AbortSignal.timeout(timeoutMs)
      })
      const text = await response.text()
      if (!response.ok && isRetryableHttpStatus(response.status)) {
        throw new RetryableHttpResponseError(response.status, text)
      }
      return { response, text }
    })
    if (!response.ok) {
      return {
        ok: false,
        code: 'PROVIDER_ERROR',
        message: `模型请求失败（${response.status}）：${text.slice(0, 300)}`
      }
    }
    return { ok: true, content: contentFromResponse(text) }
  } catch (error) {
    const isTimeout =
      (error instanceof DOMException && error.name === 'TimeoutError') ||
      (error instanceof Error && /timed?\s*out|timeout/i.test(error.message))
    return {
      ok: false,
      code: 'PROVIDER_ERROR',
      message: isTimeout
        ? timeoutMs === COURSEWARE_TIMEOUT_MS
          ? '模型生成超过 5 分钟，请缩小教材页码范围或减少预计课件页数后重试。'
          : '课件单批生成超过 2 分钟，未完成该批次的授课版内容。'
        : error instanceof RetryableHttpResponseError
          ? `模型请求失败（${error.status}）：${error.bodyText.slice(0, 300)}`
          : error instanceof Error ? error.message : String(error)
    }
  }
}

async function requestValidatedJson<T>(
  settings: AppSettingsV1,
  schema: z.ZodType<T>,
  messages: Message[],
  fetcher: typeof fetch
): Promise<CoursewareGenerationResult<T>> {
  const first = await callModel(settings, messages, fetcher)
  if (!first.ok) return first

  let firstValue: unknown
  let firstIssues = ''
  try {
    firstValue = parseJsonValue(first.content)
    const parsed = schema.safeParse(firstValue)
    if (parsed.success) return { ok: true, value: parsed.data, repaired: false }
    firstIssues = parsed.error.issues.map((issue) =>
      `${issue.path.join('.') || 'root'}: ${issue.message}`
    ).join('\n')
  } catch (error) {
    firstIssues = error instanceof Error ? error.message : String(error)
  }

  const repair = await callModel(settings, [
    {
      role: 'system',
      content: '你是 JSON 修复器。只返回修复后的完整 JSON，不解释，不使用 Markdown 代码块。'
    },
    {
      role: 'user',
      content: [
        '以下 JSON 未通过课件数据校验。',
        '校验问题：',
        firstIssues,
        '',
        '原始输出：',
        first.content,
        '',
        '请保留原意并补齐缺失字段，严格返回一个合法 JSON。'
      ].join('\n')
    }
  ], fetcher)
  if (!repair.ok) return repair

  try {
    const parsed = schema.safeParse(parseJsonValue(repair.content))
    if (parsed.success) return { ok: true, value: parsed.data, repaired: true }
    return {
      ok: false,
      code: 'INVALID_MODEL_OUTPUT',
      message: `模型结构化内容校验失败：${parsed.error.issues[0]?.message ?? '未知格式错误'}`
    }
  } catch (error) {
    return {
      ok: false,
      code: 'INVALID_MODEL_OUTPUT',
      message: `模型结构化内容校验失败：${error instanceof Error ? error.message : String(error)}`
    }
  }
}

function evidencePrompt(evidence: CoursewareBlueprintGenerationInput['evidence']): string {
  if (!evidence?.length) return '本次不补充教材外文献。'
  return JSON.stringify(evidence.map((item) => ({
    id: item.id,
    title: item.title,
    pmid: item.pmid,
    doi: item.doi,
    year: item.year,
    sourceType: item.sourceType,
    abstract: item.abstract
  })), null, 2)
}

export async function generateCoursewareBlueprint(
  settings: AppSettingsV1,
  input: CoursewareBlueprintGenerationInput,
  fetcher: typeof fetch = fetch
): Promise<
  | { ok: true; blueprint: CoursewareBlueprint; repaired: boolean }
  | Exclude<CoursewareGenerationResult<CoursewareBlueprint>, { ok: true }>
> {
  const result = await requestValidatedJson(
    settings,
    coursewareBlueprintSchema,
    [
      {
        role: 'system',
        content: [
          '你是生物医学课程设计专家。严格围绕教师提供的学科、主题和材料工作，不擅自改成免疫学课程。',
          audienceInstruction(input.request.audience),
          '先设计教学蓝图，不生成逐页课件。',
          '无论教材多长，全部 section 的 slideCount 总和不得超过 35 页。',
          '输出必须是符合指定字段的 JSON，不得包含解释。',
          '蓝图要有清晰机制主线、合理页数、重点难点、互动节点和可视化建议。',
          '不能把转录特征直接当作功能结论，涉及前沿证据时标清证据边界。',
          UNTRUSTED_MATERIAL_INSTRUCTION_ZH
        ].join('\n')
      },
      {
        role: 'user',
        content: [
          `主题：${input.request.topic}`,
          `课时：${input.request.durationMinutes} 分钟`,
          `授课对象：${input.request.audience}`,
          `教师强调：${input.request.focus || '无额外要求'}`,
          '',
          '教材页段内容：',
          wrapUntrustedPromptMaterial(clipSourceText(input.sourceText), '教材页段内容'),
          '',
          '可用前沿证据：',
          wrapUntrustedPromptMaterial(evidencePrompt(input.evidence), '可用前沿证据'),
          '',
          '返回字段：title, audience, durationMinutes, teachingGoal, sections。',
          '每个 section 包含 id, title, objective, summary, slideCount, emphasis, interactionPrompt, visualSuggestion。'
        ].join('\n')
      }
    ],
    fetcher
  )

  return result.ok
    ? { ok: true, blueprint: result.value, repaired: result.repaired }
    : result
}

function slideTaskTitle(
  section: CoursewareBlueprint['sections'][number],
  ordinal: number
): string {
  const labels = [
    section.title,
    `${section.title}：核心概念`,
    `${section.title}：机制链条`,
    `${section.title}：关键细胞与分子`,
    `${section.title}：临床联系`,
    `${section.title}：实验与证据`,
    `${section.title}：易错点与边界`,
    `${section.title}：本节总结`
  ]
  return labels[ordinal - 1] ?? `${section.title}：进阶问题 ${ordinal - 7}`
}

function slideTaskKind(
  section: CoursewareBlueprint['sections'][number],
  ordinal: number
): SlideSpec['kind'] {
  if (section.interactionPrompt && ordinal === section.slideCount) return 'interaction'
  if (ordinal === 3 || ordinal === 4) return 'mechanism'
  if (ordinal === 5) return 'case'
  return 'content'
}

function createSlideTasks(blueprint: CoursewareBlueprint): SlideTask[] {
  const normalized = normalizeCoursewareSlideCounts(blueprint)
  return normalized.sections.flatMap((section) =>
    Array.from({ length: section.slideCount }, (_, index) => {
      const ordinal = index + 1
      const emphasis = section.emphasis[index % Math.max(1, section.emphasis.length)]
      return {
        id: `${section.id}-slide-${ordinal}`,
        sectionId: section.id,
        title: slideTaskTitle(section, ordinal).slice(0, 300),
        kind: slideTaskKind(section, ordinal),
        purpose: [
          `完成“${section.title}”第 ${ordinal}/${section.slideCount} 个独立教学任务`,
          emphasis ? `聚焦“${emphasis}”` : `聚焦“${section.objective}”`,
          ordinal === 1 ? '建立本节问题框架' : '承接前页并推进新的知识层次'
        ].join('；'),
        section,
        ordinal
      }
    })
  )
}

function createSlideBatches(tasks: SlideTask[]): SlideBatch[] {
  const taskGroups: SlideTask[][] = []
  for (let index = 0; index < tasks.length; index += COURSEWARE_SLIDE_BATCH_SIZE) {
    taskGroups.push(tasks.slice(index, index + COURSEWARE_SLIDE_BATCH_SIZE))
  }
  return taskGroups.map((batchTasks, index) => ({
    index,
    total: taskGroups.length,
    tasks: batchTasks
  }))
}

function sourceExcerptForBatch(sourceText: string, batch: SlideBatch): string {
  if (sourceText.length <= MAX_SLIDE_SOURCE_TEXT_CHARS) return sourceText
  const availableStart = sourceText.length - MAX_SLIDE_SOURCE_TEXT_CHARS
  const ratio = batch.total <= 1 ? 0 : batch.index / (batch.total - 1)
  const start = Math.round(availableStart * ratio)
  return sourceText.slice(start, start + MAX_SLIDE_SOURCE_TEXT_CHARS)
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
  onSettled?: (result: R, index: number) => void
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let nextIndex = 0

  async function runWorker(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex
      nextIndex += 1
      const result = await worker(items[index], index)
      results[index] = result
      onSettled?.(result, index)
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(concurrency, items.length) },
      () => runWorker()
    )
  )
  return results
}

function createFallbackSlide(task: SlideTask): SlideSpec {
  const emphasis = task.section.emphasis[
    (task.ordinal - 1) % Math.max(1, task.section.emphasis.length)
  ]
  const isInteraction = task.kind === 'interaction' && task.section.interactionPrompt
  const bullets = [
    task.section.summary,
    emphasis ? `${emphasis}是理解“${task.section.title}”的关键环节。` : task.section.objective,
    `${task.title}：${task.section.summary}`
  ].map((bullet) => bullet.slice(0, 1_000))

  return {
    id: task.id,
    sectionId: task.sectionId,
    kind: task.kind,
    title: task.title,
    bullets,
    speakerNotes: [
      `围绕“${task.title}”讲清本页核心概念，并与本节主线建立联系。`,
      task.section.summary,
      task.section.objective
    ].join('\n'),
    ...(isInteraction
      ? {
          interaction: {
            prompt: task.section.interactionPrompt as string,
            answer: `参考答案应结合本节目标与内容主线：${task.section.summary}`.slice(0, 4_000)
          }
        }
      : task.section.visualSuggestion && task.kind === 'mechanism'
        ? {
            visual: {
              type: 'flow' as const,
              title: task.section.visualSuggestion.slice(0, 300),
              nodes: [
                `起点：${task.section.objective.slice(0, 120)}`,
                emphasis ? `关键环节：${emphasis}` : '关键环节',
                `结果：${task.title}`
              ]
            }
          }
        : {}),
    evidenceRefs: []
  }
}

function slideContentSignature(slide: SlideSpec): string {
  return [
    slide.bullets.join('\n'),
    slide.speakerNotes,
    slide.interaction?.prompt ?? '',
    slide.interaction?.answer ?? ''
  ].join('\n').replace(/\s+/g, ' ').trim().toLowerCase()
}

function normalizeSlideBatch(value: unknown, batch: SlideBatch): {
  slides: SlideSpec[]
  repaired: boolean
} {
  const rawSlides =
    value && typeof value === 'object' && Array.isArray((value as { slides?: unknown }).slides)
      ? (value as { slides: unknown[] }).slides
      : []
  const rawById = new Map<string, unknown>()
  for (const rawSlide of rawSlides) {
    if (rawSlide && typeof rawSlide === 'object' && typeof (rawSlide as { id?: unknown }).id === 'string') {
      rawById.set((rawSlide as { id: string }).id, rawSlide)
    }
  }
  let repaired = rawSlides.length !== batch.tasks.length
  const signatures = new Set<string>()

  const slides = batch.tasks.map((task, index) => {
    const parsed = coursewareSlideSpecSchema.safeParse(rawById.get(task.id) ?? rawSlides[index])
    if (!parsed.success || parsed.data.sectionId !== task.sectionId) {
      repaired = true
      const fallback = createFallbackSlide(task)
      signatures.add(slideContentSignature(fallback))
      return fallback
    }

    const normalized: SlideSpec = {
      ...parsed.data,
      id: task.id,
      sectionId: task.sectionId,
      kind: task.kind,
      title: task.title
    }
    const signature = slideContentSignature(normalized)
    if (!signature || signatures.has(signature)) {
      repaired = true
      const fallback = createFallbackSlide(task)
      signatures.add(slideContentSignature(fallback))
      return fallback
    }
    signatures.add(signature)
    return normalized
  })

  return { slides, repaired }
}

async function generateSlideBatch(
  settings: AppSettingsV1,
  input: CoursewareSlideGenerationInput,
  batch: SlideBatch,
  fetcher: typeof fetch
): Promise<CoursewareGenerationResult<SlideSpec[]>> {
  const response = await callModel(
    settings,
    [
      {
        role: 'system',
        content: [
          '你是生物医学课件编写专家。严格围绕教师提供的学科、主题和材料工作，不擅自改成免疫学课程。',
          audienceInstruction(input.request.audience),
          '交付物必须是教师可直接投屏授课的正式课件，不是教学大纲、写作建议或备课提示。',
          '严格按逐页任务清单生成课件，每一页必须解决不同的教学问题。',
          `必须恰好生成 ${batch.tasks.length} 页，并严格使用任务清单中的 id、sectionId、kind 和 title。`,
          '禁止复制上一页的标题、正文、讲稿或图示；相邻页面必须有明确的内容推进。',
          'bullets 是学生在教室里实际看到的正文，不是“本页重点”“建议讲解”“可举例”等指导语。',
          '每页使用 3-5 条完整陈述，每条应直接讲清事实、机制、因果、比较或例子；单条通常 25-90 个汉字，不能只堆术语。',
          '禁止元话语：不得出现“本页将介绍”“教师应强调”“教学目标”“建议补充”“可从以下方面”等提纲式表达。',
          'speakerNotes 提供逐页讲授逻辑、过渡、易错点和提问方式，但关键知识不能只藏在备注中。',
          '机制页优先使用可编辑 flow/comparison 图，互动页必须给出问题与参考答案。',
          '只能引用提供的 evidence id，不能编造 PMID、DOI 或论文。',
          '只返回一个 JSON 对象，顶层字段固定为 slides。',
          UNTRUSTED_MATERIAL_INSTRUCTION_ZH
        ].join('\n')
      },
      {
        role: 'user',
        content: [
          `PAGE_TASKS_JSON=${JSON.stringify(batch.tasks.map((task) => ({
            id: task.id,
            sectionId: task.sectionId,
            title: task.title,
            kind: task.kind,
            purpose: task.purpose
          })))}`,
          `课程概况：${JSON.stringify({
            title: input.blueprint.title,
            audience: input.blueprint.audience,
            durationMinutes: input.blueprint.durationMinutes,
            teachingGoal: input.blueprint.teachingGoal
          })}`,
          `涉及教学环节：${JSON.stringify([...new Map(
            batch.tasks.map((task) => [task.sectionId, task.section])
          ).values()])}`,
          `课程请求：${JSON.stringify(input.request)}`,
          `证据：${wrapUntrustedPromptMaterial(evidencePrompt(input.evidence), '课件证据')}`,
          '',
          '教材内容（当前批次对应片段）：',
          wrapUntrustedPromptMaterial(
            sourceExcerptForBatch(input.sourceText, batch),
            `教材内容第 ${batch.index + 1}/${batch.total} 批`
          )
        ].join('\n')
      }
    ],
    fetcher,
    {
      timeoutMs: COURSEWARE_SLIDE_BATCH_TIMEOUT_MS,
      maxTokens: 7_000
    }
  )
  if (!response.ok) return response

  try {
    const normalized = normalizeSlideBatch(parseJsonValue(response.content), batch)
    return { ok: true, value: normalized.slides, repaired: normalized.repaired }
  } catch {
    const normalized = normalizeSlideBatch(undefined, batch)
    return { ok: true, value: normalized.slides, repaired: true }
  }
}

export async function generateCoursewareSlides(
  settings: AppSettingsV1,
  input: CoursewareSlideGenerationInput,
  fetcher: typeof fetch = fetch,
  onProgress?: SlideProgressHandler
): Promise<CoursewareGenerationResult<SlideSpec[]>> {
  if (!resolveKunRuntimeSettings(settings).apiKey.trim()) {
    return {
      ok: false,
      code: 'MISSING_API_KEY',
      message: '请先在设置中配置模型 API Key。'
    }
  }

  const tasks = createSlideTasks(input.blueprint)
  const batches = createSlideBatches(tasks)
  if (batches.length === 0) {
    return {
      ok: false,
      code: 'INVALID_MODEL_OUTPUT',
      message: '课件蓝图没有可生成的页面。'
    }
  }

  const slideById = new Map(
    tasks.map((task) => [task.id, createFallbackSlide(task)])
  )
  let completedBatches = 0
  let degradedBatches = 0
  const emitProgress = (): void => {
    if (!onProgress) return
    try {
      onProgress({
        generationId: input.generationId,
        completedBatches,
        totalBatches: batches.length,
        degradedBatches,
        slides: tasks.map((task) => slideById.get(task.id) as SlideSpec)
      })
    } catch {
      // Progress reporting must never interrupt courseware generation.
    }
  }
  emitProgress()

  const results = await mapWithConcurrency(
    batches,
    COURSEWARE_SLIDE_MAX_CONCURRENCY,
    (batch) => generateSlideBatch(settings, input, batch, fetcher),
    (result, batchIndex) => {
      completedBatches += 1
      if (result.ok) {
        for (const slide of result.value) slideById.set(slide.id, slide)
      } else {
        degradedBatches += 1
        for (const task of batches[batchIndex].tasks) {
          slideById.set(task.id, createFallbackSlide(task))
        }
      }
      emitProgress()
    }
  )
  const missingApiKey = results.find(
    (result) => !result.ok && result.code === 'MISSING_API_KEY'
  )
  if (missingApiKey && !missingApiKey.ok) return missingApiKey
  if (results.every((result) => !result.ok)) {
    return {
      ok: false,
      code: 'PROVIDER_ERROR',
      message: '所有模型批次均未完成，未生成可直接授课的课件。请检查模型服务后重新生成。'
    }
  }

  const taskById = new Map(tasks.map((task) => [task.id, task]))
  const signatures = new Set<string>()
  let deckRepaired = results.some((result) => !result.ok)
  const slides = results.flatMap((result, index) =>
    result.ok
      ? result.value
      : batches[index].tasks.map(createFallbackSlide)
  ).map((slide) => {
    const signature = slideContentSignature(slide)
    if (signature && !signatures.has(signature)) {
      signatures.add(signature)
      return slide
    }
    const task = taskById.get(slide.id)
    if (!task) return slide
    deckRepaired = true
    const fallback = createFallbackSlide(task)
    signatures.add(slideContentSignature(fallback))
    return fallback
  })

  return {
    ok: true,
    value: slides,
    repaired: deckRepaired || results.some((result) => result.ok && result.repaired),
    degradedBatches
  }
}

export async function regenerateCoursewareSlide(
  settings: AppSettingsV1,
  input: CoursewareSlideRegenerationInput,
  fetcher: typeof fetch = fetch
): Promise<CoursewareGenerationResult<SlideSpec>> {
  return requestValidatedJson(
    settings,
    coursewareSlideSpecSchema,
    [
      {
        role: 'system',
        content: [
          '你只重写一页生物医学课件，并保持教师原有学科与主题不变。',
          audienceInstruction(input.request.audience),
          '保持 slide id 与 sectionId 不变，只按教师指令修改当前页。',
          '只返回单个合法 JSON 对象。',
          UNTRUSTED_MATERIAL_INSTRUCTION_ZH
        ].join('\n')
      },
      {
        role: 'user',
        content: [
          `教师修改指令：${input.instruction}`,
          `当前页：${JSON.stringify(input.slide)}`,
          `蓝图：${JSON.stringify(input.blueprint)}`,
          `可用证据：${wrapUntrustedPromptMaterial(evidencePrompt(input.evidence), '课件证据')}`,
          `教材内容：${wrapUntrustedPromptMaterial(clipSourceText(input.sourceText), '教材内容')}`
        ].join('\n')
      }
    ],
    fetcher
  )
}
