import { create } from 'zustand'
import type { ArtifactKind, ArtifactListItem } from '@shared/artifact'
import { useWriteWorkspaceStore } from '../write/write-workspace-store'

/** What each kind of artifact is called on cards. */
export const ARTIFACT_KIND_LABELS: Record<ArtifactKind, string> = {
  'lesson-plan': '教案',
  courseware: '课件',
  'speaker-notes': '讲稿',
  'textbook-chapter': '教材章节',
  document: '文稿',
  'literature-report': '文献报告',
  'evidence-table': '证据表',
  'analysis-report': '分析报告',
  'question-set': '随堂题'
}

export type ResumeTarget =
  /** A text file: it opens in 文稿, wherever it was made. */
  | { type: 'document' }
  /** A courseware project: the 课件 page reopens it. */
  | { type: 'courseware' }
  /** Anything else opens the tool that made it. */
  | { type: 'tool'; toolId: string }

const DOCUMENT_FILE = /\.(md|markdown|txt)$/iu

/** Where clicking an artifact on the home page takes the teacher (Task 1.6.2). */
export function resumeTargetFor(artifact: Pick<ArtifactListItem, 'storage' | 'toolId'>): ResumeTarget {
  if (artifact.storage.type === 'courseware-project') return { type: 'courseware' }
  if (DOCUMENT_FILE.test(artifact.storage.path)) return { type: 'document' }
  return { type: 'tool', toolId: artifact.toolId }
}

function samePath(left: string, right: string): boolean {
  const normalize = (value: string): string => value.replaceAll('\\', '/').replace(/\/+$/u, '').toLowerCase()
  return normalize(left) === normalize(right)
}

/** Opens a document in 文稿; documents can live in another writing space, so switch to it first. */
export async function openDocumentArtifact(artifact: Pick<ArtifactListItem, 'workspaceRoot' | 'storage'>): Promise<void> {
  const store = useWriteWorkspaceStore.getState()
  const sameSpace = store.workspaceRoots.find((root) => samePath(root, artifact.workspaceRoot))
  if (sameSpace && !samePath(sameSpace, store.workspaceRoot)) await store.selectWriteWorkspace(sameSpace)
  const root = sameSpace ?? store.workspaceRoot
  await store.openFile(root, artifact.storage.path)
  useWriteWorkspaceStore.getState().closeDocumentStart()
}

type PendingCoursewareState = {
  artifactId: string | null
  request: (artifactId: string) => void
  /** Returns the courseware waiting to be reopened, once. */
  take: () => string | null
}

/**
 * Courseware waiting for the 课件 page to mount. The workbench is rebuilt on every page change, so
 * the request cannot be a prop of the page that asked for it.
 */
export const usePendingCoursewareStore = create<PendingCoursewareState>((set, get) => ({
  artifactId: null,
  request: (artifactId) => set({ artifactId }),
  take: () => {
    const { artifactId } = get()
    if (artifactId) set({ artifactId: null })
    return artifactId
  }
}))
