import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { useWriteWorkspaceStore } from '../../write/write-workspace-store'
import { LITERATURE_EXAMPLES, LiteratureReportPage, paperFromMaterial, paperFromPubMed } from './LiteratureReportPage'

function withWorkspace<T>(root: string, render: () => T): T {
  const initial = useWriteWorkspaceStore.getInitialState()
  const previous = initial.workspaceRoot
  initial.workspaceRoot = root
  try {
    return render()
  } finally {
    initial.workspaceRoot = previous
  }
}

describe('LiteratureReportPage', () => {
  it('starts with one box for papers, identifiers and a question, instead of task types', () => {
    const html = withWorkspace('/write', () => renderToStaticMarkup(createElement(LiteratureReportPage)))

    expect(html.match(/data-testid="intent-composer"/g)).toHaveLength(1)
    expect(html).toContain(LITERATURE_EXAMPLES[1])
    expect(html).not.toContain('发送文献任务')
  })

  it('turns a PubMed record into a paper read from its abstract', () => {
    expect(paperFromPubMed({
      id: 'pubmed-1', title: 'TLS and immunotherapy', sourceType: 'abstract', pmid: '31942071',
      doi: '10.1038/x', journal: 'Nature', year: 2020, abstract: 'B cells and TLS...'
    })).toEqual({
      name: 'TLS and immunotherapy',
      text: 'TLS and immunotherapy\nNature\n2020\nB cells and TLS...',
      source: 'abstract',
      pmid: '31942071',
      doi: '10.1038/x'
    })
    expect(paperFromPubMed({ id: 'pubmed-2', title: 'No abstract', sourceType: 'abstract' })).toBeNull()
  })

  it('reads a dropped PDF as full text and picks up the DOI printed on it', () => {
    expect(paperFromMaterial({ name: 'cabrita.pdf', text: 'Nature | https://doi.org/10.1038/s41586-019-1914-8 ...' }))
      .toEqual({ name: 'cabrita.pdf', text: 'Nature | https://doi.org/10.1038/s41586-019-1914-8 ...', source: 'fulltext', doi: '10.1038/s41586-019-1914-8' })
  })
})
