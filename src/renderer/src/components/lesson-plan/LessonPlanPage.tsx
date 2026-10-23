import { useEffect, useRef, useState, type ReactElement } from 'react'
import type { ArtifactListItem } from '@shared/artifact'
import { updateIntentField, type IntentBrief } from '@shared/intent-brief'
import { checkLessonTiming, lessonPlanHours } from '@shared/lesson-plan'
import {
  startWorkflowRun,
  type WorkflowMode,
  type WorkflowRunState
} from '@shared/workflow'
import { rendererRuntimeClient } from '../../agent/runtime-client'
import { formatWorkspacePickerError } from '../../lib/format-workspace-picker-error'
import { requestIntentBrief } from '../../lib/intent-context'
import { moduleProjectIdFromDisplayText, persistModuleProjectContext } from '../../lib/module-context'
import { usePendingArtifactStore } from '../../lib/resume-artifact'
import type { ToolPrefill } from '../../lib/tool-request'
import { createWorkflowRunner, type WorkflowRunner } from '../../lib/workflow-runner'
import { useActiveProjectStore } from '../../lib/active-project'
import { useWriteWorkspaceStore } from '../../write/write-workspace-store'
import { AiWorkExamples, AiWorkPage, AiWorkRecentArtifacts } from '../ai-work/AiWorkPage'
import { IntentBriefChips } from '../ai-work/IntentBriefChips'
import { IntentComposer } from '../ai-work/IntentComposer'
import { WorkflowProgress } from '../ai-work/WorkflowProgress'
import {
  changedDocumentBlocks,
  SectionedDocumentWorkspace,
  type OpenSectionedDocument
} from '../ai-work/SectionedDocumentWorkspace'
import { readDocumentMaterials } from '../documents/DocumentStartView'
import { WriteWorkspaceEmptyState } from '../write/WriteWorkspaceEmptyState'
import { extractResearchTaskFileText } from '../zhiyan/ZhiYanModulePages'

type LoadedMaterial = { id: string; name: string; text: string }

/** A lesson plan open in the work state. */
type OpenPlan = OpenSectionedDocument

export const LESSON_PLAN_EXAMPLES = [
  '帮我写生理学第八章呼吸系统的教案，2 学时，临床医学本科生',
  '根据这份讲义写一份 90 分钟的教案，多用病例导入',
  '免疫学第三章抗原的教案，侧重思政与学术前沿'
]

function briefFieldValues(brief: IntentBrief): Record<string, string> {
  return Object.fromEntries(brief.fields.map((field) => [field.key, field.value]))
}

/** Blocks whose text differs from before a change; kept under its lesson-plan name for tests. */
export const changedLessonBlocks = changedDocumentBlocks

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
  // Segments changed by the timing adjustment, marked until the next change.
  const runner = useRef<WorkflowRunner | null>(null)
  const briefRef = useRef<IntentBrief | null>(null)
  const request = useRef({ text: '', materials: [] as LoadedMaterial[] })

  useEffect(() => {
    void loadWriteSettings()
    void rendererRuntimeClient.getSettings()
      .then((settings) => setMode(settings.workflowMode === 'step' ? 'step' : 'auto'))
      .catch(() => undefined)
  }, [loadWriteSettings])

  // A request from the AI assistant fills the input box once per request.
  useEffect(() => {
    if (!prefill) return
    setInput(prefill.text)
    // A next step hands over the result it follows (Task 3.4.1).
    if (prefill.materials?.length) setMaterials(prefill.materials.map((material, index) => ({ id: `prefill-${prefill.id}-${index}`, ...material })))
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
            projectId: useActiveProjectStore.getState().projectId ?? undefined,
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

  const timing = plan ? checkLessonTiming(plan.markdown, lessonPlanHours(plan.markdown)) : null

  if (!workspaceRoot && !plan) return <WriteWorkspaceEmptyState error={error} onPickWorkspace={() => void pickWorkspace()} />

  if (plan && (!run || run.status === 'done')) {
    return (
      <SectionedDocumentWorkspace
        module="syllabus"
        toolTitle="教案"
        document={plan}
        onDocumentChange={setPlan}
        stage={timing?.status === 'mismatch' ? '时长待调整' : '初稿'}
        banner={error ? <p role="alert" className="text-small text-ds-danger">{error}</p> : null}
        artifactKind="lesson-plan"
        newLabel="新教案"
        onNew={backToStart}
        wholeLabel="整份教案"
        partLabel="改这一部分"
        subpartLabel="改这个环节"
        emptyHint="点任一部分或环节的“改这一部分”，或在下方选择范围，说一句想怎么改。每次修改都会保存版本，可以随时撤销。"
        className={className}
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

