import { createElement, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { BookOpen } from 'lucide-react'
import { describe, expect, it, vi } from 'vitest'
import { CoursewarePage } from './CoursewarePage'
import { FileManagerWorkspacePage } from './FileManagerWorkspacePage'
import { PageHeader } from './PageHeader'
import { TextbookWorkbenchPage } from './TextbookWorkbenchPage'
import { BioinformaticsPage, PaperPolishPage, SyllabusPage } from './ZhiYanModulePages'

// PageColumn renders `mx-auto w-full px-8 max-w-[Npx]`, so its content is N minus two 32px gutters.
function pageContentWidths(html: string): number[] {
  return [...html.matchAll(/mx-auto w-full px-8 max-w-\[(\d+)px\]/g)].map((match) => Number(match[1]) - 64)
}

describe('PageHeader', () => {
  it('shows the section icon tile, the title, one description and the actions', () => {
    const html = renderToStaticMarkup(createElement(PageHeader, {
      icon: BookOpen,
      tone: 'teaching',
      title: '教材编写工作台',
      description: '当前阶段：大纲设计',
      actions: createElement('button', { type: 'button' }, '打开项目')
    }))

    expect(html).toContain('bg-ds-domain-teaching-soft text-ds-domain-teaching')
    expect(html).toContain('教材编写工作台</h1>')
    expect(html).toContain('当前阶段：大纲设计</p>')
    expect(html).toContain('<button type="button">打开项目</button>')
  })

  it('leaves out the description and action slots when a page has none', () => {
    const html = renderToStaticMarkup(createElement(PageHeader, { icon: BookOpen, tone: 'capabilities', title: '文件管理' }))

    expect(html).toContain('bg-ds-subtle text-ds-muted')
    expect(html).not.toMatch(/<p[\s>]/)
    expect(html.match(/<div/g)).toHaveLength(2)
  })
})

describe('tool pages', () => {
  const pages: Array<[string, ReactElement, number]> = [
    ['lesson plan', createElement(SyllabusPage, { onStartChat: vi.fn() }), 720],
    ['writing', createElement(PaperPolishPage, { onStartChat: vi.fn() }), 720],
    ['data analysis', createElement(BioinformaticsPage, { onStartChat: vi.fn() }), 720],
    ['courseware', createElement(CoursewarePage), 1152],
    ['textbook', createElement(TextbookWorkbenchPage), 1152],
    ['file manager', createElement(FileManagerWorkspacePage, { onStartChat: vi.fn() }), 1152]
  ]

  it.each(pages)('renders the %s page with one shared header and one content width', (_name, page, width) => {
    const html = renderToStaticMarkup(page)
    const header = html.match(/<header[\s\S]*?<\/header>/)?.[0] ?? ''

    expect(html.match(/<h1/g)).toHaveLength(1)
    expect(header).toContain('<h1')
    expect(new Set(pageContentWidths(html))).toEqual(new Set([width]))
    expect(html).not.toMatch(/\bmax-w-(?:[2-7]xl|screen-\w+)\b/)
  })
})
