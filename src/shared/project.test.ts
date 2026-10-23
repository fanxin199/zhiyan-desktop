import { describe, expect, it } from 'vitest'
import { normalizeTeacherProjectSettings } from './app-settings-normalize'
import { projectDisplayName, projectFolderName } from './project'

describe('course and research projects', () => {
  it('keeps the key points of a project the teacher made, and only its known fields', () => {
    const [course, conversation] = normalizeTeacherProjectSettings([
      {
        id: 'course-1', name: '生理学 · 第八章', type: 'teaching', lastUsedAt: '2026-10-23T00:00:00.000Z',
        origin: 'teacher', directory: ' J:\\work\\课程\\生理学 ', archived: true,
        brief: { courseName: ' 生理学 ', chapter: '第八章 呼吸系统', unknown: 'x', hours: '' } as Record<string, string>
      },
      { id: 'conv-1', name: '移植免疫', type: 'teaching', lastUsedAt: '', brief: { courseName: '免疫学' } }
    ])

    expect(course).toEqual({
      id: 'course-1', name: '生理学 · 第八章', type: 'teaching', lastUsedAt: '2026-10-23T00:00:00.000Z',
      origin: 'teacher', directory: 'J:\\work\\课程\\生理学', archived: true,
      brief: { courseName: '生理学', chapter: '第八章 呼吸系统' }
    })
    // Conversation entries never carry key points.
    expect(conversation).toEqual({ id: 'conv-1', name: '移植免疫', type: 'teaching', lastUsedAt: '', origin: 'conversation' })
  })

  it('names folders safely and shows course projects as course · chapter', () => {
    expect(projectFolderName('生理学: 第八章/呼吸?')).toBe('生理学 第八章 呼吸')
    expect(projectFolderName('  ')).toBe('未命名项目')
    expect(projectDisplayName('teaching', { courseName: '生理学', chapter: '第八章 呼吸系统' })).toBe('生理学 · 第八章 呼吸系统')
    expect(projectDisplayName('research', { title: 'TLS 与免疫治疗' })).toBe('TLS 与免疫治疗')
    expect(projectDisplayName('research', {}, '未命名课题')).toBe('未命名课题')
  })
})
