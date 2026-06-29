import { describe, expect, it, vi } from 'vitest'
import * as workbench from './Workbench'
import type { SendMessageOverrides } from '../store/chat-store-types'
import type { InlineModuleId } from './zhiyan/ZhiYanModulePages'

type WorkbenchModule = typeof workbench & {
  startModuleTask?: (options: {
    prompt: string
    workspaceRoot?: string
    displayText?: string
    navigateToChat?: boolean
    inlineModule?: InlineModuleId
    setRoute: (route: 'chat') => void
    createThread: (options?: {
      workspaceRoot?: string
      project?: {
        moduleId: InlineModuleId
        name: string
        type: 'teaching' | 'research'
        summary?: string
      }
    }) => Promise<void>
    sendMessage: (prompt: string, mode: string, overrides?: SendMessageOverrides) => Promise<boolean>
    setInput: (value: string) => void
  }) => Promise<boolean>
}

describe('module task launch', () => {
  it('creates a chat thread and immediately sends the module task', async () => {
    const startModuleTask = (workbench as WorkbenchModule).startModuleTask
    const setRoute = vi.fn()
    const createThread = vi.fn(async () => undefined)
    const sendMessage = vi.fn(async () => true)
    const setInput = vi.fn()

    expect(startModuleTask).toBeTypeOf('function')
    await expect(startModuleTask?.({
      prompt: 'Read this paper',
      workspaceRoot: 'D:\\papers',
      setRoute,
      createThread,
      sendMessage,
      setInput
    })).resolves.toBe(true)
    expect(setRoute).toHaveBeenCalledWith('chat')
    expect(createThread).toHaveBeenCalledWith({ workspaceRoot: 'D:\\papers' })
    expect(sendMessage).toHaveBeenCalledWith('Read this paper', 'agent')
    expect(setInput).not.toHaveBeenCalled()
  })

  it('keeps an inline module task on its current page and sends only concise display text', async () => {
    const startModuleTask = (workbench as WorkbenchModule).startModuleTask
    const setRoute = vi.fn()
    const createThread = vi.fn(async () => undefined)
    const sendMessage = vi.fn(async () => true)
    const setInput = vi.fn()

    await startModuleTask?.({
      prompt: 'Analyze uploaded paper with the extracted full text.',
      workspaceRoot: 'D:\\papers',
      displayText: '文献阅读 · 单篇 PDF 精读：paper.pdf',
      navigateToChat: false,
      setRoute,
      createThread,
      sendMessage,
      setInput
    })

    expect(setRoute).not.toHaveBeenCalled()
    expect(sendMessage).toHaveBeenCalledWith(
      'Analyze uploaded paper with the extracted full text.',
      'agent',
      { displayText: '文献阅读 · 单篇 PDF 精读：paper.pdf' }
    )
  })

  it('binds inline module tasks to a teacher project context', async () => {
    const startModuleTask = (workbench as WorkbenchModule).startModuleTask
    const setRoute = vi.fn()
    const createThread = vi.fn(async () => undefined)
    const sendMessage = vi.fn(async () => true)
    const setInput = vi.fn()

    await startModuleTask?.({
      prompt: 'Generate lesson plan',
      workspaceRoot: 'D:\\courses',
      displayText: '教案生成 · 移植免疫',
      navigateToChat: false,
      inlineModule: 'syllabus',
      setRoute,
      createThread,
      sendMessage,
      setInput
    })

    expect(createThread).toHaveBeenCalledWith({
      workspaceRoot: 'D:\\courses',
      project: {
        moduleId: 'syllabus',
        name: '移植免疫',
        type: 'teaching',
        summary: '教案生成 · 移植免疫'
      }
    })
  })
})

describe('module conversation isolation', () => {
  it('shows each inline module conversation only when its own thread is active', () => {
    const isInlineModuleConversationVisible = (
      workbench as WorkbenchModule & {
        isInlineModuleConversationVisible?: (options: {
          inlineConversationThreadIds: Partial<Record<InlineModuleId, string>>
          moduleId: InlineModuleId
          activeThreadId: string | null
        }) => boolean
      }
    ).isInlineModuleConversationVisible

    const moduleIds: InlineModuleId[] = [
      'literature',
      'syllabus',
      'paper-polish',
      'review-writing',
      'grant-writing',
      'bioinformatics'
    ]
    const threadIds: Partial<Record<InlineModuleId, string>> = {
      literature: 'thread-literature',
      syllabus: 'thread-syllabus',
      'paper-polish': 'thread-paper',
      'review-writing': 'thread-review',
      'grant-writing': 'thread-grant',
      bioinformatics: 'thread-data'
    }

    expect(isInlineModuleConversationVisible).toBeTypeOf('function')
    for (const moduleId of moduleIds) {
      const ownThreadId = threadIds[moduleId]
      const otherThreadId = moduleIds
        .map((candidate) => threadIds[candidate])
        .find((threadId) => threadId && threadId !== ownThreadId)

      expect(isInlineModuleConversationVisible?.({
        inlineConversationThreadIds: threadIds,
        moduleId,
        activeThreadId: ownThreadId ?? null
      })).toBe(true)
      expect(isInlineModuleConversationVisible?.({
        inlineConversationThreadIds: threadIds,
        moduleId,
        activeThreadId: otherThreadId ?? null
      })).toBe(false)
      expect(isInlineModuleConversationVisible?.({
        inlineConversationThreadIds: threadIds,
        moduleId,
        activeThreadId: 'thread-chat'
      })).toBe(false)
      expect(isInlineModuleConversationVisible?.({
        inlineConversationThreadIds: threadIds,
        moduleId,
        activeThreadId: null
      })).toBe(false)
    }
  })
})
