import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import {
  ResearchTaskCardPanel,
  applyResearchTaskExecution,
  buildResearchTaskResumeText,
  createResearchTaskCard,
  deriveResearchTaskExecution,
  normalizeResearchTaskRegistry,
  upsertResearchTaskCard
} from './research-task-card'

const card = createResearchTaskCard({
  id: 'task-1',
  moduleId: 'bioinformatics',
  taskTypeId: 'single-cell',
  taskLabel: '单细胞数据分析',
  objective: '比较治疗前后 B 细胞亚群变化',
  materials: [{ name: 'bcell.h5ad', path: 'J:/data/bcell.h5ad' }],
  saveLocation: 'J:/data',
  now: '2026-07-14T08:00:00.000Z'
})

describe('research task registry', () => {
  it('keeps a normalized recent task for each research module', () => {
    const registry = upsertResearchTaskCard(normalizeResearchTaskRegistry(null), card)
    expect(registry.recentByModule.bioinformatics).toBe('task-1')
    expect(registry.tasks['task-1']).toMatchObject({
      status: 'queued',
      objective: '比较治疗前后 B 细胞亚群变化',
      deliverables: ['分析报告', '结果图表', '可复现文件清单']
    })
    expect(normalizeResearchTaskRegistry({
      version: 1,
      tasks: { bad: { id: '', moduleId: 'unknown' } },
      recentByModule: { bioinformatics: 'bad' }
    })).toEqual({ version: 1, tasks: {}, recentByModule: {} })
  })

  it('records execution status only for the matching task and preserves the last successful step', () => {
    expect(applyResearchTaskExecution(card, {
      taskId: 'another-task',
      status: 'failed',
      lastSuccessfulStep: '读取表达矩阵'
    })).toBe(card)

    expect(applyResearchTaskExecution(card, {
      taskId: 'task-1',
      threadId: 'thread-1',
      status: 'failed',
      lastSuccessfulStep: '完成质量控制',
      errorMessage: '分析中断'
    })).toMatchObject({
      status: 'failed',
      threadId: 'thread-1',
      lastSuccessfulStep: '完成质量控制',
      errorMessage: '分析中断'
    })
    const recovered = applyResearchTaskExecution({
      ...card,
      status: 'failed',
      errorMessage: '分析中断'
    }, {
      taskId: 'task-1',
      status: 'completed',
      lastSuccessfulStep: '完成结果导出'
    })
    expect(recovered).toMatchObject({ status: 'completed', lastSuccessfulStep: '完成结果导出' })
    expect(recovered.errorMessage).toBeUndefined()
  })

  it('derives running, completed, and failed states from the matching inline task thread', () => {
    expect(deriveResearchTaskExecution({
      taskId: 'task-1', threadId: 'thread-1', activeThreadId: 'thread-2', busy: true, blocks: []
    })).toBeNull()
    expect(deriveResearchTaskExecution({
      taskId: 'task-1', threadId: 'thread-1', activeThreadId: 'thread-1', busy: true, blocks: []
    })).toMatchObject({ status: 'running' })
    expect(deriveResearchTaskExecution({
      taskId: 'task-1', threadId: 'thread-1', activeThreadId: 'thread-1', busy: false,
      blocks: [{ kind: 'user', id: 'user-1', text: '开始分析' }]
    })).toMatchObject({ status: 'paused' })
    expect(deriveResearchTaskExecution({
      taskId: 'task-1', threadId: 'thread-1', activeThreadId: 'thread-1', busy: false,
      blocks: [
        { kind: 'tool', id: 'tool-1', summary: '完成质量控制', status: 'success' },
        { kind: 'tool', id: 'tool-2', summary: '生成聚类图', status: 'error' }
      ]
    })).toMatchObject({ status: 'failed', lastSuccessfulStep: '完成质量控制' })
    expect(deriveResearchTaskExecution({
      taskId: 'task-1', threadId: 'thread-1', activeThreadId: 'thread-1', busy: false,
      blocks: [{ kind: 'assistant', id: 'answer-1', text: '分析完成' }]
    })).toMatchObject({ status: 'completed' })
    expect(deriveResearchTaskExecution({
      taskId: 'task-1', threadId: 'thread-1', activeThreadId: 'thread-1', busy: false,
      blocks: [
        { kind: 'tool', id: 'tool-1', summary: '首次绘图失败', status: 'error' },
        { kind: 'assistant', id: 'answer-1', text: '已改用兼容方式完成分析' }
      ]
    })).toMatchObject({ status: 'completed' })
  })
})

describe('ResearchTaskCardPanel', () => {
  it('shows materials, objective, status, deliverables, save location and a continuation entry', () => {
    const failed = applyResearchTaskExecution(card, {
      taskId: card.id,
      status: 'failed',
      lastSuccessfulStep: '完成质量控制'
    })
    const html = renderToStaticMarkup(createElement(ResearchTaskCardPanel, {
      task: failed,
      onContinue: vi.fn()
    }))

    for (const label of ['任务状态', '分析目标', '关联材料', '交付物', '保存位置', '从上次进度继续']) {
      expect(html).toContain(label)
    }
    expect(html).toContain('完成质量控制')
    expect(buildResearchTaskResumeText(failed)).toContain('从“完成质量控制”之后继续')
  })
})
