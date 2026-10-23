import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { artifactNextSteps } from '../../lib/next-steps'
import { detectToolRequest } from '../../lib/tool-request'
import { useWriteWorkspaceStore } from '../../write/write-workspace-store'
import { QUIZ_EXAMPLES, QuizPage, prefillMaterials } from './QuizPage'

describe('随堂题 and next steps (Tasks 3.4.1–3.4.2)', () => {
  it('hands a lesson plan over as material when the next step is a quiz', () => {
    const steps = artifactNextSteps({ kind: 'lesson-plan', title: '第八章 教案', markdown: '# 第八章\n\n## 教学目的' })

    expect(steps.map((step) => step.request.moduleId)).toEqual(['ppt-gen', 'quiz', 'textbook'])
    expect(steps[1].materials).toEqual([{ name: '第八章 教案', text: '# 第八章\n\n## 教学目的' }])
    // Courseware takes the plan as a short excerpt in its request instead.
    expect(steps[0].materials).toEqual([])
    expect(steps[0].text).toContain('参考“第八章 教案”的要点')
    expect(artifactNextSteps({ kind: 'question-set', title: '随堂题' })).toEqual([])
  })

  it('sends “出 10 道选择题” from the assistant to 随堂题', () => {
    expect(detectToolRequest('帮我出 10 道选择题')).toEqual({ moduleId: 'quiz', label: '随堂题' })
    expect(detectToolRequest('第八章的随堂题')?.moduleId).toBe('quiz')
  })

  it('starts with one sentence, examples and the materials a next step brought', () => {
    const initial = useWriteWorkspaceStore.getInitialState()
    const previous = initial.workspaceRoot
    initial.workspaceRoot = '/write'
    try {
      const prefill = { id: 7, text: '根据教案出 10 道随堂题', materials: [{ name: '第八章 教案', text: '内容' }] }
      const html = renderToStaticMarkup(createElement(QuizPage, { prefill }))
      expect(html).toContain('根据教案出 10 道随堂题')
      expect(html).toContain('第八章 教案')
      expect(html).toContain(QUIZ_EXAMPLES[0])
      expect(prefillMaterials(prefill)).toEqual([{ id: 'prefill-7-0', name: '第八章 教案', text: '内容' }])
    } finally {
      initial.workspaceRoot = previous
    }
  })
})
