import { describe, expect, it } from 'vitest'
import type { AppSettingsV1 } from '@shared/app-settings'
import {
  buildImportedWritingBlueprintText,
  coursewareDefaultsFromSettings,
  moduleProjectNameFromDisplayText
} from './module-context'

describe('module context helpers', () => {
  it('uses the teacher-facing task segment as the module project name', () => {
    expect(moduleProjectNameFromDisplayText('科研文本写作 · 建立写作蓝图', 'fallback')).toBe('建立写作蓝图')
    expect(moduleProjectNameFromDisplayText('智能教案生成：B cells', 'fallback')).toBe('智能教案生成：B cells')
  })

  it('converts recent syllabus context into courseware defaults', () => {
    const settings = {
      moduleContext: {
        projects: {
          'project-1': {
            syllabus: {
              courseName: '医学免疫学',
              topic: 'B 细胞免疫应答',
              hours: '2',
              students: '本科二年级',
              major: '临床医学',
              updatedAt: '2026-06-29T00:00:00.000Z'
            }
          }
        },
        recent: {
          syllabusProjectId: 'project-1'
        }
      }
    } as Pick<AppSettingsV1, 'moduleContext'>

    expect(coursewareDefaultsFromSettings(settings)).toEqual({
      topic: 'B 细胞免疫应答',
      durationMinutes: 90,
      audience: 'undergraduate',
      focus: '课程：医学免疫学\n主题：B 细胞免疫应答\n专业：临床医学\n对象：本科二年级'
    })
  })

  it('builds review-writing import text from a saved writing blueprint', () => {
    const text = buildImportedWritingBlueprintText({
      sourceModule: 'paper-polish',
      taskLabel: '建立写作蓝图',
      userInput: '围绕 TLS 中 B 细胞亚群建立论文主线。',
      fileNames: ['paper.pdf'],
      displayText: '科研文本写作 · 建立写作蓝图',
      updatedAt: '2026-06-29T00:00:00.000Z'
    })

    expect(text).toContain('转化为本次综述撰写蓝图')
    expect(text).toContain('围绕 TLS 中 B 细胞亚群建立论文主线。')
    expect(text).toContain('paper.pdf')
    expect(text).toContain('证据矩阵')
  })
})
