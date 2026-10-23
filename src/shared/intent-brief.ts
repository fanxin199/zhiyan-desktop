import { z } from 'zod'

/**
 * Intent briefs (docs/AI_NATIVE_REDESIGN_PLAN.md §6.3): the key points a tool needs before it can
 * start, read from the teacher's one sentence and materials, then filled in from the project, the
 * teacher's profile, remembered preferences and defaults. Every value says where it came from.
 */
export const INTENT_SOURCES = ['teacher', 'material', 'project', 'profile', 'preference', 'default'] as const
export const INTENT_TOOL_IDS = ['syllabus', 'ppt-gen', 'textbook', 'write', 'literature', 'bioinformatics', 'quiz'] as const

/** Sources the caller supplies; teacher and material values come from reading the request. */
export const INTENT_CONTEXT_SOURCES = ['project', 'profile', 'preference'] as const

export const intentSourceSchema = z.enum(INTENT_SOURCES)
export const intentToolIdSchema = z.enum(INTENT_TOOL_IDS)

export const intentFieldSchema = z.object({
  key: z.string().min(1).max(40),
  label: z.string().min(1).max(40),
  value: z.string().max(2_000),
  source: intentSourceSchema,
  required: z.boolean()
}).strict()

export const intentBriefSchema = z.object({
  toolId: intentToolIdSchema,
  fields: z.array(intentFieldSchema),
  /** Required keys that could not be filled. */
  missing: z.array(z.string()),
  /** At most one clarifying question, only while something required is missing. */
  question: z.string().max(200).optional()
}).strict()

const contextValuesSchema = z.record(z.string().min(1).max(40), z.string().max(2_000))

export const intentExtractInputSchema = z.object({
  toolId: intentToolIdSchema,
  text: z.string().max(8_000),
  materials: z.array(z.object({
    name: z.string().trim().min(1).max(255),
    text: z.string().max(200_000)
  }).strict()).max(10).default([]),
  /** Values already known, by where they came from, keyed by field key. */
  context: z.object({
    project: contextValuesSchema.optional(),
    profile: contextValuesSchema.optional(),
    preference: contextValuesSchema.optional()
  }).strict().default({})
}).strict()

export type IntentSource = z.infer<typeof intentSourceSchema>
export type IntentToolId = z.infer<typeof intentToolIdSchema>
export type IntentField = z.infer<typeof intentFieldSchema>
export type IntentBrief = z.infer<typeof intentBriefSchema>
export type IntentExtractInput = z.input<typeof intentExtractInputSchema>

export type IntentFieldDefinition = {
  key: string
  label: string
  required: boolean
  /** What the field means, for the model reading the request. */
  hint: string
  defaultValue?: string
  /** Filled with the names of the attached files when the request does not name one. */
  fromMaterialNames?: boolean
}

export const INTENT_FIELD_DEFINITIONS: Record<IntentToolId, readonly IntentFieldDefinition[]> = {
  syllabus: [
    { key: 'courseName', label: '课程', required: true, hint: '课程名称，如“生理学”' },
    { key: 'topic', label: '章节', required: true, hint: '本次授课的章节或主题，如“第八章 呼吸系统”' },
    { key: 'audience', label: '授课对象', required: false, hint: '年级和学生类型', defaultValue: '本科生' },
    { key: 'hours', label: '学时', required: false, hint: '计划学时或分钟数', defaultValue: '2 学时' },
    { key: 'methods', label: '教学方法', required: false, hint: '如讲授法、案例教学法、问题引导法', defaultValue: '讲授法、案例教学法、问题引导法' },
    { key: 'focus', label: '侧重点', required: false, hint: '如临床新进展、思政、学术前沿、基础理论', defaultValue: '临床新进展' },
    { key: 'major', label: '专业', required: false, hint: '学生所学专业，如临床医学' }
  ],
  'ppt-gen': [
    { key: 'topic', label: '主题', required: true, hint: '这次课件的主题或章节' },
    { key: 'audience', label: '对象', required: false, hint: '本科生、研究生或留学生', defaultValue: '本科生' },
    { key: 'duration', label: '时长', required: false, hint: '授课时长，如 90 分钟', defaultValue: '90 分钟' },
    { key: 'source', label: '教材文件', required: true, hint: '作为依据的教材 PDF 或 PPTX 文件名', fromMaterialNames: true }
  ],
  textbook: [
    { key: 'bookTitle', label: '教材', required: false, hint: '教材名称' },
    { key: 'chapter', label: '章节', required: true, hint: '要编写的章节' },
    { key: 'audience', label: '读者', required: false, hint: '教材面向的学生', defaultValue: '本科生' },
    { key: 'requirements', label: '出版社要求', required: false, hint: '字数、体例、格式等要求' }
  ],
  write: [
    { key: 'documentType', label: '文稿类型', required: false, hint: '论文、综述、国自然申请书或其他', defaultValue: '文稿' },
    { key: 'topic', label: '主题', required: true, hint: '要写的题目或研究问题' },
    { key: 'target', label: '目标期刊或基金', required: false, hint: '如某期刊、国自然面上项目' }
  ],
  literature: [
    { key: 'paper', label: '文献', required: true, hint: '论文 PDF 文件名、PMID、DOI 或题名', fromMaterialNames: true },
    { key: 'question', label: '关注的问题', required: false, hint: '老师最想弄清楚的问题', defaultValue: '研究问题、方法、逐图解读、结论与局限' }
  ],
  quiz: [
    { key: 'topic', label: '章节', required: true, hint: '出题范围的课程章节或主题' },
    { key: 'count', label: '题量', required: false, hint: '如“10 道”', defaultValue: '10 道' },
    { key: 'types', label: '题型', required: false, hint: '单项选择题、简答题、论述题', defaultValue: '单项选择题和简答题' },
    { key: 'audience', label: '对象', required: false, hint: '学生类型', defaultValue: '本科生' },
    { key: 'difficulty', label: '难度', required: false, hint: '基础、中等或较难', defaultValue: '中等' }
  ],
  bioinformatics: [
    { key: 'dataType', label: '数据类型', required: true, hint: '如 bulk RNA-seq、单细胞转录组' },
    { key: 'goal', label: '分析目标', required: true, hint: '如差异表达、富集分析、细胞类型注释' },
    { key: 'grouping', label: '分组与比较', required: false, hint: '样本分组和比较方向，如“处理组 vs 对照组”；之后必须由老师确认' }
  ]
}

export type IntentLayers = Partial<Record<IntentSource, Record<string, string>>>

/**
 * Builds a brief from values found at each source. The first source with a non-empty value wins,
 * in the order teacher > material > project > profile > preference > default (§6.3).
 */
export function mergeIntentBrief(
  toolId: IntentToolId,
  layers: IntentLayers,
  question?: string
): IntentBrief {
  const fields = INTENT_FIELD_DEFINITIONS[toolId].map((definition): IntentField => {
    const withDefault: IntentLayers = {
      ...layers,
      default: definition.defaultValue === undefined ? layers.default : { ...layers.default, [definition.key]: definition.defaultValue }
    }
    for (const source of INTENT_SOURCES) {
      const value = withDefault[source]?.[definition.key]?.trim()
      if (value) return { key: definition.key, label: definition.label, value, source, required: definition.required }
    }
    return { key: definition.key, label: definition.label, value: '', source: 'default', required: definition.required }
  })
  const missing = fields.filter((field) => field.required && !field.value).map((field) => field.key)
  const firstMissing = fields.find((field) => field.key === missing[0])
  const clarifying = missing.length === 0
    ? undefined
    : question?.trim() || `还需要知道${firstMissing?.label ?? '一项要点'}，请补充。`
  return { toolId, fields, missing, ...(clarifying ? { question: clarifying.slice(0, 200) } : {}) }
}

/** Teacher-readable origin of a value, e.g. “来自教师信息”. */
export const INTENT_SOURCE_LABELS: Record<IntentSource, string> = {
  teacher: '来自你的要求',
  material: '来自材料',
  project: '来自项目',
  profile: '来自教师信息',
  preference: '来自你的习惯',
  default: '默认'
}

/** The teacher changed a point: it becomes theirs, and missing points and the question follow. */
export function updateIntentField(brief: IntentBrief, key: string, value: string): IntentBrief {
  const fields = brief.fields.map((field) =>
    field.key === key ? { ...field, value: value.trim().slice(0, 2_000), source: 'teacher' as const } : field)
  const missing = fields.filter((field) => field.required && !field.value).map((field) => field.key)
  const next: IntentBrief = { toolId: brief.toolId, fields, missing }
  if (missing.length > 0 && brief.question) next.question = brief.question
  return next
}
