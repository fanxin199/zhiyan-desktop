import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { ZhiYanSidebar } from './ZhiYanSidebar'

describe('ZhiYanSidebar', () => {
  it('shows 首页, 我的课程, 我的课题 and 文件库, with AI 助手 and 设置 at the bottom', () => {
    const noop = vi.fn()
    const html = renderToStaticMarkup(createElement(ZhiYanSidebar, {
      activeRoute: 'dashboard',
      onOpenModule: noop,
      onOpenSettings: noop,
      onToggleSidebar: noop,
      onOpenAssistant: noop
    }))
    const labels = [...html.matchAll(/<span[^>]*>([^<]+)<\/span>/gu)].map((match) => match[1])

    for (const entry of ['首页', '我的课程', '我的课题', '文件库', 'AI 助手']) expect(labels).toContain(entry)
    expect(labels.indexOf('首页')).toBeLessThan(labels.indexOf('我的课程'))
    expect(labels.indexOf('我的课题')).toBeLessThan(labels.indexOf('文件库'))
    // Tools are reached from 首页 and the project pages; groups have no headings any more.
    for (const entry of ['教案', '课件', '教材', '文稿', '文献', '数据分析', '教学', '科研', 'AI 对话']) {
      expect(labels).not.toContain(entry)
    }
    // No gap between 首页 and the projects.
    expect(html).not.toContain('class="mt-4"')
  })
})
