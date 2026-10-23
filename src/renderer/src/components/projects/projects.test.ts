import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { TeacherProjectSettingsV1 } from '@shared/app-settings'
import { projectNextSteps } from '../../lib/active-project'
import { useWriteWorkspaceStore } from '../../write/write-workspace-store'
import { ProjectsPage, teacherProjectsOf } from './ProjectsPage'

function project(extra: Partial<TeacherProjectSettingsV1>): TeacherProjectSettingsV1 {
  return { id: 'p', name: '项目', type: 'teaching', lastUsedAt: '2026-10-20T00:00:00.000Z', origin: 'teacher', brief: {}, ...extra }
}

describe('projects', () => {
  it('lists only the teacher’s own, unarchived projects of one type, latest first', () => {
    const projects = [
      project({ id: 'old', lastUsedAt: '2026-10-01T00:00:00.000Z' }),
      project({ id: 'new', lastUsedAt: '2026-10-22T00:00:00.000Z' }),
      project({ id: 'archived', archived: true }),
      project({ id: 'topic', type: 'research' }),
      project({ id: 'conversation', origin: 'conversation' })
    ]

    expect(teacherProjectsOf(projects, 'teaching').map((item) => item.id)).toEqual(['new', 'old'])
    expect(teacherProjectsOf(projects, 'research').map((item) => item.id)).toEqual(['topic'])
  })

  it('suggests what a course still lacks, with the request written from its key points', () => {
    const course = project({ brief: { courseName: '生理学', chapter: '第八章 呼吸系统', hours: '2 学时', audience: '本科生' } })

    expect(projectNextSteps(course, [])).toEqual([
      { id: 'lesson-plan', label: '写这一章的教案', request: { moduleId: 'syllabus', label: '教案' }, text: '帮我写生理学 第八章 呼吸系统的教案，2 学时，本科生' },
      { id: 'courseware', label: '做配套课件', request: { moduleId: 'ppt-gen', label: '课件' }, text: '做一套生理学 第八章 呼吸系统的课件' },
      { id: 'quiz', label: '出随堂题', request: { moduleId: 'quiz', label: '随堂题' }, text: '出生理学 第八章 呼吸系统的 10 道随堂题' }
    ])
    expect(projectNextSteps(course, [{ kind: 'lesson-plan' }, { kind: 'courseware' }]).map((step) => step.id)).toEqual(['quiz', 'textbook'])
  })

  it('points a grant topic to a grant application', () => {
    const topic = project({ type: 'research', brief: { title: 'TLS 与免疫治疗', target: '国自然面上项目' } })

    const steps = projectNextSteps(topic, [{ kind: 'literature-report' }])
    expect(steps.map((step) => step.label)).toEqual(['起草基金申请书', '分析实验数据'])
    expect(steps[0].request).toEqual({ moduleId: 'write', template: 'grant', label: '文稿 · 国自然' })
  })

  it('opens on the list with a way to create a project and the 未归档 results', () => {
    const initial = useWriteWorkspaceStore.getInitialState()
    const previous = initial.workspaceRoot
    initial.workspaceRoot = '/write'
    try {
      const html = renderToStaticMarkup(createElement(ProjectsPage, { type: 'teaching', onOpenArtifact: vi.fn(), onOpenTool: vi.fn() }))
      expect(html).toContain('我的课程')
      expect(html).toContain('新建课程')
      expect(html).toContain('未归档的成果')
      expect(html).toContain('登记写作空间里已有的文稿和课件')
    } finally {
      initial.workspaceRoot = previous
    }
  })
})
