import type { ReactElement } from 'react'
import { AlertCircle, CheckCircle2, Clock3, FileText, FolderOpen, PencilLine } from 'lucide-react'
import type { ChatBlock } from '../../agent/types'
import { browserStorage, type BrowserStorageLike } from '../../lib/browser-storage'
import {
  ResearchEvidenceTracePanel,
  collectResearchEvidenceTrace,
  createMaterialEvidenceTrace,
  mergeResearchEvidenceTraces,
  normalizeResearchEvidenceTrace,
  type ResearchEvidenceTraceV1
} from './research-evidence-trace'

export const RESEARCH_TASK_MODULE_IDS = [
  'paper-polish',
  'literature',
  'review-writing',
  'grant-writing',
  'bioinformatics'
] as const

export type ResearchTaskModuleId = typeof RESEARCH_TASK_MODULE_IDS[number]
export type ResearchTaskStatus = 'queued' | 'running' | 'completed' | 'failed' | 'paused'

export type ResearchTaskMaterial = {
  name: string
  path: string
}

export type ResearchTaskCardV1 = {
  id: string
  moduleId: ResearchTaskModuleId
  taskTypeId: string
  taskLabel: string
  objective: string
  groupingMetadata?: string
  materials: ResearchTaskMaterial[]
  status: ResearchTaskStatus
  deliverables: string[]
  saveLocation: string
  threadId?: string
  lastSuccessfulStep?: string
  errorMessage?: string
  evidenceTrace?: ResearchEvidenceTraceV1
  updatedAt: string
}

export type ResearchTaskExecution = {
  taskId: string
  threadId?: string
  status: ResearchTaskStatus
  lastSuccessfulStep?: string
  errorMessage?: string
  evidenceTrace?: ResearchEvidenceTraceV1
}

export type ResearchTaskRegistryV1 = {
  version: 1
  tasks: Record<string, ResearchTaskCardV1>
  recentByModule: Partial<Record<ResearchTaskModuleId, string>>
}

const RESEARCH_TASK_REGISTRY_KEY = 'deepseekgui.researchTasks.v1'
const MAX_RESEARCH_TASKS = 100

function cleanString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function isResearchTaskModuleId(value: string): value is ResearchTaskModuleId {
  return RESEARCH_TASK_MODULE_IDS.includes(value as ResearchTaskModuleId)
}

function isResearchTaskStatus(value: string): value is ResearchTaskStatus {
  return value === 'queued' || value === 'running' || value === 'completed' || value === 'failed' || value === 'paused'
}

export function plannedResearchDeliverables(
  moduleId: ResearchTaskModuleId,
  taskTypeId: string
): string[] {
  if (moduleId === 'bioinformatics') {
    return taskTypeId === 'enrichment'
      ? ['富集结果表', '结果图表', '分析说明']
      : ['分析报告', '结果图表', '可复现文件清单']
  }
  if (moduleId === 'literature') return ['结构化解读', '证据摘要', '引用信息']
  if (moduleId === 'review-writing') return ['综述蓝图或初稿', '证据矩阵', '待核验问题清单']
  if (moduleId === 'grant-writing') return ['申请书内容', '修改建议', '风险与验证清单']
  return ['修订稿', '修改说明', '待核验问题清单']
}

export function createResearchTaskCard(input: {
  id: string
  moduleId: ResearchTaskModuleId
  taskTypeId: string
  taskLabel: string
  objective: string
  groupingMetadata?: string
  materials: ResearchTaskMaterial[]
  saveLocation: string
  now?: string
}): ResearchTaskCardV1 {
  const updatedAt = input.now ?? new Date().toISOString()
  const evidenceTrace = createMaterialEvidenceTrace(input.materials, updatedAt)
  return {
    id: input.id.trim(),
    moduleId: input.moduleId,
    taskTypeId: input.taskTypeId.trim(),
    taskLabel: input.taskLabel.trim(),
    objective: input.objective.trim(),
    ...(input.groupingMetadata?.trim() ? { groupingMetadata: input.groupingMetadata.trim() } : {}),
    materials: input.materials
      .map((material) => ({ name: material.name.trim(), path: material.path.trim() }))
      .filter((material) => material.name && material.path)
      .slice(0, 20),
    status: 'queued',
    deliverables: plannedResearchDeliverables(input.moduleId, input.taskTypeId),
    saveLocation: input.saveLocation.trim() || '尚未选择，将在任务执行时确认',
    ...(evidenceTrace ? { evidenceTrace } : {}),
    updatedAt
  }
}

function normalizeResearchTask(value: unknown): ResearchTaskCardV1 | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const source = value as Record<string, unknown>
  const id = cleanString(source.id)
  const moduleId = cleanString(source.moduleId)
  const taskTypeId = cleanString(source.taskTypeId)
  const taskLabel = cleanString(source.taskLabel)
  const objective = cleanString(source.objective)
  const groupingMetadata = cleanString(source.groupingMetadata)
  const status = cleanString(source.status)
  if (!id || !isResearchTaskModuleId(moduleId) || !taskTypeId || !taskLabel || !isResearchTaskStatus(status)) {
    return null
  }
  const materials = Array.isArray(source.materials)
    ? source.materials.flatMap((material) => {
        if (!material || typeof material !== 'object' || Array.isArray(material)) return []
        const item = material as Record<string, unknown>
        const name = cleanString(item.name)
        const path = cleanString(item.path)
        return name && path ? [{ name, path }] : []
      }).slice(0, 20)
    : []
  const deliverables = Array.isArray(source.deliverables)
    ? source.deliverables.map(cleanString).filter(Boolean).slice(0, 10)
    : plannedResearchDeliverables(moduleId, taskTypeId)
  const threadId = cleanString(source.threadId)
  const lastSuccessfulStep = cleanString(source.lastSuccessfulStep)
  const errorMessage = cleanString(source.errorMessage)
  const updatedAt = cleanString(source.updatedAt)
  const evidenceTrace = normalizeResearchEvidenceTrace(source.evidenceTrace, updatedAt || undefined)
  return {
    id,
    moduleId,
    taskTypeId,
    taskLabel,
    objective,
    ...(groupingMetadata ? { groupingMetadata } : {}),
    materials,
    status,
    deliverables,
    saveLocation: cleanString(source.saveLocation) || '尚未选择，将在任务执行时确认',
    ...(threadId ? { threadId } : {}),
    ...(lastSuccessfulStep ? { lastSuccessfulStep } : {}),
    ...(errorMessage ? { errorMessage } : {}),
    ...(evidenceTrace ? { evidenceTrace } : {}),
    updatedAt
  }
}

export function normalizeResearchTaskRegistry(raw: unknown): ResearchTaskRegistryV1 {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { version: 1, tasks: {}, recentByModule: {} }
  }
  const source = raw as Record<string, unknown>
  const tasks: Record<string, ResearchTaskCardV1> = {}
  if (source.tasks && typeof source.tasks === 'object' && !Array.isArray(source.tasks)) {
    for (const value of Object.values(source.tasks as Record<string, unknown>).slice(-MAX_RESEARCH_TASKS)) {
      const task = normalizeResearchTask(value)
      if (task) tasks[task.id] = task
    }
  }
  const recentByModule: ResearchTaskRegistryV1['recentByModule'] = {}
  if (source.recentByModule && typeof source.recentByModule === 'object' && !Array.isArray(source.recentByModule)) {
    for (const [moduleId, taskIdValue] of Object.entries(source.recentByModule as Record<string, unknown>)) {
      const taskId = cleanString(taskIdValue)
      if (isResearchTaskModuleId(moduleId) && tasks[taskId]?.moduleId === moduleId) {
        recentByModule[moduleId] = taskId
      }
    }
  }
  return { version: 1, tasks, recentByModule }
}

export function upsertResearchTaskCard(
  registry: ResearchTaskRegistryV1,
  task: ResearchTaskCardV1
): ResearchTaskRegistryV1 {
  const ordered = Object.fromEntries([
    ...Object.entries(registry.tasks).filter(([id]) => id !== task.id),
    [task.id, task]
  ].slice(-MAX_RESEARCH_TASKS))
  return normalizeResearchTaskRegistry({
    version: 1,
    tasks: ordered,
    recentByModule: { ...registry.recentByModule, [task.moduleId]: task.id }
  })
}

export function readResearchTaskRegistry(
  storage: BrowserStorageLike | null = browserStorage()
): ResearchTaskRegistryV1 {
  if (!storage) return normalizeResearchTaskRegistry(null)
  try {
    const raw = storage.getItem(RESEARCH_TASK_REGISTRY_KEY)
    return normalizeResearchTaskRegistry(raw ? JSON.parse(raw) : null)
  } catch {
    return normalizeResearchTaskRegistry(null)
  }
}

export function saveResearchTaskRegistry(
  registry: ResearchTaskRegistryV1,
  storage: BrowserStorageLike | null = browserStorage()
): void {
  if (!storage) return
  try {
    storage.setItem(RESEARCH_TASK_REGISTRY_KEY, JSON.stringify(normalizeResearchTaskRegistry(registry)))
  } catch {
    /* Local persistence is best effort; the active task remains available in component state. */
  }
}

export function recentResearchTask(
  moduleId: ResearchTaskModuleId,
  registry = readResearchTaskRegistry()
): ResearchTaskCardV1 | null {
  const taskId = registry.recentByModule[moduleId]
  return taskId ? registry.tasks[taskId] ?? null : null
}

export function persistResearchTaskCard(task: ResearchTaskCardV1): void {
  saveResearchTaskRegistry(upsertResearchTaskCard(readResearchTaskRegistry(), task))
}

export function applyResearchTaskExecution(
  task: ResearchTaskCardV1,
  execution: ResearchTaskExecution
): ResearchTaskCardV1 {
  if (execution.taskId !== task.id) return task
  const evidenceTrace = mergeResearchEvidenceTraces(task.evidenceTrace, execution.evidenceTrace)
  return {
    ...task,
    status: execution.status,
    ...(execution.threadId ? { threadId: execution.threadId } : {}),
    ...(execution.lastSuccessfulStep ? { lastSuccessfulStep: execution.lastSuccessfulStep } : {}),
    errorMessage: execution.errorMessage?.trim() || undefined,
    ...(evidenceTrace ? { evidenceTrace } : {}),
    updatedAt: new Date().toISOString()
  }
}

function successfulStep(blocks: ChatBlock[]): string | undefined {
  for (const block of [...blocks].reverse()) {
    if (block.kind === 'review' && block.status === 'success') return block.title
    if ((block.kind === 'tool' || block.kind === 'compaction') && block.status === 'success') {
      return block.summary
    }
  }
  return undefined
}

function failedStep(blocks: ChatBlock[]): { label: string; index: number } | undefined {
  for (let index = blocks.length - 1; index >= 0; index -= 1) {
    const block = blocks[index]
    if (block.kind === 'review' && block.status === 'error') return { label: block.title, index }
    if ((block.kind === 'tool' || block.kind === 'compaction') && block.status === 'error') {
      return { label: block.summary, index }
    }
  }
  return undefined
}

function lastAssistantIndex(blocks: ChatBlock[]): number {
  for (let index = blocks.length - 1; index >= 0; index -= 1) {
    if (blocks[index].kind === 'assistant') return index
  }
  return -1
}

export function deriveResearchTaskExecution(input: {
  taskId?: string
  threadId?: string
  activeThreadId: string | null
  busy: boolean
  errorMessage?: string
  blocks: ChatBlock[]
}): ResearchTaskExecution | null {
  if (!input.taskId || !input.threadId || input.activeThreadId !== input.threadId) return null
  const evidenceTrace = collectResearchEvidenceTrace(input.blocks)
  const base = {
    taskId: input.taskId,
    threadId: input.threadId,
    ...(evidenceTrace.records.length > 0 ? { evidenceTrace } : {})
  }
  const lastSuccessfulStep = successfulStep(input.blocks)
  if (input.busy) return { ...base, status: 'running', ...(lastSuccessfulStep ? { lastSuccessfulStep } : {}) }
  const failed = failedStep(input.blocks)
  const assistantIndex = lastAssistantIndex(input.blocks)
  if (input.errorMessage || (failed && failed.index > assistantIndex)) {
    return {
      ...base,
      status: 'failed',
      ...(lastSuccessfulStep ? { lastSuccessfulStep } : {}),
      errorMessage: input.errorMessage?.trim() || failed?.label || '任务执行中断'
    }
  }
  if (input.blocks.some((block) => block.kind === 'assistant')) {
    return { ...base, status: 'completed', ...(lastSuccessfulStep ? { lastSuccessfulStep } : {}) }
  }
  if (input.blocks.some((block) => block.kind === 'user')) {
    return { ...base, status: 'paused', ...(lastSuccessfulStep ? { lastSuccessfulStep } : {}) }
  }
  return { ...base, status: 'queued', ...(lastSuccessfulStep ? { lastSuccessfulStep } : {}) }
}

export function buildResearchTaskResumeText(task: ResearchTaskCardV1): string {
  const lines = [task.objective]
  if ((task.status === 'failed' || task.status === 'paused') && task.lastSuccessfulStep) {
    lines.push('', `恢复要求：请检查已有结果，从“${task.lastSuccessfulStep}”之后继续，不要重复已完成步骤。`)
  }
  return lines.join('\n')
}

const STATUS_VIEW: Record<ResearchTaskStatus, { label: string; className: string }> = {
  queued: { label: '等待开始', className: 'bg-slate-100 text-slate-700 dark:bg-slate-500/15 dark:text-slate-200' },
  running: { label: '正在执行', className: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-200' },
  completed: { label: '已完成', className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200' },
  failed: { label: '需要继续', className: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-200' },
  paused: { label: '已暂停', className: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-200' }
}

export function ResearchTaskCardPanel({
  task,
  onContinue
}: {
  task: ResearchTaskCardV1
  onContinue: (task: ResearchTaskCardV1) => void
}): ReactElement {
  const status = STATUS_VIEW[task.status]
  const StatusIcon = task.status === 'completed'
    ? CheckCircle2
    : task.status === 'failed'
      ? AlertCircle
      : Clock3
  return (
    <section className="rounded-xl border border-ds-border bg-ds-card p-4" data-testid="research-task-card">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-ui-meta font-semibold text-ds-muted">最近科研任务</p>
          <h3 className="mt-1 truncate text-ui-body font-bold text-ds-text">{task.taskLabel}</h3>
        </div>
        <span className={`inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-ui-caption font-semibold ${status.className}`}>
          <StatusIcon className={`h-3.5 w-3.5 ${task.status === 'running' ? 'animate-pulse' : ''}`} strokeWidth={1.8} />
          任务状态：{status.label}
        </span>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="rounded-lg bg-ds-main px-3 py-2.5">
          <p className="text-ui-caption font-semibold text-ds-muted">分析目标</p>
          <p className="mt-1 whitespace-pre-wrap text-ui-body-sm text-ds-text">{task.objective || '根据所选材料完成当前任务'}</p>
        </div>
        <div className="rounded-lg bg-ds-main px-3 py-2.5">
          <p className="text-ui-caption font-semibold text-ds-muted">关联材料</p>
          <p className="mt-1 text-ui-body-sm text-ds-text">{task.materials.length > 0 ? task.materials.map((item) => item.name).join('、') : '未关联本地材料'}</p>
        </div>
        <div className="rounded-lg bg-ds-main px-3 py-2.5">
          <p className="flex items-center gap-1.5 text-ui-caption font-semibold text-ds-muted"><FileText className="h-3.5 w-3.5" />交付物</p>
          <p className="mt-1 text-ui-body-sm text-ds-text">{task.deliverables.join('、')}</p>
        </div>
        <div className="rounded-lg bg-ds-main px-3 py-2.5">
          <p className="flex items-center gap-1.5 text-ui-caption font-semibold text-ds-muted"><FolderOpen className="h-3.5 w-3.5" />保存位置</p>
          <p className="mt-1 break-all text-ui-body-sm text-ds-text">{task.saveLocation}</p>
        </div>
      </div>

      {task.evidenceTrace?.records.length ? (
        <ResearchEvidenceTracePanel trace={task.evidenceTrace} />
      ) : null}

      {task.lastSuccessfulStep ? (
        <p className="mt-3 rounded-lg border border-ds-border-muted px-3 py-2 text-ui-caption text-ds-muted">
          最近完成动作：<span className="font-semibold text-ds-text">{task.lastSuccessfulStep}</span>
        </p>
      ) : null}
      {task.errorMessage ? <p className="mt-2 text-ui-caption text-red-600 dark:text-red-300">{task.errorMessage}</p> : null}

      <div className="mt-3 flex justify-end">
        <button type="button" onClick={() => onContinue(task)} className="inline-flex items-center justify-center gap-2 rounded-lg border border-accent/30 bg-accent/10 px-3 py-2 text-ui-body-sm font-semibold text-accent transition hover:bg-accent/15">
          <PencilLine className="h-3.5 w-3.5" strokeWidth={1.8} />
          {task.status === 'failed' || task.status === 'paused' ? '从上次进度继续' : '继续修改'}
        </button>
      </div>
    </section>
  )
}
