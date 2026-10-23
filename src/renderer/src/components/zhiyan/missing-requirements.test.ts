import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { CoursewarePage } from './CoursewarePage'
import { MissingRequirementsHint, missingRequirementsText } from './missing-requirements'
import { TextbookWorkbenchPage } from './TextbookWorkbenchPage'
import { LiteraturePage } from './ZhiYanModulePages'

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
    const literature = renderToStaticMarkup(createElement(LiteraturePage, { onStartChat: () => undefined }))

    for (const [html, label] of [
      [textbook, 'AI 解析出版社要求'],
      [textbook, '生成全书大纲'],
      [literature, '发送文献任务']
    ] as const) {
      const button = buttonContaining(html, label)
      expect(button, label).not.toBe('')
      expect(button, label).not.toContain('disabled=""')
    }
    // 课件 starts from one sentence: its send button stays enabled and says what is missing when used.
    const send = courseware.match(/<button[^>]*aria-label="发送"[^>]*>/u)?.[0] ?? ''
    expect(send).not.toBe('')
    expect(send).not.toContain('disabled=""')
    expect(textbook).toContain('id="textbook-title"')
    expect(textbook).toContain('id="textbook-publisher-guidelines"')
    expect(literature).toContain('id="research-task-input"')
  })
})
