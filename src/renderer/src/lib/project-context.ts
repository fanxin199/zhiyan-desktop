import type { TeacherProjectSettingsV1 } from '@shared/app-settings'
import { findTeacherProject, PROJECT_FIELDS_BY_INTENT, projectPromptBlock } from '@shared/project'
import { rendererRuntimeClient } from '../agent/runtime-client'
import { useActiveProjectStore } from './active-project'

/** The project the teacher is working in, when it still exists (Task 3.2.1). */
export async function loadActiveProject(): Promise<TeacherProjectSettingsV1 | undefined> {
  const projectId = useActiveProjectStore.getState().projectId
  if (!projectId) return undefined
  try {
    return findTeacherProject((await rendererRuntimeClient.getSettings()).teacherProjects, projectId)
  } catch {
    return undefined
  }
}

/** The project's key points as a tool's intent values, e.g. a course's 章节 as 教案's topic. */
export function intentValuesFromProject(toolId: string, project: Pick<TeacherProjectSettingsV1, 'brief'> | undefined): Record<string, string> {
  const mapping = PROJECT_FIELDS_BY_INTENT[toolId]
  if (!mapping || !project?.brief) return {}
  return Object.fromEntries(
    Object.entries(mapping)
      .map(([intentKey, projectKey]) => [intentKey, project.brief?.[projectKey]?.trim() ?? ''])
      .filter(([, value]) => value)
  )
}

/** The key-point block for requests the page writes itself, such as courseware focus. */
export async function activeProjectBlock(): Promise<{ project?: TeacherProjectSettingsV1; block: string }> {
  const project = await loadActiveProject()
  return { project, block: project ? projectPromptBlock(project) : '' }
}
