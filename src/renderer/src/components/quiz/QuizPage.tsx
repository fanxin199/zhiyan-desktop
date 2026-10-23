import { useEffect, useRef, useState, type ReactElement } from 'react'
import type { ArtifactListItem } from '@shared/artifact'
import { updateIntentField, type IntentBrief } from '@shared/intent-brief'
import { startWorkflowRun, type WorkflowMode, type WorkflowRunState } from '@shared/workflow'
import { rendererRuntimeClient } from '../../agent/runtime-client'
import { useActiveProjectStore } from '../../lib/active-project'
import { formatWorkspacePickerError } from '../../lib/format-workspace-picker-error'
import { requestIntentBrief } from '../../lib/intent-context'
import { usePendingArtifactStore } from '../../lib/resume-artifact'
import type { ToolPrefill } from '../../lib/tool-request'
import { createWorkflowRunner, type WorkflowRunner } from '../../lib/workflow-runner'
import { useWriteWorkspaceStore } from '../../write/write-workspace-store'
import { AiWorkExamples, AiWorkPage, AiWorkRecentArtifacts } from '../ai-work/AiWorkPage'
import { IntentBriefChips } from '../ai-work/IntentBriefChips'
import { IntentComposer } from '../ai-work/IntentComposer'
import { SectionedDocumentWorkspace, type OpenSectionedDocument } from '../ai-work/SectionedDocumentWorkspace'
import { WorkflowProgress } from '../ai-work/WorkflowProgress'
import { readDocumentMaterials } from '../documents/DocumentStartView'
import { WriteWorkspaceEmptyState } from '../write/WriteWorkspaceEmptyState'

type LoadedMaterial = { id: string; name: string; text: string }

export const QUIZ_EXAMPLES = [
  '根据这份教案出 10 道单项选择题和 2 道简答题',
  '生理学第八章呼吸系统，出 5 道较难的选择题',
  '免疫学抗原一章的课后练习，含一道论述题'
]

/** Materials handed over by a next step, kept with stable ids. */
export function prefillMaterials(prefill: ToolPrefill | undefined): LoadedMaterial[] {
  return (prefill?.materials ?? []).map((material, index) => ({ id: `prefill-${prefill?.id ?? 0}-${index}`, ...material }))
}

/**
 * 随堂题 (Task 3.4.2): one sentence and materials, such as the lesson plan just written; the
 * questions follow the assessment-designer skill's rules, open one by one for changes, and export
 * to Word.
 */
export function QuizPage({ prefill, className = '' }: { prefill?: ToolPrefill; className?: string }): ReactElement {
  const workspaceRoot = useWriteWorkspaceStore((state) => state.workspaceRoot)
  const loadWriteSettings = useWriteWorkspaceStore((state) => state.loadWriteSettings)
  const [input, setInput] = useState(prefill?.text ?? '')
  const [materials, setMaterials] = useState<LoadedMaterial[]>(() => prefillMaterials(prefill))
  const [brief, setBrief] = useState<IntentBrief | null>(null)
  const [run, setRun] = useState<WorkflowRunState | null>(null)
  const [mode, setMode] = useState<WorkflowMode>('auto')
  const [quiz, setQuiz] = useState<OpenSectionedDocument | null>(null)
  const [dropped, setDropped] = useState(0)
  const [error, setError] = useState('')
  const runner = useRef<WorkflowRunner | null>(null)
  const briefRef = useRef<IntentBrief | null>(null)
  const request = useRef({ text: '', materials: [] as LoadedMaterial[] })

  useEffect(() => {
    void loadWriteSettings()
    void rendererRuntimeClient.getSettings()
      .then((settings) => setMode(settings.workflowMode === 'step' ? 'step' : 'auto'))
      .catch(() => undefined)
  }, [loadWriteSettings])

  // A request from the assistant or a next step fills the input box once per request.
  useEffect(() => {
    if (!prefill) return
    setInput(prefill.text)
    if (prefill.materials?.length) setMaterials(prefillMaterials(prefill))
  }, [prefill])

  const openQuiz = async (artifact: Pick<ArtifactListItem, 'id' | 'title' | 'workspaceRoot' | 'storage'>): Promise<void> => {
    const read = await window.dsGui.readWorkspaceFile({ path: artifact.storage.path, workspaceRoot: artifact.workspaceRoot })
    if (!read.ok) {
      setError('没能打开这份随堂题，文件可能已被移走或删除。')
      return
    }
    setQuiz({ artifactId: artifact.id, path: artifact.storage.path, workspaceRoot: artifact.workspaceRoot, title: artifact.title, markdown: read.content })
  }

  // A question set chosen in 继续上次的工作 or a project page.
  useEffect(() => {
    const artifact = usePendingArtifactStore.getState().take('quiz')
    if (artifact) void openQuiz(artifact)
  }, [])

  const showBrief = (next: IntentBrief): void => {
    briefRef.current = next
    setBrief(next)
  }

  const startRun = async (): Promise<void> => {
    if (!workspaceRoot) return
    const text = input.trim()
    if (!text && materials.length === 0) return
    request.current = { text, materials }
    setError('')
    const root = workspaceRoot
    const flow = createWorkflowRunner({
      initial: startWorkflowRun(`quiz-${Date.now()}`, 'quiz', mode, new Date().toISOString()),
      onChange: setRun,
      handlers: {
        read: async () => {
          const outcome = await requestIntentBrief('quiz', text, materials.map(({ name, text: body }) => ({ name, text: body })))
          if (!outcome.ok) throw new Error(outcome.message)
          showBrief(outcome.brief)
          if (outcome.brief.missing.length > 0) {
            return { checkpoint: { kind: 'missing-required', message: outcome.brief.question ?? '还缺少必要的要点，请在上方补充。' } }
          }
        },
        draft: async () => {
          const fields = Object.fromEntries((briefRef.current?.fields ?? []).map((field) => [field.key, field.value]))
          const created = await window.dsGui.createQuestionSet({
            workspaceRoot: root,
            fields,
            instruction: request.current.text,
            materials: request.current.materials.map(({ name, text: body }) => ({ name, text: body })),
            projectId: useActiveProjectStore.getState().projectId ?? undefined
          })
          if (!created.ok) throw new Error(created.message)
          setDropped(created.dropped)
          setQuiz({ artifactId: created.artifact.id, path: created.path, workspaceRoot: root, title: created.artifact.title, markdown: created.markdown })
        }
      }
    })
    runner.current = flow
    await flow.run()
  }

  const continueRun = (): void => {
    if (briefRef.current && briefRef.current.missing.length > 0) {
      setError('请先在要点里补充标为“待补充”的内容。')
      return
    }
    setError('')
    void runner.current?.run()
  }

  const backToStart = (): void => {
    setQuiz(null)
    setRun(null)
    setBrief(null)
    briefRef.current = null
    runner.current = null
    setDropped(0)
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

  if (!workspaceRoot && !quiz) return <WriteWorkspaceEmptyState error={error} onPickWorkspace={() => void pickWorkspace()} />

  if (quiz && (!run || run.status === 'done')) {
    return (
      <SectionedDocumentWorkspace
        module="quiz"
        toolTitle="随堂题"
        document={quiz}
        onDocumentChange={setQuiz}
        stage="随堂题"
        banner={dropped > 0 ? (
          <p role="status" className="rounded-xl border border-ds-warning bg-ds-warning-soft px-4 py-3 text-small text-ds-warning">
            有 {dropped} 道题的评分标准分值不对（简答题应合计 5 分、论述题 10 分），已去掉；需要的话可以说“再补 {dropped} 道”。
          </p>
        ) : null}
        newLabel="新随堂题"
        onNew={backToStart}
        wholeLabel="整套题"
        partLabel="改这一类题"
        subpartLabel="改这道题"
        emptyHint="点任一题的“改这道题”，或在下方选择范围，说一句想怎么改，例如“干扰项再迷惑一些”。每次修改都会保存版本，可以随时撤销。"
        className={className}
      />
    )
  }

  return (
    <AiWorkPage
      module="quiz"
      title="随堂题"
      description="说一句出什么题，可以附上教案、讲义或教材章节；题目含答案、解析和评分标准，可以逐题修改并导出 Word。"
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
                placeholder="例如：根据这份教案出 10 道单项选择题和 2 道简答题"
                attachments={materials.map(({ id, name }) => ({ id, name }))}
                onAddFiles={(files) => void addFiles(files)}
                onRemoveAttachment={(id) => setMaterials((existing) => existing.filter((item) => item.id !== id))}
                autoFocus
              />
              <AiWorkExamples examples={QUIZ_EXAMPLES} onSelect={setInput} />
            </>
          )}
          {error ? <p role="alert" className="mt-3 text-small text-ds-danger">{error}</p> : null}
          {run ? (
            <div className="space-y-4">
              {brief ? <IntentBriefChips brief={brief} onChange={(key, value) => showBrief(updateIntentField(briefRef.current ?? brief, key, value))} /> : null}
              <WorkflowProgress state={run} onStop={() => runner.current?.stop()} onContinue={continueRun} />
              {run.status === 'stopped' || run.status === 'failed' ? (
                <button type="button" onClick={backToStart} className="text-small text-ds-muted underline-offset-2 hover:text-ds-ink hover:underline">重新开始</button>
              ) : null}
            </div>
          ) : (
            <AiWorkRecentArtifacts toolId="quiz" onOpen={(artifact) => void openQuiz(artifact)} />
          )}
        </>
      )}
    />
  )
}
