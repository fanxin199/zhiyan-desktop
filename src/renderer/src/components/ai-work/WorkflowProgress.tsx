import type { ReactElement } from 'react'
import { AlertCircle, CheckCircle2, Circle, Loader2, PauseCircle } from 'lucide-react'
import {
  WORKFLOW_STAGES,
  formatRemainingTime,
  nextWorkflowStage,
  remainingWorkflowSeconds,
  type WorkflowRunState
} from '@shared/workflow'

type WorkflowProgressProps = {
  state: WorkflowRunState
  onStop: () => void
  /** Continue after a pause, a stop or a failure. */
  onContinue: () => void
}

/**
 * Progress of a tool's automatic flow (Task 2.1.3): the stages, the one running now, the time left
 * and 停止; at a checkpoint, what needs a look and how to go on.
 */
export function WorkflowProgress({ state, onStop, onContinue }: WorkflowProgressProps): ReactElement {
  const stages = WORKFLOW_STAGES[state.toolId]
  const next = nextWorkflowStage(state)
  const running = state.status === 'running'
  const continueLabel = state.checkpoint?.kind === 'confirm-grouping'
    ? '确认并继续'
    : state.status === 'waiting' ? '继续' : `从「${next?.label ?? ''}」继续`

  return (
    <section aria-label="进度" data-testid="workflow-progress" className="rounded-xl border border-ds-border-muted bg-ds-card p-4">
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 text-small font-semibold text-ds-text" role="status">
          {state.status === 'done'
            ? '已完成'
            : running
              ? `正在${next?.label ?? ''}……`
              : state.status === 'waiting'
                ? '需要你看一眼'
                : state.status === 'stopped' ? '已停止' : '没有完成'}
        </p>
        {running ? (
          <>
            <span className="shrink-0 text-caption text-ds-muted">预计还需{formatRemainingTime(remainingWorkflowSeconds(state))}</span>
            <button type="button" onClick={onStop} className="shrink-0 rounded-lg border border-ds-border px-2.5 py-1 text-small text-ds-text hover:bg-ds-hover">
              停止
            </button>
          </>
        ) : null}
      </div>

      <ol className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
        {stages.map((stage) => {
          const done = state.completed.includes(stage.id)
          const current = stage.id === next?.id && state.status !== 'done'
          const Icon = done ? CheckCircle2 : current && running ? Loader2 : current ? PauseCircle : Circle
          return (
            <li
              key={stage.id}
              aria-current={current ? 'step' : undefined}
              className={`inline-flex items-center gap-1 text-caption ${done ? 'text-ds-success' : current ? 'font-semibold text-ds-text' : 'text-ds-faint'}`}
            >
              <Icon className={`h-3.5 w-3.5 ${current && running ? 'animate-spin' : ''}`} strokeWidth={2} />
              {stage.label}
            </li>
          )
        })}
      </ol>

      {state.status === 'waiting' || state.status === 'stopped' || state.status === 'failed' ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-ds-border-muted pt-3">
          {state.checkpoint ? <p className="min-w-0 flex-1 text-small text-ds-text">{state.checkpoint.message}</p> : null}
          {state.status === 'failed' && state.error ? (
            <p role="alert" className="flex min-w-0 flex-1 items-start gap-1 text-small text-ds-danger">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.8} />
              {state.error}
            </p>
          ) : null}
          {!state.checkpoint && state.status !== 'failed' ? <span className="flex-1" /> : null}
          <button type="button" onClick={onContinue} className="shrink-0 rounded-lg bg-accent px-3 py-1.5 text-small font-semibold text-white hover:bg-accent-strong">
            {continueLabel}
          </button>
        </div>
      ) : null}
    </section>
  )
}
