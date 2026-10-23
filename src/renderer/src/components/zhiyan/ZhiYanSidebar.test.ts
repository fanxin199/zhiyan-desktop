import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { ZhiYanSidebar } from './ZhiYanSidebar'

describe('ZhiYanSidebar direct teacher task entries', () => {
  it('shows the seven tools under 教学 and 科研, with AI 助手 and 设置 at the bottom', () => {
    const noop = vi.fn()
    const html = renderToStaticMarkup(createElement(ZhiYanSidebar, {
      activeRoute: 'dashboard',
      onOpenModule: noop,
      onOpenSettings: noop,
      onToggleSidebar: noop,
      onOpenAssistant: noop
    }))
    const labels = [...html.matchAll(/<span[^>]*>([^<]+)<\/span>/gu)].map((match) => match[1])

    for (const group of ['教学', '科研']) expect(html).toContain(group)
    expect(html).not.toContain('能力中心')
    for (const entry of ['首页', '教案', '课件', '教材', '文稿', '文献', '数据分析', '文件库', 'AI 助手']) {
      expect(labels).toContain(entry)
    }
    // The AI 对话 page became the AI 助手 panel; paper, review and grant writing are templates of 文稿.
    for (const entry of ['AI 对话', '智能教案', '文件管理', '文本写作', '综述撰写', '自然基金撰写', '自由写作台']) {
      expect(html).not.toContain(entry)
    }
    expect(html.indexOf('文件库')).toBeLessThan(html.indexOf('AI 助手'))
  })
})
