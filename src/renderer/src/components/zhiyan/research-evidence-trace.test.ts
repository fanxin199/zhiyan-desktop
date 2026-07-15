import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { ChatBlock } from '../../agent/types'
import {
  ResearchEvidenceTracePanel,
  buildResearchEvidencePrompt,
  collectResearchEvidenceTrace,
  createMaterialEvidenceTrace,
  parseResearchEvidenceTrace
} from './research-evidence-trace'

describe('research evidence trace', () => {
  it('requires six explicit evidence levels and verifiable citation identifiers', () => {
    const prompt = buildResearchEvidencePrompt()

    for (const label of [
      '用户材料',
      '全文证据',
      '摘要/元数据',
      '数据库结果',
      '相关性推断',
      '机制假设'
    ]) {
      expect(prompt).toContain(label)
    }
    expect(prompt).toContain('DOI/PMID')
    expect(prompt).toContain('ZHIYAN_EVIDENCE_V1')
  })

  it('parses and normalizes the hidden evidence record from an assistant answer', () => {
    const trace = parseResearchEvidenceTrace(`结论正文
<!-- ZHIYAN_EVIDENCE_V1
{"version":1,"records":[{"kind":"full_text","claim":"TLS 中 B 细胞富集与疗效相关","title":"B cells in TLS","year":"2024","source":"Cancer Cell","doi":"https://doi.org/10.1016/j.ccell.2024.01.001","pmid":"PMID: 38312345","locator":"Figure 3"},{"kind":"mechanism_hypothesis","claim":"B 细胞可能通过抗原呈递增强 T 细胞应答","title":"当前机制解释"}]}
ZHIYAN_EVIDENCE_V1 -->`)

    expect(trace?.records).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: 'full_text',
        doi: '10.1016/j.ccell.2024.01.001',
        pmid: '38312345',
        verification: 'verifiable'
      }),
      expect.objectContaining({
        kind: 'mechanism_hypothesis',
        verification: 'not_applicable'
      })
    ]))
  })

  it('combines user materials, structured claims, and searchable database citations without duplicates', () => {
    const initial = createMaterialEvidenceTrace([
      { name: 'paper.pdf', path: 'D:/papers/paper.pdf' }
    ], '2026-07-15T08:00:00.000Z')
    const blocks: ChatBlock[] = [
      {
        kind: 'tool',
        id: 'tool-1',
        summary: '检索 PubMed',
        status: 'success',
        meta: {
          sources: [{
            title: 'B cells in TLS',
            url: 'https://pubmed.ncbi.nlm.nih.gov/38312345/',
            retrievedAt: '2026-07-15T08:05:00.000Z'
          }]
        }
      },
      {
        kind: 'assistant',
        id: 'answer-1',
        text: `<!-- ZHIYAN_EVIDENCE_V1
{"version":1,"records":[{"kind":"database_result","claim":"检索到相关论文","title":"B cells in TLS","year":"2024","source":"PubMed","pmid":"38312345"}]}
ZHIYAN_EVIDENCE_V1 -->`
      }
    ]

    const trace = collectResearchEvidenceTrace(blocks, initial)

    expect(trace.records.filter((record) => record.kind === 'user_material')).toHaveLength(1)
    expect(trace.records.filter((record) => record.pmid === '38312345')).toHaveLength(1)
    expect(collectResearchEvidenceTrace(blocks, trace)).toBe(trace)
  })

  it('shows evidence level, citation metadata, and missing-identifier warnings to teachers', () => {
    const trace = parseResearchEvidenceTrace(`<!-- ZHIYAN_EVIDENCE_V1
{"version":1,"records":[{"kind":"abstract_metadata","claim":"摘要报告应答者中 TLS 更丰富","title":"TLS response cohort","year":"2023","source":"Journal of Immunotherapy","pmid":"37800001"},{"kind":"full_text","claim":"正文支持空间共定位","title":"Spatial B cells","year":"2022","source":"Nature Medicine"}]}
ZHIYAN_EVIDENCE_V1 -->`)
    const html = renderToStaticMarkup(createElement(ResearchEvidenceTracePanel, { trace: trace! }))

    expect(html).toContain('科研证据追溯')
    expect(html).toContain('摘要/元数据')
    expect(html).toContain('PMID 37800001')
    expect(html).toContain('缺少 DOI/PMID')
  })
})
