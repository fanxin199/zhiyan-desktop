import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import i18n from '../i18n'
import { useChatStore } from '../store/chat-store'
import type { AppRoute } from '../store/chat-store-types'
import type { DocumentTemplateId } from '@shared/document-templates'
import { useWriteWorkspaceStore } from '../write/write-workspace-store'
import { Workbench } from './Workbench'

const chatInitialState = useChatStore.getInitialState()
const writeInitialState = useWriteWorkspaceStore.getInitialState()
const originalRoute = chatInitialState.route
const originalFilesPanelOpen = writeInitialState.filesPanelOpen
const originalWorkspaceRoot = writeInitialState.workspaceRoot
const originalActiveFilePath = writeInitialState.activeFilePath
const originalDocumentStart = writeInitialState.documentStart

// Server rendering reads each store's initial state object rather than its current state,
// so the tests change that object and restore it afterwards.
function renderWorkbench(
  route: AppRoute,
  filesPanelOpen = true,
  document: { activeFilePath: string | null; documentStart?: DocumentTemplateId | null } = { activeFilePath: '/tmp/write/文稿.md' }
): string {
  chatInitialState.route = route
  writeInitialState.filesPanelOpen = filesPanelOpen
  writeInitialState.workspaceRoot = '/tmp/write'
  writeInitialState.activeFilePath = document.activeFilePath
  writeInitialState.documentStart = document.documentStart ?? null
  return renderToStaticMarkup(createElement(Workbench))
}

describe('Workbench writing page navigation', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('zh')
  })

  afterEach(() => {
    chatInitialState.route = originalRoute
    writeInitialState.filesPanelOpen = originalFilesPanelOpen
    writeInitialState.workspaceRoot = originalWorkspaceRoot
    writeInitialState.activeFilePath = originalActiveFilePath
    writeInitialState.documentStart = originalDocumentStart
  })

  it('keeps the main navigation on the writing page and shows the file tree as an in-page panel', () => {
    const html = renderWorkbench('write')

    expect(html).toContain('智能教案')
    expect(html).toContain('科研数据分析')
    expect(html).toContain('data-testid="write-files-panel"')
    expect(html).toContain('aria-label="收起文稿列表"')
    expect(html).not.toContain('aria-label="显示文稿列表"')
  })

  it('collapses the file panel into a toolbar button without hiding the main navigation', () => {
    const html = renderWorkbench('write', false)

    expect(html).toContain('智能教案')
    expect(html).not.toContain('data-testid="write-files-panel"')
    expect(html).toContain('aria-label="显示文稿列表"')
  })

  it('does not show the writing file panel on other pages', () => {
    expect(renderWorkbench('dashboard')).not.toContain('data-testid="write-files-panel"')
  })

  it('shows the 文稿 start state when no document is open', () => {
    const html = renderWorkbench('write', true, { activeFilePath: null })

    expect(html).toContain('data-ai-work-state="start"')
    expect(html).toContain('role="radiogroup"')
    expect(html).not.toContain('data-testid="write-files-panel"')
    expect(html).not.toContain('回到正在编辑的文稿')
  })

  it('opens the start state with the template of an old writing page preselected', () => {
    const html = renderWorkbench('write', true, { activeFilePath: '/tmp/write/文稿.md', documentStart: 'grant' })

    expect(html).toMatch(/aria-checked="true"[^>]*>国自然</u)
    expect(html).toContain('回到正在编辑的文稿')
    expect(html).toContain('立项依据、技术路线相互对应')
  })
})
