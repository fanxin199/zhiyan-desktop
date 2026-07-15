import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../../i18n'
import { WriteFileTree } from './WriteFileTree'

describe('WriteFileTree', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
  })

  it('reveals rename and delete actions only when a file row is engaged', () => {
    const html = renderToStaticMarkup(
      createElement(WriteFileTree, {
        rootDirectory: '/write',
        entriesByDir: {
          '/write': [{ name: 'draft.md', path: '/write/draft.md', type: 'file', ext: '.md' }]
        },
        expandedDirs: new Set<string>(),
        loadingDirs: {},
        selectedFilePath: '/write/draft.md',
        error: null,
        onToggleDir: vi.fn(),
        onSelectFile: vi.fn(),
        onCreateFile: vi.fn(),
        onCreateDirectory: vi.fn(),
        onRenameEntry: vi.fn(),
        onDeleteEntry: vi.fn(),
        onRefresh: vi.fn(),
        showHeader: false,
        showRootLabel: false
      })
    )

    expect(html).toContain('pointer-events-none opacity-0')
    expect(html).toContain('group-hover:pointer-events-auto')
    expect(html).toContain('title="Rename"')
    expect(html).toContain('title="Delete file"')
  })
})
