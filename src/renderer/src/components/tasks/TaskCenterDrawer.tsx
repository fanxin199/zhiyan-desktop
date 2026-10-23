import type { ReactElement } from 'react'
import { AlertCircle, CheckCircle2, Circle, ListTodo, Loader2, PauseCircle, PlayCircle, UserRound, X, XCircle } from 'lucide-react'
import { useTaskQueueStore, type QueueTask, type QueueTaskStatus } from '../../lib/task-queue'

const STATUS: Record<QueueTaskStatus, { label: string; icon: typeof Circle; className: string }> = {
  queued: { label: '排队中', icon: Circle, className: 'text-ds-faint' },
  running: { label: '进行中', icon: Loader2, className: 'text-accent' },
  done: { label: '已完成', icon: CheckCircle2, className: 'text-ds-success' },
  failed: { label: '没有完成', icon: AlertCircle, className: 'text-ds-danger' },
  canceled: { label: '已取消', icon: XCircle, className: 'text-ds-faint' },
  'needs-you': { label: '需要你接着做', icon: UserRound, className: 'text-ds-warning' }
}

type TaskCenterDrawerProps = {
  /** Opens a finished result where it can be worked on. */
  onOpenResult: (artifactId: string) => void
  /** Opens the tool for a task that needs the teacher, with the request filled in. */
  onContinueInTool: (task: QueueTask) => void
}

/** Tasks grouped by the sentence they came from, latest first. */
export function taskBatches(tasks: QueueTask[]): QueueTask[][] {
  const batches = new Map<string, QueueTask[]>()
  for (const task of tasks) batches.set(task.batchId, [...(batches.get(task.batchId) ?? []), task])
  return [...batches.values()].reverse()
}

function TaskRow({ task, onOpenResult, onContinueInTool }: { task: QueueTask } & TaskCenterDrawerProps): ReactElement {
  const status = STATUS[task.status]
  const Icon = status.icon
  const { cancel, retry } = useTaskQueueStore.getState()
  return (
    <li className="flex items-start gap-2 px-4 py-2.5">
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${status.className} ${task.status === 'running' ? 'animate-spin' : ''}`} strokeWidth={1.8} />
      <div className="min-w-0 flex-1">
        <p className="text-small font-semibold text-ds-text">
          {task.label}
          <span className="ml-2 text-caption font-normal text-ds-muted">{task.cancelRequested ? '正在取消' : status.label}</span>
        </p>
        {task.artifactTitle ? <p className="truncate text-caption text-ds-muted">{task.artifactTitle}</p> : null}
        {task.note ? <p className="text-caption text-ds-muted">{task.note}</p> : null}
        <div className="mt-1 flex gap-2 text-caption">
          {task.status === 'done' && task.artifactId ? (
            <button type="button" onClick={() => onOpenResult(task.artifactId!)} className="font-semibold text-accent hover:underline">打开</button>
          ) : null}
          {task.status === 'needs-you' ? (
            <button type="button" onClick={() => onContinueInTool(task)} className="font-semibold text-accent hover:underline">打开继续</button>
          ) : null}
          {task.status === 'failed' || task.status === 'canceled' ? (
            <button type="button" onClick={() => retry(task.id)} className="font-semibold text-accent hover:underline">重试</button>
          ) : null}
          {(task.status === 'queued' || task.status === 'running') && !task.cancelRequested ? (
            <button type="button" onClick={() => cancel(task.id)} className="text-ds-muted hover:text-ds-ink hover:underline">取消</button>
          ) : null}
        </div>
      </div>
    </li>
  )
}

/**
 * 任务中心 (Task 3.5.2): every deliverable of “一句话做整套”, with progress, pause and resume,
 * cancel, retry and a way into each result.
 */
export function TaskCenterDrawer(props: TaskCenterDrawerProps): ReactElement | null {
  const open = useTaskQueueStore((state) => state.open)
  const tasks = useTaskQueueStore((state) => state.tasks)
  const paused = useTaskQueueStore((state) => state.paused)
  if (!open) return null
  const { setOpen, pause, resume, clearFinished } = useTaskQueueStore.getState()
  const active = tasks.some((task) => task.status === 'queued' || task.status === 'running')

  return (
    <aside
      data-testid="task-center"
      aria-label="任务中心"
      onKeyDown={(event) => { if (event.key === 'Escape') setOpen(false) }}
      className="ds-no-drag absolute inset-y-0 right-0 z-40 flex w-[380px] max-w-full flex-col border-l border-ds-border-muted bg-ds-main shadow-xl"
    >
      <header className="flex h-12 shrink-0 items-center gap-1 border-b border-ds-border-muted px-3">
        <span className="inline-flex flex-1 items-center gap-2 text-heading font-semibold text-ds-text">
          <ListTodo className="h-4 w-4 text-accent" strokeWidth={1.8} />
          任务中心
        </span>
        {active ? (
          <button type="button" onClick={paused ? resume : pause} className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-small text-ds-muted hover:bg-ds-hover hover:text-ds-ink">
            {paused ? <PlayCircle className="h-4 w-4" strokeWidth={1.8} /> : <PauseCircle className="h-4 w-4" strokeWidth={1.8} />}
            {paused ? '继续' : '暂停'}
          </button>
        ) : null}
        <button type="button" onClick={clearFinished} className="rounded-lg px-2 py-1.5 text-small text-ds-muted hover:bg-ds-hover hover:text-ds-ink">清除已结束</button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-lg p-1.5 text-ds-muted hover:bg-ds-hover hover:text-ds-ink" aria-label="关闭任务中心">
          <X className="h-4 w-4" strokeWidth={1.8} />
        </button>
      </header>
      {paused && active ? <p className="border-b border-ds-border-muted px-4 py-2 text-caption text-ds-warning">已暂停：正在进行的一项做完后不再开始新的。</p> : null}
      {tasks.length === 0 ? (
        <p className="px-4 py-6 text-small text-ds-muted">
          还没有任务。在 AI 助手里一句话说几件事，比如“第八章做教案、课件和 10 道选择题”，就会在这里排队完成。
        </p>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {taskBatches(tasks).map((batch) => (
            <section key={batch[0].batchId} className="border-b border-ds-border-muted">
              <p className="truncate px-4 pt-3 text-caption text-ds-faint" title={batch[0].text}>{batch[0].text.split('\n')[0]}</p>
              <ul>
                {batch.map((task) => <TaskRow key={task.id} task={task} {...props} />)}
              </ul>
            </section>
          ))}
        </div>
      )}
    </aside>
  )
}
