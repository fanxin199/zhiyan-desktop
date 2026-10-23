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
  /** Reopened by the tool that made it: courseware projects, lesson plans, literature reports. */
  | { type: 'reopen'; toolId: 'ppt-gen' | 'syllabus' | 'literature' | 'bioinformatics' | 'quiz' }
  /** Anything else opens the tool that made it. */
  | { type: 'tool'; toolId: string }

const DOCUMENT_FILE = /\.(md|markdown|txt)$/iu

/** Where clicking an artifact on the home page takes the teacher (Task 1.6.2). */
export function resumeTargetFor(artifact: Pick<ArtifactListItem, 'kind' | 'storage' | 'toolId'>): ResumeTarget {
  if (artifact.storage.type === 'courseware-project') return { type: 'reopen', toolId: 'ppt-gen' }
  if (DOCUMENT_FILE.test(artifact.storage.path)) {
    if (artifact.kind === 'lesson-plan' && artifact.toolId === 'syllabus') return { type: 'reopen', toolId: 'syllabus' }
    if ((artifact.kind === 'literature-report' || artifact.kind === 'evidence-table') && artifact.toolId === 'literature') {
      return { type: 'reopen', toolId: 'literature' }
    }
    if (artifact.kind === 'analysis-report' && artifact.toolId === 'bioinformatics') return { type: 'reopen', toolId: 'bioinformatics' }
    if (artifact.kind === 'question-set' && artifact.toolId === 'quiz') return { type: 'reopen', toolId: 'quiz' }
  }
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

type PendingArtifactState = {
  pending: { toolId: string; artifact: ArtifactListItem } | null
  request: (toolId: string, artifact: ArtifactListItem) => void
  /** Returns the artifact waiting for this tool's page, once. */
  take: (toolId: string) => ArtifactListItem | null
}

/**
 * An artifact waiting for its tool's page to mount, such as courseware chosen on the home page. The
 * workbench is rebuilt on every page change, so the request cannot be a prop of the page that asked.
 */
export const usePendingArtifactStore = create<PendingArtifactState>((set, get) => ({
  pending: null,
  request: (toolId, artifact) => set({ pending: { toolId, artifact } }),
  take: (toolId) => {
    const { pending } = get()
    if (!pending || pending.toolId !== toolId) return null
    set({ pending: null })
    return pending.artifact
  }
}))
