import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { CoursewarePage, getCoursewareWorkflowStepIndex } from './CoursewarePage'

describe('CoursewarePage workflow indicator', () => {
  it('renders the four teacher-facing courseware steps', () => {
    const html = renderToStaticMarkup(createElement(CoursewarePage))

    expect(html).toContain('课件生成流程')
    expect(html).toContain('上传教材')
    expect(html).toContain('AI 分析')
    expect(html).toContain('图片审核')
    expect(html).toContain('生成课件')
  })

  it('maps the current courseware state to the expected highlighted step', () => {
    expect(getCoursewareWorkflowStepIndex({
      step: 'request',
      busy: null,
      hasSource: false,
      hasBlueprint: false,
      hasSlides: false,
      hasVisuals: false
    })).toBe(0)

    expect(getCoursewareWorkflowStepIndex({
      step: 'request',
      busy: 'source',
      hasSource: true,
      hasBlueprint: false,
      hasSlides: false,
      hasVisuals: false
    })).toBe(1)

    expect(getCoursewareWorkflowStepIndex({
      step: 'request',
      busy: null,
      hasSource: true,
      hasBlueprint: false,
      hasSlides: false,
      hasVisuals: true
    })).toBe(2)

    expect(getCoursewareWorkflowStepIndex({
      step: 'slides',
      busy: null,
      hasSource: true,
      hasBlueprint: true,
      hasSlides: true,
      hasVisuals: true
    })).toBe(3)
  })
})
