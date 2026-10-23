import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import { AlertTriangle, Download, FilePenLine, Loader2, Plus, Sparkles } from 'lucide-react'
import type { ArtifactListItem } from '@shared/artifact'
import type { RevisionResult, RevisionScope } from '@shared/artifact-revision'
import { updateIntentField, type IntentBrief } from '@shared/intent-brief'
import {
  adjustLessonTiming,
  checkLessonTiming,
  lessonPlanBlocks,
  lessonPlanHours,
  type LessonPlanBlock
} from '@shared/lesson-plan'
import {
  startWorkflowRun,
  type WorkflowMode,
  type WorkflowRunState
} from '@shared/workflow'
import { rendererRuntimeClient } from '../../agent/runtime-client'
import { formatWorkspacePickerError } from '../../lib/format-workspace-picker-error'
import { requestIntentBrief } from '../../lib/intent-context'
import { moduleProjectIdFromDisplayText, persistModuleProjectContext } from '../../lib/module-context'
import { openDocumentArtifact, usePendingArtifactStore } from '../../lib/resume-artifact'
import type { ToolPrefill } from '../../lib/tool-request'
import { createWorkflowRunner, type WorkflowRunner } from '../../lib/workflow-runner'
import { useChatStore } from '../../store/chat-store'
import { useWriteWorkspaceStore } from '../../write/write-workspace-store'
import { AiSidePanel } from '../ai-work/AiSidePanel'
import { AiWorkExamples, AiWorkPage, AiWorkRecentArtifacts } from '../ai-work/AiWorkPage'
import { ArtifactTopBar } from '../ai-work/ArtifactTopBar'
import { IntentBriefChips } from '../ai-work/IntentBriefChips'
import { IntentComposer } from '../ai-work/IntentComposer'
import { RevisionResultCard } from '../ai-work/RevisionResultCard'
import { WorkflowProgress } from '../ai-work/WorkflowProgress'
import { AssistantMarkdown } from '../chat/AssistantMarkdown'
import { readDocumentMaterials } from '../documents/DocumentStartView'
import { WriteWorkspaceEmptyState } from '../write/WriteWorkspaceEmptyState'
import { extractResearchTaskFileText } from '../zhiyan/ZhiYanModulePages'

type LoadedMaterial = { id: string; name: string; text: string }

/** A lesson plan open in the work state. */
type OpenPlan = { artifactId: string; path: string; workspaceRoot: string; title: string; markdown: string }

type Exchange = {
  id: number
  instruction: string
  scopeLabel: string
  status: 'working' | 'done' | 'error'
  result?: RevisionResult
  error?: string
  settled?: 'kept' | 'undone'
}

export const LESSON_PLAN_EXAMPLES = [
  '帮我写生理学第八章呼吸系统的教案，2 学时，临床医学本科生',
  '根据这份讲义写一份 90 分钟的教案，多用病例导入',
  '免疫学第三章抗原的教案，侧重思政与学术前沿'
]

const WHOLE_PLAN = ''

function briefFieldValues(brief: IntentBrief): Record<string, string> {
  return Object.fromEntries(brief.fields.map((field) => [field.key, field.value]))
}

/** Blocks whose text differs from before a change, so the canvas can mark them. */
export function changedLessonBlocks(before: string, after: string): Set<string> {
  const previous = new Map(lessonPlanBlocks(before).blocks.map((block) => [block.title, block.body]))
  return new Set(lessonPlanBlocks(after).blocks.filter((block) => previous.get(block.title) !== block.body).map((block) => block.title))
}

function LessonBlockCard({
  block,
  changed,
  selected,
  onRevise
}: {
  block: LessonPlanBlock
  changed: boolean
  selected: boolean
  onRevise: () => void
}): ReactElement {
  return (
    <section
      data-lesson-block={block.title}
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
          {block.level === 3 ? '改这个环节' : '改这一部分'}
        </button>
      </header>
      {block.body ? <AssistantMarkdown text={block.body} streaming={false} className="text-body" /> : null}
    </section>
  )
}

/**
 * 教案 as an AI work page (Task 2.2): say in one sentence which lesson, add materials, check the key
 * points; the plan is written automatically and opens section by section, where any part or
 * teaching segment can be changed with one sentence, the timing checked and Word exported.
 */
export function LessonPlanPage({
  prefill,
  handoffFile,
  onHandoffFileConsumed,
  className = ''
}: {
  prefill?: ToolPrefill
  /** A file sent from 文件库, added as material. */
  handoffFile?: { name: string; path: string }
  onHandoffFileConsumed?: () => void
  className?: string
}): ReactElement {
  const workspaceRoot = useWriteWorkspaceStore((state) => state.workspaceRoot)
  const loadWriteSettings = useWriteWorkspaceStore((state) => state.loadWriteSettings)
  const [input, setInput] = useState(prefill?.text ?? '')
  const [materials, setMaterials] = useState<LoadedMaterial[]>([])
  const [brief, setBrief] = useState<IntentBrief | null>(null)
  const [run, setRun] = useState<WorkflowRunState | null>(null)
  const [mode, setMode] = useState<WorkflowMode>('auto')
  const [plan, setPlan] = useState<OpenPlan | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [exchanges, setExchanges] = useState<Exchange[]>([])
  const [scopeId, setScopeId] = useState(WHOLE_PLAN)
  const [panelOpen, setPanelOpen] = useState(true)
  const [panelWidth, setPanelWidth] = useState(360)
  const [panelInput, setPanelInput] = useState('')
  const [changed, setChanged] = useState<Set<string>>(new Set())
  const runner = useRef<WorkflowRunner | null>(null)
  const briefRef = useRef<IntentBrief | null>(null)
  const request = useRef({ text: '', materials: [] as LoadedMaterial[] })
  const nextExchange = useRef(1)

  useEffect(() => {
    void loadWriteSettings()
    void rendererRuntimeClient.getSettings()
      .then((settings) => setMode(settings.workflowMode === 'step' ? 'step' : 'auto'))
      .catch(() => undefined)
  }, [loadWriteSettings])

  // A request from the AI assistant fills the input box once per request.
  useEffect(() => {
    if (prefill) setInput(prefill.text)
  }, [prefill])

  const showBrief = (next: IntentBrief): void => {
    briefRef.current = next
    setBrief(next)
  }

  const openPlan = async (artifact: Pick<ArtifactListItem, 'id' | 'title' | 'workspaceRoot' | 'storage'>): Promise<void> => {
    const read = await window.dsGui.readWorkspaceFile({ path: artifact.storage.path, workspaceRoot: artifact.workspaceRoot })
    if (!read.ok) {
      setError('没能打开这份教案，文件可能已被移走或删除。')
      return
    }
    setPlan({ artifactId: artifact.id, path: artifact.storage.path, workspaceRoot: artifact.workspaceRoot, title: artifact.title, markdown: read.content })
    setExchanges([])
    setChanged(new Set())
    setScopeId(WHOLE_PLAN)
  }

  useEffect(() => {
    if (!handoffFile) return
    void (async () => {
      try {
        const read = await window.dsGui.readFileBinary(handoffFile.path)
        if (!read.ok) throw new Error(read.message)
        const extracted = await extractResearchTaskFileText({ name: handoffFile.name, dataBase64: read.data })
        if (extracted.kind === 'unsupported' || !extracted.text.trim()) throw new Error('unreadable')
        const id = `${handoffFile.path}`
        setMaterials((existing) => existing.some((item) => item.id === id)
          ? existing
          : [...existing, { id, name: handoffFile.name, text: extracted.text }].slice(0, 10))
      } catch {
        setError(`无法读取：${handoffFile.name}。可以添加 PDF、Word、文本或 Markdown 文件。`)
      } finally {
        onHandoffFileConsumed?.()
      }
    })()
    // Keyed by the incoming file.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handoffFile?.path])

  // A lesson plan chosen in 继续上次的工作 on the home page.
  useEffect(() => {
    const artifact = usePendingArtifactStore.getState().take('syllabus')
    if (artifact) void openPlan(artifact)
  }, [])

  const reload = async (current: OpenPlan): Promise<string> => {
    const read = await window.dsGui.readWorkspaceFile({ path: current.path, workspaceRoot: current.workspaceRoot })
    if (!read.ok) throw new Error('没能读取修改后的教案。')
    setPlan({ ...current, markdown: read.content })
    return read.content
  }

  const startRun = async (): Promise<void> => {
    if (!workspaceRoot) return
    const text = input.trim()
    if (!text && materials.length === 0) return
    request.current = { text, materials }
    setError('')
    const root = workspaceRoot
    const flow = createWorkflowRunner({
      initial: startWorkflowRun(`syllabus-${Date.now()}`, 'syllabus', mode, new Date().toISOString()),
      onChange: setRun,
      handlers: {
        read: async () => {
          const outcome = await requestIntentBrief('syllabus', text, materials.map(({ name, text: body }) => ({ name, text: body })))
          if (!outcome.ok) throw new Error(outcome.message)
          showBrief(outcome.brief)
          if (outcome.brief.missing.length > 0) {
            return { checkpoint: { kind: 'missing-required', message: outcome.brief.question ?? '还缺少必要的要点，请在上方补充。' } }
          }
        },
        draft: async () => {
          const current = briefRef.current
          if (!current) throw new Error('还没有读到要点。')
          const fields = briefFieldValues(current)
          const created = await window.dsGui.createLessonPlan({
            workspaceRoot: root,
            fields: {
              courseName: fields.courseName ?? '', topic: fields.topic ?? '', audience: fields.audience ?? '',
              hours: fields.hours ?? '', methods: fields.methods ?? '', focus: fields.focus ?? '', major: fields.major ?? ''
            },
            instruction: request.current.text,
            materials: request.current.materials.map(({ name, text: body }) => ({ name, text: body }))
          })
          if (!created.ok) throw new Error(created.message)
          setPlan({ artifactId: created.artifact.id, path: created.path, workspaceRoot: root, title: created.artifact.title, markdown: created.markdown })
          // Courseware and the next lesson plan start from these course details.
          const projectId = moduleProjectIdFromDisplayText('syllabus', `智能教案生成：${fields.topic || fields.courseName}`, '智能教案生成')
          void persistModuleProjectContext(projectId, {
            syllabus: {
              courseName: fields.courseName ?? '', topic: fields.topic ?? '', hours: fields.hours ?? '',
              students: fields.audience ?? '', major: fields.major ?? '', updatedAt: new Date().toISOString()
            }
          }, { syllabusProjectId: projectId }).catch(() => undefined)
        }
      }
    })
    runner.current = flow
    await flow.run()
  }

  const continueRun = (): void => {
    const flow = runner.current
    if (!flow) return
    if (briefRef.current && briefRef.current.missing.length > 0) {
      setError('请先在要点里补充标为“待补充”的内容。')
      return
    }
    setError('')
    void flow.run()
  }

  const backToStart = (): void => {
    setPlan(null)
    setRun(null)
    setBrief(null)
    briefRef.current = null
    runner.current = null
    setExchanges([])
  }

  const addFiles = async (files: File[]): Promise<void> => {
    const { materials: loaded, rejected } = await readDocumentMaterials(files)
    setMaterials((existing) => [...existing, ...loaded.filter((item) => !existing.some((known) => known.id === item.id))].slice(0, 10))
    setError(rejected.length > 0 ? `无法读取：${rejected.join('、')}。可以添加 PDF、Word、文本或 Markdown 文件。` : '')
  }

  const pickWorkspace = async (): Promise<void> => {
    try {
      const picked = await window.dsGui.pickWorkspaceDirectory()
      if (!picked.canceled && picked.path) await useWriteWorkspaceStore.getState().addWriteWorkspace(picked.path)
    } catch (pickError) {
      setError(formatWorkspacePickerError(pickError))
    }
  }

  const blocks = useMemo(() => (plan ? lessonPlanBlocks(plan.markdown) : { intro: '', blocks: [] }), [plan])
  const timing = plan ? checkLessonTiming(plan.markdown, lessonPlanHours(plan.markdown)) : null
  const scopeBlock = blocks.blocks.find((block) => block.sectionId === scopeId)
  const scope: RevisionScope = scopeBlock ? { type: 'section', sectionId: scopeBlock.sectionId, title: scopeBlock.title } : { type: 'whole' }
  const scopeLabel = scopeBlock ? `“${scopeBlock.title}”` : '整份教案'
  const revising = exchanges.some((exchange) => exchange.status === 'working')

  const updateExchange = (id: number, change: Partial<Exchange>): void => {
    setExchanges((current) => current.map((exchange) => exchange.id === id ? { ...exchange, ...change } : exchange))
  }

  const revise = async (instruction: string): Promise<void> => {
    if (!plan || revising) return
    const id = nextExchange.current++
    setExchanges((current) => [...current, { id, instruction, scopeLabel, status: 'working' }])
    try {
      const artifact = await window.dsGui.getArtifact(plan.artifactId)
      if (!artifact) throw new Error('找不到这份教案的登记记录。')
      const outcome = await window.dsGui.reviseArtifact({ artifactId: plan.artifactId, baseVersion: artifact.currentVersion, scope, instruction })
      if (!outcome.ok) {
        updateExchange(id, { status: 'error', error: outcome.message })
        return
      }
      const before = plan.markdown
      const after = await reload(plan)
      setChanged(changedLessonBlocks(before, after))
      updateExchange(id, { status: 'done', result: outcome.value })
    } catch (reviseError) {
      updateExchange(id, { status: 'error', error: reviseError instanceof Error ? reviseError.message : '修改没有完成，请稍后再试。' })
    }
  }

  const undo = async (exchange: Exchange): Promise<void> => {
    if (!plan || !exchange.result) return
    updateExchange(exchange.id, { status: 'working' })
    try {
      await window.dsGui.restoreArtifactVersion(plan.artifactId, exchange.result.undoVersion)
      await reload(plan)
      setChanged(new Set())
      updateExchange(exchange.id, { status: 'done', settled: 'undone' })
    } catch (undoError) {
      updateExchange(exchange.id, { status: 'done', error: undoError instanceof Error ? undoError.message : '撤销没有完成，请从“版本”里恢复。' })
    }
  }

  const fixTiming = async (): Promise<void> => {
    if (!plan || timing?.status !== 'mismatch') return
    const adjusted = adjustLessonTiming(plan.markdown, timing.planned)
    const written = await window.dsGui.writeWorkspaceFile({ path: plan.path, workspaceRoot: plan.workspaceRoot, content: adjusted })
    if (!written.ok) {
      setError(written.message)
      return
    }
    await window.dsGui.createArtifactVersion({ id: plan.artifactId, source: 'teacher-edit', summary: '按计划学时调整各环节时长' })
    setChanged(changedLessonBlocks(plan.markdown, adjusted))
    setPlan({ ...plan, markdown: adjusted })
  }

  const exportWord = async (): Promise<void> => {
    if (!plan) return
    const result = await window.dsGui.exportWriteDocument({ path: plan.path, workspaceRoot: plan.workspaceRoot, format: 'docx', content: plan.markdown })
    if (result.ok) setNotice(`已导出：${result.path}`)
    else if (!result.canceled) setError(result.message ?? '导出没有完成。')
  }

  const editInDocuments = async (): Promise<void> => {
    if (!plan) return
    await openDocumentArtifact({ workspaceRoot: plan.workspaceRoot, storage: { type: 'file', path: plan.path } })
    await useChatStore.getState().openWrite()
  }

  if (!workspaceRoot && !plan) return <WriteWorkspaceEmptyState error={error} onPickWorkspace={() => void pickWorkspace()} />

  if (plan && (!run || run.status === 'done')) {
    return (
      <AiWorkPage
        module="syllabus"
        title="教案"
        state="work"
        className={className}
        topBar={(
          <ArtifactTopBar
            title={plan.title}
            stage={timing?.status === 'mismatch' ? '时长待调整' : '初稿'}
            artifactId={plan.artifactId}
            onRestored={() => void reload(plan).then(() => setChanged(new Set()))}
            actions={(
              <>
                <button type="button" onClick={backToStart} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-small text-ds-muted hover:bg-ds-hover hover:text-ds-ink">
                  <Plus className="h-4 w-4" strokeWidth={1.8} />
                  新教案
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
          <div className="mx-auto max-w-[880px] space-y-3 px-8 py-6" data-testid="lesson-plan-canvas">
            {error ? <p role="alert" className="text-small text-ds-danger">{error}</p> : null}
            {notice ? <p role="status" className="text-small text-ds-muted">{notice}</p> : null}
            {timing?.status === 'mismatch' ? (
              <div role="alert" className="flex flex-wrap items-center gap-2 rounded-xl border border-ds-warning bg-ds-warning-soft px-4 py-3 text-small text-ds-warning">
                <AlertTriangle className="h-4 w-4 shrink-0" strokeWidth={1.8} />
                <span className="min-w-0 flex-1">各环节合计 {timing.total} 分钟，计划学时为 {timing.planned} 分钟。</span>
                <button type="button" onClick={() => void fixTiming()} className="shrink-0 rounded-lg border border-ds-warning px-2.5 py-1 font-semibold hover:bg-ds-hover">
                  一键调整为 {timing.planned} 分钟
                </button>
              </div>
            ) : null}
            {blocks.intro ? (
              <div className="rounded-xl border border-ds-border-muted bg-ds-card px-5 py-4">
                <AssistantMarkdown text={blocks.intro} streaming={false} className="text-body" />
              </div>
            ) : null}
            {blocks.blocks.length === 0 ? (
              <div className="rounded-xl border border-ds-border-muted bg-ds-card px-5 py-4">
                <AssistantMarkdown text={plan.markdown} streaming={false} className="text-body" />
              </div>
            ) : blocks.blocks.map((block) => (
              <LessonBlockCard
                key={block.sectionId}
                block={block}
                changed={changed.has(block.title)}
                selected={block.sectionId === scopeId}
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
            composer={(
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-caption text-ds-muted">
                  <span className="shrink-0">修改范围</span>
                  <select
                    value={scopeId}
                    onChange={(event) => setScopeId(event.target.value)}
                    className="min-w-0 flex-1 rounded-md border border-ds-border bg-ds-card px-2 py-1 text-caption text-ds-text"
                  >
                    <option value={WHOLE_PLAN}>整份教案</option>
                    {blocks.blocks.map((block) => (
                      <option key={block.sectionId} value={block.sectionId}>{`${block.level === 3 ? '　' : ''}${block.title}`}</option>
                    ))}
                  </select>
                </label>
                <IntentComposer
                  variant="panel"
                  value={panelInput}
                  onChange={setPanelInput}
                  onSubmit={() => {
                    const instruction = panelInput.trim()
                    if (!instruction) return
                    setPanelInput('')
                    void revise(instruction)
                  }}
                  placeholder={`说一句想怎么改${scopeLabel}`}
                  busy={revising}
                />
              </div>
            )}
          >
            {exchanges.length === 0 ? (
              <p className="text-small leading-6 text-ds-muted">
                点任一部分或环节的“改这一部分”，或在下方选择范围，说一句想怎么改。每次修改都会保存版本，可以随时撤销。
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

  return (
    <AiWorkPage
      module="syllabus"
      title="教案"
      description="说一句要写哪一课，可以附上教材章节或讲义；AI 读出要点后自动写好教案，之后可以逐个环节修改。"
      state="start"
      className={className}
      start={(
        <>
          {run ? null : (
            <>
              <IntentComposer
                value={input}
                onChange={setInput}
                onSubmit={() => void startRun()}
                placeholder="例如：帮我写生理学第八章呼吸系统的教案，2 学时"
                attachments={materials.map(({ id, name }) => ({ id, name }))}
                onAddFiles={(files) => void addFiles(files)}
                onRemoveAttachment={(id) => setMaterials((existing) => existing.filter((item) => item.id !== id))}
                autoFocus
              />
              <AiWorkExamples examples={LESSON_PLAN_EXAMPLES} onSelect={setInput} />
            </>
          )}
          {error ? <p role="alert" className="mt-3 text-small text-ds-danger">{error}</p> : null}
          {run ? (
            <div className="space-y-4">
              <div className="rounded-xl bg-ds-subtle px-4 py-3 text-small text-ds-text">
                <p className="whitespace-pre-wrap">{request.current.text || '（只提供了材料）'}</p>
                {request.current.materials.length > 0 ? (
                  <p className="mt-1 text-caption text-ds-muted">材料：{request.current.materials.map((item) => item.name).join('、')}</p>
                ) : null}
              </div>
              {brief ? (
                <IntentBriefChips
                  brief={brief}
                  onChange={(key, value) => showBrief(updateIntentField(briefRef.current ?? brief, key, value))}
                />
              ) : null}
              <WorkflowProgress
                state={run}
                onStop={() => runner.current?.stop()}
                onContinue={continueRun}
              />
              {run.status === 'stopped' || run.status === 'failed' ? (
                <button type="button" onClick={backToStart} className="text-small text-ds-muted underline-offset-2 hover:text-ds-ink hover:underline">
                  重新开始
                </button>
              ) : null}
            </div>
          ) : (
            <AiWorkRecentArtifacts toolId="syllabus" onOpen={(artifact) => void openPlan(artifact)} />
          )}
        </>
      )}
    />
  )
}

