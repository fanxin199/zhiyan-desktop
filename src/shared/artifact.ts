import { z } from 'zod'

/**
 * An artifact is a deliverable a teacher cares about: a lesson plan, a courseware project, a
 * document. The registry records where each one lives and what stage it has reached; every change
 * to it is kept as a version that can be restored (docs/AI_NATIVE_REDESIGN_PLAN.md §6.1).
 */
export const ARTIFACT_KINDS = [
  'lesson-plan',
  'courseware',
  'speaker-notes',
  'textbook-chapter',
  'document',
  'literature-report',
  'evidence-table',
  'analysis-report',
  'question-set'
] as const
export const ARTIFACT_STORAGE_TYPES = ['file', 'courseware-project'] as const
export const ARTIFACT_VERSION_SOURCES = ['ai-generate', 'ai-revise', 'teacher-edit', 'restore'] as const

const MAX_PATH_LENGTH = 4_096
const MAX_ID_LENGTH = 160

const trimmed = (max: number) => z.string().trim().min(1).max(max)

export const artifactKindSchema = z.enum(ARTIFACT_KINDS)
export const artifactVersionSourceSchema = z.enum(ARTIFACT_VERSION_SOURCES)

export const artifactStorageSchema = z.object({
  type: z.enum(ARTIFACT_STORAGE_TYPES),
  path: trimmed(MAX_PATH_LENGTH)
}).strict()

export const artifactRecordSchema = z.object({
  id: trimmed(MAX_ID_LENGTH),
  kind: artifactKindSchema,
  title: trimmed(200),
  /** Null until projects arrive in P3, meaning “未归档”. */
  projectId: trimmed(MAX_ID_LENGTH).nullable(),
  /** Module registry id of the tool that made it. */
  toolId: trimmed(80),
  /** The workspace the artifact was registered under; its file and versions must stay inside it. */
  workspaceRoot: trimmed(MAX_PATH_LENGTH),
  storage: artifactStorageSchema,
  /** Teacher-readable stage, such as “图片审核”. */
  stage: z.string().trim().max(80),
  progress: z.number().min(0).max(1).optional(),
  /** Number of the latest version; 0 before the first version is saved. */
  currentVersion: z.number().int().min(0),
  createdAt: z.string(),
  updatedAt: z.string()
}).strict()

export const artifactVersionSchema = z.object({
  version: z.number().int().min(1),
  createdAt: z.string(),
  source: artifactVersionSourceSchema,
  /** Such as “案例导入改为高血压急症”. */
  summary: z.string().trim().max(500),
  /** The teacher's own words when the version came from a request. */
  instruction: z.string().trim().max(4_000).optional()
}).strict()

export const artifactRegisterInputSchema = z.object({
  kind: artifactKindSchema,
  title: trimmed(200),
  toolId: trimmed(80),
  workspaceRoot: trimmed(MAX_PATH_LENGTH),
  storage: artifactStorageSchema,
  stage: z.string().trim().max(80).optional(),
  progress: z.number().min(0).max(1).optional(),
  projectId: trimmed(MAX_ID_LENGTH).nullable().optional()
}).strict()

export const artifactUpdateInputSchema = z.object({
  id: trimmed(MAX_ID_LENGTH),
  title: trimmed(200).optional(),
  stage: z.string().trim().max(80).optional(),
  progress: z.number().min(0).max(1).nullable().optional()
}).strict()

export const artifactListInputSchema = z.object({
  toolId: trimmed(80).optional(),
  kind: artifactKindSchema.optional(),
  limit: z.number().int().min(1).max(500).optional()
}).strict()

export const artifactIdInputSchema = z.object({
  id: trimmed(MAX_ID_LENGTH)
}).strict()

export const artifactCreateVersionInputSchema = z.object({
  id: trimmed(MAX_ID_LENGTH),
  source: artifactVersionSourceSchema.exclude(['restore']),
  summary: z.string().trim().max(500),
  instruction: z.string().trim().max(4_000).optional()
}).strict()

export const artifactRestoreVersionInputSchema = z.object({
  id: trimmed(MAX_ID_LENGTH),
  version: z.number().int().min(1)
}).strict()

export type ArtifactKind = z.infer<typeof artifactKindSchema>
export type ArtifactVersionSource = z.infer<typeof artifactVersionSourceSchema>
export type ArtifactStorage = z.infer<typeof artifactStorageSchema>
export type ArtifactRecord = z.infer<typeof artifactRecordSchema>
export type ArtifactVersion = z.infer<typeof artifactVersionSchema>
export type ArtifactRegisterInput = z.infer<typeof artifactRegisterInputSchema>
export type ArtifactUpdateInput = z.infer<typeof artifactUpdateInputSchema>
export type ArtifactListInput = z.infer<typeof artifactListInputSchema>
export type ArtifactCreateVersionInput = z.infer<typeof artifactCreateVersionInputSchema>
export type ArtifactRestoreVersionInput = z.infer<typeof artifactRestoreVersionInputSchema>

/** A registry entry as the renderer sees it: `available` is false when its file has been moved or deleted. */
export type ArtifactListItem = ArtifactRecord & { available: boolean }
