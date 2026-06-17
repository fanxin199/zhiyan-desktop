import { z } from 'zod'

export const MAX_COURSEWARE_SLIDES = 35

export function normalizeCoursewareSlideCounts<
  T extends { sections: Array<{ slideCount: number }> }
>(blueprint: T): T {
  const total = blueprint.sections.reduce((sum, section) => sum + section.slideCount, 0)
  if (total <= MAX_COURSEWARE_SLIDES) return blueprint

  const sectionCount = blueprint.sections.length
  const remaining = MAX_COURSEWARE_SLIDES - sectionCount
  const extras = blueprint.sections.map((section) => Math.max(0, section.slideCount - 1))
  const totalExtras = extras.reduce((sum, count) => sum + count, 0)
  const allocations = extras.map((count) =>
    totalExtras > 0 ? Math.floor((count / totalExtras) * remaining) : 0
  )
  let unallocated = remaining - allocations.reduce((sum, count) => sum + count, 0)
  const priorities = extras
    .map((count, index) => ({
      index,
      fraction: totalExtras > 0
        ? (count / totalExtras) * remaining - allocations[index]
        : 0
    }))
    .sort((left, right) => right.fraction - left.fraction || left.index - right.index)

  for (const priority of priorities) {
    if (unallocated <= 0) break
    if (allocations[priority.index] >= extras[priority.index]) continue
    allocations[priority.index] += 1
    unallocated -= 1
  }

  return {
    ...blueprint,
    sections: blueprint.sections.map((section, index) => ({
      ...section,
      slideCount: 1 + allocations[index]
    }))
  }
}

export const coursewareAudienceSchema = z.enum([
  'undergraduate',
  'graduate',
  'international'
])

function boundedStringArraySchema(maxItems: number) {
  return z.preprocess(
    (value) => Array.isArray(value) ? value.slice(0, maxItems) : value,
    z.array(z.string().trim().min(1).max(300)).max(maxItems)
  )
}

export const evidenceRefSchema = z.object({
  id: z.string().trim().min(1).max(160),
  title: z.string().trim().min(1).max(1_000),
  sourceType: z.enum(['textbook', 'abstract', 'fulltext']),
  pmid: z.string().trim().max(32).optional(),
  doi: z.string().trim().max(256).optional(),
  year: z.number().int().min(1900).max(2200).optional(),
  journal: z.string().trim().max(300).optional(),
  authors: z.array(z.string().trim().min(1).max(200)).max(50).optional(),
  abstract: z.string().trim().max(80_000).optional(),
  sourcePage: z.number().int().positive().optional()
}).strict()

export const sourceFigureRefSchema = z.object({
  id: z.string().trim().min(1).max(160),
  pageNumber: z.number().int().positive(),
  crop: z.object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    width: z.number().positive().max(1),
    height: z.number().positive().max(1)
  }).strict().optional(),
  caption: z.string().trim().max(1_000).optional(),
  imageDataUrl: z.string().max(20_000_000).optional()
}).strict()

export const coursewareSourceKindSchema = z.enum(['pdf', 'pptx'])

export const coursewareSourceDocumentSchema = z.object({
  kind: coursewareSourceKindSchema,
  path: z.string().trim().min(1).max(4_096),
  pageCount: z.number().int().positive().max(100_000),
  searchable: z.boolean().default(true)
}).strict()

export const sourceVisualAssetSchema = z.object({
  id: z.string().trim().min(1).max(160),
  sourceKind: coursewareSourceKindSchema,
  sourceIndex: z.number().int().positive(),
  sourceName: z.string().trim().max(512).optional(),
  mediaType: z.string().trim().min(1).max(128),
  role: z.enum(['figure', 'photo', 'chart', 'diagram', 'decorative', 'unknown']),
  status: z.enum(['approved', 'rejected', 'pending']),
  confidence: z.number().min(0).max(1),
  occurrences: z.array(z.number().int().positive()).min(1).max(1_000),
  caption: z.string().trim().max(2_000).optional(),
  nearbyText: z.string().trim().max(8_000).optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  crop: z.object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    width: z.number().positive().max(1),
    height: z.number().positive().max(1)
  }).strict().optional(),
  imageDataUrl: z.string().max(20_000_000).optional(),
  assetPath: z.string().trim().max(1_024).optional()
}).strict()

export const coursewareRequestSchema = z.object({
  sourcePath: z.string().trim().min(1).max(4_096),
  pageStart: z.number().int().positive(),
  pageEnd: z.number().int().positive(),
  topic: z.string().trim().min(1).max(300),
  durationMinutes: z.number().int().min(20).max(600),
  audience: coursewareAudienceSchema,
  focus: z.string().trim().max(4_000).default(''),
  includeRecentLiterature: z.boolean().default(false),
  literatureQuery: z.string().trim().max(1_000).optional(),
  maxLiteratureResults: z.number().int().min(1).max(20).default(6)
}).strict().refine((value) => value.pageEnd >= value.pageStart, {
  message: '结束页不能小于起始页。',
  path: ['pageEnd']
})

export const coursewareBlueprintSectionSchema = z.object({
  id: z.string().trim().min(1).max(160),
  title: z.string().trim().min(1).max(300),
  objective: z.string().trim().min(1).max(2_000),
  summary: z.string().trim().min(1).max(4_000),
  slideCount: z.number().int().min(1).max(30),
  emphasis: boundedStringArraySchema(12),
  interactionPrompt: z.string().trim().max(1_000).optional(),
  visualSuggestion: z.string().trim().max(1_000).optional()
}).strict()

export const coursewareBlueprintSchema = z.object({
  title: z.string().trim().min(1).max(300),
  audience: coursewareAudienceSchema,
  durationMinutes: z.number().int().min(20).max(600),
  teachingGoal: z.string().trim().min(1).max(4_000),
  sections: z.array(coursewareBlueprintSectionSchema).min(1).max(20)
}).strict().transform(normalizeCoursewareSlideCounts)

export const coursewareSlideSpecSchema = z.object({
  id: z.string().trim().min(1).max(160),
  sectionId: z.string().trim().min(1).max(160),
  kind: z.enum(['title', 'content', 'mechanism', 'case', 'interaction', 'references']),
  title: z.string().trim().min(1).max(300),
  subtitle: z.string().trim().max(500).optional(),
  bullets: z.array(z.string().trim().min(1).max(1_000)).max(8).default([]),
  speakerNotes: z.string().trim().min(1).max(20_000),
  interaction: z.object({
    prompt: z.string().trim().min(1).max(2_000),
    answer: z.string().trim().min(1).max(4_000)
  }).strict().optional(),
  visual: z.object({
    type: z.enum(['none', 'flow', 'comparison', 'source-figure']),
    title: z.string().trim().max(300).optional(),
    nodes: boundedStringArraySchema(12).optional(),
    figureId: z.string().trim().max(160).optional()
  }).strict().optional(),
  evidenceRefs: z.array(evidenceRefSchema).max(20).default([])
}).strict()

const coursewareProjectV1Schema = z.object({
  version: z.literal(1),
  request: coursewareRequestSchema,
  blueprint: coursewareBlueprintSchema,
  slides: z.preprocess(
    (value) => Array.isArray(value) ? value.slice(0, MAX_COURSEWARE_SLIDES) : value,
    z.array(coursewareSlideSpecSchema).min(1).max(MAX_COURSEWARE_SLIDES)
  ),
  sourceFigures: z.array(sourceFigureRefSchema).max(100).default([]),
  evidence: z.array(evidenceRefSchema).max(100).default([]),
  generatedAt: z.string().datetime()
}).strict()

const coursewareProjectV2Schema = z.object({
  version: z.literal(2),
  request: coursewareRequestSchema,
  sourceDocument: coursewareSourceDocumentSchema,
  blueprint: coursewareBlueprintSchema,
  slides: z.preprocess(
    (value) => Array.isArray(value) ? value.slice(0, MAX_COURSEWARE_SLIDES) : value,
    z.array(coursewareSlideSpecSchema).min(1).max(MAX_COURSEWARE_SLIDES)
  ),
  sourceVisuals: z.array(sourceVisualAssetSchema).max(200).default([]),
  evidence: z.array(evidenceRefSchema).max(100).default([]),
  generatedAt: z.string().datetime()
}).strict()

function migrateCoursewareProject(value: unknown): unknown {
  const legacy = coursewareProjectV1Schema.safeParse(value)
  if (!legacy.success) return value
  const project = legacy.data
  const sourceKind = project.request.sourcePath.toLowerCase().endsWith('.pptx') ? 'pptx' : 'pdf'
  return {
    version: 2,
    request: project.request,
    sourceDocument: {
      kind: sourceKind,
      path: project.request.sourcePath,
      pageCount: project.request.pageEnd,
      searchable: true
    },
    blueprint: project.blueprint,
    slides: project.slides,
    sourceVisuals: project.sourceFigures.map((figure) => ({
      id: figure.id,
      sourceKind,
      sourceIndex: figure.pageNumber,
      mediaType: figure.imageDataUrl?.match(/^data:([^;,]+)/)?.[1] ?? 'image/png',
      role: 'figure',
      status: 'approved',
      confidence: 1,
      occurrences: [figure.pageNumber],
      ...(figure.caption ? { caption: figure.caption } : {}),
      ...(figure.crop ? { crop: figure.crop } : {}),
      ...(figure.imageDataUrl ? { imageDataUrl: figure.imageDataUrl } : {})
    })),
    evidence: project.evidence,
    generatedAt: project.generatedAt
  }
}

export const coursewareProjectSchema = z.preprocess(
  migrateCoursewareProject,
  coursewareProjectV2Schema
)

export function parseCoursewareProject(value: unknown): z.infer<typeof coursewareProjectV2Schema> {
  return coursewareProjectSchema.parse(value)
}

export type CoursewareAudience = z.infer<typeof coursewareAudienceSchema>
export type CoursewareRequest = z.infer<typeof coursewareRequestSchema>
export type CoursewareBlueprintSection = z.infer<typeof coursewareBlueprintSectionSchema>
export type CoursewareBlueprint = z.infer<typeof coursewareBlueprintSchema>
export type SlideSpec = z.infer<typeof coursewareSlideSpecSchema>
export type SourceFigureRef = z.infer<typeof sourceFigureRefSchema>
export type CoursewareSourceKind = z.infer<typeof coursewareSourceKindSchema>
export type CoursewareSourceDocument = z.infer<typeof coursewareSourceDocumentSchema>
export type SourceVisualAsset = z.infer<typeof sourceVisualAssetSchema>
export type EvidenceRef = z.infer<typeof evidenceRefSchema>
export type CoursewareProject = z.infer<typeof coursewareProjectSchema>

export type CoursewareSourceAnalysisResult =
  | {
      ok: true
      document: CoursewareSourceDocument
      text: string
      assets: SourceVisualAsset[]
    }
  | {
      ok: false
      code: 'UNSUPPORTED_SOURCE' | 'READ_FAILED' | 'OCR_REQUIRED'
      message: string
    }

export type CoursewareBlueprintGenerationInput = {
  request: CoursewareRequest
  sourceText: string
  evidence?: EvidenceRef[]
}

export type CoursewareSlideGenerationInput = {
  request: CoursewareRequest
  blueprint: CoursewareBlueprint
  sourceText: string
  evidence?: EvidenceRef[]
  generationId?: string
}

export type CoursewareSlideGenerationProgress = {
  generationId?: string
  completedBatches: number
  totalBatches: number
  degradedBatches: number
  slides: SlideSpec[]
}

export type CoursewareSlideRegenerationInput = CoursewareSlideGenerationInput & {
  slide: SlideSpec
  instruction: string
}

export type CoursewareGenerationResult<T> =
  | {
      ok: true
      value: T
      repaired: boolean
      degradedBatches?: number
    }
  | {
      ok: false
      code: 'MISSING_API_KEY' | 'PROVIDER_ERROR' | 'INVALID_MODEL_OUTPUT'
      message: string
    }

export type PdfRangeExtractResult =
  | {
      ok: true
      path: string
      text: string
      pageCount: number
      pageStart: number
      pageEnd: number
      extractedPages: number
    }
  | {
      ok: false
      code: 'INVALID_RANGE' | 'OCR_REQUIRED' | 'READ_FAILED'
      message: string
    }

export type PdfInspectResult =
  | {
      ok: true
      path: string
      pageCount: number
      searchable: boolean
    }
  | {
      ok: false
      code: 'READ_FAILED'
      message: string
    }

export type PubMedSearchRequest = {
  query: string
  maxResults?: number
  minYear?: number
}

export type PubMedSearchResult =
  | { ok: true; records: EvidenceRef[] }
  | { ok: false; message: string }

export type CoursewareExportRequest = {
  project: CoursewareProject
  outputDirectory?: string
}

export type CoursewareVisualQaSeverity = 'info' | 'warning' | 'error'

export type CoursewareVisualQaIssueCode =
  | 'image-out-of-bounds'
  | 'image-aspect-ratio-mismatch'
  | 'image-text-overlap'
  | 'text-box-too-small'

export type CoursewareVisualQaBox = {
  x: number
  y: number
  w: number
  h: number
}

export type CoursewareVisualQaIssue = {
  severity: CoursewareVisualQaSeverity
  code: CoursewareVisualQaIssueCode
  slideIndex: number
  slideId: string
  slideTitle: string
  pageType: 'source-figure' | 'teaching'
  message: string
  box?: CoursewareVisualQaBox
  relatedBox?: CoursewareVisualQaBox
  details?: Record<string, number | string | boolean | null>
}

export type CoursewareVisualQaReport = {
  checkedAt: string
  slideCount: number
  checkedSlideCount: number
  issueCount: number
  warningCount: number
  errorCount: number
  issues: CoursewareVisualQaIssue[]
}

export type CoursewareExportResult =
  | {
      ok: true
      pptxPath: string
      docxPath: string
      projectPath: string
      qaReportPath: string
      qaReport: CoursewareVisualQaReport
      exportedAt: string
    }
  | {
      ok: false
      canceled: boolean
      message?: string
    }
