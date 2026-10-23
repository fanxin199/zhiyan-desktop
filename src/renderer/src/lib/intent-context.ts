import type { AppSettingsV1 } from '@shared/app-settings'
import type { IntentLayers, IntentToolId } from '@shared/intent-brief'
import { rendererRuntimeClient } from '../agent/runtime-client'

type ContextLayers = Pick<IntentLayers, 'project' | 'profile' | 'preference'>

function compact(values: Record<string, string | undefined>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(values)
      .map(([key, value]) => [key, value?.trim() ?? ''])
      .filter(([, value]) => value)
  )
}

/**
 * What the app already knows for a tool's key points (§6.3): the teacher's profile and, until P3
 * brings real projects, the most recent lesson plan's course details from `moduleContext`.
 * A chapter is never carried over, since each lesson is about a new one; preferences arrive in P3.
 */
export function intentContextFromSettings(
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
    context = intentContextFromSettings(toolId, await rendererRuntimeClient.getSettings({ forceRefresh: true }))
  } catch {
    // Fall through with no pre-filled values.
  }
  return window.dsGui.extractIntentBrief({ toolId, text, materials, context })
}
