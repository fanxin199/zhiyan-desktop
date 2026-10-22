import { createHash } from 'node:crypto'
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, extname, join } from 'node:path'
import JSZip from 'jszip'
import { z } from 'zod'
import {
  artifactCreateVersionInputSchema,
  artifactRestoreVersionInputSchema,
  artifactVersionSchema,
  type ArtifactCreateVersionInput,
  type ArtifactRecord,
  type ArtifactRestoreVersionInput,
  type ArtifactVersion,
  type ArtifactVersionSource
} from '../../shared/artifact'
import type { ArtifactRegistry } from './artifact-service'
import { resolveTargetPathWithinWorkspace } from './workspace-paths'

/** Versions live next to the artifact, so they move and back up together with its folder. */
export const ARTIFACT_VERSIONS_DIRECTORY = join('.zhiyan', 'versions')
/** The latest versions kept in full; older ones keep only the last version of each day. */
export const ARTIFACT_RECENT_VERSION_LIMIT = 50

const MANIFEST_FILE_NAME = 'versions.json'
const BLOB_DIRECTORY_NAME = 'blobs'

const snapshotSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('file'), blob: z.string().regex(/^[a-f0-9]{64}$/u) }),
  z.object({
    type: z.literal('archive'),
    entries: z.array(z.object({ path: z.string().min(1), blob: z.string().regex(/^[a-f0-9]{64}$/u) }))
  })
])
const storedVersionSchema = artifactVersionSchema.extend({ snapshot: snapshotSchema })
const manifestSchema = z.object({
  version: z.literal(1),
  artifactId: z.string(),
  versions: z.array(storedVersionSchema)
})

type Snapshot = z.infer<typeof snapshotSchema>
type StoredVersion = z.infer<typeof storedVersionSchema>
type Manifest = z.infer<typeof manifestSchema>

type ArtifactVersionStoreOptions = {
  registry: Pick<ArtifactRegistry, 'get' | 'setCurrentVersion'>
  now?: () => Date
}

type ArtifactLocation = { artifact: ArtifactRecord; storagePath: string; directory: string }

function sha256(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex')
}

function sameSnapshot(left: Snapshot, right: Snapshot): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function localDay(iso: string): string {
  const date = new Date(iso)
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`
}

/** Newest versions in full, then the last version of each earlier day. `versions` is oldest first. */
export function retainedVersions<T extends { createdAt: string }>(versions: T[], limit = ARTIFACT_RECENT_VERSION_LIMIT): T[] {
  const recent = versions.slice(-limit)
  const older = versions.slice(0, Math.max(0, versions.length - limit))
  const lastOfDay = new Map<string, T>()
  for (const version of older) lastOfDay.set(localDay(version.createdAt), version)
  return [...lastOfDay.values(), ...recent]
}

function publicVersion(version: StoredVersion): ArtifactVersion {
  const { snapshot: _snapshot, ...rest } = version
  return rest
}

async function writeFileAtomically(path: string, data: Buffer | string): Promise<void> {
  const temporaryPath = `${path}.${process.pid}.tmp`
  await writeFile(temporaryPath, data)
  await rename(temporaryPath, path)
}

/**
 * Saves, lists and restores versions of registered artifacts. A text artifact is stored whole; a
 * courseware project is stored as the files inside its archive, so images shared by many versions
 * are kept once. Restoring writes the old content back and saves it as a new version, so history is
 * never rewritten.
 */
export class ArtifactVersionStore {
  private readonly registry: ArtifactVersionStoreOptions['registry']
  private readonly now: () => Date
  private readonly queues = new Map<string, Promise<unknown>>()

  constructor(options: ArtifactVersionStoreOptions) {
    this.registry = options.registry
    this.now = options.now ?? (() => new Date())
  }

  createVersion(input: ArtifactCreateVersionInput): Promise<ArtifactVersion> {
    const request = artifactCreateVersionInputSchema.parse(input)
    return this.serialize(request.id, async () => {
      const location = await this.locate(request.id)
      const snapshot = await this.capture(location)
      return this.append(location, snapshot, {
        source: request.source,
        summary: request.summary,
        ...(request.instruction ? { instruction: request.instruction } : {})
      }, { skipIfUnchanged: true })
    })
  }

  async listVersions(id: string): Promise<ArtifactVersion[]> {
    const location = await this.locate(id)
    const manifest = await this.readManifest(location)
    return manifest.versions.map(publicVersion).reverse()
  }

  restoreVersion(input: ArtifactRestoreVersionInput): Promise<ArtifactVersion> {
    const request = artifactRestoreVersionInputSchema.parse(input)
    return this.serialize(request.id, async () => {
      const location = await this.locate(request.id)
      const manifest = await this.readManifest(location)
      const target = manifest.versions.find((version) => version.version === request.version)
      if (!target) throw new Error(`找不到第 ${request.version} 版。`)
      await mkdir(dirname(location.storagePath), { recursive: true })
      await writeFileAtomically(location.storagePath, await this.materialize(location, target.snapshot))
      return this.append(location, target.snapshot, {
        source: 'restore',
        summary: `恢复到第 ${request.version} 版`
      }, { skipIfUnchanged: false })
    })
  }

  private async locate(id: string): Promise<ArtifactLocation> {
    const artifact = await this.registry.get(id)
    if (!artifact) throw new Error('找不到这个成果，可能已被移除。')
    if (!/^[A-Za-z0-9_-]+$/u.test(artifact.id)) throw new Error('成果编号无效。')
    const storagePath = await resolveTargetPathWithinWorkspace(artifact.storage.path, artifact.workspaceRoot)
    const directory = await resolveTargetPathWithinWorkspace(
      join(dirname(storagePath), ARTIFACT_VERSIONS_DIRECTORY, artifact.id),
      artifact.workspaceRoot
    )
    return { artifact, storagePath, directory }
  }

  private async capture(location: ArtifactLocation): Promise<Snapshot> {
    let data: Buffer
    try {
      if (!(await stat(location.storagePath)).isFile()) throw new Error('not a file')
      data = await readFile(location.storagePath)
    } catch {
      throw new Error('成果文件已被移走或删除，无法保存版本。')
    }
    const isArchive = location.artifact.storage.type === 'courseware-project'
      && extname(location.storagePath).toLowerCase() !== '.json'
    if (!isArchive) return { type: 'file', blob: await this.writeBlob(location, data) }

    const zip = await JSZip.loadAsync(data)
    const entries: Array<{ path: string; blob: string }> = []
    for (const file of Object.values(zip.files).sort((left, right) => left.name.localeCompare(right.name))) {
      if (file.dir) continue
      entries.push({ path: file.name, blob: await this.writeBlob(location, await file.async('nodebuffer')) })
    }
    return { type: 'archive', entries }
  }

  private async materialize(location: ArtifactLocation, snapshot: Snapshot): Promise<Buffer> {
    if (snapshot.type === 'file') return this.readBlob(location, snapshot.blob)
    const zip = new JSZip()
    for (const entry of snapshot.entries) zip.file(entry.path, await this.readBlob(location, entry.blob))
    return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
  }

  private async append(
    location: ArtifactLocation,
    snapshot: Snapshot,
    details: { source: ArtifactVersionSource; summary: string; instruction?: string },
    options: { skipIfUnchanged: boolean }
  ): Promise<ArtifactVersion> {
    const manifest = await this.readManifest(location)
    const latest = manifest.versions.at(-1)
    // Saving content identical to the latest version, such as a repeated autosave, adds nothing.
    if (latest && options.skipIfUnchanged && sameSnapshot(latest.snapshot, snapshot)) {
      return publicVersion(latest)
    }
    const version: StoredVersion = {
      version: (latest?.version ?? 0) + 1,
      createdAt: this.now().toISOString(),
      ...details,
      snapshot
    }
    const versions = retainedVersions([...manifest.versions, version])
    await this.writeManifest(location, { ...manifest, versions })
    await this.removeUnusedBlobs(location, versions)
    await this.registry.setCurrentVersion(location.artifact.id, version.version)
    return publicVersion(version)
  }

  private async readManifest(location: ArtifactLocation): Promise<Manifest> {
    let raw: string
    try {
      raw = await readFile(join(location.directory, MANIFEST_FILE_NAME), 'utf8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      return { version: 1, artifactId: location.artifact.id, versions: [] }
    }
    const manifest = manifestSchema.parse(JSON.parse(raw))
    if (manifest.artifactId !== location.artifact.id) throw new Error('版本记录与成果不匹配。')
    return manifest
  }

  private async writeManifest(location: ArtifactLocation, manifest: Manifest): Promise<void> {
    await mkdir(location.directory, { recursive: true })
    await writeFileAtomically(join(location.directory, MANIFEST_FILE_NAME), `${JSON.stringify(manifest, null, 2)}\n`)
  }

  private async writeBlob(location: ArtifactLocation, data: Buffer): Promise<string> {
    const hash = sha256(data)
    const directory = join(location.directory, BLOB_DIRECTORY_NAME)
    const path = join(directory, hash)
    try {
      await stat(path)
    } catch {
      await mkdir(directory, { recursive: true })
      await writeFileAtomically(path, data)
    }
    return hash
  }

  private async readBlob(location: ArtifactLocation, hash: string): Promise<Buffer> {
    const data = await readFile(join(location.directory, BLOB_DIRECTORY_NAME, hash))
    if (sha256(data) !== hash) throw new Error('版本内容已损坏，无法恢复。')
    return data
  }

  private async removeUnusedBlobs(location: ArtifactLocation, versions: StoredVersion[]): Promise<void> {
    const used = new Set(versions.flatMap((version) => version.snapshot.type === 'file'
      ? [version.snapshot.blob]
      : version.snapshot.entries.map((entry) => entry.blob)))
    const directory = join(location.directory, BLOB_DIRECTORY_NAME)
    for (const name of await readdir(directory).catch(() => [] as string[])) {
      if (!used.has(name)) await rm(join(directory, name), { force: true })
    }
  }

  private serialize<T>(id: string, task: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(id) ?? Promise.resolve()
    const next = previous.then(task, task)
    this.queues.set(id, next.catch(() => undefined))
    return next
  }
}
