import {
  completeWorkflowStage,
  continueWorkflowRun,
  failWorkflowRun,
  nextWorkflowStage,
  stopWorkflowRun,
  type StageOutcome,
  type WorkflowRunState
} from '@shared/workflow'
import { browserStorage, type BrowserStorageLike } from './browser-storage'

const WORKFLOW_RUNS_KEY = 'zhiyan.workflowRuns.v1'
const MAX_SAVED_RUNS = 50

/** Does one stage's work; it should give up when `signal` aborts. */
export type StageHandler = (context: { signal: AbortSignal; state: WorkflowRunState }) => Promise<StageOutcome | void>

type SavedRuns = Record<string, WorkflowRunState>

function readRuns(storage: BrowserStorageLike | null): SavedRuns {
  try {
    const parsed = JSON.parse(storage?.getItem(WORKFLOW_RUNS_KEY) ?? '{}') as unknown
    return parsed && typeof parsed === 'object' ? parsed as SavedRuns : {}
  } catch {
    return {}
  }
}

/** Keeps a run so it can continue from its last finished stage after a stop or a restart. */
export function saveWorkflowRun(state: WorkflowRunState, storage: BrowserStorageLike | null = browserStorage()): void {
  const runs = { ...readRuns(storage), [state.id]: state }
  const kept = Object.values(runs)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, MAX_SAVED_RUNS)
  try {
    storage?.setItem(WORKFLOW_RUNS_KEY, JSON.stringify(Object.fromEntries(kept.map((run) => [run.id, run]))))
  } catch {
    // Losing the record only means the next run starts from the beginning.
  }
}

/**
 * A saved run, if any. A run that was still running when the app closed counts as stopped, so the
 * teacher can continue it.
 */
export function loadWorkflowRun(id: string, storage: BrowserStorageLike | null = browserStorage()): WorkflowRunState | null {
  const run = readRuns(storage)[id]
  if (!run) return null
  return run.status === 'running' ? { ...run, status: 'stopped' } : run
}

export type WorkflowRunner = {
  /** Runs stages from the first unfinished one until the flow waits, stops, fails or is done. */
  run: () => Promise<WorkflowRunState>
  /** Stops the current stage; finished stages stay finished. */
  stop: () => void
  current: () => WorkflowRunState
}

/**
 * Executes a tool's stages (§6.4). Stages without a handler finish at once, which lets a tool adopt
 * the flow before every stage is its own step.
 */
export function createWorkflowRunner(options: {
  initial: WorkflowRunState
  handlers: Partial<Record<string, StageHandler>>
  onChange?: (state: WorkflowRunState) => void
  storage?: BrowserStorageLike | null
  now?: () => string
}): WorkflowRunner {
  const storage = options.storage === undefined ? browserStorage() : options.storage
  const now = options.now ?? (() => new Date().toISOString())
  let state = options.initial
  let controller: AbortController | null = null

  const publish = (next: WorkflowRunState): void => {
    state = next
    saveWorkflowRun(state, storage)
    options.onChange?.(state)
  }

  return {
    current: () => state,
    stop: () => {
      controller?.abort()
      publish(stopWorkflowRun(state, now()))
    },
    run: async () => {
      if (controller) return state
      publish(continueWorkflowRun(state, now()))
      controller = new AbortController()
      const { signal } = controller
      try {
        while (state.status === 'running') {
          const stage = nextWorkflowStage(state)
          if (!stage) {
            publish({ ...state, status: 'done', updatedAt: now() })
            break
          }
          let outcome: StageOutcome | void
          try {
            outcome = await options.handlers[stage.id]?.({ signal, state })
          } catch (error) {
            if (!signal.aborted) publish(failWorkflowRun(state, error instanceof Error ? error.message : String(error), now()))
            break
          }
          // A stage that finished after 停止 is not counted, so it runs again on continue.
          if (signal.aborted) break
          publish(completeWorkflowStage(state, stage.id, outcome ?? {}, now()))
        }
      } finally {
        controller = null
      }
      return state
    }
  }
}
