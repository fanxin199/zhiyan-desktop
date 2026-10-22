import { describe, expect, it } from 'vitest'
import { teacherLabel } from './teacher-label'

describe('teacherLabel', () => {
  it('addresses a teacher by name and falls back to 老师', () => {
    expect(teacherLabel({ name: '张三' })).toBe('张三老师')
    expect(teacherLabel({ name: '李教授' })).toBe('李教授')
    expect(teacherLabel({ name: '  ' })).toBe('老师')
    expect(teacherLabel(undefined)).toBe('老师')
  })
})
