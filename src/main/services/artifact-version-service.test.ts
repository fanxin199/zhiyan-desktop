import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import JSZip from 'jszip'
import { afterEach, describe, expect, it } from 'vitest'
import type { ArtifactListItem } from '../../shared/artifact'
import { ArtifactRegistry } from './artifact-service'
import {
  ARTIFACT_VERSIONS_DIRECTORY,
  ArtifactVersionStore,
  retainedVersions
} from './artifact-version-service'

const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

async function setup(fileName = '第八章教案.md', content: string | Buffer = '# 第八章\n初稿\n') {
  const root = await mkdtemp(join(tmpdir(), 'zhiyan-versions-'))
  tempDirs.push(root)
  const workspace = join(root, 'workspace')
  await mkdir(workspace, { recursive: true })
  const path = join(workspace, fileName)
  await writeFile(path, content)
  let tick = 0
  const now = () => new Date(Date.UTC(2026, 9, 23, 8, 0, tick++))
  const registry = new ArtifactRegistry({ dataDirectory: join(root, 'data'), now })
  const versions = new ArtifactVersionStore({ registry, now })
  return { root, workspace, path, registry, versions }
}

async function courseware(projectJson: string, image: Buffer): Promise<Buffer> {
  const zip = new JSZip()
  zip.file('project.json', projectJson)
  zip.file('assets/figure.png', image)
  return zip.generateAsync({ type: 'nodebuffer' })
}

describe('ArtifactVersionStore', () => {
  it('saves versions next to the artifact, skips unchanged saves and restores as a new version', async () => {
    const { workspace, path, registry, versions } = await setup()
    const artifact = await registry.register({
      kind: 'lesson-plan', title: '第八章教案', toolId: 'syllabus', workspaceRoot: workspace, storage: { type: 'file', path }
    })

    const first = await versions.createVersion({ id: artifact.id, source: 'ai-generate', summary: '生成初稿' })
    await writeFile(path, '# 第八章\n案例导入改为高血压急症\n', 'utf8')
    const second = await versions.createVersion({
      id: artifact.id, source: 'ai-revise', summary: '案例导入改为高血压急症', instruction: '换成高血压急症的案例'
    })
    const repeated = await versions.createVersion({ id: artifact.id, source: 'teacher-edit', summary: '自动保存' })

    expect([first.version, second.version, repeated.version]).toEqual([1, 2, 2])
    expect((await registry.get(artifact.id))?.currentVersion).toBe(2)
    expect(await readdir(join(workspace, ARTIFACT_VERSIONS_DIRECTORY, artifact.id))).toContain('versions.json')

    const restored = await versions.restoreVersion({ id: artifact.id, version: 1 })
    expect(restored).toMatchObject({ version: 3, source: 'restore', summary: '恢复到第 1 版' })
    expect(await readFile(path, 'utf8')).toBe('# 第八章\n初稿\n')
    expect((await versions.listVersions(artifact.id)).map((version) => [version.version, version.source])).toEqual([
      [3, 'restore'],
      [2, 'ai-revise'],
      [1, 'ai-generate']
    ])
    expect((await versions.listVersions(artifact.id))[1]).toMatchObject({ instruction: '换成高血压急症的案例' })
    expect((await versions.listVersions(artifact.id))[0]).not.toHaveProperty('snapshot')
  })

  it('keeps courseware images once across versions and rebuilds the archive on restore', async () => {
    const image = Buffer.from('fake-png-bytes')
    const { workspace, path, registry, versions } = await setup('呼吸系统.zhiyan-courseware', await courseware('{"title":"v1"}', image))
    const artifact = await registry.register({
      kind: 'courseware', title: '呼吸系统课件', toolId: 'ppt-gen', workspaceRoot: workspace, storage: { type: 'courseware-project', path }
    })

    await versions.createVersion({ id: artifact.id, source: 'ai-generate', summary: '生成课件' })
    await writeFile(path, await courseware('{"title":"v2"}', image))
    await versions.createVersion({ id: artifact.id, source: 'ai-revise', summary: '改标题' })

    // project.json twice and the shared image once.
    expect(await readdir(join(workspace, ARTIFACT_VERSIONS_DIRECTORY, artifact.id, 'blobs'))).toHaveLength(3)

    await versions.restoreVersion({ id: artifact.id, version: 1 })
    const restored = await JSZip.loadAsync(await readFile(path))
    expect(await restored.file('project.json')?.async('string')).toBe('{"title":"v1"}')
    expect(await restored.file('assets/figure.png')?.async('nodebuffer')).toEqual(image)
  })

  it('refuses artifacts whose file has left the workspace', async () => {
    const { root, workspace, path } = await setup()
    const outside = join(root, 'outside.md')
    await writeFile(outside, 'x', 'utf8')
    const artifact: ArtifactListItem = {
      id: 'art_outside', kind: 'document', title: '外部', projectId: null, toolId: 'write', workspaceRoot: workspace,
      storage: { type: 'file', path: outside }, stage: '', currentVersion: 0,
      createdAt: '2026-10-23T08:00:00.000Z', updatedAt: '2026-10-23T08:00:00.000Z', available: true
    }
    const versions = new ArtifactVersionStore({
      registry: { get: async () => artifact, setCurrentVersion: async () => artifact }
    })

    await expect(versions.createVersion({ id: artifact.id, source: 'teacher-edit', summary: '保存' }))
      .rejects.toThrow('Path must stay within the selected workspace.')
    expect(await readFile(path, 'utf8')).toBe('# 第八章\n初稿\n')
  })

  it('reports a moved file when saving but can still restore it', async () => {
    const { workspace, path, registry, versions } = await setup()
    const artifact = await registry.register({
      kind: 'document', title: '文稿', toolId: 'write', workspaceRoot: workspace, storage: { type: 'file', path }
    })
    await versions.createVersion({ id: artifact.id, source: 'teacher-edit', summary: '保存' })
    await rm(path)

    await expect(versions.createVersion({ id: artifact.id, source: 'teacher-edit', summary: '保存' }))
      .rejects.toThrow('成果文件已被移走或删除')
    await expect(versions.restoreVersion({ id: artifact.id, version: 1 })).resolves.toMatchObject({ version: 2 })
    expect(await readFile(path, 'utf8')).toBe('# 第八章\n初稿\n')
  })

  it('refuses to restore a missing or damaged version', async () => {
    const { workspace, path, registry, versions } = await setup()
    const artifact = await registry.register({
      kind: 'document', title: '文稿', toolId: 'write', workspaceRoot: workspace, storage: { type: 'file', path }
    })
    await versions.createVersion({ id: artifact.id, source: 'teacher-edit', summary: '保存' })
    const blobs = join(workspace, ARTIFACT_VERSIONS_DIRECTORY, artifact.id, 'blobs')
    const [blob] = await readdir(blobs)
    await writeFile(join(blobs, blob), 'tampered', 'utf8')

    await expect(versions.restoreVersion({ id: artifact.id, version: 9 })).rejects.toThrow('找不到第 9 版')
    await expect(versions.restoreVersion({ id: artifact.id, version: 1 })).rejects.toThrow('版本内容已损坏')
    expect(await readFile(path, 'utf8')).toBe('# 第八章\n初稿\n')
  })
})

describe('teacher edit versions', () => {
  it('joins edits saved within ten minutes into one version and starts a new one after a pause', async () => {
    const root = await mkdtemp(join(tmpdir(), 'zhiyan-versions-'))
    tempDirs.push(root)
    const workspace = join(root, 'workspace')
    await mkdir(workspace, { recursive: true })
    const path = join(workspace, '文稿.md')
    await writeFile(path, 'v1', 'utf8')
    let minutes = 0
    const now = () => new Date(Date.UTC(2026, 9, 23, 8, minutes))
    const registry = new ArtifactRegistry({ dataDirectory: join(root, 'data'), now })
    const versions = new ArtifactVersionStore({ registry, now })
    const artifact = await registry.register({
      kind: 'document', title: '文稿', toolId: 'write', workspaceRoot: workspace, storage: { type: 'file', path }
    })

    await versions.createVersion({ id: artifact.id, source: 'ai-generate', summary: '生成初稿' })
    for (const [minute, content] of [[1, 'v2'], [5, 'v3'], [14, 'v4'], [30, 'v5']] as const) {
      minutes = minute
      await writeFile(path, content, 'utf8')
      await versions.createVersion({ id: artifact.id, source: 'teacher-edit', summary: '手动修改' })
    }

    // Edits at minutes 1, 5 and 14 are one session; the edit at minute 30 starts another.
    expect((await versions.listVersions(artifact.id)).map((version) => [version.version, version.source])).toEqual([
      [3, 'teacher-edit'],
      [2, 'teacher-edit'],
      [1, 'ai-generate']
    ])
    await versions.restoreVersion({ id: artifact.id, version: 2 })
    expect(await readFile(path, 'utf8')).toBe('v4')
  })
})

describe('retainedVersions', () => {
  it('keeps the latest versions in full and one version per earlier day', () => {
    const versions = Array.from({ length: 8 }, (_, index) => ({
      version: index + 1,
      // Two versions a day for the first three days, then two more on the fourth.
      createdAt: new Date(2026, 9, 20 + Math.floor(index / 2), 9, index).toISOString()
    }))

    // Versions 6–8 are the latest; of the older ones, 2, 4 and 5 are the last of their day.
    expect(retainedVersions(versions, 3).map((version) => version.version)).toEqual([2, 4, 5, 6, 7, 8])
    expect(retainedVersions(versions, 50)).toHaveLength(8)
  })
})
