import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { ARTIFACT_REGISTRY_FILE_NAME, ArtifactRegistry } from './artifact-service'

const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

async function setup(): Promise<{ dataDirectory: string; workspace: string; draft: string; registry: ArtifactRegistry }> {
  const root = await mkdtemp(join(tmpdir(), 'zhiyan-artifacts-'))
  tempDirs.push(root)
  const dataDirectory = join(root, 'data')
  const workspace = join(root, 'workspace')
  await mkdir(workspace, { recursive: true })
  const draft = join(workspace, '第八章教案.md')
  await writeFile(draft, '# 第八章\n', 'utf8')
  let tick = 0
  let id = 0
  const registry = new ArtifactRegistry({
    dataDirectory,
    now: () => new Date(Date.UTC(2026, 9, 23, 8, 0, tick++)),
    createId: () => `art_${++id}`
  })
  return { dataDirectory, workspace, draft, registry }
}

describe('ArtifactRegistry', () => {
  it('registers an artifact inside its workspace and finds it again after a restart', async () => {
    const { dataDirectory, workspace, draft, registry } = await setup()

    const record = await registry.register({
      kind: 'lesson-plan',
      title: '第八章教案',
      toolId: 'syllabus',
      workspaceRoot: workspace,
      storage: { type: 'file', path: draft },
      stage: '初稿'
    })

    expect(record).toMatchObject({
      id: 'art_1',
      kind: 'lesson-plan',
      projectId: null,
      stage: '初稿',
      currentVersion: 0
    })
    const reopened = new ArtifactRegistry({ dataDirectory })
    expect(await reopened.get('art_1')).toMatchObject({ title: '第八章教案', available: true })
    expect(JSON.parse(await readFile(join(dataDirectory, ARTIFACT_REGISTRY_FILE_NAME), 'utf8')).version).toBe(1)
  })

  it('refreshes the existing entry when the same file is registered again', async () => {
    const { workspace, draft, registry } = await setup()
    const input = {
      kind: 'lesson-plan' as const,
      title: '第八章教案',
      toolId: 'syllabus',
      workspaceRoot: workspace,
      storage: { type: 'file' as const, path: draft }
    }

    const first = await registry.register(input)
    const second = await registry.register({ ...input, title: '第八章 呼吸系统教案', stage: '已导出' })

    expect(second.id).toBe(first.id)
    expect(second.createdAt).toBe(first.createdAt)
    expect(second).toMatchObject({ title: '第八章 呼吸系统教案', stage: '已导出' })
    expect(await registry.list()).toHaveLength(1)
  })

  it('updates the stage and progress and can clear the progress', async () => {
    const { workspace, draft, registry } = await setup()
    const record = await registry.register({
      kind: 'courseware',
      title: '呼吸系统课件',
      toolId: 'ppt-gen',
      workspaceRoot: workspace,
      storage: { type: 'courseware-project', path: draft }
    })

    const reviewing = await registry.update({ id: record.id, stage: '图片审核', progress: 0.4 })
    expect(reviewing).toMatchObject({ stage: '图片审核', progress: 0.4 })
    expect(reviewing.updatedAt > record.updatedAt).toBe(true)

    const done = await registry.update({ id: record.id, stage: '可导出', progress: null })
    expect(done.stage).toBe('可导出')
    expect(done).not.toHaveProperty('progress')
  })

  it('lists the latest artifacts first, filtered by tool, and marks moved files as unavailable', async () => {
    const { workspace, draft, registry } = await setup()
    const notes = join(workspace, '讲稿.md')
    await writeFile(notes, '讲稿', 'utf8')
    await registry.register({ kind: 'lesson-plan', title: '教案', toolId: 'syllabus', workspaceRoot: workspace, storage: { type: 'file', path: draft } })
    await registry.register({ kind: 'speaker-notes', title: '讲稿', toolId: 'ppt-gen', workspaceRoot: workspace, storage: { type: 'file', path: notes } })

    expect((await registry.list()).map((item) => item.title)).toEqual(['讲稿', '教案'])
    expect((await registry.list({ toolId: 'syllabus' })).map((item) => item.title)).toEqual(['教案'])

    await rm(notes)
    expect((await registry.list()).map((item) => [item.title, item.available])).toEqual([
      ['讲稿', false],
      ['教案', true]
    ])
  })

  it('refuses files outside the workspace, missing files and unknown ids', async () => {
    const { workspace, registry } = await setup()
    const outside = join(workspace, '..', 'outside.md')
    await writeFile(outside, 'x', 'utf8')

    await expect(registry.register({
      kind: 'document', title: '外部文件', toolId: 'write', workspaceRoot: workspace, storage: { type: 'file', path: outside }
    })).rejects.toThrow('Path must stay within the selected workspace.')
    await expect(registry.register({
      kind: 'document', title: '不存在', toolId: 'write', workspaceRoot: workspace, storage: { type: 'file', path: join(workspace, 'missing.md') }
    })).rejects.toThrow('成果文件不存在')
    await expect(registry.update({ id: 'art_missing', stage: '初稿' })).rejects.toThrow('找不到这个成果')
    expect(await registry.list()).toEqual([])
  })

  it('keeps readable entries when one entry in the registry file is damaged', async () => {
    const { dataDirectory, workspace, draft, registry } = await setup()
    await registry.register({ kind: 'document', title: '文稿', toolId: 'write', workspaceRoot: workspace, storage: { type: 'file', path: draft } })
    const path = join(dataDirectory, ARTIFACT_REGISTRY_FILE_NAME)
    const file = JSON.parse(await readFile(path, 'utf8'))
    file.artifacts.push({ id: 'broken' })
    await writeFile(path, JSON.stringify(file), 'utf8')

    expect((await new ArtifactRegistry({ dataDirectory }).list()).map((item) => item.title)).toEqual(['文稿'])
  })
})
