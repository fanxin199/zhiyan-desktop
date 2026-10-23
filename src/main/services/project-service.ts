import { randomUUID } from 'node:crypto'
import { mkdir, readdir } from 'node:fs/promises'
import { basename, extname, join, resolve } from 'node:path'
import type { AppSettingsPatch, AppSettingsV1, TeacherProjectSettingsV1 } from '../../shared/app-settings'
import type { ArtifactKind } from '../../shared/artifact'
import {
  normalizeProjectBrief,
  PROJECT_FOLDERS,
  projectAdoptInputSchema,
  projectCreateInputSchema,
  projectDisplayName,
  projectFolderName,
  projectUpdateInputSchema,
  type ProjectAdoptInput,
  type ProjectCreateInput,
  type ProjectUpdateInput
} from '../../shared/project'
import type { ArtifactRegistry } from './artifact-service'
import { canonicalPath, expandHomePath } from './workspace-paths'

/** Files found in a workspace and what they are registered as (Task 3.1.2). */
const ADOPTED_FILES: Record<string, { kind: ArtifactKind; toolId: string }> = {
  '.md': { kind: 'document', toolId: 'write' },
  '.zhiyan-courseware': { kind: 'courseware', toolId: 'ppt-gen' }
}
const ADOPT_MAX_DEPTH = 4
const ADOPT_MAX_FILES = 300

type ProjectServiceOptions = {
  loadSettings: () => Promise<AppSettingsV1>
  applySettingsPatch: (patch: AppSettingsPatch) => Promise<AppSettingsV1>
  registry: Pick<ArtifactRegistry, 'register' | 'list'>
  now?: () => Date
  createId?: () => string
}

/**
 * Course and research projects (Tasks 3.1.1–3.1.2): each gets a folder under the workspace, such as
 * 课程/生理学 · 第八章, next to 未归档 for results without a project. Nothing existing is moved.
 */
export class ProjectService {
  constructor(private readonly options: ProjectServiceOptions) {}

  private now(): string {
    return (this.options.now?.() ?? new Date()).toISOString()
  }

  async create(input: ProjectCreateInput): Promise<TeacherProjectSettingsV1> {
    const request = projectCreateInputSchema.parse(input)
    const workspaceRoot = await canonicalPath(resolve(expandHomePath(request.workspaceRoot)))
    const brief = normalizeProjectBrief(request.type, request.brief)
    const name = projectDisplayName(request.type, brief, request.type === 'teaching' ? '未命名课程' : '未命名课题')
    const directory = join(workspaceRoot, PROJECT_FOLDERS[request.type], projectFolderName(name))
    await mkdir(directory, { recursive: true })
    await mkdir(join(workspaceRoot, PROJECT_FOLDERS.unfiled), { recursive: true })
    const project: TeacherProjectSettingsV1 = {
      id: `${request.type === 'teaching' ? 'course' : 'topic'}-${this.options.createId?.() ?? randomUUID()}`,
      name,
      type: request.type,
      workspacePath: workspaceRoot,
      lastUsedAt: this.now(),
      origin: 'teacher',
      brief,
      directory
    }
    const settings = await this.options.loadSettings()
    await this.options.applySettingsPatch({ teacherProjects: [project, ...settings.teacherProjects] })
    return project
  }

  /** Changes key points or archives; the name follows the key points, the folder stays where it is. */
  async update(input: ProjectUpdateInput): Promise<TeacherProjectSettingsV1> {
    const request = projectUpdateInputSchema.parse(input)
    const settings = await this.options.loadSettings()
    const existing = settings.teacherProjects.find((project) => project.id === request.id && project.origin === 'teacher')
    if (!existing) throw new Error('找不到这个项目。')
    const brief = request.brief ? normalizeProjectBrief(existing.type, request.brief) : existing.brief ?? {}
    const updated: TeacherProjectSettingsV1 = {
      ...existing,
      brief,
      name: projectDisplayName(existing.type, brief, existing.name),
      lastUsedAt: this.now(),
      ...(request.archived !== undefined ? { archived: request.archived } : {})
    }
    if (request.archived === false) delete updated.archived
    await this.options.applySettingsPatch({
      teacherProjects: settings.teacherProjects.map((project) => project.id === updated.id ? updated : project)
    })
    return updated
  }

  /**
   * Registers documents and courseware already in the workspace as 未归档 artifacts so they can be
   * filed into projects; files stay where they are. Returns how many were newly registered.
   */
  async adoptExisting(input: ProjectAdoptInput): Promise<{ added: number }> {
    const request = projectAdoptInputSchema.parse(input)
    const workspaceRoot = await canonicalPath(resolve(expandHomePath(request.workspaceRoot)))
    const before = (await this.options.registry.list({ limit: 500 })).length
    const files: string[] = []
    const walk = async (directory: string, depth: number): Promise<void> => {
      if (depth > ADOPT_MAX_DEPTH || files.length >= ADOPT_MAX_FILES) return
      let entries
      try {
        entries = await readdir(directory, { withFileTypes: true })
      } catch {
        return
      }
      for (const entry of entries) {
        if (files.length >= ADOPT_MAX_FILES) return
        // App records (.zhiyan-analysis, version stores) and tool folders are not teacher files.
        if (entry.name.startsWith('.') || entry.name === 'node_modules') continue
        const path = join(directory, entry.name)
        if (entry.isDirectory()) await walk(path, depth + 1)
        else if (entry.isFile() && ADOPTED_FILES[extname(entry.name).toLowerCase()]) files.push(path)
      }
    }
    await walk(workspaceRoot, 0)
    for (const path of files) {
      const { kind, toolId } = ADOPTED_FILES[extname(path).toLowerCase()]
      await this.options.registry.register({
        kind,
        title: basename(path, extname(path)),
        toolId,
        workspaceRoot,
        storage: { type: kind === 'courseware' ? 'courseware-project' : 'file', path },
        ifMissing: true
      })
    }
    const after = (await this.options.registry.list({ limit: 500 })).length
    return { added: Math.max(0, after - before) }
  }
}
