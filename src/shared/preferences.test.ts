import { describe, expect, it } from 'vitest'
import { normalizeAppSettings } from './app-settings-normalize'
import { generationContextBlock } from './generation-context'
import { applicablePreferences, normalizeTeacherPreferences, preferencePromptBlock, type TeacherPreferenceV1 } from './preferences'

const T = '2026-10-23T08:00:00.000Z'
const preferences: TeacherPreferenceV1[] = [
  { id: 'g', text: '中文标点用全角', scope: 'global', source: 'explicit', createdAt: T },
  { id: 'c', text: '课件每页不超过 5 行', scope: 'tool', toolId: 'ppt-gen', source: 'suggested', createdAt: T },
  { id: 'p', text: '病例都用呼吸科的', scope: 'project', projectId: 'course-1', source: 'explicit', createdAt: T }
]

describe('teacher preferences', () => {
  it('keeps well-formed habits and drops scoped ones without their tool or project', () => {
    expect(normalizeTeacherPreferences([
      ...preferences,
      { id: 'x', text: '无工具', scope: 'tool', source: 'explicit', createdAt: T },
      { id: 'y', text: '', scope: 'global', source: 'explicit', createdAt: T },
      'nonsense'
    ])).toEqual(preferences)
    expect(normalizeTeacherPreferences(undefined)).toEqual([])
  })

  it('applies global habits everywhere, tool habits to their tool and project habits inside their project', () => {
    expect(applicablePreferences(preferences, 'ppt-gen').map((item) => item.id)).toEqual(['g', 'c'])
    expect(applicablePreferences(preferences, 'syllabus', 'course-1').map((item) => item.id)).toEqual(['g', 'p'])
    expect(preferencePromptBlock(preferences, 'syllabus').split('\n')).toEqual([
      '## 老师的习惯（除非本次要求另有说明，都要遵守）',
      '- 中文标点用全角'
    ])
    expect(preferencePromptBlock([], 'syllabus')).toBe('')
  })

  it('goes into generation together with the project key points', () => {
    const block = generationContextBlock({
      teacherProjects: [{ id: 'course-1', name: '生理学', type: 'teaching', lastUsedAt: '', origin: 'teacher', brief: { courseName: '生理学' } }],
      preferences
    }, 'syllabus', 'course-1')

    expect(block).toContain('## 课程项目要点（生理学')
    expect(block).toContain('- 病例都用呼吸科的')
    expect(block.indexOf('项目要点')).toBeLessThan(block.indexOf('老师的习惯'))
  })

  it('survives saving and loading settings, and older settings start with none', () => {
    expect(normalizeAppSettings({ preferences } as never).preferences).toEqual(preferences)
    expect(normalizeAppSettings({} as never).preferences).toEqual([])
  })
})
