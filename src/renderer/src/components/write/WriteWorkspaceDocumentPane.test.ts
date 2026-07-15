import { createElement, createRef } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { defaultWriteSettings } from '@shared/app-settings'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../../i18n'
import { WriteWorkspaceDocumentPane } from './WriteWorkspaceDocumentPane'

function renderDocument(fileContent: string): string {
  return renderToStaticMarkup(
    createElement(WriteWorkspaceDocumentPane, {
      activeFilePath: '/write/welcome.md',
      activeFileIsImage: false,
      activeFileIsText: true,
      fileLoading: false,
      fileContent,
      imageDataUrl: '',
      imageMimeType: '',
      fileSize: fileContent.length,
      workspaceRoot: '/write',
      workspaceName: 'Write',
      workspacePathLabel: '/write',
      renderSafety: {
        notice: 'none',
        readOnly: false,
        livePreviewEnabled: true,
        markdownPreviewEnabled: true
      },
      fileGuardMessage: '',
      fileGuardDetail: '',
      editorVisible: true,
      previewVisible: false,
      editorWidth: 'min-w-0 flex-1',
      previewWidth: 'min-w-0 flex-1',
      editorAppearance: 'live',
      debouncedPreviewContent: fileContent,
      isMarkdown: true,
      inlineCompletion: defaultWriteSettings().inlineCompletion,
      inlineCompletionApiReady: false,
      recentEdits: [],
      editorPaneRef: createRef<HTMLDivElement>(),
      previewPaneRef: createRef<HTMLDivElement>(),
      onAskAssistant: vi.fn(),
      onCreateDraft: vi.fn(),
      onOrganizeMaterial: vi.fn(),
      onPickWorkspace: vi.fn(),
      onRefreshWorkspace: vi.fn(),
      onContentChange: vi.fn(),
      onDocumentEdit: vi.fn(),
      onSelectionChange: vi.fn(),
      onSaveShortcut: vi.fn(),
      onImagePasteSaved: vi.fn(),
      onImagePasteError: vi.fn()
    })
  )
}

describe('WriteWorkspaceDocumentPane', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
  })

  it('shows a natural writing prompt for an empty auto-created heading', () => {
    const html = renderDocument('# \n\n')

    expect(html).toContain('data-testid="write-editor-empty-hint"')
    expect(html).toContain('Start with a title, or just begin writing…')
  })

  it('hides the writing prompt after meaningful content is entered', () => {
    const html = renderDocument('# Methods\n\nStudy design')

    expect(html).not.toContain('data-testid="write-editor-empty-hint"')
  })
})
