import { z } from 'zod'

export const TEXTBOOK_AUDIENCES = ['undergraduate', 'graduate', 'international'] as const
export const TEXTBOOK_CITATION_STYLES = ['gbt7714', 'vancouver', 'apa', 'custom'] as const
export const TEXTBOOK_SECTION_STATUSES = ['draft', 'writing', 'reviewed'] as const
export const TEXTBOOK_CHECK_SEVERITIES = ['info', 'warning', 'error'] as const
export const TEXTBOOK_FONT_OPTIONS = [
  'Microsoft YaHei',
  'SimSun',
  'NSimSun',
  'SimHei',
  'KaiTi',
  'FangSong',
  'DengXian',
  'Source Han Serif SC',
  'Source Han Sans SC',
  'Noto Serif CJK SC',
  'Noto Sans CJK SC'
] as const
const DEFAULT_TEXTBOOK_FORMAT_RULES = {
  fontFamily: 'Microsoft YaHei',
  fontSizePt: 11,
  lineSpacing: 1.5,
  headingPattern: '章标题使用一级标题，节标题使用二级标题',
  symbolRules: '',
  unresolvedRules: []
}

function boundedStringArraySchema(maxItems: number, maxLength = 300) {
  return z.preprocess(
    (value) => Array.isArray(value) ? value.slice(0, maxItems) : value,
    z.array(z.string().trim().min(1).max(maxLength)).max(maxItems)
  )
}

export const textbookFormatRulesSchema = z.object({
  fontFamily: z.string().trim().max(120).default('Microsoft YaHei'),
  fontSizePt: z.number().min(7).max(42).default(11),
  lineSpacing: z.number().min(1).max(3).default(1.5),
  headingPattern: z.string().trim().max(500).default('章标题使用一级标题，节标题使用二级标题'),
  symbolRules: z.string().trim().max(4_000).default(''),
  unresolvedRules: boundedStringArraySchema(24, 1_000).default([])
}).strict()

export const textbookMetadataSchema = z.object({
  title: z.string().trim().min(1).max(300),
  subject: z.string().trim().max(300).default('生物医学'),
  audience: z.enum(TEXTBOOK_AUDIENCES).default('undergraduate'),
  author: z.string().trim().max(200).default(''),
  writingGoal: z.string().trim().max(4_000).default(''),
  citationStyle: z.enum(TEXTBOOK_CITATION_STYLES).default('gbt7714'),
  outputFormats: boundedStringArraySchema(6, 40).default(['markdown', 'docx', 'project'])
}).strict()

export const textbookOutlineSectionSchema = z.object({
  id: z.string().trim().min(1).max(160),
  chapterId: z.string().trim().min(1).max(160),
  title: z.string().trim().min(1).max(300),
  writingGoal: z.string().trim().max(2_000).default(''),
  estimatedWords: z.number().int().min(100).max(30_000).default(3_000),
  keyConcepts: boundedStringArraySchema(16).default([]),
  confirmed: z.boolean().default(false)
}).strict()

export const textbookOutlineChapterSchema = z.object({
  id: z.string().trim().min(1).max(160),
  title: z.string().trim().min(1).max(300),
  writingGoal: z.string().trim().max(2_000).default(''),
  sections: z.array(textbookOutlineSectionSchema).min(1).max(30)
}).strict()

export const textbookOutlineSchema = z.object({
  title: z.string().trim().min(1).max(300),
  rationale: z.string().trim().max(4_000).default(''),
  chapters: z.array(textbookOutlineChapterSchema).min(1).max(40)
}).strict()

export const textbookReferenceSchema = z.object({
  key: z.string().trim().min(1).max(160),
  title: z.string().trim().min(1).max(1_000),
  sourceType: z.enum(['abstract', 'fulltext', 'manual']).default('abstract'),
  pmid: z.string().trim().max(32).optional(),
  doi: z.string().trim().max(256).optional(),
  year: z.number().int().min(1900).max(2200).optional(),
  journal: z.string().trim().max(300).optional(),
  authors: z.array(z.string().trim().min(1).max(200)).max(50).default([]),
  abstract: z.string().trim().max(80_000).optional()
}).strict()

export const textbookSectionSchema = z.object({
  id: z.string().trim().min(1).max(160),
  chapterId: z.string().trim().min(1).max(160),
  title: z.string().trim().min(1).max(300),
  path: z.string().trim().min(1).max(4_096),
  content: z.string().max(500_000).default(''),
  status: z.enum(TEXTBOOK_SECTION_STATUSES).default('draft'),
  referenceKeys: boundedStringArraySchema(100, 160).default([]),
  teacherNotes: z.string().trim().max(10_000).default('')
}).strict()

export const textbookCheckItemSchema = z.object({
  id: z.string().trim().min(1).max(160),
  severity: z.enum(TEXTBOOK_CHECK_SEVERITIES),
  scope: z.string().trim().max(300).default('全书'),
  message: z.string().trim().min(1).max(2_000),
  suggestion: z.string().trim().max(2_000).default('')
}).strict()

export const textbookProjectSchema = z.object({
  version: z.literal(1),
  metadata: textbookMetadataSchema,
  publisherGuidelines: z.string().trim().max(200_000).default(''),
  formatRules: textbookFormatRulesSchema.default(DEFAULT_TEXTBOOK_FORMAT_RULES),
  outline: textbookOutlineSchema.optional(),
  sections: z.array(textbookSectionSchema).max(1_000).default([]),
  references: z.array(textbookReferenceSchema).max(2_000).default([]),
  checks: z.array(textbookCheckItemSchema).max(500).default([]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
}).strict()

export const textbookOutlineGenerationInputSchema = z.object({
  metadata: textbookMetadataSchema,
  publisherGuidelines: z.string().trim().max(200_000).default(''),
  formatRules: textbookFormatRulesSchema.default(DEFAULT_TEXTBOOK_FORMAT_RULES),
  teacherBrief: z.string().trim().max(20_000).default('')
}).strict()

export const textbookFormatRulesParseInputSchema = z.object({
  publisherGuidelines: z.string().trim().max(200_000).default(''),
  currentRules: textbookFormatRulesSchema.default(DEFAULT_TEXTBOOK_FORMAT_RULES)
}).strict()

export const textbookSectionGenerationInputSchema = z.object({
  project: textbookProjectSchema,
  sectionId: z.string().trim().min(1).max(160),
  instruction: z.string().trim().max(4_000).default('')
}).strict()

export const textbookSectionRevisionInputSchema = textbookSectionGenerationInputSchema.extend({
  instruction: z.string().trim().min(1).max(4_000),
  selection: z.string().trim().max(80_000).optional()
}).strict()

export const textbookCheckInputSchema = z.object({
  project: textbookProjectSchema
}).strict()

export const textbookExportInputSchema = z.object({
  project: textbookProjectSchema,
  outputDirectory: z.string().trim().min(1).max(4_096)
}).strict()

export const textbookLoadProjectInputSchema = z.object({
  path: z.string().trim().min(1).max(4_096)
}).strict()

export const textbookSectionDraftSchema = z.object({
  content: z.string().trim().min(1).max(500_000),
  referenceKeys: boundedStringArraySchema(100, 160).default([])
}).strict()

export const textbookCheckResultSchema = z.object({
  summary: z.string().trim().min(1).max(4_000),
  items: z.array(textbookCheckItemSchema).max(500)
}).strict()

export type TextbookAudience = z.infer<typeof textbookMetadataSchema>['audience']
export type TextbookCitationStyle = z.infer<typeof textbookMetadataSchema>['citationStyle']
export type TextbookFormatRules = z.infer<typeof textbookFormatRulesSchema>
export type TextbookMetadata = z.infer<typeof textbookMetadataSchema>
export type TextbookOutlineSection = z.infer<typeof textbookOutlineSectionSchema>
export type TextbookOutlineChapter = z.infer<typeof textbookOutlineChapterSchema>
export type TextbookOutline = z.infer<typeof textbookOutlineSchema>
export type TextbookReference = z.infer<typeof textbookReferenceSchema>
export type TextbookSection = z.infer<typeof textbookSectionSchema>
export type TextbookCheckItem = z.infer<typeof textbookCheckItemSchema>
export type TextbookProject = z.infer<typeof textbookProjectSchema>
export type TextbookOutlineGenerationInput = z.infer<typeof textbookOutlineGenerationInputSchema>
export type TextbookFormatRulesParseInput = z.infer<typeof textbookFormatRulesParseInputSchema>
export type TextbookSectionGenerationInput = z.infer<typeof textbookSectionGenerationInputSchema>
export type TextbookSectionRevisionInput = z.infer<typeof textbookSectionRevisionInputSchema>
export type TextbookCheckInput = z.infer<typeof textbookCheckInputSchema>
export type TextbookExportInput = z.infer<typeof textbookExportInputSchema>
export type TextbookSectionDraft = z.infer<typeof textbookSectionDraftSchema>
export type TextbookCheckResult = z.infer<typeof textbookCheckResultSchema>

export type TextbookGenerationResult<T> =
  | { ok: true; value: T; repaired: boolean }
  | { ok: false; code: 'MISSING_API_KEY' | 'PROVIDER_ERROR' | 'INVALID_MODEL_OUTPUT'; message: string }

export type TextbookExportResult =
  | {
      ok: true
      directory: string
      markdownPath: string
      docxPath: string
      projectPath: string
      exportedAt: string
    }
  | { ok: false; message: string }

export function sectionPath(chapterIndex: number, sectionIndex: number): string {
  const chapter = String(chapterIndex + 1).padStart(2, '0')
  const section = String(sectionIndex + 1).padStart(2, '0')
  return `chapters/ch${chapter}-sec${section}.md`
}

export function createSectionsFromOutline(outline: TextbookOutline): TextbookSection[] {
  return outline.chapters.flatMap((chapter, chapterIndex) =>
    chapter.sections.map((section, sectionIndex) => ({
      id: section.id,
      chapterId: chapter.id,
      title: section.title,
      path: sectionPath(chapterIndex, sectionIndex),
      content: '',
      status: 'draft' as const,
      referenceKeys: [],
      teacherNotes: ''
    }))
  )
}

export function parseTextbookProject(value: unknown): TextbookProject {
  return textbookProjectSchema.parse(value)
}

const CHINESE_FONT_ALIASES: Array<[RegExp, string]> = [
  [/微软雅黑|Microsoft\s*YaHei/i, 'Microsoft YaHei'],
  [/新宋体|NSimSun/i, 'NSimSun'],
  [/宋体|SimSun/i, 'SimSun'],
  [/黑体|SimHei/i, 'SimHei'],
  [/楷体|KaiTi/i, 'KaiTi'],
  [/仿宋|FangSong/i, 'FangSong'],
  [/等线|DengXian/i, 'DengXian'],
  [/思源宋体|Source\s*Han\s*Serif/i, 'Source Han Serif SC'],
  [/思源黑体|Source\s*Han\s*Sans/i, 'Source Han Sans SC'],
  [/Noto\s*Serif\s*CJK/i, 'Noto Serif CJK SC'],
  [/Noto\s*Sans\s*CJK/i, 'Noto Sans CJK SC']
]

const CHINESE_FONT_SIZE_PT: Array<[RegExp, number]> = [
  [/小五/, 9],
  [/五号/, 10.5],
  [/小四/, 12],
  [/四号/, 14],
  [/小三/, 15],
  [/三号/, 16],
  [/小二/, 18],
  [/二号/, 22],
  [/小一/, 24],
  [/一号/, 26],
  [/小初/, 36],
  [/初号/, 42]
]

function compactRules(lines: string[]): string[] {
  return Array.from(new Set(lines.map((line) => line.trim()).filter(Boolean))).slice(0, 24)
}

function sentencesContaining(text: string, patterns: RegExp[], maxItems: number): string[] {
  const sentences = text
    .split(/[\n。；;]+/)
    .map((item) => item.trim())
    .filter(Boolean)
  return sentences
    .filter((sentence) => patterns.some((pattern) => pattern.test(sentence)))
    .slice(0, maxItems)
}

export function inferTextbookFormatRulesFromGuidelines(
  publisherGuidelines: string,
  currentRules: TextbookFormatRules = DEFAULT_TEXTBOOK_FORMAT_RULES
): TextbookFormatRules {
  const text = publisherGuidelines.trim()
  const next: TextbookFormatRules = { ...currentRules }
  if (!text) return next

  const fontMatch = CHINESE_FONT_ALIASES.find(([pattern]) => pattern.test(text))
  if (fontMatch) next.fontFamily = fontMatch[1]

  const pointMatch = text.match(/(?:正文|主体|全书|字号|字[体號号])[^。\n；;]{0,24}?(\d{1,2}(?:\.\d+)?)\s*(?:pt|磅)/i)
    ?? text.match(/(\d{1,2}(?:\.\d+)?)\s*(?:pt|磅)/i)
  if (pointMatch?.[1]) {
    const parsed = Number(pointMatch[1])
    if (Number.isFinite(parsed) && parsed >= 7 && parsed <= 42) next.fontSizePt = parsed
  } else {
    const sizeMatch = CHINESE_FONT_SIZE_PT.find(([pattern]) => pattern.test(text))
    if (sizeMatch) next.fontSizePt = sizeMatch[1]
  }

  const lineSpacingMatch = text.match(/(\d(?:\.\d+)?)\s*倍\s*行[距间]/)
  if (lineSpacingMatch?.[1]) {
    const parsed = Number(lineSpacingMatch[1])
    if (Number.isFinite(parsed) && parsed >= 1 && parsed <= 3) next.lineSpacing = parsed
  }

  const headingRules = sentencesContaining(text, [/标题|章|节|编号|层级/], 4)
  if (headingRules.length) next.headingPattern = headingRules.join('；')

  const symbolRules = sentencesContaining(text, [/标点|符号|全角|半角|缩写|斜体|上标|下标|单位/], 6)
  if (symbolRules.length) next.symbolRules = symbolRules.join('；')

  const unresolved = sentencesContaining(text, [/图|表|公式|参考文献|索引|版权|模板|版心|页边距|页眉|页脚|目录/], 12)
  next.unresolvedRules = compactRules([...next.unresolvedRules, ...unresolved])

  return textbookFormatRulesSchema.parse(next)
}
