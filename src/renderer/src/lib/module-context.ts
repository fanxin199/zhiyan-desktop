import type {
  AppSettingsV1,
  ModuleContextSettingsV1,
  TeacherModuleProjectContextV1,
  WritingBlueprintModuleContextV1
} from '@shared/app-settings'
import type { CoursewareAudience, CoursewareRequest } from '../../../shared/courseware'
import { rendererRuntimeClient } from '../agent/runtime-client'
import { stableTeacherProjectId } from './thread-project-registry'

export function moduleProjectNameFromDisplayText(displayText: string, fallback: string): string {
  const segments = displayText.split(/[·路]/u).map((segment) => segment.trim()).filter(Boolean)
  return segments.at(-1) || displayText.trim() || fallback
}

export function moduleProjectIdFromDisplayText(
  moduleId: string,
  displayText: string,
  fallback: string
): string {
  return stableTeacherProjectId(moduleId, moduleProjectNameFromDisplayText(displayText, fallback))
}

export function mergeModuleProjectContext(
  current: ModuleContextSettingsV1,
  projectId: string,
  patch: TeacherModuleProjectContextV1,
  recent: Partial<ModuleContextSettingsV1['recent']> = {}
): ModuleContextSettingsV1 {
  return {
    projects: {
      ...current.projects,
      [projectId]: {
        ...(current.projects[projectId] ?? {}),
        ...patch
      }
    },
    recent: {
      ...current.recent,
      ...recent
    }
  }
}

export async function persistModuleProjectContext(
  projectId: string,
  patch: TeacherModuleProjectContextV1,
  recent: Partial<ModuleContextSettingsV1['recent']> = {}
): Promise<void> {
  const settings = await rendererRuntimeClient.getSettings({ forceRefresh: true })
  await rendererRuntimeClient.setSettings({
    moduleContext: mergeModuleProjectContext(settings.moduleContext, projectId, patch, recent)
  })
}

function audienceFromStudents(students: string): CoursewareAudience {
  if (/国际|留学生|international/i.test(students)) return 'international'
  if (/研究生|硕士|博士|graduate|postgraduate/i.test(students)) return 'graduate'
  return 'undergraduate'
}

function durationMinutesFromHours(hours: string): number | null {
  const numberMatch = /(\d+(?:\.\d+)?)/u.exec(hours)
  if (!numberMatch) return null
  const value = Number(numberMatch[1])
  if (!Number.isFinite(value) || value <= 0) return null
  if (/分钟|min/i.test(hours)) return Math.max(15, Math.min(480, Math.round(value)))
  return Math.max(15, Math.min(480, Math.round(value * 45)))
}

export type CoursewareContextDefaults = Pick<CoursewareRequest, 'topic' | 'durationMinutes' | 'audience' | 'focus'>

export function coursewareDefaultsFromSettings(settings: Pick<AppSettingsV1, 'moduleContext'>): CoursewareContextDefaults | null {
  const recentId = settings.moduleContext.recent.syllabusProjectId
  const syllabus = recentId ? settings.moduleContext.projects[recentId]?.syllabus : undefined
  if (!syllabus) return null

  const topic = syllabus.topic || syllabus.courseName
  const durationMinutes = durationMinutesFromHours(syllabus.hours) ?? 90
  const audience = audienceFromStudents(syllabus.students)
  const focus = [
    syllabus.courseName ? `课程：${syllabus.courseName}` : '',
    syllabus.topic ? `主题：${syllabus.topic}` : '',
    syllabus.major ? `专业：${syllabus.major}` : '',
    syllabus.students ? `对象：${syllabus.students}` : ''
  ].filter(Boolean).join('\n')

  if (!topic && !focus) return null
  return {
    topic,
    durationMinutes,
    audience,
    focus
  }
}

export async function loadCoursewareContextDefaults(): Promise<CoursewareContextDefaults | null> {
  try {
    return coursewareDefaultsFromSettings(await rendererRuntimeClient.getSettings({ forceRefresh: true }))
  } catch {
    return null
  }
}

export function writingBlueprintFromSettings(
  settings: Pick<AppSettingsV1, 'moduleContext'>
): WritingBlueprintModuleContextV1 | null {
  const recentId = settings.moduleContext.recent.writingBlueprintProjectId
  return recentId ? settings.moduleContext.projects[recentId]?.writingBlueprint ?? null : null
}

export async function loadRecentWritingBlueprint(): Promise<WritingBlueprintModuleContextV1 | null> {
  try {
    return writingBlueprintFromSettings(await rendererRuntimeClient.getSettings({ forceRefresh: true }))
  } catch {
    return null
  }
}

export function buildImportedWritingBlueprintText(blueprint: WritingBlueprintModuleContextV1): string {
  const lines = [
    '请基于以下已有写作蓝图信息，转化为本次综述撰写蓝图：',
    '',
    '## 已有写作任务',
    blueprint.userInput || blueprint.displayText
  ]
  if (blueprint.fileNames.length > 0) {
    lines.push('', '## 已关联材料', blueprint.fileNames.map((name, index) => `${index + 1}. ${name}`).join('\n'))
  }
  lines.push('', '## 本次要求', '请保留原研究问题和证据边界，但改写为综述的中心论点、章节结构、每节边界和证据矩阵。')
  return lines.join('\n')
}
