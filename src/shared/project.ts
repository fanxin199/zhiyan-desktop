/**
 * Course and research projects (docs/AI_NATIVE_REDESIGN_PLAN.md §6.6). They extend the teacher
 * projects that conversations already create: a project the teacher makes has key points, a folder
 * under the workspace and the artifacts whose `projectId` names it.
 */
import { z } from 'zod'
import type { TeacherProjectTypeV1 } from './app-settings-types'

export type ProjectBriefFieldDefinition = {
  key: string
  label: string
  /** Shown as the placeholder when the value is empty. */
  hint: string
  multiline?: boolean
}

export const PROJECT_BRIEF_FIELDS: Record<TeacherProjectTypeV1, readonly ProjectBriefFieldDefinition[]> = {
  teaching: [
    { key: 'courseName', label: '课程', hint: '如“生理学”' },
    { key: 'chapter', label: '章节', hint: '如“第八章 呼吸系统”' },
    { key: 'audience', label: '授课对象', hint: '如“2023 级临床医学本科生”' },
    { key: 'hours', label: '学时', hint: '如“2 学时”' },
    { key: 'major', label: '专业', hint: '如“临床医学”' },
    { key: 'goals', label: '教学目标', hint: '这一章希望学生掌握什么', multiline: true },
    { key: 'glossary', label: '术语表', hint: '统一使用的术语，每行一个，如“肺通气 pulmonary ventilation”', multiline: true }
  ],
  research: [
    { key: 'title', label: '题目', hint: '课题名称' },
    { key: 'question', label: '科学问题', hint: '要回答的核心问题', multiline: true },
    { key: 'hypothesis', label: '核心假说', hint: '', multiline: true },
    { key: 'keyTerms', label: '关键术语', hint: '每行一个', multiline: true },
    { key: 'target', label: '目标期刊或基金', hint: '如“国自然面上项目”' }
  ]
}

/** Folder names under the workspace: 课程, 课题 and 未归档 for results without a project. */
export const PROJECT_FOLDERS: Record<TeacherProjectTypeV1 | 'unfiled', string> = {
  teaching: '课程',
  research: '课题',
  unfiled: '未归档'
}

export const PROJECT_TYPE_LABELS: Record<TeacherProjectTypeV1, string> = {
  teaching: '课程',
  research: '课题'
}

/** A folder name from a project name: no characters Windows forbids, at most 60 characters. */
export function projectFolderName(name: string): string {
  const cleaned = [...name]
    .map((character) => (character.charCodeAt(0) < 32 ? ' ' : character))
    .join('')
    .replace(/[<>:"/\\|?*]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
    .replace(/[. ]+$/u, '')
    .slice(0, 60)
    .trim()
  return cleaned || '未命名项目'
}

/** The name shown for a project: “生理学 · 第八章 呼吸系统”, or the research title. */
export function projectDisplayName(type: TeacherProjectTypeV1, brief: Record<string, string>, fallback = ''): string {
  if (type === 'teaching') {
    return [brief.courseName?.trim(), brief.chapter?.trim()].filter(Boolean).join(' · ') || fallback
  }
  return brief.title?.trim() || fallback
}

export function normalizeProjectBrief(type: TeacherProjectTypeV1, brief: unknown): Record<string, string> {
  if (!brief || typeof brief !== 'object' || Array.isArray(brief)) return {}
  const source = brief as Record<string, unknown>
  return Object.fromEntries(
    PROJECT_BRIEF_FIELDS[type]
      .map((field) => [field.key, typeof source[field.key] === 'string' ? (source[field.key] as string).trim().slice(0, 4_000) : ''])
      .filter(([, value]) => value)
  )
}

const briefSchema = z.record(z.string().trim().min(1).max(40), z.string().max(4_000))

export const projectCreateInputSchema = z.object({
  type: z.enum(['teaching', 'research']),
  brief: briefSchema,
  /** The writing workspace the project's folder goes in. */
  workspaceRoot: z.string().trim().min(1).max(4_096)
}).strict()

export const projectUpdateInputSchema = z.object({
  id: z.string().trim().min(1).max(160),
  brief: briefSchema.optional(),
  archived: z.boolean().optional()
}).strict()

export const projectAdoptInputSchema = z.object({
  workspaceRoot: z.string().trim().min(1).max(4_096)
}).strict()

export type ProjectCreateInput = z.infer<typeof projectCreateInputSchema>
export type ProjectUpdateInput = z.infer<typeof projectUpdateInputSchema>
export type ProjectAdoptInput = z.infer<typeof projectAdoptInputSchema>

/** A project's key points as prompt lines, “- 课程：生理学”, empty values left out. */
export function projectBriefLines(type: TeacherProjectTypeV1, brief: Record<string, string> = {}): string[] {
  return PROJECT_BRIEF_FIELDS[type]
    .filter((field) => brief[field.key]?.trim())
    .map((field) => `- ${field.label}：${brief[field.key].trim().replace(/\s*\n\s*/gu, '；')}`)
}

/**
 * The block added to generation prompts inside a project (Task 3.2.1), so every result follows the
 * same course or research key points. Empty when the project has none.
 */
export function projectPromptBlock(project: { name: string; type: TeacherProjectTypeV1; brief?: Record<string, string> }): string {
  const lines = projectBriefLines(project.type, project.brief)
  if (lines.length === 0) return ''
  return [
    `## ${PROJECT_TYPE_LABELS[project.type]}项目要点（${project.name}，生成时必须遵循，术语按其中的写法统一）`,
    ...lines
  ].join('\n')
}

/**
 * Intent keys that are really project key points, per tool, mapped to the project field
 * (Task 3.2.1): read from the active project, and offered back to it when the teacher edits one.
 */
export const PROJECT_FIELDS_BY_INTENT: Record<string, Record<string, string>> = {
  syllabus: { courseName: 'courseName', topic: 'chapter', audience: 'audience', hours: 'hours', major: 'major' },
  'ppt-gen': { topic: 'chapter', audience: 'audience' },
  textbook: { bookTitle: 'courseName', chapter: 'chapter', audience: 'audience' },
  write: { topic: 'title', target: 'target' }
}

/** The teacher's own project with this id, if it is still in use. */
export function findTeacherProject<T extends { id: string; origin?: string; archived?: boolean }>(
  projects: T[],
  projectId: string | undefined | null
): T | undefined {
  if (!projectId) return undefined
  return projects.find((project) => project.id === projectId && project.origin === 'teacher' && !project.archived)
}
