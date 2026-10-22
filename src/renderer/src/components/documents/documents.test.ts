import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'
import { splitMarkdownSections } from '@shared/artifact-revision'
import { useWriteWorkspaceStore } from '../../write/write-workspace-store'
import { DocumentAiPanel, documentRevisionScope } from './DocumentAiPanel'

const DOCUMENT = '# 第八章\n\n## 一、导入\n讲述哮喘病例。\n\n## 二、新课讲授\n肺通气。\n'
const noSelection = { text: '', ranges: [], charCount: 0 }

describe('documentRevisionScope', () => {
  const sections = splitMarkdownSections(DOCUMENT).filter((section) => section.level > 1)

  it('changes the selection first, then the chosen section, else the whole document', () => {
    const selection = {
      text: '哮喘',
      charCount: 2,
      ranges: [{ from: 18, to: 20, text: '哮喘', charCount: 2, startLine: 4, startColumn: 3, endLine: 4, endColumn: 5 }]
    }

    expect(documentRevisionScope(selection, sections, 'section-2')).toEqual({
      scope: { type: 'selection', from: 18, to: 20, text: '哮喘' },
      label: '选中的文字（2 字）'
    })
    expect(documentRevisionScope(noSelection, sections, 'section-3')).toEqual({
      scope: { type: 'section', sectionId: 'section-3', title: '二、新课讲授' },
      label: '“二、新课讲授”这一节'
    })
    expect(documentRevisionScope(noSelection, sections, '')).toEqual({ scope: { type: 'whole' }, label: '全文' })
  })
})

describe('DocumentAiPanel', () => {
  const initialState = useWriteWorkspaceStore.getInitialState()
  const original = {
    assistantOpen: initialState.assistantOpen,
    fileContent: initialState.fileContent,
    activeArtifact: initialState.activeArtifact
  }

  afterEach(() => {
    Object.assign(initialState, original)
  })

  it('explains how to ask for a change and lists the sections to choose from', () => {
    // Server rendering reads the store's initial state object, so the test changes it and restores it.
    Object.assign(initialState, { assistantOpen: true, fileContent: DOCUMENT, activeArtifact: { id: 'art_1', currentVersion: 1 } })

    const html = renderToStaticMarkup(createElement(DocumentAiPanel))

    expect(html).toContain('选中文稿里的文字，或在下方选一节')
    expect(html).toMatch(/<option value=""[^>]*>全文<\/option>/u)
    expect(html).toContain('一、导入')
    expect(html).toContain('二、新课讲授')
    expect(html).not.toContain('>第八章<')
    expect(html).toContain('placeholder="说一句想怎么改全文"')
  })
})
