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

export const coursewareProjectSchema = z.object({
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

export type CoursewareAudience = z.infer<typeof coursewareAudienceSchema>
export type CoursewareRequest = z.infer<typeof coursewareRequestSchema>
export type CoursewareBlueprintSection = z.infer<typeof coursewareBlueprintSectionSchema>
export type CoursewareBlueprint = z.infer<typeof coursewareBlueprintSchema>
export type SlideSpec = z.infer<typeof coursewareSlideSpecSchema>
export type SourceFigureRef = z.infer<typeof sourceFigureRefSchema>
export type EvidenceRef = z.infer<typeof evidenceRefSchema>
export type CoursewareProject = z.infer<typeof coursewareProjectSchema>

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

export type CoursewareExportResult =
  | {
      ok: true
      pptxPath: string
      docxPath: string
      projectPath: string
      exportedAt: string
    }
  | {
      ok: false
      canceled: boolean
      message?: string
    }
