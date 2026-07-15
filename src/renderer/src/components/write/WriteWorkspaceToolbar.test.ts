import { createElement, createRef } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../../i18n'
import { WriteWorkspaceToolbar } from './WriteWorkspaceToolbar'

describe('WriteWorkspaceToolbar', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
  })

  it('keeps the document controls in one compact, writing-first toolbar', () => {
    const html = renderToStaticMarkup(
      createElement(WriteWorkspaceToolbar, {
        activeFileIsText: true,
        activeFileName: 'welcome.md',
        activeFilePath: '/write/welcome.md',
        assistantOpen: false,
        exportInFlight: false,
        exportMenuOpen: false,
        exportMenuRef: createRef<HTMLDivElement>(),
        leftSidebarCollapsed: false,
        liveModeActive: true,
        modeMenuItems: [],
        modeMenuOpen: false,
        modeMenuRef: createRef<HTMLDivElement>(),
        onCopyRichText: vi.fn(),
        onExportFile: vi.fn(),
        onToggleLeftSidebar: vi.fn(),
        readOnly: false,
        saveLabel: 'Saved',
        saveStatus: 'saved',
        setAssistantOpen: vi.fn(),
        setExportMenuOpen: vi.fn(),
        setModeMenuOpen: vi.fn(),
        setPreviewMode: vi.fn()
      })
    )

    expect(html).toContain('data-testid="write-compact-toolbar"')
    expect(html).toContain('>Edit<')
    expect(html.match(/welcome\.md/g)).toHaveLength(1)
    expect(html).toContain('aria-label="Saved"')
    expect(html).not.toContain('title="Change workspace"')
    expect(html).not.toContain('title="Save file"')
  })
})
