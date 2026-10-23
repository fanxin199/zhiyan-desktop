import { useEffect, useState, type ReactElement } from 'react'
import { FolderOpen } from 'lucide-react'
import type { TeacherProjectSettingsV1 } from '@shared/app-settings'
import { PROJECT_TYPE_LABELS } from '@shared/project'
import { useActiveProjectStore } from '../../lib/active-project'
import { loadActiveProject } from '../../lib/project-context'

/** The active project, loaded again whenever the teacher switches project. */
export function useActiveProject(): TeacherProjectSettingsV1 | undefined {
  const projectId = useActiveProjectStore((state) => state.projectId)
  const [project, setProject] = useState<TeacherProjectSettingsV1 | undefined>()
  useEffect(() => {
    let active = true
    if (!projectId) {
      setProject(undefined)
      return
    }
    void loadActiveProject().then((loaded) => { if (active) setProject(loaded) })
    return () => { active = false }
  }, [projectId])
  return project
}

/**
 * Says that the result goes into the project the tool was opened from, with its key points, and
 * offers to leave the project (Task 3.2.1).
 */
export function ActiveProjectNote({ className = '' }: { className?: string }): ReactElement | null {
  const project = useActiveProject()
  if (!project) return null
  return (
    <p role="note" className={`flex flex-wrap items-center gap-1.5 text-caption text-ds-muted ${className}`}>
      <FolderOpen className="h-3.5 w-3.5 shrink-0" strokeWidth={1.8} />
      <span>
        在{PROJECT_TYPE_LABELS[project.type]}“{project.name}”中：按项目要点生成，结果归入这个项目。
      </span>
      <button
        type="button"
        onClick={() => useActiveProjectStore.getState().setProjectId(null)}
        className="underline-offset-2 hover:text-ds-ink hover:underline"
      >
        不归入项目
      </button>
    </p>
  )
}
