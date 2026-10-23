import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { CoursewarePage } from './CoursewarePage'
import { MissingRequirementsHint, missingRequirementsText } from './missing-requirements'
import { TextbookWorkbenchPage } from './TextbookWorkbenchPage'
import { DataAnalysisPage } from '../analysis/DataAnalysisPage'

describe('missing requirements', () => {
  it('names everything still missing in one line', () => {
    const missing = [
      { label: '选择教材', targetId: 'courseware-source' },
      { label: '填写授课主题', targetId: 'courseware-topic' }
    ]

    expect(missingRequirementsText(missing)).toBe('还差：选择教材、填写授课主题')
    expect(renderToStaticMarkup(createElement(MissingRequirementsHint, { missing }))).toContain('role="status"')
    expect(renderToStaticMarkup(createElement(MissingRequirementsHint, { missing: [] }))).toBe('')
  })

  it('keeps primary buttons clickable before their requirements are met', () => {
    const courseware = renderToStaticMarkup(createElement(CoursewarePage))
    const textbook = renderToStaticMarkup(createElement(TextbookWorkbenchPage))
    const analysis = renderToStaticMarkup(createElement(DataAnalysisPage, { onStartAgentTask: () => undefined, researchTaskExecution: null }))

    // 课件 starts from one sentence: its send button stays enabled and says what is missing when used.
    const send = courseware.match(/<button[^>]*aria-label="发送"[^>]*>/u)?.[0] ?? ''
    expect(send).not.toBe('')
    expect(send).not.toContain('disabled=""')
    // 教材 also starts from one sentence; its detailed settings are a step away.
    const textbookSend = textbook.match(/<button[^>]*aria-label="发送"[^>]*>/u)?.[0] ?? ''
    expect(textbookSend).not.toBe('')
    expect(textbookSend).not.toContain('disabled=""')
    // 数据分析 also starts from one sentence; without data files it says what is missing when sent.
    const analysisSend = analysis.match(/<button[^>]*aria-label="发送"[^>]*>/u)?.[0] ?? ''
    expect(analysisSend).not.toBe('')
    expect(analysisSend).not.toContain('disabled=""')
  })
})
