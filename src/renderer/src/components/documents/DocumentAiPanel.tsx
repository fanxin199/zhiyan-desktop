import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import { Loader2 } from 'lucide-react'
import {
  splitMarkdownSections,
  type MarkdownSection,
  type RevisionResult,
  type RevisionScope
} from '@shared/artifact-revision'
import { aiChangeRanges } from '../../write/ai-change-highlight'
import type { WriteEditorSelectionState } from '../write/WriteMarkdownEditor'
import { useWriteWorkspaceStore } from '../../write/write-workspace-store'
import { AiSidePanel } from '../ai-work/AiSidePanel'
import { IntentComposer } from '../ai-work/IntentComposer'
import { RevisionResultCard } from '../ai-work/RevisionResultCard'
import { useHabitOffer } from '../ai-work/RememberHabitOffer'
import { artifactNextSteps, useToolOpenerStore } from '../../lib/next-steps'

type Exchange = {
  id: number
  instruction: string
  scopeLabel: string
  status: 'working' | 'done' | 'error'
  result?: RevisionResult
  error?: string
  /** Kept or undone; the card then shrinks to one line. */
  settled?: 'kept' | 'undone'
}

const WHOLE_DOCUMENT = ''

function documentTitle(path: string): string {
  return (path.split(/[\\/]/u).pop() ?? path).replace(/\.(md|markdown|txt)$/iu, '')
}

/** What “说一句就改” applies to: the selection, else the chosen section, else the whole document. */
export function documentRevisionScope(
  selection: WriteEditorSelectionState,
  sections: MarkdownSection[],
  sectionId: string
): { scope: RevisionScope; label: string } {
  const range = selection.ranges.length === 1 ? selection.ranges[0] : null
  if (range && range.to > range.from) {
    return {
      scope: { type: 'selection', from: range.from, to: range.to, text: range.text },
      label: `选中的文字（${range.charCount} 字）`
    }
  }
  const section = sections.find((candidate) => candidate.id === sectionId)
  if (section) return { scope: { type: 'section', sectionId: section.id, title: section.title }, label: `“${section.title}”这一节` }
  return { scope: { type: 'whole' }, label: '全文' }
}

/**
 * The AI column of a document (Tasks 1.4.3–1.4.4): say what to change about the selection, a
 * section or the whole document; the change is saved as a version, highlighted in the editor and
 * can be kept or undone.
 */
export function DocumentAiPanel(): ReactElement {
  const open = useWriteWorkspaceStore((state) => state.assistantOpen)
  const setOpen = useWriteWorkspaceStore((state) => state.setAssistantOpen)
  const workspaceRoot = useWriteWorkspaceStore((state) => state.workspaceRoot)
  const activeFilePath = useWriteWorkspaceStore((state) => state.activeFilePath)
  const fileContent = useWriteWorkspaceStore((state) => state.fileContent)
  const selection = useWriteWorkspaceStore((state) => state.selection)
  const activeArtifact = useWriteWorkspaceStore((state) => state.activeArtifact)
  const revisionRequest = useWriteWorkspaceStore((state) => state.revisionRequest)
  const [width, setWidth] = useState(360)
  const [input, setInput] = useState('')
  const [sectionId, setSectionId] = useState(WHOLE_DOCUMENT)
  const [exchanges, setExchanges] = useState<Exchange[]>([])
  const nextId = useRef(1)
  const habit = useHabitOffer('write', '文稿')
  const sections = useMemo(() => splitMarkdownSections(fileContent).filter((section) => section.level > 1), [fileContent])
  const { scope, label } = documentRevisionScope(selection, sections, sectionId)
  const busy = exchanges.some((exchange) => exchange.status === 'working')

  useEffect(() => {
    setExchanges([])
    setSectionId(WHOLE_DOCUMENT)
  }, [activeFilePath])

  const update = (id: number, change: Partial<Exchange>): void => {
    setExchanges((current) => current.map((exchange) => exchange.id === id ? { ...exchange, ...change } : exchange))
  }

  const revise = async (instruction: string, requestedScope = scope, scopeLabel = label): Promise<void> => {
    const store = useWriteWorkspaceStore.getState()
    const artifact = store.activeArtifact
    if (!artifact || !workspaceRoot || busy) return
    const id = nextId.current++
    setExchanges((current) => [...current, { id, instruction, scopeLabel, status: 'working' }])
    try {
      // The AI works on the file, so unsaved typing goes to disk first and is kept as the version
      // the change starts from; undo returns to it.
      await store.flushSave(workspaceRoot)
      const base = await window.dsGui.createArtifactVersion({ id: artifact.id, source: 'teacher-edit', summary: '手动修改' })
      const outcome = await window.dsGui.reviseArtifact({
        artifactId: artifact.id,
        baseVersion: base.version,
        scope: requestedScope,
        instruction
      })
      if (!outcome.ok) {
        update(id, { status: 'error', error: outcome.message })
        return
      }
      await useWriteWorkspaceStore.getState().syncActiveFileFromDisk(workspaceRoot, { force: true, animate: false })
      const latest = useWriteWorkspaceStore.getState()
      latest.setActiveArtifact({ id: artifact.id, currentVersion: outcome.value.newVersion })
      latest.setAiChangeHighlights(outcome.value.changes.flatMap((change) => aiChangeRanges(latest.fileContent, change)))
      update(id, { status: 'done', result: outcome.value })
      habit.consider(instruction)
    } catch (error) {
      update(id, { status: 'error', error: error instanceof Error ? error.message : '修改没有完成，请稍后再试。' })
    }
  }

  const undo = async (exchange: Exchange): Promise<void> => {
    const artifact = useWriteWorkspaceStore.getState().activeArtifact
    if (!artifact || !exchange.result) return
    update(exchange.id, { status: 'working' })
    try {
      const restored = await window.dsGui.restoreArtifactVersion(artifact.id, exchange.result.undoVersion)
      const store = useWriteWorkspaceStore.getState()
      await store.syncActiveFileFromDisk(workspaceRoot, { force: true, animate: false })
      store.setActiveArtifact({ id: artifact.id, currentVersion: restored.version })
      store.setAiChangeHighlights([])
      update(exchange.id, { status: 'done', settled: 'undone' })
    } catch (error) {
      update(exchange.id, { status: 'done', error: error instanceof Error ? error.message : '撤销没有完成，请从“版本”里恢复。' })
    }
  }

  // The selection toolbar sends its sentence here.
  useEffect(() => {
    if (!revisionRequest) return
    useWriteWorkspaceStore.getState().clearRevisionRequest()
    void revise(revisionRequest.instruction)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per request id.
  }, [revisionRequest?.id])

  const submit = (): void => {
    const instruction = input.trim()
    if (!instruction) return
    setInput('')
    void revise(instruction)
  }

  return (
    <AiSidePanel
      open={open}
      onOpenChange={setOpen}
      width={width}
      onWidthChange={setWidth}
      nextSteps={activeArtifact && activeFilePath
        ? artifactNextSteps({ kind: 'document', title: documentTitle(activeFilePath), markdown: fileContent }).map((step) => ({
            id: step.id,
            label: step.label,
            onSelect: () => useToolOpenerStore.getState().open?.(step.request, step.text, step.materials)
          }))
        : undefined}
      composer={(
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-caption text-ds-muted">
            <span className="shrink-0">修改范围</span>
            {scope.type === 'selection' ? (
              <span className="truncate font-medium text-ds-text">{label}</span>
            ) : (
              <select
                value={sectionId}
                onChange={(event) => setSectionId(event.target.value)}
                className="min-w-0 flex-1 rounded-md border border-ds-border bg-ds-card px-2 py-1 text-caption text-ds-text"
              >
                <option value={WHOLE_DOCUMENT}>全文</option>
                {sections.map((section) => (
                  <option key={section.id} value={section.id}>{`${'　'.repeat(Math.max(0, section.level - 2))}${section.title}`}</option>
                ))}
              </select>
            )}
          </label>
          <IntentComposer
            variant="panel"
            value={input}
            onChange={setInput}
            onSubmit={submit}
            placeholder={`说一句想怎么改${label}`}
            busy={busy || !activeArtifact}
          />
        </div>
      )}
    >
      {habit.offer ? <div className="mb-3">{habit.offer}</div> : null}
      {exchanges.length === 0 ? (
        <p className="text-small leading-6 text-ds-muted">
          选中文稿里的文字，或在下方选一节，说一句想怎么改；不选就是改全文。每次修改都会保存版本，可以随时撤销。
        </p>
      ) : (
        <ol className="space-y-3">
          {exchanges.map((exchange) => (
            <li key={exchange.id} className="space-y-2">
              <div className="ml-6 rounded-xl bg-ds-subtle px-3 py-2 text-small text-ds-text">
                <p className="text-caption text-ds-muted">{exchange.scopeLabel}</p>
                <p className="whitespace-pre-wrap">{exchange.instruction}</p>
              </div>
              {exchange.status === 'working' ? (
                <p role="status" className="flex items-center gap-2 text-small text-ds-muted">
                  <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.8} />
                  正在修改……
                </p>
              ) : null}
              {exchange.status === 'error' ? <p role="alert" className="text-small text-ds-danger">{exchange.error}</p> : null}
              {exchange.status === 'done' && exchange.result && exchange.settled === 'kept' ? (
                <p className="text-small text-ds-muted">已保留：{exchange.result.summary}</p>
              ) : null}
              {exchange.status === 'done' && exchange.result && exchange.settled !== 'kept' ? (
                <RevisionResultCard
                  result={exchange.result}
                  undone={exchange.settled === 'undone'}
                  onKeep={() => {
                    update(exchange.id, { settled: 'kept' })
                    useWriteWorkspaceStore.getState().setAiChangeHighlights([])
                  }}
                  onUndo={() => void undo(exchange)}
                />
              ) : null}
              {exchange.status === 'done' && exchange.error ? <p role="alert" className="text-small text-ds-danger">{exchange.error}</p> : null}
            </li>
          ))}
        </ol>
      )}
    </AiSidePanel>
  )
}
