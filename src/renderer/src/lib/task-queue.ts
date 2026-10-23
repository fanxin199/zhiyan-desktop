import { create } from 'zustand'
import { browserStorage, type BrowserStorageLike } from './browser-storage'
import { requestIntentBrief } from './intent-context'
import type { ToolModuleId } from './tool-request'
import type { QueuedWork } from './work-request'

export type QueueTaskStatus = 'queued' | 'running' | 'done' | 'failed' | 'canceled' | 'needs-you'

export type QueueTask = {
  id: string
  /** Tasks from the same sentence. */
  batchId: string
  moduleId: ToolModuleId
  label: string
  text: string
  template?: QueuedWork['template']
  status: QueueTaskStatus
  projectId: string | null
  workspaceRoot: string
  artifactId?: string
  artifactTitle?: string
  /** Why the teacher is needed, or what went wrong. */
  note?: string
  /** 取消 asked while it was running; it is marked canceled once it ends. */
  cancelRequested?: boolean
  createdAt: string
  updatedAt: string
}

type Outcome = Pick<QueueTask, 'status' | 'artifactId' | 'artifactTitle' | 'note'>
export type TaskExecutor = (task: QueueTask) => Promise<Outcome>

const QUEUE_KEY = 'zhiyan.taskQueue.v1'
const MAX_TASKS = 60

const TERMINAL: QueueTaskStatus[] = ['done', 'failed', 'canceled', 'needs-you']

function fieldsOf(brief: { fields: Array<{ key: string; value: string }> }): Record<string, string> {
  return Object.fromEntries(brief.fields.map((field) => [field.key, field.value]))
}

/** Tools that run unattended; the others need a file or decisions only the teacher can make. */
export const DEFAULT_EXECUTORS: Partial<Record<ToolModuleId, TaskExecutor>> = {
  syllabus: async (task) => {
    const outcome = await requestIntentBrief('syllabus', task.text, [], task.projectId)
    if (!outcome.ok) return { status: 'failed', note: outcome.message }
    if (outcome.brief.missing.length > 0) return { status: 'needs-you', note: outcome.brief.question ?? '还缺少课程或章节，请打开教案补充。' }
    const fields = fieldsOf(outcome.brief)
    const created = await window.dsGui.createLessonPlan({
      workspaceRoot: task.workspaceRoot,
      fields: {
        courseName: fields.courseName ?? '', topic: fields.topic ?? '', audience: fields.audience ?? '',
        hours: fields.hours ?? '', methods: fields.methods ?? '', focus: fields.focus ?? '', major: fields.major ?? ''
      },
      instruction: task.text,
      projectId: task.projectId ?? undefined
    })
    return created.ok
      ? { status: 'done', artifactId: created.artifact.id, artifactTitle: created.artifact.title }
      : { status: 'failed', note: created.message }
  },
  quiz: async (task) => {
    const outcome = await requestIntentBrief('quiz', task.text, [], task.projectId)
    if (!outcome.ok) return { status: 'failed', note: outcome.message }
    if (outcome.brief.missing.length > 0) return { status: 'needs-you', note: outcome.brief.question ?? '还缺少出题范围，请打开随堂题补充。' }
    const created = await window.dsGui.createQuestionSet({
      workspaceRoot: task.workspaceRoot,
      fields: fieldsOf(outcome.brief),
      instruction: task.text,
      projectId: task.projectId ?? undefined
    })
    return created.ok
      ? { status: 'done', artifactId: created.artifact.id, artifactTitle: created.artifact.title }
      : { status: 'failed', note: created.message }
  },
  write: async (task) => {
    const created = await window.dsGui.createDocument({
      workspaceRoot: task.workspaceRoot,
      template: task.template ?? 'blank',
      instruction: task.text,
      materials: [],
      projectId: task.projectId ?? undefined
    })
    return created.ok
      ? { status: 'done', artifactId: created.artifact.id, artifactTitle: created.artifact.title }
      : { status: 'failed', note: created.message }
  }
}

const NEEDS_YOU: Partial<Record<ToolModuleId, string>> = {
  'ppt-gen': '课件要以教材为依据，请打开课件选择教材文件后继续。',
  textbook: '教材章节篇幅较长，请打开教材，确认大纲后逐节写作。',
  literature: '请打开文献，拖入论文 PDF 或给出 PMID / DOI。',
  bioinformatics: '请打开数据分析，添加数据文件并确认分组。'
}

type QueueState = {
  tasks: QueueTask[]
  paused: boolean
  /** The task center drawer. */
  open: boolean
  setOpen: (open: boolean) => void
  enqueue: (works: QueuedWork[], context: { projectId: string | null; workspaceRoot: string }) => void
  pause: () => void
  resume: () => void
  cancel: (id: string) => void
  retry: (id: string) => void
  clearFinished: () => void
}

type Persisted = Pick<QueueState, 'tasks' | 'paused'>

function load(storage: BrowserStorageLike | null): Persisted {
  try {
    const parsed = JSON.parse(storage?.getItem(QUEUE_KEY) ?? '{}') as Partial<Persisted>
    // A task that was running when the app closed runs again.
    const tasks = Array.isArray(parsed.tasks)
      ? parsed.tasks.map((task) => task.status === 'running' ? { ...task, status: 'queued' as const, cancelRequested: undefined } : task)
      : []
    return { tasks, paused: parsed.paused === true }
  } catch {
    return { tasks: [], paused: false }
  }
}

let storage: BrowserStorageLike | null = browserStorage()
let executors: Partial<Record<ToolModuleId, TaskExecutor>> = DEFAULT_EXECUTORS
let running = false

function now(): string {
  return new Date().toISOString()
}

/**
 * 一句话做整套 (Tasks 3.5.1–3.5.2): the queue of deliverables from one sentence. One task runs at a
 * time in the background, whichever page is open; the queue is kept on this computer, so after a
 * restart it continues where it was.
 */
export const useTaskQueueStore = create<QueueState>((set, get) => ({
  ...load(storage),
  open: false,
  setOpen: (open) => set({ open }),
  enqueue: (works, context) => {
    const batchId = `batch-${Date.now().toString(36)}`
    const created = now()
    const tasks: QueueTask[] = works.map((work, index) => ({
      id: `${batchId}-${index}`,
      batchId,
      moduleId: work.moduleId,
      label: work.label,
      text: work.text,
      ...(work.template ? { template: work.template } : {}),
      status: 'queued',
      projectId: context.projectId,
      workspaceRoot: context.workspaceRoot,
      createdAt: created,
      updatedAt: created
    }))
    set((state) => ({ tasks: [...state.tasks, ...tasks].slice(-MAX_TASKS) }))
    void processQueue()
  },
  pause: () => set({ paused: true }),
  resume: () => {
    set({ paused: false })
    void processQueue()
  },
  cancel: (id) => set((state) => ({
    tasks: state.tasks.map((task) => {
      if (task.id !== id) return task
      if (task.status === 'queued') return { ...task, status: 'canceled', updatedAt: now() }
      if (task.status === 'running') return { ...task, cancelRequested: true }
      return task
    })
  })),
  retry: (id) => {
    set((state) => ({
      tasks: state.tasks.map((task) => task.id === id && (task.status === 'failed' || task.status === 'canceled')
        ? { ...task, status: 'queued', note: undefined, updatedAt: now() }
        : task)
    }))
    void processQueue()
  },
  clearFinished: () => set((state) => ({ tasks: state.tasks.filter((task) => !TERMINAL.includes(task.status) || task.status === 'needs-you') }))
}))

useTaskQueueStore.subscribe((state) => {
  try {
    storage?.setItem(QUEUE_KEY, JSON.stringify({ tasks: state.tasks, paused: state.paused }))
  } catch {
    // Without storage the queue still runs; it is only not restored after a restart.
  }
})

function update(id: string, change: Partial<QueueTask>): void {
  useTaskQueueStore.setState((state) => ({
    tasks: state.tasks.map((task) => task.id === id ? { ...task, ...change, updatedAt: now() } : task)
  }))
}

async function notifyIfBatchDone(batchId: string): Promise<void> {
  const batch = useTaskQueueStore.getState().tasks.filter((task) => task.batchId === batchId)
  if (batch.length === 0 || !batch.every((task) => TERMINAL.includes(task.status))) return
  const done = batch.filter((task) => task.status === 'done').length
  const waiting = batch.filter((task) => task.status === 'needs-you').length
  const failed = batch.filter((task) => task.status === 'failed').length
  const parts = [`完成 ${done} 项`, waiting ? `${waiting} 项需要你接着做` : '', failed ? `${failed} 项没有完成` : ''].filter(Boolean)
  try {
    await window.dsGui.showTurnCompleteNotification({ title: '整套任务结束', body: parts.join('，') })
  } catch {
    // The task center still shows the result.
  }
}

/** Runs queued tasks one by one until the queue is empty or paused. */
export async function processQueue(): Promise<void> {
  if (running) return
  running = true
  try {
    for (;;) {
      const state = useTaskQueueStore.getState()
      if (state.paused) return
      const task = state.tasks.find((item) => item.status === 'queued')
      if (!task) return
      const executor = executors[task.moduleId]
      if (!executor) {
        update(task.id, { status: 'needs-you', note: NEEDS_YOU[task.moduleId] ?? '请打开对应工具继续。' })
        await notifyIfBatchDone(task.batchId)
        continue
      }
      if (!task.workspaceRoot) {
        update(task.id, { status: 'failed', note: '请先选择写作空间，再重试。' })
        await notifyIfBatchDone(task.batchId)
        continue
      }
      update(task.id, { status: 'running' })
      let outcome: Outcome
      try {
        outcome = await executor({ ...task, status: 'running' })
      } catch (error) {
        outcome = { status: 'failed', note: error instanceof Error ? error.message : String(error) }
      }
      const latest = useTaskQueueStore.getState().tasks.find((item) => item.id === task.id)
      // Canceled while running: the result, if any, stays in 继续上次的工作.
      update(task.id, latest?.cancelRequested ? { ...outcome, status: 'canceled', cancelRequested: undefined } : outcome)
      await notifyIfBatchDone(task.batchId)
    }
  } finally {
    running = false
  }
}

/** For tests: other storage and executors, and a fresh queue. */
export function resetTaskQueueForTests(options: { storage?: BrowserStorageLike | null; executors?: Partial<Record<ToolModuleId, TaskExecutor>> } = {}): void {
  storage = options.storage ?? null
  executors = options.executors ?? DEFAULT_EXECUTORS
  running = false
  useTaskQueueStore.setState({ ...load(storage), open: false })
}
