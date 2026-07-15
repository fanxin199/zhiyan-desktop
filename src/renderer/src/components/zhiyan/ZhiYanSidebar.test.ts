import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { ZhiYanSidebar } from './ZhiYanSidebar'

describe('ZhiYanSidebar direct teacher task entries', () => {
  it('keeps teaching, research, and capability groups with every direct entry visible', () => {
    const noop = vi.fn()
    const html = renderToStaticMarkup(createElement(ZhiYanSidebar, {
      activeRoute: 'dashboard',
      onOpenDashboard: noop,
      onOpenSyllabus: noop,
      onOpenPptGen: noop,
      onOpenPaperPolish: noop,
      onOpenLiterature: noop,
      onOpenReviewWriting: noop,
      onOpenGrantWriting: noop,
      onOpenTextbook: noop,
      onOpenBioinformatics: noop,
      onOpenWrite: noop,
      onOpenFileManager: noop,
      onOpenSettings: noop,
      onOpenChat: noop,
      onToggleSidebar: noop
    }))

    for (const group of ['教学', '科研', '能力中心']) expect(html).toContain(group)
    for (const entry of [
      '智能教案',
      '课件 PPT',
      '教材编写',
      '文本写作',
      '文献阅读',
      '综述撰写',
      '自然基金撰写',
      '科研数据分析',
      '自由写作台',
      'AI 对话',
      '文件管理'
    ]) {
      expect(html).toContain(entry)
    }
  })
})
