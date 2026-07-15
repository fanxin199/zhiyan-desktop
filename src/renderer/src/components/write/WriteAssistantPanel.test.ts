import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../../i18n'
import { useWriteWorkspaceStore } from '../../write/write-workspace-store'
import { WriteAssistantPanel } from './WriteAssistantPanel'

describe('WriteAssistantPanel', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    useWriteWorkspaceStore.setState({
      workspaceRoot: '/write',
      activeFilePath: '/write/welcome.md',
      quotedSelections: []
    })
  })

  it('uses a compact empty state without repeating the active file path', () => {
    const html = renderToStaticMarkup(
      createElement(WriteAssistantPanel, {
        input: '',
        setInput: vi.fn(),
        mode: 'agent',
        setMode: vi.fn(),
        busy: false,
        runtimeConnection: 'ready',
        activeThreadId: null,
        blocks: [],
        liveReasoning: '',
        liveAssistant: '',
        composerModel: 'auto',
        composerPickList: [],
        composerReasoningEffort: 'high',
        setComposerModel: vi.fn(),
        setComposerReasoningEffort: vi.fn(),
        queuedMessages: [],
        removeQueuedMessage: vi.fn(),
        onSend: vi.fn(),
        onInterrupt: vi.fn(),
        onRetryConnection: vi.fn(),
        onOpenSettings: vi.fn(),
        onNewConversation: vi.fn(),
        onCollapse: vi.fn()
      })
    )

    expect(html).toContain('data-testid="write-assistant-empty"')
    expect(html).toContain('grid-cols-3')
    expect(html).toContain('Summarize document')
    expect(html).toContain('Draft an outline')
    expect(html).toContain('Polish selection')
    expect(html).not.toContain('welcome.md')
  })
})
