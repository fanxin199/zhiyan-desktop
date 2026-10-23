/**
 * Course and research projects (docs/AI_NATIVE_REDESIGN_PLAN.md §6.6). They extend the teacher
 * projects that conversations already create: a project the teacher makes has key points, a folder
 * under the workspace and the artifacts whose `projectId` names it.
 */
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
