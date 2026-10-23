import { mkdir } from 'node:fs/promises'
import { relative, resolve } from 'node:path'
import type { AppSettingsV1, TeacherProjectSettingsV1 } from '../../shared/app-settings'
import { findTeacherProject, projectPromptBlock } from '../../shared/project'

export type ProjectPlacement = {
  project?: TeacherProjectSettingsV1
  /** “## 课程项目要点 …” for the prompt, or empty. */
  block: string
  /** Where the new file goes: the project's folder when it lies inside the workspace, else the workspace. */
  directory: string
}

function isInside(root: string, path: string): boolean {
  const rel = relative(resolve(root), resolve(path))
  return rel === '' || (!rel.startsWith('..') && !/^[a-zA-Z]:/u.test(rel))
}

/**
 * How a result made inside a project is written and saved (Task 3.2.1): with the project's key
 * points in the prompt, in the project's folder and filed under the project.
 */
export async function projectPlacement(
  settings: Pick<AppSettingsV1, 'teacherProjects'>,
  projectId: string | undefined,
  workspaceRoot: string
): Promise<ProjectPlacement> {
  const project = findTeacherProject(settings.teacherProjects, projectId)
  if (!project) return { block: '', directory: workspaceRoot }
  const directory = project.directory && isInside(workspaceRoot, project.directory) ? project.directory : workspaceRoot
  await mkdir(directory, { recursive: true })
  return { project, block: projectPromptBlock(project), directory }
}
