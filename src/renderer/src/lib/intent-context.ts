import type { AppSettingsV1, TeacherProjectSettingsV1 } from '@shared/app-settings'
import type { IntentLayers, IntentToolId } from '@shared/intent-brief'
import { findTeacherProject } from '@shared/project'
import { rendererRuntimeClient } from '../agent/runtime-client'
import { useActiveProjectStore } from './active-project'
import { intentValuesFromProject } from './project-context'

type ContextLayers = Pick<IntentLayers, 'project' | 'profile' | 'preference'>

function compact(values: Record<string, string | undefined>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(values)
      .map(([key, value]) => [key, value?.trim() ?? ''])
      .filter(([, value]) => value)
  )
}

/**
 * What the app already knows for a tool's key points (§6.3): the active course or research project
 * when there is one (Task 3.2.1), otherwise the most recent lesson plan's course details from
 * `moduleContext`, and the teacher's profile. Outside a project a chapter is never carried over,
 * since each lesson is about a new one.
 */
export function intentContextFromSettings(
  toolId: IntentToolId,
  settings: Pick<AppSettingsV1, 'teacherProfile' | 'moduleContext'>,
  project?: Pick<TeacherProjectSettingsV1, 'brief'>
): ContextLayers {
  const layers = contextWithoutProject(toolId, settings)
  const fromProject = intentValuesFromProject(toolId, project)
  return Object.keys(fromProject).length > 0 ? { ...layers, project: { ...layers.project, ...fromProject } } : layers
}

function contextWithoutProject(
  toolId: IntentToolId,
  settings: Pick<AppSettingsV1, 'teacherProfile' | 'moduleContext'>
): ContextLayers {
  const { courses } = settings.teacherProfile
  // With several courses on the profile, any one of them would be a guess.
  const onlyCourse = courses.length === 1 ? courses[0] : undefined
  const recentId = settings.moduleContext.recent.syllabusProjectId
  const lesson = recentId ? settings.moduleContext.projects[recentId]?.syllabus : undefined

  switch (toolId) {
    case 'syllabus':
      return {
        project: compact({ courseName: lesson?.courseName, audience: lesson?.students, hours: lesson?.hours, major: lesson?.major }),
        profile: compact({ courseName: onlyCourse })
      }
    case 'ppt-gen':
      // Courseware usually follows the lesson plan just written.
      return { project: compact({ topic: lesson?.topic || lesson?.courseName, audience: lesson?.students }) }
    case 'textbook':
      return { project: compact({ audience: lesson?.students }), profile: compact({ bookTitle: onlyCourse }) }
    default:
      return {}
  }
}

/**
 * Reads a tool's key points for a request, with what the app already knows filled in. Settings that
 * cannot be read only mean nothing is pre-filled.
 */
export async function requestIntentBrief(
  toolId: IntentToolId,
  text: string,
  materials: Array<{ name: string; text: string }> = []
): ReturnType<Window['dsGui']['extractIntentBrief']> {
  let context: ContextLayers = {}
  try {
    const settings = await rendererRuntimeClient.getSettings({ forceRefresh: true })
    const project = findTeacherProject(settings.teacherProjects, useActiveProjectStore.getState().projectId)
    context = intentContextFromSettings(toolId, settings, project)
  } catch {
    // Fall through with no pre-filled values.
  }
  return window.dsGui.extractIntentBrief({ toolId, text, materials, context })
}
