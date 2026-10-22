import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ArtifactRecord } from '@shared/artifact'
import { recordArtifact, recordWriteDocumentSave, resetWriteDocumentArtifactIds } from './artifact-records'

function record(id = 'art_1'): ArtifactRecord {
  return {
    id,
    kind: 'document',
    title: '文稿',
    projectId: null,
    toolId: 'write',
    workspaceRoot: '/write',
    storage: { type: 'file', path: '/write/文稿.md' },
    stage: '',
    currentVersion: 0,
    createdAt: '2026-10-23T08:00:00.000Z',
    updatedAt: '2026-10-23T08:00:00.000Z'
  }
}

function api() {
  return {
    registerArtifact: vi.fn(async () => record()),
    createArtifactVersion: vi.fn(async () => ({
      version: 1, createdAt: '2026-10-23T08:00:00.000Z', source: 'teacher-edit' as const, summary: '手动修改'
    }))
  }
}

afterEach(() => {
  resetWriteDocumentArtifactIds()
  vi.restoreAllMocks()
})

describe('recordArtifact', () => {
  it('registers the artifact and saves its first version', async () => {
    const bridge = api()

    await expect(recordArtifact({
      kind: 'lesson-plan', title: '教案', toolId: 'syllabus', workspaceRoot: '/write', storage: { type: 'file', path: '/write/教案.md' }
    }, { source: 'ai-generate', summary: '生成初稿' }, bridge)).resolves.toMatchObject({ id: 'art_1' })
    expect(bridge.createArtifactVersion).toHaveBeenCalledWith({ id: 'art_1', source: 'ai-generate', summary: '生成初稿' })
  })

  it('never lets a registry failure reach the caller', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const bridge = api()
    bridge.registerArtifact.mockRejectedValue(new Error('Workspace must be selected'))

    await expect(recordArtifact({
      kind: 'document', title: '文稿', toolId: 'write', workspaceRoot: '/elsewhere', storage: { type: 'file', path: '/elsewhere/a.md' }
    }, undefined, bridge)).resolves.toBeNull()
  })
})

describe('recordWriteDocumentSave', () => {
  it('registers a document once without renaming earlier entries, then only saves versions', async () => {
    const bridge = api()
    const save = { workspaceRoot: '/write', path: '/write/文稿.md', title: '文稿' }

    await recordWriteDocumentSave(save, bridge)
    await recordWriteDocumentSave(save, bridge)

    expect(bridge.registerArtifact).toHaveBeenCalledOnce()
    expect(bridge.registerArtifact).toHaveBeenCalledWith(expect.objectContaining({ ifMissing: true, toolId: 'write' }))
    expect(bridge.createArtifactVersion).toHaveBeenCalledTimes(2)
    expect(bridge.createArtifactVersion).toHaveBeenLastCalledWith({ id: 'art_1', source: 'teacher-edit', summary: '手动修改' })
  })

  it('registers the file again when its entry has gone', async () => {
    const bridge = api()
    const save = { workspaceRoot: '/write', path: '/write/文稿.md', title: '文稿' }
    await recordWriteDocumentSave(save, bridge)
    bridge.createArtifactVersion.mockRejectedValueOnce(new Error('找不到这个成果'))

    await recordWriteDocumentSave(save, bridge)

    expect(bridge.registerArtifact).toHaveBeenCalledTimes(2)
  })
})
