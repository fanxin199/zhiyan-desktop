import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import {
  completeWorkflowStage,
  formatRemainingTime,
  remainingWorkflowSeconds,
  startWorkflowRun,
  WORKFLOW_STAGES,
  type WorkflowRunState
} from '@shared/workflow'
import type { BrowserStorageLike } from '../../lib/browser-storage'
import { createWorkflowRunner, loadWorkflowRun } from '../../lib/workflow-runner'
import { WorkflowProgress } from './WorkflowProgress'

const T = '2026-10-23T08:00:00.000Z'

function memoryStorage(): BrowserStorageLike {
  const items = new Map<string, string>()
  return { getItem: (key) => items.get(key) ?? null, setItem: (key, value) => void items.set(key, value) }
}

describe('workflow stages and checkpoints', () => {
  it('runs straight through in 自动完成 and pauses after every stage in 逐步确认', () => {
    const auto = completeWorkflowStage(startWorkflowRun('a', 'syllabus', 'auto', T), 'read', {}, T)
    const step = completeWorkflowStage(startWorkflowRun('s', 'syllabus', 'step', T), 'read', {}, T)

    expect(auto).toMatchObject({ status: 'running', completed: ['read'] })
    expect(step).toMatchObject({ status: 'waiting', completed: ['read'] })
    expect(step.checkpoint).toBeUndefined()
  })

  it('always stops for the teacher to confirm sample grouping, even in 自动完成', () => {
    let state = startWorkflowRun('g', 'bioinformatics', 'auto', T)
    state = completeWorkflowStage(state, 'read', {}, T)
    state = completeWorkflowStage(state, 'grouping', {}, T)

    expect(state).toMatchObject({ status: 'waiting', checkpoint: { kind: 'confirm-grouping' } })
  })

  it('checks an outline only in 逐步确认 or when the content is long', () => {
    const outline = { kind: 'outline' as const, message: '请看一下大纲' }
    const base = completeWorkflowStage(startWorkflowRun('t', 'textbook', 'auto', T), 'rules', {}, T)

    expect(completeWorkflowStage(base, 'outline', { checkpoint: outline }, T).status).toBe('running')
    expect(completeWorkflowStage(base, 'outline', { checkpoint: outline, longContent: true }, T).status).toBe('waiting')
    // Other checkpoints, such as an uncertain image, always stop the flow.
    const image = { kind: 'uncertain-image' as const, message: '有 2 张图片需要你看一眼' }
    const slides = completeWorkflowStage(startWorkflowRun('p', 'ppt-gen', 'auto', T), 'read', {}, T)
    expect(completeWorkflowStage(slides, 'images', { checkpoint: image }, T)).toMatchObject({ status: 'waiting', checkpoint: image })
  })

  it('is done after the last stage and estimates the time left from unfinished stages', () => {
    const state: WorkflowRunState = { ...startWorkflowRun('w', 'write', 'auto', T), completed: ['read', 'draft'] }

    expect(remainingWorkflowSeconds(state)).toBe(20)
    expect(completeWorkflowStage(state, 'check', {}, T).status).toBe('done')
    expect(formatRemainingTime(20)).toBe('不到 1 分钟')
    expect(formatRemainingTime(185)).toBe('约 3 分钟')
  })
})

describe('createWorkflowRunner', () => {
  it('runs every stage in order and saves progress', async () => {
    const storage = memoryStorage()
    const order: string[] = []
    const handlers = Object.fromEntries(WORKFLOW_STAGES.syllabus.map((stage) => [stage.id, async () => { order.push(stage.id) }]))
    const runner = createWorkflowRunner({ initial: startWorkflowRun('run-1', 'syllabus', 'auto', T), handlers, storage, now: () => T })

    await expect(runner.run()).resolves.toMatchObject({ status: 'done' })
    expect(order).toEqual(['read', 'draft', 'check', 'ready'])
    expect(loadWorkflowRun('run-1', storage)).toMatchObject({ status: 'done', completed: order })
  })

  it('stops mid-stage and continues from the last finished stage', async () => {
    const storage = memoryStorage()
    let release: () => void = () => undefined
    const draft = vi.fn(() => new Promise<void>((resolve) => { release = resolve }))
    const runner = createWorkflowRunner({ initial: startWorkflowRun('run-2', 'write', 'auto', T), handlers: { draft }, storage, now: () => T })

    const running = runner.run()
    await vi.waitFor(() => expect(draft).toHaveBeenCalledTimes(1))
    runner.stop()
    release()
    await expect(running).resolves.toMatchObject({ status: 'stopped', completed: ['read'] })

    // After a restart the saved run continues where it stopped; the stopped stage runs again.
    const saved = loadWorkflowRun('run-2', storage)
    expect(saved).toMatchObject({ status: 'stopped', completed: ['read'] })
    const resumed = createWorkflowRunner({ initial: saved!, handlers: { draft: async () => undefined }, storage, now: () => T })
    await expect(resumed.run()).resolves.toMatchObject({ status: 'done', completed: ['read', 'draft', 'check'] })
  })

  it('reports a failed stage and treats a run left running at shutdown as stopped', async () => {
    const storage = memoryStorage()
    const runner = createWorkflowRunner({
      initial: startWorkflowRun('run-3', 'write', 'auto', T),
      handlers: { draft: async () => { throw new Error('模型请求失败（500）') } },
      storage,
      now: () => T
    })

    await expect(runner.run()).resolves.toMatchObject({ status: 'failed', error: '模型请求失败（500）', completed: ['read'] })

    storage.setItem('zhiyan.workflowRuns.v1', JSON.stringify({ old: { ...startWorkflowRun('old', 'write', 'auto', T) } }))
    expect(loadWorkflowRun('old', storage)?.status).toBe('stopped')
  })
})

describe('WorkflowProgress', () => {
  it('shows the running stage, the time left and 停止', () => {
    const state: WorkflowRunState = { ...startWorkflowRun('p', 'ppt-gen', 'auto', T), completed: ['read', 'images'] }
    const html = renderToStaticMarkup(createElement(WorkflowProgress, { state, onStop: vi.fn(), onContinue: vi.fn() }))

    expect(html).toContain('正在生成框架……')
    expect(html).toContain('预计还需约 5 分钟')
    expect(html).toContain('停止')
    expect(html).toContain('aria-current="step"')
  })

  it('asks for confirmation at the grouping checkpoint and offers to continue after a stop', () => {
    const waiting: WorkflowRunState = {
      ...startWorkflowRun('g', 'bioinformatics', 'auto', T),
      completed: ['read', 'grouping'],
      status: 'waiting',
      checkpoint: { kind: 'confirm-grouping', message: '请确认样本分组和比较方向，确认后才会开始分析。' }
    }
    const stopped: WorkflowRunState = { ...startWorkflowRun('w', 'write', 'auto', T), completed: ['read'], status: 'stopped' }

    const waitingHtml = renderToStaticMarkup(createElement(WorkflowProgress, { state: waiting, onStop: vi.fn(), onContinue: vi.fn() }))
    expect(waitingHtml).toContain('请确认样本分组和比较方向')
    expect(waitingHtml).toContain('确认并继续')
    expect(waitingHtml).not.toContain('>停止<')
    expect(renderToStaticMarkup(createElement(WorkflowProgress, { state: stopped, onStop: vi.fn(), onContinue: vi.fn() })))
      .toContain('从「写初稿」继续')
  })
})
