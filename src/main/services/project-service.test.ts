import { mkdir, mkdtemp, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { AppSettingsPatch, AppSettingsV1, TeacherProjectSettingsV1 } from '../../shared/app-settings'
import { normalizeTeacherProjectSettings } from '../../shared/app-settings-normalize'
import { ArtifactRegistry } from './artifact-service'
import { ProjectService } from './project-service'

const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

async function setup(existing: Array<Partial<TeacherProjectSettingsV1>> = []) {
  const root = await mkdtemp(join(tmpdir(), 'zhiyan-projects-'))
  tempDirs.push(root)
  const workspace = join(root, 'write')
  await mkdir(workspace, { recursive: true })
  let projects = normalizeTeacherProjectSettings(existing)
  const registry = new ArtifactRegistry({ dataDirectory: join(root, 'data') })
  let id = 0
  const service = new ProjectService({
    loadSettings: async () => ({ teacherProjects: projects }) as AppSettingsV1,
    applySettingsPatch: async (patch: AppSettingsPatch) => {
      projects = normalizeTeacherProjectSettings(patch.teacherProjects ?? projects)
      return { teacherProjects: projects } as AppSettingsV1
    },
    registry,
    now: () => new Date('2026-10-23T08:00:00.000Z'),
    createId: () => `id${++id}`
  })
  return { root, workspace, service, registry, projects: () => projects }
}

describe('ProjectService', () => {
  it('creates a course with its folder under 课程, next to 未归档, and keeps conversation entries', async () => {
    const { workspace, service, projects } = await setup([{ id: 'conv-1', name: '移植免疫', type: 'teaching', lastUsedAt: '' }])

    const course = await service.create({
      type: 'teaching',
      workspaceRoot: workspace,
      brief: { courseName: '生理学', chapter: '第八章 呼吸系统', hours: '2 学时', nonsense: 'x' }
    })

    expect(course).toMatchObject({
      id: 'course-id1',
      name: '生理学 · 第八章 呼吸系统',
      type: 'teaching',
      origin: 'teacher',
      brief: { courseName: '生理学', chapter: '第八章 呼吸系统', hours: '2 学时' }
    })
    expect(course.directory).toMatch(/[\\/]课程[\\/]生理学 · 第八章 呼吸系统$/u)
    expect((await stat(course.directory!)).isDirectory()).toBe(true)
    expect((await readdir(workspace)).sort()).toEqual(['未归档', '课程'])
    expect(projects().map((project) => project.id)).toEqual(['course-id1', 'conv-1'])
  })

  it('renames a project when its key points change, keeps its folder and can archive it', async () => {
    const { workspace, service, projects } = await setup()
    const topic = await service.create({ type: 'research', workspaceRoot: workspace, brief: { title: 'TLS 与免疫治疗' } })

    const updated = await service.update({ id: topic.id, brief: { title: 'TLS 预测免疫治疗疗效', question: 'B 细胞的作用？' }, archived: true })

    expect(updated).toMatchObject({ name: 'TLS 预测免疫治疗疗效', archived: true, directory: topic.directory })
    expect(projects()[0].brief).toEqual({ title: 'TLS 预测免疫治疗疗效', question: 'B 细胞的作用？' })
    expect((await service.update({ id: topic.id, archived: false })).archived).toBeUndefined()
    await expect(service.update({ id: 'missing' })).rejects.toThrow('找不到这个项目')
  })

  it('registers documents and courseware already in the workspace as 未归档 without moving them', async () => {
    const { workspace, service, registry } = await setup()
    await mkdir(join(workspace, '旧稿'), { recursive: true })
    await mkdir(join(workspace, '.zhiyan-analysis', 'task'), { recursive: true })
    await writeFile(join(workspace, '综述.md'), '# 综述')
    await writeFile(join(workspace, '旧稿', '第八章.zhiyan-courseware'), 'zip')
    await writeFile(join(workspace, '.zhiyan-analysis', 'task', 'report.md'), '# 报告')
    await writeFile(join(workspace, '数据.csv'), 'a,b')

    await expect(service.adoptExisting({ workspaceRoot: workspace })).resolves.toEqual({ added: 2 })
    const listed = await registry.list({ projectId: null })
    expect(listed.map((item) => [item.title, item.kind, item.toolId]).sort()).toEqual([
      ['第八章', 'courseware', 'ppt-gen'],
      ['综述', 'document', 'write']
    ])
    // A second run finds nothing new.
    await expect(service.adoptExisting({ workspaceRoot: workspace })).resolves.toEqual({ added: 0 })
  })
})
