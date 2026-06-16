import { createRequire } from 'node:module'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import type { z } from 'zod'
import {
  resolveKunRuntimeSettings,
  type AppSettingsV1
} from '../../shared/app-settings'
import { upstreamOpenAiChatCompletionsUrl } from '../../shared/openai-compat-url'
import {
  createSectionsFromOutline,
  inferTextbookFormatRulesFromGuidelines,
  parseTextbookProject,
  textbookCheckResultSchema,
  textbookFormatRulesSchema,
  textbookOutlineSchema,
  textbookProjectSchema,
  textbookSectionDraftSchema,
  type TextbookCheckInput,
  type TextbookCheckResult,
  type TextbookExportInput,
  type TextbookExportResult,
  type TextbookFormatRules,
  type TextbookFormatRulesParseInput,
  type TextbookGenerationResult,
  type TextbookOutline,
  type TextbookOutlineGenerationInput,
  type TextbookProject,
  type TextbookReference,
  type TextbookSection,
  type TextbookSectionGenerationInput,
  type TextbookSectionRevisionInput
} from '../../shared/textbook'
import {
  isRetryableHttpStatus,
  RetryableHttpResponseError,
  withProviderRetry
} from './provider-retry'

type HtmlToDocxConverter = (
  htmlString: string,
  headerHtmlString?: string | null,
  documentOptions?: {
    title?: string
    creator?: string
    description?: string
    font?: string
    fontSize?: number
  },
  footerHtmlString?: string | null
) => Promise<ArrayBuffer | Blob | Buffer>

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

const require = createRequire(import.meta.url)
const htmlToDocx = require('html-to-docx') as HtmlToDocxConverter

const TEXTBOOK_TIMEOUT_MS = 300_000
const MAX_PROJECT_PROMPT_CHARS = 180_000
const MAX_SECTION_CONTEXT_CHARS = 90_000

function clipText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text
  const head = Math.floor(maxChars * 0.7)
  const tail = maxChars - head
  return `${text.slice(0, head)}\n\n[中间内容因长度限制省略]\n\n${text.slice(-tail)}`
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
  options: { maxTokens?: number } = {}
): Promise<{ ok: true; content: string } | { ok: false; code: 'MISSING_API_KEY' | 'PROVIDER_ERROR'; message: string }> {
  const runtime = resolveKunRuntimeSettings(settings)
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
        signal: AbortSignal.timeout(TEXTBOOK_TIMEOUT_MS)
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
    return {
      ok: false,
      code: 'PROVIDER_ERROR',
      message: error instanceof Error ? error.message : String(error)
    }
  }
}

async function requestValidatedJson<T>(
  settings: AppSettingsV1,
  schema: z.ZodType<T>,
  messages: Message[],
  fetcher: typeof fetch,
  maxTokens?: number
): Promise<TextbookGenerationResult<T>> {
  const first = await callModel(settings, messages, fetcher, { maxTokens })
  if (!first.ok) return first

  let issues = ''
  try {
    const parsed = schema.safeParse(parseJsonValue(first.content))
    if (parsed.success) return { ok: true, value: parsed.data, repaired: false }
    issues = parsed.error.issues.map((issue) =>
      `${issue.path.map(String).join('.') || 'root'}: ${issue.message}`
    ).join('\n')
  } catch (error) {
    issues = error instanceof Error ? error.message : String(error)
  }

  const repair = await callModel(settings, [
    {
      role: 'system',
      content: '你是 JSON 修复器。只返回修复后的完整 JSON，不解释，不使用 Markdown 代码块。'
    },
    {
      role: 'user',
      content: [
        '以下教材写作 JSON 没有通过结构校验。',
        '校验问题：',
        issues,
        '',
        '原始输出：',
        first.content,
        '',
        '请保留原意并补齐缺失字段，严格返回一个合法 JSON。'
      ].join('\n')
    }
  ], fetcher, { maxTokens })
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

function audienceInstruction(audience: string): string {
  if (audience === 'graduate') {
    return '面向研究生教材：增加机制深度、争议点、实验方法、证据边界和研究设计。'
  }
  if (audience === 'international') {
    return '面向国际学生教材：表达清晰，关键免疫学术语给出必要英文对照，避免中文语境隐含知识。'
  }
  return '面向本科二年级教材：先讲主线和概念边界，少堆名词，多用机制链条和临床/实验例子。'
}

function projectContext(project: TextbookProject): string {
  return clipText(JSON.stringify({
    metadata: project.metadata,
    publisherGuidelines: project.publisherGuidelines,
    formatRules: project.formatRules,
    outline: project.outline,
    sections: project.sections.map((section) => ({
      id: section.id,
      title: section.title,
      status: section.status,
      teacherNotes: section.teacherNotes,
      content: clipText(section.content, 8_000)
    })),
    references: project.references.map((reference) => ({
      key: reference.key,
      title: reference.title,
      pmid: reference.pmid,
      doi: reference.doi,
      year: reference.year,
      abstract: reference.abstract
    }))
  }), MAX_PROJECT_PROMPT_CHARS)
}

function findSection(project: TextbookProject, sectionId: string): TextbookSection {
  const section = project.sections.find((item) => item.id === sectionId)
  if (!section) throw new Error('未找到当前教材章节。')
  return section
}

function referencesPrompt(references: TextbookReference[]): string {
  if (!references.length) return '当前项目尚未加入参考文献。'
  return JSON.stringify(references.map((reference) => ({
    key: reference.key,
    title: reference.title,
    pmid: reference.pmid,
    doi: reference.doi,
    year: reference.year,
    journal: reference.journal,
    abstract: reference.abstract
  })), null, 2)
}

export async function parseTextbookFormatRules(
  settings: AppSettingsV1,
  input: TextbookFormatRulesParseInput,
  fetcher: typeof fetch = fetch
): Promise<TextbookGenerationResult<TextbookFormatRules>> {
  const baseline = inferTextbookFormatRulesFromGuidelines(input.publisherGuidelines, input.currentRules)
  return requestValidatedJson(
    settings,
    textbookFormatRulesSchema,
    [
      {
        role: 'system',
        content: [
          '你是医学教材出版规范解析助手。',
          '任务是把出版社要求原文转化为可编辑、可导出的结构化格式规则。',
          '只能依据原文和已有规则抽取，不要编造出版社没有提出的要求。',
          '明确可执行的字体、字号、行距、标题层级、符号/标点规则要写入对应字段。',
          '无法可靠机器执行或需要出版社模板人工确认的内容，放入 unresolvedRules。',
          '只返回 JSON 对象，不解释，不使用 Markdown。'
        ].join('\n')
      },
      {
        role: 'user',
        content: [
          `当前规则：${JSON.stringify(input.currentRules)}`,
          `本地初步解析结果：${JSON.stringify(baseline)}`,
          '',
          '出版社要求原文：',
          input.publisherGuidelines || '未提供',
          '',
          '返回字段：fontFamily, fontSizePt, lineSpacing, headingPattern, symbolRules, unresolvedRules。'
        ].join('\n')
      }
    ],
    fetcher,
    4_000
  )
}

export async function generateTextbookOutline(
  settings: AppSettingsV1,
  input: TextbookOutlineGenerationInput,
  fetcher: typeof fetch = fetch
): Promise<TextbookGenerationResult<TextbookOutline>> {
  return requestValidatedJson(
    settings,
    textbookOutlineSchema,
    [
      {
        role: 'system',
        content: [
          '你是医学免疫学教材总主编，负责从零设计可执行的全书写作大纲。',
          audienceInstruction(input.metadata.audience),
          '必须遵守出版社要求；如果要求中有字体、间距、标点、编号或符号规范，要把它们转化为章节写作约束。',
          '大纲必须服务后续逐节写作，每一节都要有明确写作目标、预计字数和关键概念。',
          '只返回 JSON 对象，不解释，不使用 Markdown。'
        ].join('\n')
      },
      {
        role: 'user',
        content: [
          `教材元数据：${JSON.stringify(input.metadata)}`,
          `可编辑格式规则：${JSON.stringify(input.formatRules)}`,
          '',
          '出版社要求原文：',
          input.publisherGuidelines || '未提供',
          '',
          '教师补充说明：',
          input.teacherBrief || '无',
          '',
          '返回字段：title, rationale, chapters。每个 chapter 包含 id, title, writingGoal, sections；每个 section 包含 id, chapterId, title, writingGoal, estimatedWords, keyConcepts, confirmed。'
        ].join('\n')
      }
    ],
    fetcher,
    12_000
  )
}

export async function generateTextbookSection(
  settings: AppSettingsV1,
  input: TextbookSectionGenerationInput,
  fetcher: typeof fetch = fetch
): Promise<TextbookGenerationResult<{ section: TextbookSection }>> {
  const section = findSection(input.project, input.sectionId)
  const draft = await requestValidatedJson(
    settings,
    textbookSectionDraftSchema,
    [
      {
        role: 'system',
        content: [
          '你是医学免疫学教材作者。生成当前小节的正式教材正文，而不是写作建议。',
          audienceInstruction(input.project.metadata.audience),
          '严格遵守出版社要求和项目格式规则。',
          '正文使用 Markdown：节标题用二级标题，必要的小标题用三级标题。',
          '可以只引用项目参考文献库中已有 key，引用格式使用 [@key]，不得编造 PMID、DOI 或文献。',
          '涉及免疫机制时区分已证实事实、合理推断和需要验证的问题。',
          '只返回 JSON 对象，字段为 content 和 referenceKeys。'
        ].join('\n')
      },
      {
        role: 'user',
        content: [
          `当前节：${JSON.stringify(section)}`,
          `教师本次要求：${input.instruction || '无'}`,
          '',
          '项目上下文：',
          clipText(projectContext(input.project), MAX_SECTION_CONTEXT_CHARS),
          '',
          '项目参考文献库：',
          referencesPrompt(input.project.references)
        ].join('\n')
      }
    ],
    fetcher,
    12_000
  )
  if (!draft.ok) return draft
  return {
    ok: true,
    repaired: draft.repaired,
    value: {
      section: {
        ...section,
        content: draft.value.content,
        referenceKeys: draft.value.referenceKeys,
        status: 'writing'
      }
    }
  }
}

export async function reviseTextbookSection(
  settings: AppSettingsV1,
  input: TextbookSectionRevisionInput,
  fetcher: typeof fetch = fetch
): Promise<TextbookGenerationResult<{ section: TextbookSection }>> {
  const section = findSection(input.project, input.sectionId)
  const draft = await requestValidatedJson(
    settings,
    textbookSectionDraftSchema,
    [
      {
        role: 'system',
        content: [
          '你只修改当前教材小节，不改其他章节。',
          audienceInstruction(input.project.metadata.audience),
          '保留教师原意和教材风格，按教师指令完成重写、扩展、压缩或规范检查后的修订。',
          '严格遵守出版社要求。只能使用项目参考文献库中的引用 key。',
          '只返回 JSON 对象，字段为 content 和 referenceKeys。'
        ].join('\n')
      },
      {
        role: 'user',
        content: [
          `教师修订指令：${input.instruction}`,
          `选中文本：${input.selection || '未指定，处理整节'}`,
          `当前节：${JSON.stringify(section)}`,
          '',
          '项目上下文：',
          clipText(projectContext(input.project), MAX_SECTION_CONTEXT_CHARS),
          '',
          '项目参考文献库：',
          referencesPrompt(input.project.references)
        ].join('\n')
      }
    ],
    fetcher,
    12_000
  )
  if (!draft.ok) return draft
  return {
    ok: true,
    repaired: draft.repaired,
    value: {
      section: {
        ...section,
        content: draft.value.content,
        referenceKeys: draft.value.referenceKeys,
        status: 'writing'
      }
    }
  }
}

export async function checkTextbookProject(
  settings: AppSettingsV1,
  input: TextbookCheckInput,
  fetcher: typeof fetch = fetch
): Promise<TextbookGenerationResult<TextbookCheckResult>> {
  return requestValidatedJson(
    settings,
    textbookCheckResultSchema,
    [
      {
        role: 'system',
        content: [
          '你是医学教材审稿人与编辑规范检查员。',
          '检查范围：出版社格式要求、术语一致性、章节衔接、引用缺失、证据边界、教材语体。',
          '无法可靠机器判断的出版社规则必须作为 warning 提出，不要假装已经完成。',
          '只返回 JSON 对象，字段为 summary 和 items。'
        ].join('\n')
      },
      {
        role: 'user',
        content: projectContext(input.project)
      }
    ],
    fetcher,
    8_000
  )
}

function safeFileName(value: string): string {
  const cleaned = Array.from(value, (character) =>
    character.charCodeAt(0) < 32 || /[<>:"/\\|?*]/.test(character) ? '-' : character
  ).join('')
    .replace(/\s+/g, ' ')
    .replace(/\.+$/g, '')
    .trim()
  return (cleaned || 'textbook').slice(0, 90)
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function referenceLine(reference: TextbookReference, index: number): string {
  const authors = reference.authors.length ? `${reference.authors.slice(0, 6).join(', ')}. ` : ''
  const year = reference.year ? ` ${reference.year}.` : ''
  const journal = reference.journal ? ` ${reference.journal}.` : ''
  const doi = reference.doi ? ` DOI: ${reference.doi}.` : ''
  const pmid = reference.pmid ? ` PMID: ${reference.pmid}.` : ''
  return `${index + 1}. ${authors}${reference.title}.${journal}${year}${doi}${pmid}`.replace(/\s+/g, ' ').trim()
}

function buildCombinedMarkdown(project: TextbookProject): string {
  const lines = [`# ${project.metadata.title}`, '']
  if (project.metadata.author) lines.push(`作者：${project.metadata.author}`, '')
  if (project.metadata.writingGoal) lines.push(project.metadata.writingGoal, '')

  for (const chapter of project.outline?.chapters ?? []) {
    lines.push(`# ${chapter.title}`, '')
    for (const sectionOutline of chapter.sections) {
      const section = project.sections.find((item) => item.id === sectionOutline.id)
      lines.push(section?.content?.trim() || `## ${sectionOutline.title}\n\n（本节待撰写）`, '')
    }
  }

  if (project.references.length) {
    lines.push('# 参考文献', '')
    project.references.forEach((reference, index) => {
      lines.push(referenceLine(reference, index))
    })
    lines.push('')
  }
  return lines.join('\n')
}

function markdownToHtml(markdown: string): string {
  const lines = markdown.split(/\r?\n/)
  const html: string[] = []
  let listOpen = false
  const closeList = (): void => {
    if (listOpen) {
      html.push('</ul>')
      listOpen = false
    }
  }

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) {
      closeList()
      continue
    }
    if (trimmed.startsWith('### ')) {
      closeList()
      html.push(`<h3>${escapeHtml(trimmed.slice(4))}</h3>`)
    } else if (trimmed.startsWith('## ')) {
      closeList()
      html.push(`<h2>${escapeHtml(trimmed.slice(3))}</h2>`)
    } else if (trimmed.startsWith('# ')) {
      closeList()
      html.push(`<h1>${escapeHtml(trimmed.slice(2))}</h1>`)
    } else if (/^[-*]\s+/.test(trimmed)) {
      if (!listOpen) {
        html.push('<ul>')
        listOpen = true
      }
      html.push(`<li>${escapeHtml(trimmed.replace(/^[-*]\s+/, ''))}</li>`)
    } else {
      closeList()
      html.push(`<p>${escapeHtml(trimmed)}</p>`)
    }
  }
  closeList()
  return html.join('\n')
}

async function bufferFromDocxResult(result: ArrayBuffer | Blob | Buffer): Promise<Buffer> {
  if (Buffer.isBuffer(result)) return result
  if (typeof ArrayBuffer !== 'undefined' && result instanceof ArrayBuffer) {
    return Buffer.from(new Uint8Array(result))
  }
  if (typeof Blob !== 'undefined' && result instanceof Blob) {
    return Buffer.from(await result.arrayBuffer())
  }
  throw new TypeError('DOCX 导出结果格式不受支持。')
}

function buildDocxHtml(project: TextbookProject, markdown: string): string {
  const rules = project.formatRules
  return `<!DOCTYPE html>
  <html lang="${project.metadata.audience === 'international' ? 'en' : 'zh-CN'}">
  <head>
    <meta charset="utf-8" />
    <style>
      body {
        font-family: "${escapeHtml(rules.fontFamily)}", "Microsoft YaHei", sans-serif;
        font-size: ${rules.fontSizePt}pt;
        line-height: ${rules.lineSpacing};
        color: #17202a;
      }
      h1 { font-size: ${Math.max(16, rules.fontSizePt + 6)}pt; page-break-before: always; }
      h1:first-child { page-break-before: auto; }
      h2 { font-size: ${Math.max(14, rules.fontSizePt + 3)}pt; margin-top: 18pt; }
      h3 { font-size: ${Math.max(12, rules.fontSizePt + 1)}pt; margin-top: 12pt; }
      p, li { text-align: justify; }
      .guidelines { color: #5f6f7a; border-left: 3px solid #91a4b2; padding-left: 10px; }
    </style>
  </head>
  <body>
    <section class="guidelines">
      <p>导出已应用可解析格式规则：字体 ${escapeHtml(rules.fontFamily)}，字号 ${rules.fontSizePt}pt，行距 ${rules.lineSpacing}。</p>
      ${rules.unresolvedRules.length ? `<p>以下出版社规则需人工复核：${escapeHtml(rules.unresolvedRules.join('；'))}</p>` : ''}
    </section>
    ${markdownToHtml(markdown)}
  </body>
  </html>`
}

async function writeProjectFiles(project: TextbookProject, outputDirectory: string): Promise<{
  markdownPath: string
  docxPath: string
  projectPath: string
}> {
  await mkdir(outputDirectory, { recursive: true })
  await mkdir(join(outputDirectory, 'chapters'), { recursive: true })

  const parsed = textbookProjectSchema.parse(project)
  const markdown = buildCombinedMarkdown(parsed)
  const baseName = safeFileName(parsed.metadata.title)
  const markdownPath = join(outputDirectory, `${baseName}.md`)
  const docxPath = join(outputDirectory, `${baseName}.docx`)
  const projectPath = join(outputDirectory, 'textbook.zhiyan-textbook')

  await writeFile(join(outputDirectory, 'publisher-guidelines.md'), `${parsed.publisherGuidelines}\n`, 'utf8')
  await writeFile(join(outputDirectory, 'outline.json'), `${JSON.stringify(parsed.outline ?? null, null, 2)}\n`, 'utf8')
  await writeFile(join(outputDirectory, 'references.json'), `${JSON.stringify(parsed.references, null, 2)}\n`, 'utf8')
  for (const section of parsed.sections) {
    await writeFile(join(outputDirectory, section.path), `${section.content}\n`, 'utf8')
  }
  await writeFile(markdownPath, markdown, 'utf8')
  await writeFile(projectPath, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8')

  const docx = await htmlToDocx(buildDocxHtml(parsed, markdown), null, {
    title: parsed.metadata.title,
    creator: '智研助手',
    description: '医学教材写作平台导出的教材正文',
    font: parsed.formatRules.fontFamily,
    fontSize: parsed.formatRules.fontSizePt * 2
  })
  await writeFile(docxPath, await bufferFromDocxResult(docx))

  return { markdownPath, docxPath, projectPath }
}

export async function exportTextbookProject(
  input: TextbookExportInput
): Promise<TextbookExportResult> {
  try {
    const project = textbookProjectSchema.parse({
      ...input.project,
      updatedAt: new Date().toISOString()
    })
    const paths = await writeProjectFiles(project, input.outputDirectory)
    return {
      ok: true,
      directory: input.outputDirectory,
      ...paths,
      exportedAt: new Date().toISOString()
    }
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error)
    }
  }
}

export async function loadTextbookProject(path: string): Promise<TextbookProject> {
  const raw = await readFile(path, 'utf8')
  const project = parseTextbookProject(JSON.parse(raw))
  return {
    ...project,
    metadata: {
      ...project.metadata,
      title: project.metadata.title || basename(path)
    }
  }
}

export function createProjectFromOutline(
  input: TextbookOutlineGenerationInput,
  outline: TextbookOutline
): TextbookProject {
  const now = new Date().toISOString()
  return {
    version: 1,
    metadata: input.metadata,
    publisherGuidelines: input.publisherGuidelines,
    formatRules: input.formatRules,
    outline,
    sections: createSectionsFromOutline(outline),
    references: [],
    checks: [],
    createdAt: now,
    updatedAt: now
  }
}
