import type { TeacherProjectSettingsV1 } from './app-settings-types'
import { preferencePromptBlock, type TeacherPreferenceV1 } from './preferences'
import { findTeacherProject, projectPromptBlock } from './project'

/**
 * What every generation inside the app is told besides the request (Tasks 3.2.1, 3.3.1): the key
 * points of the project it belongs to and the teacher's habits for this tool. Empty when neither.
 */
export function generationContextBlock(
  settings: { teacherProjects: TeacherProjectSettingsV1[]; preferences?: TeacherPreferenceV1[] },
  toolId: string,
  projectId: string | null | undefined
): string {
  const project = findTeacherProject(settings.teacherProjects, projectId)
  return [
    project ? projectPromptBlock(project) : '',
    preferencePromptBlock(settings.preferences, toolId, project?.id)
  ].filter(Boolean).join('\n\n')
}
