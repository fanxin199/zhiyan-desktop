import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { CoursewarePage } from './CoursewarePage'
import { MissingRequirementsHint, missingRequirementsText } from './missing-requirements'
import { TextbookWorkbenchPage } from './TextbookWorkbenchPage'
import { BioinformaticsPage } from './ZhiYanModulePages'

function buttonContaining(html: string, label: string): string {
  const labelIndex = html.indexOf(`${label}</button>`)
  if (labelIndex < 0) return ''
  return html.slice(html.lastIndexOf('<button', labelIndex), labelIndex)
}

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
    const analysis = renderToStaticMarkup(createElement(BioinformaticsPage, { onStartChat: () => undefined }))

    for (const [html, label] of [
      [analysis, '发送分析任务']
    ] as const) {
      const button = buttonContaining(html, label)
      expect(button, label).not.toBe('')
      expect(button, label).not.toContain('disabled=""')
    }
    // 课件 starts from one sentence: its send button stays enabled and says what is missing when used.
    const send = courseware.match(/<button[^>]*aria-label="发送"[^>]*>/u)?.[0] ?? ''
    expect(send).not.toBe('')
    expect(send).not.toContain('disabled=""')
    // 教材 also starts from one sentence; its detailed settings are a step away.
    const textbookSend = textbook.match(/<button[^>]*aria-label="发送"[^>]*>/u)?.[0] ?? ''
    expect(textbookSend).not.toBe('')
    expect(textbookSend).not.toContain('disabled=""')
    expect(analysis).toContain('id="research-task-input"')
  })
})
