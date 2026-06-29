import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { SettingsSidebar } from './SettingsSidebar'

const labels: Record<string, string> = {
  back: '返回',
  general: '通用',
  write: '写作',
  settingsFooter: '设置'
}

describe('SettingsSidebar', () => {
  it('shows a teacher information hint under general settings without adding a new tab', () => {
    const html = renderToStaticMarkup(createElement(SettingsSidebar, {
      category: 'general',
      goBack: vi.fn(),
      setCategory: vi.fn(),
      t: (key: string) => labels[key] ?? key
    }))

    expect(html).toContain('通用设置中可修改教师信息')
    expect((html.match(/<button/g) ?? [])).toHaveLength(4)
  })
})
