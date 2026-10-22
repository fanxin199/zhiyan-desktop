import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { ZhiYanSidebar } from './ZhiYanSidebar'

describe('ZhiYanSidebar direct teacher task entries', () => {
  it('keeps teaching, research, and capability groups with one writing entry', () => {
    const noop = vi.fn()
    const html = renderToStaticMarkup(createElement(ZhiYanSidebar, {
      activeRoute: 'dashboard',
      onOpenModule: noop,
      onOpenSettings: noop,
      onToggleSidebar: noop
    }))

    for (const group of ['教学', '科研', '能力中心']) expect(html).toContain(group)
    for (const entry of [
      '智能教案',
      '课件 PPT',
      '教材编写',
      '文稿',
      '文献阅读',
      '科研数据分析',
      'AI 对话',
      '文件管理'
    ]) {
      expect(html).toContain(entry)
    }
    // Paper, review and grant writing are templates of 文稿 now.
    for (const entry of ['文本写作', '综述撰写', '自然基金撰写', '自由写作台']) {
      expect(html).not.toContain(entry)
    }
  })
})
