import { z } from 'zod'

/**
 * “说一句就改” (docs/AI_NATIVE_REDESIGN_PLAN.md §6.2): the teacher picks part of an artifact, or
 * nothing for the whole of it, says what to change, and the AI saves the change as a new version.
 */
const MAX_ID_LENGTH = 160

export const revisionScopeSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('whole') }).strict(),
  // A lesson plan step, document section or textbook section. The title confirms the section is
  // still where it was when the teacher asked.
  z.object({
    type: z.literal('section'),
    sectionId: z.string().trim().min(1).max(80),
    title: z.string().trim().max(500).optional()
  }).strict(),
  z.object({ type: z.literal('slide'), slideId: z.string().trim().min(1).max(MAX_ID_LENGTH) }).strict(),
  // Character offsets into the artifact's text, end exclusive; the selected text finds the passage
  // again if the teacher edited the artifact after asking.
  z.object({
    type: z.literal('selection'),
    from: z.number().int().min(0),
    to: z.number().int().min(0),
    text: z.string().max(200_000).optional()
  }).strict(),
  z.object({ type: z.literal('figure'), figureId: z.string().trim().min(1).max(MAX_ID_LENGTH) }).strict()
])

export const revisionRequestSchema = z.object({
  artifactId: z.string().trim().min(1).max(MAX_ID_LENGTH),
  /** The version the teacher was looking at when asking. */
  baseVersion: z.number().int().min(0),
  scope: revisionScopeSchema,
  instruction: z.string().trim().min(1).max(4_000)
}).strict()

export type RevisionScope = z.infer<typeof revisionScopeSchema>
export type RevisionRequest = z.infer<typeof revisionRequestSchema>

export type RevisionChange = {
  /** Teacher-readable place, such as “二、新课讲授” or “选中的文字”. */
  ref: string
  before: string
  after: string
}

export type RevisionResult = {
  newVersion: number
  /** “撤销” restores this version: the content just before the change. */
  undoVersion: number
  summary: string
  changes: RevisionChange[]
  /** Set when the teacher changed the artifact after asking; the change was made on the latest content. */
  rebased: boolean
  /** Changes the AI made outside the chosen part, which were discarded. */
  discardedOutsideScope: boolean
}

export type RevisionOutcome =
  | { ok: true; value: RevisionResult }
  | {
      ok: false
      code: 'MISSING_API_KEY' | 'PROVIDER_ERROR' | 'INVALID_MODEL_OUTPUT' | 'UNSUPPORTED_SCOPE' | 'INVALID_SCOPE'
      message: string
    }

export type MarkdownSection = {
  /** Stable for the same document text: `section-<n>` in reading order. */
  id: string
  title: string
  level: number
  /** Character offsets of the section, heading included, end exclusive. */
  start: number
  end: number
}

const HEADING = /^(#{1,6})[ \t]+(.+?)[ \t]*#*[ \t]*$/u

/**
 * Splits Markdown into heading sections. A section runs to the next heading of the same or a higher
 * level, so it contains its subsections. Headings inside fenced code are ignored.
 */
export function splitMarkdownSections(text: string): MarkdownSection[] {
  const headings: Array<{ title: string; level: number; start: number }> = []
  let offset = 0
  let fence: string | null = null
  for (const line of text.split('\n')) {
    const fenceMatch = /^\s{0,3}(`{3,}|~{3,})/u.exec(line)
    if (fenceMatch) {
      const marker = fenceMatch[1][0]
      if (fence === null) fence = marker
      else if (fence === marker) fence = null
    } else if (fence === null) {
      const heading = HEADING.exec(line.replace(/\r$/u, ''))
      if (heading) headings.push({ title: heading[2], level: heading[1].length, start: offset })
    }
    offset += line.length + 1
  }
  return headings.map((heading, index) => {
    const next = headings.slice(index + 1).find((candidate) => candidate.level <= heading.level)
    return {
      id: `section-${index + 1}`,
      title: heading.title,
      level: heading.level,
      start: heading.start,
      end: next ? next.start : text.length
    }
  })
}
