import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { AppSettingsV1 } from '@shared/app-settings'
import { mergeIntentBrief, updateIntentField } from '@shared/intent-brief'
import { projectPromptBlock } from '@shared/project'
import { intentContextFromSettings } from '../../lib/intent-context'
import { IntentBriefChips } from './IntentBriefChips'

const lesson = {
  courseName: '生理学', topic: '第七章 血液循环', hours: '4 学时', students: '2023 级本科生', major: '临床医学',
  updatedAt: '2026-10-20T00:00:00.000Z'
}

function settings(courses: string[], withLesson = true): Pick<AppSettingsV1, 'teacherProfile' | 'moduleContext'> {
  return {
    teacherProfile: { name: '王老师', school: '某医科大学', department: '生理学系', courses, researchTopics: [] },
    moduleContext: withLesson
      ? { projects: { 'p-1': { syllabus: lesson } }, recent: { syllabusProjectId: 'p-1' } }
      : { projects: {}, recent: {} }
  }
}

describe('IntentBriefChips', () => {
  it('shows each point with its value and where it came from, and marks defaults', () => {
    const brief = mergeIntentBrief('syllabus', {
      teacher: { topic: '第八章 呼吸系统' },
      profile: { courseName: '生理学' }
    })
    const html = renderToStaticMarkup(createElement(IntentBriefChips, { brief, onChange: vi.fn() }))

    expect(html).toContain('data-testid="intent-brief"')
    expect(html).toContain('第八章 呼吸系统')
    expect(html).toContain('来自教师信息')
    expect(html).toContain('2 学时')
    expect(html).toContain('>默认<')
    expect(html).not.toContain('role="status"')
  })

  it('asks its one question and shows missing required points as 待补充', () => {
    const brief = mergeIntentBrief('syllabus', { teacher: { topic: '呼吸系统' } })
    const html = renderToStaticMarkup(createElement(IntentBriefChips, { brief, onChange: vi.fn() }))

    expect(html).toContain('还需要知道课程，请补充。')
    expect(html).toContain('待补充')
  })
})

describe('updateIntentField', () => {
  it('makes an edited point the teacher’s, and drops the question once nothing is missing', () => {
    const brief = mergeIntentBrief('syllabus', { teacher: { topic: '呼吸系统' } })
    const updated = updateIntentField(brief, 'courseName', ' 生理学 ')

    expect(updated.fields.find((field) => field.key === 'courseName')).toMatchObject({ value: '生理学', source: 'teacher' })
    expect(updated.missing).toEqual([])
    expect(updated.question).toBeUndefined()

    const cleared = updateIntentField(updated, 'topic', '')
    expect(cleared.missing).toEqual(['topic'])
  })
})

describe('intentContextFromSettings', () => {
  it('fills a lesson plan from the latest lesson, but never carries the chapter over', () => {
    expect(intentContextFromSettings('syllabus', settings(['生理学', '病理生理学']))).toEqual({
      project: { courseName: '生理学', audience: '2023 级本科生', hours: '4 学时', major: '临床医学' },
      profile: {}
    })
  })

  it('uses the profile’s course only when the teacher has exactly one', () => {
    expect(intentContextFromSettings('syllabus', settings(['免疫学'], false)).profile).toEqual({ courseName: '免疫学' })
    expect(intentContextFromSettings('syllabus', settings(['免疫学', '生理学'], false)).profile).toEqual({})
  })

  it('lets courseware follow the latest lesson plan, and leaves research tools alone', () => {
    expect(intentContextFromSettings('ppt-gen', settings([]))).toEqual({
      project: { topic: '第七章 血液循环', audience: '2023 级本科生' }
    })
    expect(intentContextFromSettings('literature', settings(['生理学']))).toEqual({})
  })
})

describe('key points inside a project (Task 3.2.1)', () => {
  const course = { brief: { courseName: '人体生理学', chapter: '第八章 呼吸系统', audience: '临床医学本科生', glossary: '肺通气' } }

  it('takes course, chapter and audience from the project, ahead of the latest lesson', () => {
    expect(intentContextFromSettings('syllabus', settings(['生理学']), course).project).toEqual({
      courseName: '人体生理学', topic: '第八章 呼吸系统', audience: '临床医学本科生', hours: '4 学时', major: '临床医学'
    })
    expect(intentContextFromSettings('ppt-gen', settings([], false), course).project).toEqual({ topic: '第八章 呼吸系统', audience: '临床医学本科生' })
  })

  it('writes the project’s key points as one prompt block, leaving empty ones out', () => {
    expect(projectPromptBlock({ name: '人体生理学 · 第八章', type: 'teaching', brief: { ...course.brief, goals: '掌握\n肺通气' } }).split('\n')).toEqual([
      '## 课程项目要点（人体生理学 · 第八章，生成时必须遵循，术语按其中的写法统一）',
      '- 课程：人体生理学',
      '- 章节：第八章 呼吸系统',
      '- 授课对象：临床医学本科生',
      '- 教学目标：掌握；肺通气',
      '- 术语表：肺通气'
    ])
    expect(projectPromptBlock({ name: '空', type: 'research', brief: {} })).toBe('')
  })
})
