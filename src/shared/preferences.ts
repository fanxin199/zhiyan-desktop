import { z } from 'zod'

/**
 * Remembered habits (docs/AI_NATIVE_REDESIGN_PLAN.md §6.6, Task 3.3), such as “课件每页不超过 5
 * 行”. Each applies everywhere, to one tool, or to one project, and is added to generation prompts.
 */
export const teacherPreferenceSchema = z.object({
  id: z.string().trim().min(1).max(80),
  text: z.string().trim().min(1).max(300),
  scope: z.enum(['global', 'tool', 'project']),
  toolId: z.string().trim().min(1).max(80).optional(),
  projectId: z.string().trim().min(1).max(160).optional(),
  /** `explicit` when the teacher said “以后都…”, `suggested` when the app noticed a repeated change. */
  source: z.enum(['explicit', 'suggested']),
  createdAt: z.string().trim().max(64)
}).strict()

export type TeacherPreferenceV1 = z.infer<typeof teacherPreferenceSchema>

export const MAX_TEACHER_PREFERENCES = 100

/** Keeps well-formed preferences only; a scoped one needs its tool or project. */
export function normalizeTeacherPreferences(value: unknown): TeacherPreferenceV1[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => teacherPreferenceSchema.safeParse(item))
    .filter((parsed): parsed is { success: true; data: TeacherPreferenceV1 } => parsed.success)
    .map((parsed) => parsed.data)
    .filter((preference) =>
      (preference.scope !== 'tool' || Boolean(preference.toolId)) &&
      (preference.scope !== 'project' || Boolean(preference.projectId)))
    .slice(0, MAX_TEACHER_PREFERENCES)
}

/** The preferences that apply to a tool, optionally inside a project. */
export function applicablePreferences(
  preferences: TeacherPreferenceV1[] | undefined,
  toolId: string,
  projectId?: string | null
): TeacherPreferenceV1[] {
  return (preferences ?? []).filter((preference) =>
    preference.scope === 'global' ||
    (preference.scope === 'tool' && preference.toolId === toolId) ||
    (preference.scope === 'project' && Boolean(projectId) && preference.projectId === projectId))
}

/** “## 老师的习惯 …” for generation prompts; empty when none applies. */
export function preferencePromptBlock(
  preferences: TeacherPreferenceV1[] | undefined,
  toolId: string,
  projectId?: string | null
): string {
  const applicable = applicablePreferences(preferences, toolId, projectId)
  if (applicable.length === 0) return ''
  return ['## 老师的习惯（除非本次要求另有说明，都要遵守）', ...applicable.map((preference) => `- ${preference.text}`)].join('\n')
}
