import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BrowserStorageLike } from '../../lib/browser-storage'
import { processQueue, resetTaskQueueForTests, useTaskQueueStore, type TaskExecutor } from '../../lib/task-queue'
import { splitWorkRequest } from '../../lib/work-request'
import { TaskCenterDrawer, taskBatches } from './TaskCenterDrawer'

function memoryStorage(): BrowserStorageLike {
  const items = new Map<string, string>()
  return { getItem: (key) => items.get(key) ?? null, setItem: (key, value) => void items.set(key, value) }
}

const notify = vi.fn(async () => ({ ok: true as const, shown: true }))
vi.stubGlobal('window', { dsGui: { showTurnCompleteNotification: notify } })

afterEach(() => {
  notify.mockClear()
  resetTaskQueueForTests()
})

const context = { projectId: 'course-1', workspaceRoot: '/write' }

describe('一句话做整套 (Task 3.5.1)', () => {
  it('splits a sentence naming several deliverables into one task each', () => {
    const works = splitWorkRequest('第八章做教案、课件和 10 道选择题')

    expect(works.map((work) => [work.moduleId, work.label])).toEqual([
      ['syllabus', '教案'],
      ['ppt-gen', '课件'],
      ['quiz', '随堂题']
    ])
    expect(works[2].text).toBe('第八章做教案、课件和 10 道选择题\n（这一项只做：随堂题）')
    expect(splitWorkRequest('帮我写第八章的教案')).toEqual([])
    expect(splitWorkRequest('教案和课件有什么区别？')).toEqual([])
  })
})

describe('task queue (Task 3.5.2)', () => {
  it('runs tasks in order, hands work that needs the teacher back, and notifies when the batch ends', async () => {
    const order: string[] = []
    const run: TaskExecutor = async (task) => {
      order.push(task.label)
      return { status: 'done', artifactId: `a-${task.moduleId}`, artifactTitle: `${task.label}成果` }
    }
    resetTaskQueueForTests({ executors: { syllabus: run, quiz: run } })

    useTaskQueueStore.getState().enqueue(splitWorkRequest('第八章做教案、课件和 10 道选择题'), context)
    await vi.waitFor(() => expect(notify).toHaveBeenCalledTimes(1))

    expect(order).toEqual(['教案', '随堂题'])
    expect(useTaskQueueStore.getState().tasks.map((task) => [task.label, task.status, task.projectId])).toEqual([
      ['教案', 'done', 'course-1'],
      ['课件', 'needs-you', 'course-1'],
      ['随堂题', 'done', 'course-1']
    ])
    expect(notify).toHaveBeenCalledWith({ title: '整套任务结束', body: '完成 2 项，1 项需要你接着做' })
  })

  it('pauses, cancels a queued task, and retries a failed one', async () => {
    let fail = true
    const run: TaskExecutor = async () => (fail ? { status: 'failed', note: '模型请求失败' } : { status: 'done' })
    resetTaskQueueForTests({ executors: { syllabus: run, quiz: run } })
    const queue = useTaskQueueStore.getState()

    queue.pause()
    queue.enqueue(splitWorkRequest('第八章做教案和 10 道选择题'), context)
    expect(useTaskQueueStore.getState().tasks.every((task) => task.status === 'queued')).toBe(true)

    const [plan, quiz] = useTaskQueueStore.getState().tasks
    queue.cancel(quiz.id)
    queue.resume()
    await vi.waitFor(() => expect(useTaskQueueStore.getState().tasks[0].status).toBe('failed'))
    expect(useTaskQueueStore.getState().tasks[1].status).toBe('canceled')

    fail = false
    queue.retry(plan.id)
    await vi.waitFor(() => expect(useTaskQueueStore.getState().tasks[0].status).toBe('done'))
  })

  it('continues after a restart: a task left running runs again', async () => {
    const storage = memoryStorage()
    storage.setItem('zhiyan.taskQueue.v1', JSON.stringify({
      paused: false,
      tasks: [{
        id: 'b-0', batchId: 'b', moduleId: 'syllabus', label: '教案', text: '第八章教案', status: 'running',
        projectId: null, workspaceRoot: '/write', createdAt: '', updatedAt: ''
      }]
    }))
    const run = vi.fn<TaskExecutor>(async () => ({ status: 'done' }))
    resetTaskQueueForTests({ storage, executors: { syllabus: run } })

    expect(useTaskQueueStore.getState().tasks[0].status).toBe('queued')
    await processQueue()
    expect(run).toHaveBeenCalledTimes(1)
    expect(JSON.parse(storage.getItem('zhiyan.taskQueue.v1') ?? '{}').tasks[0].status).toBe('done')
  })

  it('shows each batch with its tasks and the actions they allow', () => {
    resetTaskQueueForTests({ executors: {} })
    // Server rendering reads the store's initial state.
    const initial = useTaskQueueStore.getInitialState()
    const previous = { open: initial.open, paused: initial.paused, tasks: initial.tasks }
    Object.assign(initial, {
      open: true,
      paused: false,
      tasks: [
        { id: 'b-0', batchId: 'b', moduleId: 'syllabus', label: '教案', text: '第八章做教案和课件', status: 'done', artifactId: 'a1', artifactTitle: '第八章 教案', projectId: null, workspaceRoot: '/w', createdAt: '', updatedAt: '' },
        { id: 'b-1', batchId: 'b', moduleId: 'ppt-gen', label: '课件', text: '第八章做教案和课件', status: 'needs-you', note: '请选择教材', projectId: null, workspaceRoot: '/w', createdAt: '', updatedAt: '' }
      ]
    })

    try {
      const html = renderToStaticMarkup(createElement(TaskCenterDrawer, { onOpenResult: vi.fn(), onContinueInTool: vi.fn() }))
      expect(html).toContain('任务中心')
      expect(html).toContain('第八章 教案')
      expect(html).toContain('需要你接着做')
      expect(html).toContain('打开继续')
      expect(taskBatches(initial.tasks)).toHaveLength(1)
    } finally {
      Object.assign(initial, previous)
    }
  })
})
