import { useMemo, useRef, useState, type ReactElement, type ReactNode } from 'react'
import { Download, FilePenLine, Loader2, Plus, Sparkles } from 'lucide-react'
import type { ArtifactKind } from '@shared/artifact'
import type { RevisionOutcome, RevisionResult, RevisionScope } from '@shared/artifact-revision'
import { markdownBlocks, type MarkdownBlock } from '@shared/document-blocks'
import { fixedText, type SelfCheckSuggestion } from '@shared/self-check'
import { artifactNextSteps, useToolOpenerStore } from '../../lib/next-steps'
import { openDocumentArtifact } from '../../lib/resume-artifact'
import { useSelfCheck } from '../../lib/self-check'
import { useChatStore } from '../../store/chat-store'
import { getZhiYanModule, type ZhiYanSectionModuleId } from '../zhiyan/zhiyan-module-registry'
import { WriteMarkdownPreview } from '../write/WriteMarkdownPreview'
import { AiSidePanel, type AiNextStep } from './AiSidePanel'
import { AiWorkPage } from './AiWorkPage'
import { ArtifactTopBar } from './ArtifactTopBar'
import { IntentComposer } from './IntentComposer'
import { RevisionResultCard } from './RevisionResultCard'
import { useHabitOffer } from './RememberHabitOffer'
import { SelfCheckPanel } from './SelfCheckPanel'

/** A Markdown artifact open in a tool's work state. */
export type OpenSectionedDocument = {
  artifactId: string
  path: string
  workspaceRoot: string
  title: string
  markdown: string
}

type Exchange = {
  id: number
  instruction: string
  scopeLabel: string
  status: 'working' | 'done' | 'error'
  result?: RevisionResult
  error?: string
  settled?: 'kept' | 'undone'
}

const WHOLE_DOCUMENT = ''

/** Blocks whose text differs from before a change, so the canvas can mark them. */
export function changedDocumentBlocks(before: string, after: string): Set<string> {
  const previous = new Map(markdownBlocks(before).blocks.map((block) => [block.title, block.body]))
  return new Set(markdownBlocks(after).blocks.filter((block) => previous.get(block.title) !== block.body).map((block) => block.title))
}

/** Markdown as the 文稿 preview shows it, so pictures next to the document (such as charts) appear. */
function DocumentMarkdown({ text, document }: { text: string; document: OpenSectionedDocument }): ReactElement {
  return <WriteMarkdownPreview content={text} isMarkdown filePath={document.path} workspaceRoot={document.workspaceRoot} />
}

function BlockCard({
  block,
  document,
  changed,
  selected,
  label,
  onRevise
}: {
  block: MarkdownBlock
  document: OpenSectionedDocument
  changed: boolean
  selected: boolean
  label: string
  onRevise: () => void
}): ReactElement {
  return (
    <section
      data-document-block={block.title}
      className={`rounded-xl border px-5 py-4 transition-colors ${block.level === 3 ? 'ml-6' : ''} ${
        changed ? 'border-ds-success bg-ds-success-soft' : selected ? 'border-accent bg-ds-card' : 'border-ds-border-muted bg-ds-card'
      }`}
    >
      <header className="mb-2 flex items-center gap-2">
        <h2 className={`min-w-0 flex-1 font-semibold text-ds-text ${block.level === 2 ? 'text-heading' : 'text-body'}`}>{block.title}</h2>
        <button
          type="button"
          onClick={onRevise}
          className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-caption text-ds-muted hover:bg-ds-hover hover:text-ds-ink"
        >
          <Sparkles className="h-3.5 w-3.5" strokeWidth={1.8} />
          {label}
        </button>
      </header>
      {block.body ? <DocumentMarkdown text={block.body} document={document} /> : null}
    </section>
  )
}

type SectionedDocumentWorkspaceProps = {
  module: ZhiYanSectionModuleId
  /** The tool's name, such as “教案”. */
  toolTitle: string
  document: OpenSectionedDocument
  onDocumentChange: (document: OpenSectionedDocument) => void
  stage: string
  /** Shown above the canvas, such as the lesson timing check. */
  banner?: ReactNode
  /** “新教案”, back to the start state. */
  newLabel: string
  onNew: () => void
  /** Words for the parts: the whole document and the revise buttons of level-2 and level-3 blocks. */
  wholeLabel: string
  partLabel: string
  subpartLabel: string
  emptyHint: string
  nextSteps?: AiNextStep[]
  /** What the result is; its usual next steps are offered when `nextSteps` is not given (Task 3.4.1). */
  artifactKind?: ArtifactKind
  /** Blocks to mark after a change made outside the panel, such as a timing adjustment. */
  changedBlocks?: Set<string>
  /**
   * Makes the change another way than `artifact:revise`, such as rerunning an analysis through the
   * agent; it must save versions so the result can be undone.
   */
  reviseWith?: (instruction: string, scope: RevisionScope, scopeLabel: string) => Promise<RevisionOutcome>
  className?: string
}

/**
 * The work state shared by tools whose result is a sectioned Markdown document (lesson plans,
 * literature reports): one card per part, “说一句就改” on a part or the whole, changes marked and
 * kept or undone, versions, Word export and full editing in 文稿 (Tasks 2.2.2, 2.5).
 */
export function SectionedDocumentWorkspace({
  module,
  toolTitle,
  document,
  onDocumentChange,
  stage,
  banner,
  newLabel,
  onNew,
  wholeLabel,
  partLabel,
  subpartLabel,
  emptyHint,
  nextSteps,
  artifactKind,
  changedBlocks,
  reviseWith,
  className = ''
}: SectionedDocumentWorkspaceProps): ReactElement {
  const [exchanges, setExchanges] = useState<Exchange[]>([])
  const [scopeId, setScopeId] = useState(WHOLE_DOCUMENT)
  const [panelOpen, setPanelOpen] = useState(true)
  const [panelWidth, setPanelWidth] = useState(360)
  const [input, setInput] = useState('')
  const [changed, setChanged] = useState<Set<string>>(new Set())
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const nextExchange = useRef(1)
  const suggestedSteps: AiNextStep[] | undefined = nextSteps ?? (artifactKind
    ? artifactNextSteps({ kind: artifactKind, title: document.title, markdown: document.markdown }).map((step) => ({
        id: step.id,
        label: step.label,
        ...(step.description ? { description: step.description } : {}),
        onSelect: () => useToolOpenerStore.getState().open?.(step.request, step.text, step.materials)
      }))
    : undefined)
  const habit = useHabitOffer(module, getZhiYanModule(module)?.sidebarLabel ?? toolTitle)

  const shownChanges = changedBlocks && changedBlocks.size > 0 ? changedBlocks : changed
  const blocks = useMemo(() => markdownBlocks(document.markdown), [document.markdown])
  const scopeBlock = blocks.blocks.find((block) => block.sectionId === scopeId)
  const scope: RevisionScope = scopeBlock ? { type: 'section', sectionId: scopeBlock.sectionId, title: scopeBlock.title } : { type: 'whole' }
  const scopeLabel = scopeBlock ? `“${scopeBlock.title}”` : wholeLabel
  const revising = exchanges.some((exchange) => exchange.status === 'working')

  const reload = async (): Promise<string> => {
    const read = await window.dsGui.readWorkspaceFile({ path: document.path, workspaceRoot: document.workspaceRoot })
    if (!read.ok) throw new Error('没能读取修改后的内容。')
    onDocumentChange({ ...document, markdown: read.content })
    return read.content
  }

  const updateExchange = (id: number, change: Partial<Exchange>): void => {
    setExchanges((current) => current.map((exchange) => exchange.id === id ? { ...exchange, ...change } : exchange))
  }

  const revise = async (instruction: string, target = { scope, label: scopeLabel }): Promise<void> => {
    if (revising) return
    const id = nextExchange.current++
    setExchanges((current) => [...current, { id, instruction, scopeLabel: target.label, status: 'working' }])
    try {
      let outcome: RevisionOutcome
      if (reviseWith) {
        outcome = await reviseWith(instruction, target.scope, target.label)
      } else {
        const artifact = await window.dsGui.getArtifact(document.artifactId)
        if (!artifact) throw new Error('找不到这份成果的登记记录。')
        outcome = await window.dsGui.reviseArtifact({ artifactId: document.artifactId, baseVersion: artifact.currentVersion, scope: target.scope, instruction })
      }
      if (!outcome.ok) {
        updateExchange(id, { status: 'error', error: outcome.message })
        return
      }
      const before = document.markdown
      const after = await reload()
      setChanged(changedDocumentBlocks(before, after))
      updateExchange(id, { status: 'done', result: outcome.value })
      habit.consider(instruction)
    } catch (reviseError) {
      updateExchange(id, { status: 'error', error: reviseError instanceof Error ? reviseError.message : '修改没有完成，请稍后再试。' })
    }
  }

  const selfCheck = useSelfCheck(artifactKind ?? 'document', document.markdown, document.title)

  /** An accepted self-check suggestion: fixed in place and saved as a version, or asked of the AI. */
  const acceptSuggestion = async (suggestion: SelfCheckSuggestion): Promise<void> => {
    const fix = suggestion.fix
    if (fix?.type === 'revise') {
      const block = blocks.blocks.find((candidate) => candidate.title === fix.sectionTitle)
      await revise(fix.instruction, block
        ? { scope: { type: 'section', sectionId: block.sectionId, title: block.title }, label: `“${block.title}”` }
        : { scope: { type: 'whole' }, label: wholeLabel })
      return
    }
    const next = fixedText(document.markdown, suggestion)
    if (next === null) return
    const written = await window.dsGui.writeWorkspaceFile({ path: document.path, workspaceRoot: document.workspaceRoot, content: next })
    if (!written.ok) throw new Error(written.message)
    await window.dsGui.createArtifactVersion({ id: document.artifactId, source: 'teacher-edit', summary: `采纳自查建议：${suggestion.title}`.slice(0, 500) })
    setChanged(changedDocumentBlocks(document.markdown, next))
    onDocumentChange({ ...document, markdown: next })
  }

  const undo = async (exchange: Exchange): Promise<void> => {
    if (!exchange.result) return
    updateExchange(exchange.id, { status: 'working' })
    try {
      await window.dsGui.restoreArtifactVersion(document.artifactId, exchange.result.undoVersion)
      await reload()
      setChanged(new Set())
      updateExchange(exchange.id, { status: 'done', settled: 'undone' })
    } catch (undoError) {
      updateExchange(exchange.id, { status: 'done', error: undoError instanceof Error ? undoError.message : '撤销没有完成，请从“版本”里恢复。' })
    }
  }

  const exportWord = async (): Promise<void> => {
    const result = await window.dsGui.exportWriteDocument({ path: document.path, workspaceRoot: document.workspaceRoot, format: 'docx', content: document.markdown })
    if (result.ok) setNotice(`已导出：${result.path}`)
    else if (!result.canceled) setError(result.message ?? '导出没有完成。')
  }

  const editInDocuments = async (): Promise<void> => {
    await openDocumentArtifact({ workspaceRoot: document.workspaceRoot, storage: { type: 'file', path: document.path } })
    await useChatStore.getState().openWrite()
  }

  return (
    <AiWorkPage
      module={module}
      title={toolTitle}
      state="work"
      className={className}
      topBar={(
        <ArtifactTopBar
          title={document.title}
          stage={stage}
          artifactId={document.artifactId}
          onRestored={() => void reload().then(() => setChanged(new Set()))}
          actions={(
            <>
              <button type="button" onClick={onNew} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-small text-ds-muted hover:bg-ds-hover hover:text-ds-ink">
                <Plus className="h-4 w-4" strokeWidth={1.8} />
                {newLabel}
              </button>
              <button type="button" onClick={() => void editInDocuments()} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-small text-ds-muted hover:bg-ds-hover hover:text-ds-ink">
                <FilePenLine className="h-4 w-4" strokeWidth={1.8} />
                在文稿中编辑
              </button>
              <button type="button" onClick={() => void exportWord()} className="inline-flex items-center gap-1 rounded-lg bg-accent px-3 py-1.5 text-small font-semibold text-white hover:bg-accent-strong">
                <Download className="h-4 w-4" strokeWidth={1.8} />
                导出 Word
              </button>
            </>
          )}
        />
      )}
      canvas={(
        <div className="mx-auto max-w-[880px] space-y-3 px-8 py-6" data-testid="sectioned-document-canvas">
          {error ? <p role="alert" className="text-small text-ds-danger">{error}</p> : null}
          {notice ? <p role="status" className="text-small text-ds-muted">{notice}</p> : null}
          {banner}
          {blocks.intro ? (
            <div className="rounded-xl border border-ds-border-muted bg-ds-card px-5 py-4">
              <DocumentMarkdown text={blocks.intro} document={document} />
            </div>
          ) : null}
          {blocks.blocks.length === 0 ? (
            <div className="rounded-xl border border-ds-border-muted bg-ds-card px-5 py-4">
              <DocumentMarkdown text={document.markdown} document={document} />
            </div>
          ) : blocks.blocks.map((block) => (
            <BlockCard
              key={block.sectionId}
              block={block}
              document={document}
              changed={shownChanges.has(block.title)}
              selected={block.sectionId === scopeId}
              label={block.level === 3 ? subpartLabel : partLabel}
              onRevise={() => {
                setScopeId(block.sectionId)
                setPanelOpen(true)
              }}
            />
          ))}
        </div>
      )}
      sidePanel={(
        <AiSidePanel
          open={panelOpen}
          onOpenChange={setPanelOpen}
          width={panelWidth}
          onWidthChange={setPanelWidth}
          nextSteps={suggestedSteps}
          checks={<SelfCheckPanel state={selfCheck} onAccept={acceptSuggestion} busy={revising} />}
          composer={(
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-caption text-ds-muted">
                <span className="shrink-0">修改范围</span>
                <select
                  value={scopeId}
                  onChange={(event) => setScopeId(event.target.value)}
                  className="min-w-0 flex-1 rounded-md border border-ds-border bg-ds-card px-2 py-1 text-caption text-ds-text"
                >
                  <option value={WHOLE_DOCUMENT}>{wholeLabel}</option>
                  {blocks.blocks.map((block) => (
                    <option key={block.sectionId} value={block.sectionId}>{`${block.level === 3 ? '　' : ''}${block.title}`}</option>
                  ))}
                </select>
              </label>
              <IntentComposer
                variant="panel"
                value={input}
                onChange={setInput}
                onSubmit={() => {
                  const instruction = input.trim()
                  if (!instruction) return
                  setInput('')
                  void revise(instruction)
                }}
                placeholder={`说一句想怎么改${scopeLabel}`}
                busy={revising}
              />
            </div>
          )}
        >
          {habit.offer ? <div className="mb-3">{habit.offer}</div> : null}
          {exchanges.length === 0 ? (
            <p className="text-small leading-6 text-ds-muted">{emptyHint}</p>
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
                      onKeep={() => {
                        updateExchange(exchange.id, { settled: 'kept' })
                        setChanged(new Set())
                      }}
                      onUndo={() => void undo(exchange)}
                      undone={exchange.settled === 'undone'}
                    />
                  ) : null}
                </li>
              ))}
            </ol>
          )}
        </AiSidePanel>
      )}
    />
  )
}
