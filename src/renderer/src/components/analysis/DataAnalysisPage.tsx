import { useEffect, useRef, useState, type ReactElement } from 'react'
import { FileSpreadsheet, Plus, X } from 'lucide-react'
import type { ArtifactListItem } from '@shared/artifact'
import type { RevisionOutcome } from '@shared/artifact-revision'
import { updateIntentField, type IntentBrief } from '@shared/intent-brief'
import { startWorkflowRun, type WorkflowMode, type WorkflowRunState } from '@shared/workflow'
import { rendererRuntimeClient } from '../../agent/runtime-client'
import { recordArtifact } from '../../lib/artifact-records'
import { activeProjectBlock } from '../../lib/project-context'
import { requestIntentBrief } from '../../lib/intent-context'
import { usePendingArtifactStore } from '../../lib/resume-artifact'
import type { ToolPrefill } from '../../lib/tool-request'
import { createWorkflowRunner, type WorkflowRunner } from '../../lib/workflow-runner'
import { AiWorkExamples, AiWorkPage, AiWorkRecentArtifacts } from '../ai-work/AiWorkPage'
import { IntentBriefChips } from '../ai-work/IntentBriefChips'
import { IntentComposer } from '../ai-work/IntentComposer'
import { SectionedDocumentWorkspace, type OpenSectionedDocument } from '../ai-work/SectionedDocumentWorkspace'
import { WorkflowProgress } from '../ai-work/WorkflowProgress'
import {
  AnalysisEnvironmentPreflight,
  resolveAnalysisEnvironmentPreflight,
  useAnalysisEnvironmentPreflight,
  type AnalysisRequirement
} from '../zhiyan/analysis-environment-preflight'
import {
  ANALYSIS_REPORT_PLACEHOLDER,
  buildAnalysisReportPrompt,
  buildAnalysisReproducibilityPrompt,
  createAnalysisReproducibilityManifest,
  persistAnalysisReproducibilityManifest
} from '../zhiyan/analysis-reproducibility'
import type { ResearchTaskExecution } from '../zhiyan/research-task-card'
import { ResizableTextArea } from '../zhiyan/ResizableTextArea'
import { extractResearchTaskFileText } from '../zhiyan/ZhiYanModulePages'

type DataFile = { name: string; path: string; preview: string }

type StartAgentTask = (
  prompt: string,
  options: { workspaceRoot: string; displayText: string; inlineModule: 'bioinformatics'; researchTaskId: string }
) => void

export const DATA_ANALYSIS_EXAMPLES = [
  '这是 bulk RNA-seq 的 counts 表，做处理组和对照组的差异表达，再做 GO 富集',
  '单细胞 h5ad 文件，按样本分组比较各细胞类型比例',
  '差异分析结果表，画火山图和前 50 个基因的热图'
]

const DATA_EXTENSIONS = ['csv', 'tsv', 'txt', 'xlsx', 'xls', 'h5ad', 'rds', 'mtx', 'gz', 'json']
const PREVIEW_BYTES = 64 * 1024
const PREVIEW_LINES = 8
const ENVIRONMENT_NOT_READY = '需要先准备分析环境，准备好后点“从「运行分析」继续”。'

function dirnameOf(path: string): string {
  const index = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  return index > 0 ? path.slice(0, index) : path
}

function joinPath(root: string, relative: string): string {
  const separator = root.includes('\\') ? '\\' : '/'
  return `${root.replace(/[\\/]+$/u, '')}${separator}${relative.replace(/[\\/]/gu, separator)}`
}

/** The first lines of a text table: enough for the AI to see columns and group labels. */
export function tablePreview(text: string): string {
  return text.split(/\r?\n/u).slice(0, PREVIEW_LINES).map((line) => line.slice(0, 400)).join('\n')
}

/** Data the analysis needs: genomics files need the bioinformatics pack, other tables the base one. */
export function analysisRequirementFor(brief: IntentBrief | null, files: Array<{ name: string }>): AnalysisRequirement {
  const dataType = brief?.fields.find((field) => field.key === 'dataType')?.value ?? ''
  const genomic = /rna|seq|单细胞|转录组|scrna|bulk|基因/iu.test(dataType) || files.some((file) => /\.(h5ad|rds|mtx)(\.gz)?$/iu.test(file.name))
  return genomic ? 'bioinformatics' : 'base'
}

async function readPreview(name: string, path: string): Promise<string> {
  const extension = name.split('.').pop()?.toLowerCase() ?? ''
  if (!['csv', 'tsv', 'txt', 'xlsx', 'xls'].includes(extension)) return '（二进制格式，未读取列名）'
  const read = await window.dsGui.readFileBinary(path)
  if (!read.ok) return `（无法读取：${read.message}）`
  if (extension === 'xlsx' || extension === 'xls') {
    const extracted = await extractResearchTaskFileText({ name, dataBase64: read.data })
    return tablePreview(extracted.text)
  }
  const binary = atob(read.data.slice(0, Math.ceil(PREVIEW_BYTES / 3) * 4))
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
  return tablePreview(new TextDecoder().decode(bytes))
}

/**
 * 数据分析 as an AI work page (Task 2.6): one sentence and data files; the AI reads the columns and
 * proposes the sample grouping, which the teacher must confirm; the analysis then runs through the
 * agent and ends as a 分析报告 with charts, statistics, interpretation and a reproducible record.
 */
export function DataAnalysisPage({
  onStartAgentTask,
  researchTaskExecution,
  inlineConversation,
  prefill,
  handoffFile,
  onHandoffFileConsumed,
  className = ''
}: {
  onStartAgentTask: StartAgentTask
  /** The agent task's state, from the module conversation. */
  researchTaskExecution: ResearchTaskExecution | null
  /** The agent's conversation, shown while it works. */
  inlineConversation?: ReactElement
  prefill?: ToolPrefill
  handoffFile?: { name: string; path: string }
  onHandoffFileConsumed?: () => void
  className?: string
}): ReactElement {
  const [input, setInput] = useState(prefill?.text ?? '')
  const [files, setFiles] = useState<DataFile[]>([])
  const [brief, setBrief] = useState<IntentBrief | null>(null)
  const [grouping, setGrouping] = useState('')
  const [run, setRun] = useState<WorkflowRunState | null>(null)
  const [mode, setMode] = useState<WorkflowMode>('auto')
  const [report, setReport] = useState<OpenSectionedDocument | null>(null)
  const [error, setError] = useState('')
  const runner = useRef<WorkflowRunner | null>(null)
  const briefRef = useRef<IntentBrief | null>(null)
  const groupingRef = useRef(grouping)
  groupingRef.current = grouping
  const waiting = useRef<{ taskId: string; resolve: () => void; reject: (error: Error) => void } | null>(null)
  const requirement = analysisRequirementFor(brief, files)
  // The environment is checked only once the analysis is about to run (Task 2.6.3).
  const environment = useAnalysisEnvironmentPreflight(run?.error === ENVIRONMENT_NOT_READY, requirement)

  useEffect(() => {
    void rendererRuntimeClient.getSettings()
      .then((settings) => setMode(settings.workflowMode === 'step' ? 'step' : 'auto'))
      .catch(() => undefined)
  }, [])

  // A request from the AI assistant fills the input box once per request.
  useEffect(() => {
    if (prefill) setInput(prefill.text)
  }, [prefill])

  // The agent's task finishing lets the waiting stage go on.
  useEffect(() => {
    const pending = waiting.current
    if (!pending || researchTaskExecution?.taskId !== pending.taskId) return
    if (researchTaskExecution.status === 'completed') {
      waiting.current = null
      pending.resolve()
    } else if (researchTaskExecution.status === 'failed') {
      waiting.current = null
      pending.reject(new Error(researchTaskExecution.errorMessage ?? '分析没有完成。'))
    }
  }, [researchTaskExecution])

  const addFile = async (name: string, path: string): Promise<void> => {
    if (files.some((file) => file.path === path)) return
    const preview = await readPreview(name, path).catch(() => '（无法读取）')
    setFiles((current) => [...current, { name, path, preview }].slice(0, 10))
  }

  useEffect(() => {
    if (!handoffFile) return
    void addFile(handoffFile.name, handoffFile.path).finally(() => onHandoffFileConsumed?.())
    // Keyed by the incoming file.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handoffFile?.path])

  const pickFile = async (): Promise<void> => {
    const picked = await window.dsGui.pickFile({ filters: [{ name: '数据文件', extensions: DATA_EXTENSIONS }] })
    if (picked.canceled || !picked.path) return
    await addFile(picked.path.split(/[\\/]/u).pop() ?? picked.path, picked.path)
  }

  const openReport = async (artifact: Pick<ArtifactListItem, 'id' | 'title' | 'workspaceRoot' | 'storage'>): Promise<void> => {
    const read = await window.dsGui.readWorkspaceFile({ path: artifact.storage.path, workspaceRoot: artifact.workspaceRoot })
    if (!read.ok) {
      setError('没能打开这份分析报告，文件可能已被移走或删除。')
      return
    }
    setReport({ artifactId: artifact.id, path: artifact.storage.path, workspaceRoot: artifact.workspaceRoot, title: artifact.title, markdown: read.content })
  }

  // A report chosen in 继续上次的工作 on the home page.
  useEffect(() => {
    const artifact = usePendingArtifactStore.getState().take('bioinformatics')
    if (artifact) void openReport(artifact)
  }, [])

  const waitForAgent = (taskId: string, signal?: AbortSignal): Promise<void> => new Promise((resolve, reject) => {
    waiting.current = { taskId, resolve, reject }
    signal?.addEventListener('abort', () => {
      if (waiting.current?.taskId === taskId) waiting.current = null
      reject(new Error('已停止等待；分析可能仍在对话中进行。'))
    })
  })

  const showBrief = (next: IntentBrief): void => {
    briefRef.current = next
    setBrief(next)
  }

  const startRun = async (): Promise<void> => {
    const text = input.trim()
    if (files.length === 0) {
      setError('请先添加数据文件。')
      return
    }
    setError('')
    const dataFiles = files
    // Results, code and the report are saved in a folder the teacher chooses, the data's folder by default.
    const picked = await window.dsGui.pickWorkspaceDirectory(dirnameOf(dataFiles[0].path))
    if (picked.canceled || !picked.path) {
      setError('请选择保存分析记录和结果的文件夹（默认是数据所在的文件夹）。')
      return
    }
    const workspaceRoot = picked.path
    let artifactId = ''
    let reportPath = ''
    let reportTitle = ''
    const flow = createWorkflowRunner({
      initial: startWorkflowRun(`bioinformatics-${Date.now()}`, 'bioinformatics', mode, new Date().toISOString()),
      onChange: setRun,
      handlers: {
        read: async () => {
          const outcome = await requestIntentBrief(
            'bioinformatics',
            text,
            dataFiles.map((file) => ({ name: file.name, text: `文件：${file.name}\n前几行：\n${file.preview}` }))
          )
          if (!outcome.ok) throw new Error(outcome.message)
          showBrief(outcome.brief)
          const proposal = outcome.brief.fields.find((field) => field.key === 'grouping')
          if (proposal?.value && proposal.source !== 'default') setGrouping(proposal.value)
        },
        // 确认分组 always stops (§6.4); the teacher's confirmed text is read when the analysis starts.
        analyse: async ({ signal }) => {
          const status = await window.dsGui.getPythonRuntimeStatus()
          const currentRequirement = analysisRequirementFor(briefRef.current, dataFiles)
          if (!resolveAnalysisEnvironmentPreflight(status, currentRequirement).ready) throw new Error(ENVIRONMENT_NOT_READY)
          const values = Object.fromEntries((briefRef.current?.fields ?? []).map((field) => [field.key, field.value]))
          const taskId = `research-task:bioinformatics:${Date.now().toString(36)}`
          const manifest = createAnalysisReproducibilityManifest({
            taskId,
            taskTypeId: currentRequirement === 'bioinformatics' ? 'bulk' : 'table',
            taskLabel: values.goal || '数据分析',
            objective: text || values.goal || '数据分析',
            groupingMetadata: groupingRef.current,
            files: dataFiles.map(({ name, path }) => ({ name, path })),
            runtime: status
          })
          await persistAnalysisReproducibilityManifest(workspaceRoot, manifest)
          const projectContext = await activeProjectBlock('bioinformatics')
          reportPath = joinPath(workspaceRoot, manifest.artifacts.report ?? '')
          reportTitle = `${values.goal || '数据分析'} 分析报告`.slice(0, 120)
          const artifact = await recordArtifact({
            kind: 'analysis-report',
            title: reportTitle,
            toolId: 'bioinformatics',
            workspaceRoot,
            storage: { type: 'file', path: reportPath },
            stage: '分析中',
            projectId: projectContext.project?.id ?? null
          })
          if (!artifact) throw new Error('没能登记这次分析，请确认数据所在文件夹可以写入。')
          artifactId = artifact.id
          onStartAgentTask([
            '你正在处理「数据分析」模块中的科研任务。',
            ...(projectContext.block ? [projectContext.block] : []),
            `老师的要求：${text || '（见数据与分组）'}`,
            `数据类型：${values.dataType || '（从文件判断）'}；分析目标：${values.goal || '（按老师的要求）'}`,
            `数据文件：\n${dataFiles.map((file) => `- ${file.path}`).join('\n')}`,
            `老师确认的样本分组与比较方向：${groupingRef.current}`,
            '',
            buildAnalysisReproducibilityPrompt(manifest),
            '',
            buildAnalysisReportPrompt(manifest)
          ].join('\n'), { workspaceRoot, displayText: `数据分析：${values.goal || dataFiles[0].name}`, inlineModule: 'bioinformatics', researchTaskId: taskId })
          await waitForAgent(taskId, signal)
        },
        report: async () => {
          const read = await window.dsGui.readWorkspaceFile({ path: reportPath, workspaceRoot })
          if (!read.ok || read.content.trim() === ANALYSIS_REPORT_PLACEHOLDER.trim()) {
            throw new Error('分析已结束，但没有写出分析报告。可以在下方对话里请 AI 补写报告，再从这一步继续。')
          }
          await window.dsGui.createArtifactVersion({ id: artifactId, source: 'ai-generate', summary: '生成分析报告' })
          setReport({ artifactId, path: reportPath, workspaceRoot, title: reportTitle, markdown: read.content })
        }
      }
    })
    runner.current = flow
    await flow.run()
  }

  const continueRun = (): void => {
    if (run?.checkpoint?.kind === 'confirm-grouping' && !grouping.trim()) {
      setError('请先写明样本分组和比较方向；只画已有结果时写“不重新统计”。')
      return
    }
    setError('')
    void runner.current?.run()
  }

  const backToStart = (): void => {
    setReport(null)
    setRun(null)
    setBrief(null)
    briefRef.current = null
    runner.current = null
  }

  /** Chart-level changes rerun the analysis through the agent and save a new version (Task 2.6.2). */
  const reviseThroughAgent = async (instruction: string, _scope: unknown, scopeLabel: string): Promise<RevisionOutcome> => {
    if (!report) return { ok: false, code: 'INVALID_SCOPE', message: '没有打开的分析报告。' }
    const before = await window.dsGui.createArtifactVersion({ id: report.artifactId, source: 'teacher-edit', summary: '修改前' })
    const taskId = `research-task:bioinformatics:${Date.now().toString(36)}`
    const directory = dirnameOf(report.path)
    onStartAgentTask([
      '你正在处理「数据分析」模块中的科研任务：在已有分析基础上修改。',
      `修改要求（针对${scopeLabel}）：${instruction}`,
      `分析报告：${report.path}；同一目录下有 analysis.py、run.log、manifest.json 和 outputs.json。`,
      '先阅读 analysis.py 和报告，只修改与要求相关的代码、图表和段落，重新运行必要的代码；',
      '覆盖对应图片，更新报告中受影响的部分，在 run.log 追加本次修改，并更新 outputs.json。不要改动原始数据。'
    ].join('\n'), { workspaceRoot: directory, displayText: `修改分析：${instruction.slice(0, 40)}`, inlineModule: 'bioinformatics', researchTaskId: taskId })
    try {
      await waitForAgent(taskId)
    } catch (agentError) {
      return { ok: false, code: 'PROVIDER_ERROR', message: agentError instanceof Error ? agentError.message : '修改没有完成。' }
    }
    const after = await window.dsGui.createArtifactVersion({ id: report.artifactId, source: 'ai-revise', summary: instruction.slice(0, 200), instruction })
    return {
      ok: true,
      value: {
        newVersion: after.version,
        undoVersion: before.version,
        summary: `已按要求重新运行并更新报告：${instruction}`,
        changes: [],
        rebased: false,
        discardedOutsideScope: false
      }
    }
  }

  if (report && (!run || run.status === 'done')) {
    return (
      <SectionedDocumentWorkspace
        module="bioinformatics"
        toolTitle="数据分析"
        document={report}
        onDocumentChange={setReport}
        stage="分析报告"
        newLabel="新分析"
        onNew={backToStart}
        wholeLabel="整份报告"
        partLabel="改这一部分"
        subpartLabel="改这张图"
        emptyHint="说一句想怎么改，例如“火山图阈值改为 1.5 倍”。AI 会重新运行相关代码并更新报告，保存为新版本，可以撤销。"
        reviseWith={reviseThroughAgent}
        banner={inlineConversation ? <details className="rounded-xl border border-ds-border-muted bg-ds-card px-4 py-2"><summary className="cursor-pointer text-small text-ds-muted">分析过程对话</summary>{inlineConversation}</details> : null}
        className={className}
      />
    )
  }

  const waitingForGrouping = run?.status === 'waiting' && run.checkpoint?.kind === 'confirm-grouping'

  return (
    <AiWorkPage
      module="bioinformatics"
      title="数据分析"
      description="说一句要分析什么，添加数据文件；AI 读出列名后提出分组和比较方向，由你确认后运行分析，结果是带图表和可复现记录的分析报告。"
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
                placeholder="例如：做处理组和对照组的差异表达，再做 GO 富集"
                autoFocus
                allowEmpty
              />
              <div className="mt-3 rounded-xl border border-ds-border-muted bg-ds-card p-3">
                {files.length > 0 ? (
                  <ul className="mb-2 space-y-1.5" aria-label="数据文件">
                    {files.map((file) => (
                      <li key={file.path} className="flex items-center gap-2 text-small text-ds-text">
                        <FileSpreadsheet className="h-4 w-4 shrink-0 text-accent" strokeWidth={1.8} />
                        <span className="min-w-0 flex-1 truncate" title={file.path}>{file.name}</span>
                        <button
                          type="button"
                          onClick={() => setFiles((current) => current.filter((item) => item.path !== file.path))}
                          className="rounded p-0.5 text-ds-muted hover:bg-ds-hover hover:text-ds-ink"
                          aria-label={`移除 ${file.name}`}
                        >
                          <X className="h-3.5 w-3.5" strokeWidth={1.8} />
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <button
                  type="button"
                  onClick={() => void pickFile()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-ds-border px-3 py-1.5 text-small font-semibold text-ds-text hover:border-accent"
                >
                  <Plus className="h-4 w-4" strokeWidth={1.8} />
                  添加数据文件
                </button>
                <span className="ml-2 text-caption text-ds-muted">CSV、TSV、Excel、h5ad、RDS 等；原始文件不会被改动</span>
              </div>
              <AiWorkExamples examples={DATA_ANALYSIS_EXAMPLES} onSelect={setInput} />
            </>
          )}
          {error ? <p role="alert" className="mt-3 text-small text-ds-danger">{error}</p> : null}
          {run ? (
            <div className="space-y-4">
              {brief ? (
                <IntentBriefChips brief={brief} onChange={(key, value) => showBrief(updateIntentField(briefRef.current ?? brief, key, value))} />
              ) : null}
              {waitingForGrouping ? (
                <section className="rounded-xl border border-accent bg-ds-card p-4" aria-label="确认分组">
                  <label htmlFor="analysis-grouping" className="text-small font-semibold text-ds-text">样本分组与比较方向（必须确认）</label>
                  <p className="mt-1 text-caption text-ds-muted">
                    AI 根据列名提出了建议，请核对：样本标识列、分组列、比较方向（如“处理组 vs 对照组”）、配对或批次。智研助手不会根据文件名猜测分组。
                  </p>
                  <ResizableTextArea
                    id="analysis-grouping"
                    value={grouping}
                    onChange={(event) => setGrouping(event.target.value)}
                    rows={3}
                    className="mt-2 w-full rounded-lg border border-ds-border bg-ds-card px-3 py-2 text-small text-ds-text outline-none focus:border-accent"
                    placeholder="例如：sample 列为样本标识，group 列为分组；比较 treated vs control"
                  />
                  <details className="mt-2 text-caption text-ds-muted">
                    <summary className="cursor-pointer">查看数据的前几行</summary>
                    {files.map((file) => (
                      <div key={file.path} className="mt-2">
                        <p className="font-semibold text-ds-text">{file.name}</p>
                        <pre className="mt-1 max-h-40 overflow-auto whitespace-pre rounded bg-ds-subtle p-2 font-mono">{file.preview}</pre>
                      </div>
                    ))}
                  </details>
                </section>
              ) : null}
              <WorkflowProgress state={run} onStop={() => runner.current?.stop()} onContinue={continueRun} />
              {run.error === ENVIRONMENT_NOT_READY ? <AnalysisEnvironmentPreflight {...environment} /> : null}
              {run.status === 'stopped' || run.status === 'failed' ? (
                <button type="button" onClick={backToStart} className="text-small text-ds-muted underline-offset-2 hover:text-ds-ink hover:underline">
                  重新开始
                </button>
              ) : null}
              {inlineConversation ? <div className="mt-2">{inlineConversation}</div> : null}
            </div>
          ) : (
            <AiWorkRecentArtifacts toolId="bioinformatics" onOpen={(artifact) => void openReport(artifact)} />
          )}
        </>
      )}
    />
  )
}
