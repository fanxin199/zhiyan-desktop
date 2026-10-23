import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { TeacherPreferenceV1 } from '@shared/preferences'
import type { BrowserStorageLike } from '../../lib/browser-storage'
import { PreferencesSettingsSection, preferenceScopeLabel } from '../settings-section-preferences'
import { habitFromInstruction, rememberInstruction } from './RememberHabitOffer'

function memoryStorage(): BrowserStorageLike {
  const items = new Map<string, string>()
  return { getItem: (key) => items.get(key) ?? null, setItem: (key, value) => void items.set(key, value) }
}

const T = '2026-10-23T08:00:00.000Z'

describe('noticing habits (Task 3.3.2)', () => {
  it('takes “以后都…/一律…” as a habit stated by the teacher', () => {
    expect(habitFromInstruction('以后都每页不超过 5 行', [])).toEqual({ text: '每页不超过 5 行', source: 'explicit' })
    expect(habitFromInstruction('请一律用中文标点', [])).toEqual({ text: '用中文标点', source: 'explicit' })
    expect(habitFromInstruction('导入改成病例', [])).toBeNull()
    expect(habitFromInstruction('以后', [])).toBeNull()
  })

  it('suggests a habit when the same change was asked for before with the tool', () => {
    const storage = memoryStorage()
    const first = rememberInstruction('ppt-gen', '每页文字不超过5行', storage)
    const second = rememberInstruction('ppt-gen', '每页文字不超过 5 行。', storage)

    expect(habitFromInstruction('每页文字不超过5行', first)).toBeNull()
    expect(habitFromInstruction('每页文字不超过 5 行。', second)).toEqual({ text: '每页文字不超过 5 行。', source: 'suggested' })
    // Another tool's requests do not count.
    expect(rememberInstruction('syllabus', '每页文字不超过5行', storage)).toEqual([])
  })
})

describe('我的偏好', () => {
  const preferences: TeacherPreferenceV1[] = [
    { id: 'a', text: '中文标点用全角', scope: 'global', source: 'explicit', createdAt: T },
    { id: 'b', text: '课件每页不超过 5 行', scope: 'tool', toolId: 'ppt-gen', source: 'suggested', createdAt: T },
    { id: 'c', text: '病例用呼吸科的', scope: 'project', projectId: 'course-1', source: 'explicit', createdAt: T }
  ]
  const projects = [{ id: 'course-1', name: '生理学 · 第八章', type: 'teaching' as const, lastUsedAt: '', origin: 'teacher' as const }]

  it('says where each habit applies', () => {
    expect(preferences.map((preference) => preferenceScopeLabel(preference, projects))).toEqual(['全部工具', '课件', '课程 · 生理学 · 第八章'])
    expect(preferenceScopeLabel(preferences[2], [])).toBe('已删除的项目')
  })

  it('lists the habits with a way to add, mark suggested ones and delete', () => {
    const html = renderToStaticMarkup(createElement(PreferencesSettingsSection, { form: { preferences, teacherProjects: projects }, update: vi.fn() }))

    expect(html).toContain('我的偏好')
    expect(html).toContain('课件每页不超过 5 行')
    expect(html).toContain('发现的')
    expect(html).toContain('删除“病例用呼吸科的”')
    expect(renderToStaticMarkup(createElement(PreferencesSettingsSection, { form: { preferences: [], teacherProjects: [] }, update: vi.fn() })))
      .toContain('还没有记住的习惯')
  })
})
