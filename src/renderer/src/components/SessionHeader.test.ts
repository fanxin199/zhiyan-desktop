import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'
import { useChatStore } from '../store/chat-store'
import { formatTeacherProjectLabel, SessionHeader, shouldShowTechnicalMetrics } from './SessionHeader'

describe('SessionHeader technical metrics visibility', () => {
  it('only shows the full technical metrics in the expanded header after opting in', () => {
    expect(shouldShowTechnicalMetrics(true, true)).toBe(false)
    expect(shouldShowTechnicalMetrics(false, false)).toBe(false)
    expect(shouldShowTechnicalMetrics(false, true)).toBe(true)
  })
})

describe('SessionHeader project label', () => {
  it('formats teacher project labels for compact session context', () => {
    expect(formatTeacherProjectLabel({
      id: 'teacher-project:syllabus',
      name: '移植免疫',
      type: 'teaching',
      lastUsedAt: '2026-06-29T00:00:00.000Z'
    })).toBe('教案 · 移植免疫')
    expect(formatTeacherProjectLabel({
      id: 'teacher-project:literature',
      name: 'B 细胞综述',
      type: 'research',
      lastUsedAt: '2026-06-29T00:00:00.000Z'
    })).toBe('科研 · B 细胞综述')
  })
})

describe('SessionHeader workspace name', () => {
  // Server rendering reads the store's initial state object, so the test changes it and restores it.
  const initialState = useChatStore.getInitialState()
  const original = {
    threads: initialState.threads,
    activeThreadId: initialState.activeThreadId,
    workspaceLabel: initialState.workspaceLabel
  }

  afterEach(() => {
    Object.assign(initialState, original)
  })

  it('shows the conversation title and time without the workspace folder name', () => {
    Object.assign(initialState, {
      workspaceLabel: 'default',
      activeThreadId: 'thr_1',
      threads: [{
        id: 'thr_1',
        title: '第八章呼吸系统教案',
        updatedAt: '2026-10-22T08:00:00.000Z',
        model: 'auto',
        mode: 'agent',
        workspace: 'C:\\Users\\teacher\\default_workspace'
      }]
    })

    const html = renderToStaticMarkup(createElement(SessionHeader, { compact: true }))

    expect(html).toContain('第八章呼吸系统教案')
    expect(html).not.toContain('default_workspace')
    expect(html).not.toContain('>default<')
  })
})
