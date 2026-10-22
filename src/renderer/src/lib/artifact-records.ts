import type {
  ArtifactCreateVersionInput,
  ArtifactRecord,
  ArtifactRegisterInput
} from '@shared/artifact'

type ArtifactApi = Pick<Window['dsGui'], 'registerArtifact' | 'createArtifactVersion'>
type VersionDetails = Omit<ArtifactCreateVersionInput, 'id'>

function artifactApi(): ArtifactApi | null {
  const api = typeof window === 'undefined' ? undefined : window.dsGui
  return typeof api?.registerArtifact === 'function' && typeof api.createArtifactVersion === 'function'
    ? api
    : null
}

/**
 * Registers a saved deliverable and, when given, saves its content as a version. The registry is
 * secondary to saving itself, so failures are logged and never reach the teacher's workflow.
 */
export async function recordArtifact(
  input: ArtifactRegisterInput,
  version?: VersionDetails,
  api: ArtifactApi | null = artifactApi()
): Promise<ArtifactRecord | null> {
  if (!api) return null
  try {
    const artifact = await api.registerArtifact(input)
    if (version) await api.createArtifactVersion({ id: artifact.id, ...version })
    return artifact
  } catch (error) {
    console.warn('[zhiyan] Could not record artifact', error)
    return null
  }
}

const writeDocumentArtifactIds = new Map<string, string>()

/**
 * Records a teacher's save in the writing workspace as a teacher-edit version. The file is
 * registered once per session; an entry made earlier, such as a lesson plan sent to the writing
 * workspace, keeps its kind and title.
 */
export async function recordWriteDocumentSave(
  input: { workspaceRoot: string; path: string; title: string },
  api: ArtifactApi | null = artifactApi()
): Promise<void> {
  if (!api) return
  const version: VersionDetails = { source: 'teacher-edit', summary: '手动修改' }
  const knownId = writeDocumentArtifactIds.get(input.path)
  if (knownId) {
    try {
      await api.createArtifactVersion({ id: knownId, ...version })
      return
    } catch {
      // The entry may have been removed; register the file again below.
      writeDocumentArtifactIds.delete(input.path)
    }
  }
  const artifact = await recordArtifact({
    kind: 'document',
    title: input.title,
    toolId: 'write',
    workspaceRoot: input.workspaceRoot,
    storage: { type: 'file', path: input.path },
    ifMissing: true
  }, version, api)
  if (artifact) writeDocumentArtifactIds.set(input.path, artifact.id)
}

export function resetWriteDocumentArtifactIds(): void {
  writeDocumentArtifactIds.clear()
}
