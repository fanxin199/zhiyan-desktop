import type { IntentToolId } from './intent-brief'

/**
 * Automatic flows with checkpoints (docs/AI_NATIVE_REDESIGN_PLAN.md §6.4). Each tool's existing
 * steps are stages. In 自动完成 mode stages run one after another and stop only at checkpoints; in
 * 逐步确认 mode the flow also pauses after every stage. A stopped or interrupted flow continues from
 * the last finished stage.
 */
export const WORKFLOW_MODES = ['auto', 'step'] as const
export type WorkflowMode = typeof WORKFLOW_MODES[number]

export const CHECKPOINT_KINDS = [
  'confirm-grouping',
  'missing-required',
  'unverified-citation',
  'uncertain-image',
  'outline'
] as const
export type CheckpointKind = typeof CHECKPOINT_KINDS[number]

export type WorkflowCheckpoint = { kind: CheckpointKind; message: string }

export type WorkflowStage = {
  id: string
  label: string
  /** Rough duration, for “预计还需”. */
  estimateSeconds: number
  /** A checkpoint that always follows this stage, whatever the mode. */
  checkpoint?: CheckpointKind
}

export const WORKFLOW_STAGES: Record<IntentToolId, readonly WorkflowStage[]> = {
  syllabus: [
    { id: 'read', label: '读取材料', estimateSeconds: 10 },
    { id: 'draft', label: '生成教案', estimateSeconds: 90 },
    { id: 'check', label: '自查', estimateSeconds: 20 },
    { id: 'ready', label: '可导出', estimateSeconds: 1 }
  ],
  'ppt-gen': [
    { id: 'read', label: '读取教材', estimateSeconds: 15 },
    { id: 'images', label: '识别图片', estimateSeconds: 30 },
    { id: 'outline', label: '生成框架', estimateSeconds: 60 },
    { id: 'slides', label: '逐页撰写', estimateSeconds: 180 },
    { id: 'visuals', label: '配图', estimateSeconds: 20 },
    { id: 'check', label: '自查', estimateSeconds: 20 },
    { id: 'ready', label: '可导出', estimateSeconds: 1 }
  ],
  textbook: [
    { id: 'rules', label: '解析出版社要求', estimateSeconds: 20 },
    { id: 'outline', label: '生成大纲', estimateSeconds: 60 },
    { id: 'sections', label: '逐节写作', estimateSeconds: 300 },
    { id: 'check', label: '自查', estimateSeconds: 30 },
    { id: 'ready', label: '可导出', estimateSeconds: 1 }
  ],
  write: [
    { id: 'read', label: '读取材料', estimateSeconds: 10 },
    { id: 'draft', label: '写初稿', estimateSeconds: 90 },
    { id: 'check', label: '自查', estimateSeconds: 20 }
  ],
  literature: [
    { id: 'read', label: '读取文献', estimateSeconds: 20 },
    { id: 'report', label: '逐图解读并写成报告', estimateSeconds: 150 },
    { id: 'citations', label: '核验引用', estimateSeconds: 20 }
  ],
  quiz: [
    { id: 'read', label: '读取材料', estimateSeconds: 10 },
    { id: 'draft', label: '出题', estimateSeconds: 90 },
    { id: 'check', label: '逐题核验', estimateSeconds: 5 }
  ],
  bioinformatics: [
    { id: 'read', label: '读取数据', estimateSeconds: 20 },
    // Sample groups and comparison direction must be confirmed by the teacher (§6.4).
    { id: 'grouping', label: '确认分组', estimateSeconds: 5, checkpoint: 'confirm-grouping' },
    { id: 'analyse', label: '运行分析', estimateSeconds: 300 },
    { id: 'figures', label: '生成图表', estimateSeconds: 60 },
    { id: 'report', label: '写成报告', estimateSeconds: 60 }
  ]
}

export type WorkflowStatus = 'running' | 'waiting' | 'stopped' | 'failed' | 'done'

export type WorkflowRunState = {
  id: string
  toolId: IntentToolId
  mode: WorkflowMode
  /** Stage ids finished so far, in order. */
  completed: string[]
  status: WorkflowStatus
  /** Why the flow is waiting; absent when 逐步确认 simply pauses after a stage. */
  checkpoint?: WorkflowCheckpoint
  error?: string
  updatedAt: string
}

export type StageOutcome = {
  /** Something the teacher should look at before the flow goes on. */
  checkpoint?: WorkflowCheckpoint
  /** Long content (many chapters, a long document): its outline becomes a checkpoint even in 自动完成. */
  longContent?: boolean
}

export function startWorkflowRun(id: string, toolId: IntentToolId, mode: WorkflowMode, now: string): WorkflowRunState {
  return { id, toolId, mode, completed: [], status: 'running', updatedAt: now }
}

/** The next stage to run, or null when every stage is finished. */
export function nextWorkflowStage(state: Pick<WorkflowRunState, 'toolId' | 'completed'>): WorkflowStage | null {
  return WORKFLOW_STAGES[state.toolId].find((stage) => !state.completed.includes(stage.id)) ?? null
}

function checkpointAfter(stage: WorkflowStage, state: WorkflowRunState, outcome: StageOutcome): WorkflowCheckpoint | undefined {
  if (stage.checkpoint === 'confirm-grouping') {
    return outcome.checkpoint?.kind === 'confirm-grouping'
      ? outcome.checkpoint
      : { kind: 'confirm-grouping', message: '请确认样本分组和比较方向，确认后才会开始分析。' }
  }
  const checkpoint = outcome.checkpoint
  // Outlines are checked only when the teacher asked to confirm each step or the content is long.
  if (checkpoint?.kind === 'outline' && state.mode !== 'step' && !outcome.longContent) return undefined
  return checkpoint
}

/** Records a finished stage and decides whether the flow goes on, waits or is done. */
export function completeWorkflowStage(
  state: WorkflowRunState,
  stageId: string,
  outcome: StageOutcome,
  now: string
): WorkflowRunState {
  const stage = WORKFLOW_STAGES[state.toolId].find((item) => item.id === stageId)
  if (!stage) throw new Error(`Unknown stage ${stageId} for ${state.toolId}`)
  const completed = state.completed.includes(stageId) ? state.completed : [...state.completed, stageId]
  const finished = { ...state, completed, updatedAt: now, error: undefined }
  if (!nextWorkflowStage(finished)) return { ...finished, status: 'done', checkpoint: undefined }
  const checkpoint = checkpointAfter(stage, state, outcome)
  if (checkpoint) return { ...finished, status: 'waiting', checkpoint }
  if (state.mode === 'step') return { ...finished, status: 'waiting', checkpoint: undefined }
  return { ...finished, status: 'running', checkpoint: undefined }
}

/** Goes on after a pause, a stop or a failure, from the first unfinished stage. */
export function continueWorkflowRun(state: WorkflowRunState, now: string): WorkflowRunState {
  if (state.status === 'done') return state
  return { ...state, status: 'running', checkpoint: undefined, error: undefined, updatedAt: now }
}

export function stopWorkflowRun(state: WorkflowRunState, now: string): WorkflowRunState {
  return state.status === 'done' ? state : { ...state, status: 'stopped', updatedAt: now }
}

export function failWorkflowRun(state: WorkflowRunState, message: string, now: string): WorkflowRunState {
  return { ...state, status: 'failed', error: message, updatedAt: now }
}

/** Estimated seconds left: the unfinished stages' estimates. */
export function remainingWorkflowSeconds(state: Pick<WorkflowRunState, 'toolId' | 'completed'>): number {
  return WORKFLOW_STAGES[state.toolId]
    .filter((stage) => !state.completed.includes(stage.id))
    .reduce((total, stage) => total + stage.estimateSeconds, 0)
}

/** “约 3 分钟”, “不到 1 分钟”. */
export function formatRemainingTime(seconds: number): string {
  if (seconds < 60) return '不到 1 分钟'
  return `约 ${Math.round(seconds / 60)} 分钟`
}
