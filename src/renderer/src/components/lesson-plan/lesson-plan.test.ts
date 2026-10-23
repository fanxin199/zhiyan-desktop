import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { buildLessonPlanMarkdown, lessonPlanBlocks, lessonPlanHours, type LessonPlanContent } from '@shared/lesson-plan'
import { useWriteWorkspaceStore } from '../../write/write-workspace-store'
import { changedLessonBlocks, LESSON_PLAN_EXAMPLES, LessonPlanPage } from './LessonPlanPage'

const content: LessonPlanContent = {
  objectives: { knowledge: ['掌握肺通气'], extension: [] },
  keyPoints: ['肺通气的动力'],
  difficulties: ['胸膜腔负压'],
  learnerAnalysis: '学生已学过解剖学。',
  methods: '讲授法',
  teachingAids: '计算机多媒体设备',
  means: '',
  process: [
    { title: '导入', minutes: 10, content: '病例导入。' },
    { title: '新课讲授', minutes: 80, content: '讲解肺通气。' }
  ],
  advances: '',
  improvement: ''
}

const header = {
  courseName: '生理学', topic: '第八章 呼吸系统', hours: '2 学时', audience: '本科生', major: '临床医学',
  teacher: '王老师', school: '某医科大学', department: '生理学系'
}

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

describe('LessonPlanPage start state', () => {
  it('asks for one sentence and materials, with examples', () => {
    const html = withWorkspace('/write', () => renderToStaticMarkup(createElement(LessonPlanPage, {})))

    expect(html).toContain('data-ai-work-state="start"')
    expect(html.match(/data-testid="intent-composer"/g)).toHaveLength(1)
    expect(html).toContain(LESSON_PLAN_EXAMPLES[0])
    // The old form's fields are gone: course details become key points after the first sentence.
    expect(html).not.toContain('授课教师')
    expect(html).not.toContain('教学方法选择')
  })

  it('fills the input box with a request from the AI assistant', () => {
    const html = withWorkspace('/write', () => renderToStaticMarkup(createElement(LessonPlanPage, {
      prefill: { id: 1, text: '帮我写一份第八章呼吸系统的教案' }
    })))

    expect(html).toContain('帮我写一份第八章呼吸系统的教案')
  })

  it('asks for a writing space first when there is none', () => {
    const html = withWorkspace('', () => renderToStaticMarkup(createElement(LessonPlanPage, {})))

    expect(html).not.toContain('data-testid="intent-composer"')
  })
})

describe('lesson plan canvas', () => {
  const markdown = buildLessonPlanMarkdown(header, content)

  it('splits the plan into parts and teaching segments, with the header table first', () => {
    const { intro, blocks } = lessonPlanBlocks(markdown)

    expect(intro).toContain('| 学科系 | 生理学系 | 授课教师 | 王老师 |')
    expect(intro).not.toContain('# 生理学')
    expect(blocks.map((block) => [block.level, block.title])).toEqual([
      [2, '教学目的与要求'],
      [2, '教学重点与难点'],
      [2, '教学对象分析'],
      [2, '教学方法与组织'],
      [2, '教学过程设计'],
      [3, '一、导入（10 分钟）'],
      [3, '二、新课讲授（80 分钟）'],
      [2, '教材和参考资料']
    ])
    expect(blocks.find((block) => block.title === '教学过程设计')?.body).toBe('')
    expect(blocks.find((block) => block.title.startsWith('一、'))?.body).toBe('病例导入。')
    expect(lessonPlanHours(markdown)).toBe('2 学时')
  })

  it('marks only the blocks a change touched', () => {
    const after = markdown.replace('病例导入。', '以哮喘病例导入，提出问题。')

    expect([...changedLessonBlocks(markdown, after)]).toEqual(['一、导入（10 分钟）'])
  })
})
