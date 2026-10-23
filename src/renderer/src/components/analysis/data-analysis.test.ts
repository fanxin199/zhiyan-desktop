import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { mergeIntentBrief } from '@shared/intent-brief'
import { resumeTargetFor } from '../../lib/resume-artifact'
import { analysisRequirementFor, DATA_ANALYSIS_EXAMPLES, DataAnalysisPage, tablePreview } from './DataAnalysisPage'

describe('DataAnalysisPage', () => {
  it('starts with one sentence and data files, without task types or the environment panel', () => {
    const html = renderToStaticMarkup(createElement(DataAnalysisPage, { onStartAgentTask: vi.fn(), researchTaskExecution: null }))

    expect(html.match(/data-testid="intent-composer"/g)).toHaveLength(1)
    expect(html).toContain('添加数据文件')
    expect(html).toContain(DATA_ANALYSIS_EXAMPLES[0])
    expect(html).not.toContain('选择任务类型')
    // The environment is checked only when the analysis is about to run.
    expect(html).not.toContain('分析环境')
  })

  it('shows the AI only the first lines of a table, which carry columns and group labels', () => {
    const table = ['sample_id\tresponse\tbatch', ...Array.from({ length: 20 }, (_, index) => `S${index}\tResponder\tA`)].join('\r\n')

    expect(tablePreview(table).split('\n')).toHaveLength(8)
    expect(tablePreview(table).split('\n')[0]).toBe('sample_id\tresponse\tbatch')
  })

  it('asks for the bioinformatics pack only for genomic data', () => {
    const bulk = mergeIntentBrief('bioinformatics', { teacher: { dataType: 'bulk RNA-seq', goal: '差异表达' } })
    const survey = mergeIntentBrief('bioinformatics', { teacher: { dataType: '问卷数据', goal: '描述统计' } })

    expect(analysisRequirementFor(bulk, [{ name: 'counts.csv' }])).toBe('bioinformatics')
    expect(analysisRequirementFor(survey, [{ name: 'survey.xlsx' }])).toBe('base')
    expect(analysisRequirementFor(null, [{ name: 'cells.h5ad' }])).toBe('bioinformatics')
  })

  it('reopens an analysis report on the analysis page', () => {
    expect(resumeTargetFor({
      kind: 'analysis-report',
      toolId: 'bioinformatics',
      storage: { type: 'file', path: 'D:\\data\\.zhiyan-analysis\\task\\report.md' }
    })).toEqual({ type: 'reopen', toolId: 'bioinformatics' })
    // Records from before the report existed point at the manifest and open the tool.
    expect(resumeTargetFor({
      kind: 'analysis-report',
      toolId: 'bioinformatics',
      storage: { type: 'file', path: 'D:\\data\\.zhiyan-analysis\\task\\manifest.json' }
    })).toEqual({ type: 'tool', toolId: 'bioinformatics' })
  })
})
