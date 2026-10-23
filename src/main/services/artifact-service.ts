import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { z } from 'zod'
import {
  artifactRecordSchema,
  artifactRegisterInputSchema,
  artifactUpdateInputSchema,
  type ArtifactListInput,
  type ArtifactListItem,
  type ArtifactRecord,
  type ArtifactRegisterInput,
  type ArtifactUpdateInput
} from '../../shared/artifact'
import { canonicalPath, expandHomePath, resolveTargetPathWithinWorkspace } from './workspace-paths'

export const ARTIFACT_REGISTRY_FILE_NAME = 'zhiyan-artifacts.json'

const registryFileSchema = z.object({
  version: z.literal(1),
  artifacts: z.array(z.unknown())
})

type RegistryFile = { version: 1; artifacts: ArtifactRecord[] }

type ArtifactRegistryOptions = {
  /** Directory holding the registry file, normally the app's user data directory. */
  dataDirectory: string
  now?: () => Date
  createId?: () => string
}

function samePath(left: string, right: string): boolean {
  return process.platform === 'win32' ? left.toLowerCase() === right.toLowerCase() : left === right
}

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile()
  } catch {
    return false
  }
}

/**
 * The artifact registry, kept as one JSON file in the app's data directory. Paths are resolved and
 * checked against their workspace when an artifact is registered; listing reports artifacts whose
 * file has been moved away as unavailable instead of dropping them.
 */
export class ArtifactRegistry {
  private readonly path: string
  private readonly now: () => Date
  private readonly createId: () => string
  private cache: RegistryFile | null = null
  private writes: Promise<unknown> = Promise.resolve()

  constructor(options: ArtifactRegistryOptions) {
    this.path = join(options.dataDirectory, ARTIFACT_REGISTRY_FILE_NAME)
    this.now = options.now ?? (() => new Date())
    this.createId = options.createId ?? (() => `art_${randomUUID().replaceAll('-', '').slice(0, 20)}`)
  }

  async register(input: ArtifactRegisterInput): Promise<ArtifactRecord> {
    const request = artifactRegisterInputSchema.parse(input)
    const workspaceRoot = await canonicalPath(resolve(expandHomePath(request.workspaceRoot)))
    const storagePath = await resolveTargetPathWithinWorkspace(request.storage.path, workspaceRoot)
    if (!await isFile(storagePath)) {
      throw new Error('成果文件不存在，无法登记。')
    }
    return this.mutate((file) => {
      const timestamp = this.now().toISOString()
      const existing = file.artifacts.find((artifact) => samePath(artifact.storage.path, storagePath))
      if (existing && request.ifMissing) return { file, result: existing }
      if (existing) {
        // Saving the same file again refreshes its entry instead of adding a duplicate.
        const updated: ArtifactRecord = {
          ...existing,
          kind: request.kind,
          title: request.title,
          toolId: request.toolId,
          workspaceRoot,
          storage: { type: request.storage.type, path: storagePath },
          ...(request.stage !== undefined ? { stage: request.stage } : {}),
          ...(request.progress !== undefined ? { progress: request.progress } : {}),
          ...(request.projectId !== undefined ? { projectId: request.projectId } : {}),
          updatedAt: timestamp
        }
        return { file: replaceArtifact(file, updated), result: updated }
      }
      const created: ArtifactRecord = {
        id: this.createId(),
        kind: request.kind,
        title: request.title,
        projectId: request.projectId ?? null,
        toolId: request.toolId,
        workspaceRoot,
        storage: { type: request.storage.type, path: storagePath },
        stage: request.stage ?? '',
        ...(request.progress !== undefined ? { progress: request.progress } : {}),
        currentVersion: 0,
        createdAt: timestamp,
        updatedAt: timestamp
      }
      return { file: { ...file, artifacts: [...file.artifacts, created] }, result: created }
    })
  }

  async update(input: ArtifactUpdateInput): Promise<ArtifactRecord> {
    const request = artifactUpdateInputSchema.parse(input)
    return this.mutate((file) => {
      const existing = requireArtifact(file, request.id)
      const { progress: _progress, ...withoutProgress } = existing
      const updated: ArtifactRecord = {
        ...(request.progress === null ? withoutProgress : existing),
        ...(request.title !== undefined ? { title: request.title } : {}),
        ...(request.stage !== undefined ? { stage: request.stage } : {}),
        ...(typeof request.progress === 'number' ? { progress: request.progress } : {}),
        ...(request.projectId !== undefined ? { projectId: request.projectId } : {}),
        // Filing an artifact into a project is not work on it, so it keeps its place in 继续上次的工作.
        updatedAt: Object.keys(request).every((key) => key === 'id' || key === 'projectId')
          ? existing.updatedAt
          : this.now().toISOString()
      }
      return { file: replaceArtifact(file, updated), result: updated }
    })
  }

  /** Records that a new version was saved; used by the version service. */
  async setCurrentVersion(id: string, version: number): Promise<ArtifactRecord> {
    return this.mutate((file) => {
      const updated: ArtifactRecord = {
        ...requireArtifact(file, id),
        currentVersion: version,
        updatedAt: this.now().toISOString()
      }
      return { file: replaceArtifact(file, updated), result: updated }
    })
  }

  async get(id: string): Promise<ArtifactListItem | null> {
    const artifact = (await this.load()).artifacts.find((item) => item.id === id)
    return artifact ? { ...artifact, available: await isFile(artifact.storage.path) } : null
  }

  /** Latest first. */
  async list(filter: ArtifactListInput = {}): Promise<ArtifactListItem[]> {
    const artifacts = (await this.load()).artifacts
      .filter((artifact) => !filter.toolId || artifact.toolId === filter.toolId)
      .filter((artifact) => !filter.kind || artifact.kind === filter.kind)
      .filter((artifact) => filter.projectId === undefined || artifact.projectId === filter.projectId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, filter.limit ?? 200)
    return Promise.all(artifacts.map(async (artifact) => ({
      ...artifact,
      available: await isFile(artifact.storage.path)
    })))
  }

  private async load(): Promise<RegistryFile> {
    if (this.cache) return this.cache
    let raw: string
    try {
      raw = await readFile(this.path, 'utf8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      this.cache = { version: 1, artifacts: [] }
      return this.cache
    }
    const parsed = registryFileSchema.safeParse(JSON.parse(raw))
    if (!parsed.success) throw new Error(`成果登记表格式无法识别：${this.path}`)
    // Keep every entry that still matches the schema; one damaged entry must not hide the rest.
    const artifacts = parsed.data.artifacts.flatMap((entry) => {
      const artifact = artifactRecordSchema.safeParse(entry)
      return artifact.success ? [artifact.data] : []
    })
    this.cache = { version: 1, artifacts }
    return this.cache
  }

  private mutate<T>(change: (file: RegistryFile) => { file: RegistryFile; result: T }): Promise<T> {
    const task = this.writes.then(async () => {
      const { file, result } = change(await this.load())
      await mkdir(dirname(this.path), { recursive: true })
      const temporaryPath = `${this.path}.${process.pid}.tmp`
      await writeFile(temporaryPath, `${JSON.stringify(file, null, 2)}\n`, 'utf8')
      await rename(temporaryPath, this.path)
      this.cache = file
      return result
    })
    this.writes = task.catch(() => undefined)
    return task
  }
}

function requireArtifact(file: RegistryFile, id: string): ArtifactRecord {
  const artifact = file.artifacts.find((item) => item.id === id)
  if (!artifact) throw new Error('找不到这个成果，可能已被移除。')
  return artifact
}

function replaceArtifact(file: RegistryFile, artifact: ArtifactRecord): RegistryFile {
  return { ...file, artifacts: file.artifacts.map((item) => item.id === artifact.id ? artifact : item) }
}
