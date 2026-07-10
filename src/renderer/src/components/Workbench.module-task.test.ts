import { describe, expect, it, vi } from 'vitest'
import * as workbench from './Workbench'
import type { SendMessageOverrides } from '../store/chat-store-types'
import type { InlineModuleId } from './zhiyan/ZhiYanModulePages'
import type { ChatBlock } from '../agent/types'

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
  startDashboardPrompt?: (options: {
    prompt: string
    setRoute: (route: 'chat') => void
    createThread: () => Promise<void>
    sendMessage: (prompt: string, mode: string, overrides?: SendMessageOverrides) => Promise<boolean>
    setInput: (value: string) => void
  }) => Promise<boolean>
  openRecentDashboardThread?: (options: {
    threadId: string
    setRoute: (route: 'chat') => void
    selectThread: (id: string) => Promise<void>
  }) => Promise<void>
  latestAssistantDraftText?: (blocks: ChatBlock[], liveAssistant?: string) => string
  moduleWriteDraftFileName?: (title: string, now?: Date) => string
  buildModuleWriteDraftMarkdown?: (seed: {
    title: string
    content: string
    sourceModule: InlineModuleId
    createdAtLabel?: string
  }) => string
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

describe('dashboard recent conversations', () => {
  it('sends a dashboard natural language prompt to the chat route', async () => {
    const startDashboardPrompt = (workbench as WorkbenchModule).startDashboardPrompt
    const setRoute = vi.fn()
    const createThread = vi.fn(async () => undefined)
    const sendMessage = vi.fn(async () => true)
    const setInput = vi.fn()

    await expect(startDashboardPrompt?.({
      prompt: '  帮我做一份B细胞课件  ',
      setRoute,
      createThread,
      sendMessage,
      setInput
    })).resolves.toBe(true)

    expect(setRoute).toHaveBeenCalledWith('chat')
    expect(createThread).toHaveBeenCalledTimes(1)
    expect(sendMessage).toHaveBeenCalledWith(
      '帮我做一份B细胞课件',
      'agent',
      { displayText: '帮我做一份B细胞课件' }
    )
    expect(setInput).not.toHaveBeenCalled()
  })

  it('does not create a chat thread for an empty dashboard prompt', async () => {
    const startDashboardPrompt = (workbench as WorkbenchModule).startDashboardPrompt
    const setRoute = vi.fn()
    const createThread = vi.fn(async () => undefined)
    const sendMessage = vi.fn(async () => true)
    const setInput = vi.fn()

    await expect(startDashboardPrompt?.({
      prompt: '   ',
      setRoute,
      createThread,
      sendMessage,
      setInput
    })).resolves.toBe(false)

    expect(setRoute).not.toHaveBeenCalled()
    expect(createThread).not.toHaveBeenCalled()
    expect(sendMessage).not.toHaveBeenCalled()
  })

  it('opens a recent dashboard thread in the chat route', async () => {
    const openRecentDashboardThread = (workbench as WorkbenchModule).openRecentDashboardThread
    const calls: string[] = []
    const setRoute = vi.fn((route: 'chat') => {
      calls.push(`route:${route}`)
    })
    const selectThread = vi.fn(async (id: string) => {
      calls.push(`thread:${id}`)
    })

    await openRecentDashboardThread?.({
      threadId: 'thread-literature',
      setRoute,
      selectThread
    })

    expect(setRoute).toHaveBeenCalledWith('chat')
    expect(selectThread).toHaveBeenCalledWith('thread-literature')
    expect(calls).toEqual(['route:chat', 'thread:thread-literature'])
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

describe('module output to free writing draft', () => {
  it('uses the latest assistant answer as draft content', () => {
    const latestAssistantDraftText = (workbench as WorkbenchModule).latestAssistantDraftText

    expect(latestAssistantDraftText?.([
      { kind: 'user', id: 'user-1', text: '请写立项依据' },
      { kind: 'assistant', id: 'assistant-1', text: '第一版内容' },
      { kind: 'assistant', id: 'assistant-2', text: '最终版内容' }
    ] as ChatBlock[])).toBe('最终版内容')

    expect(latestAssistantDraftText?.([], ' 正在生成的内容 ')).toBe('正在生成的内容')
  })

  it('builds a Markdown draft with source metadata', () => {
    const buildModuleWriteDraftMarkdown = (workbench as WorkbenchModule).buildModuleWriteDraftMarkdown

    const markdown = buildModuleWriteDraftMarkdown?.({
      title: '自然基金撰写结果',
      content: '## 立项依据\n\n围绕 TLS 中 B 细胞亚群展开。',
      sourceModule: 'grant-writing',
      createdAtLabel: '2026/6/30 10:00:00'
    })

    expect(markdown).toContain('# 自然基金撰写结果')
    expect(markdown).toContain('> 来源：自然基金撰写')
    expect(markdown).toContain('> 生成时间：2026/6/30 10:00:00')
    expect(markdown).toContain('## 立项依据')
  })

  it('creates a safe Markdown file name for module drafts', () => {
    const moduleWriteDraftFileName = (workbench as WorkbenchModule).moduleWriteDraftFileName

    expect(moduleWriteDraftFileName?.(
      '自然基金: B/TLS 项目?',
      new Date('2026-06-30T02:03:04.005Z')
    )).toBe('自然基金 B TLS 项目-2026-06-30T02-03-04-005Z.md')
  })
})
