import { createElement, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { CoursewarePage } from './CoursewarePage'
import { FileManagerWorkspacePage } from './FileManagerWorkspacePage'
import { PageHeader } from './PageHeader'
import { TextbookWorkbenchPage } from './TextbookWorkbenchPage'
import { LessonPlanPage } from '../lesson-plan/LessonPlanPage'
import { useWriteWorkspaceStore } from '../../write/write-workspace-store'
import {
  BioinformaticsPage,
  LiteraturePage
} from './ZhiYanModulePages'
import { getZhiYanSectionModule, type ZhiYanSectionModuleId } from './zhiyan-module-registry'

// PageColumn renders `mx-auto w-full px-8 max-w-[Npx]`, so its content is N minus two 32px gutters.
function pageContentWidths(html: string): number[] {
  return [...html.matchAll(/mx-auto w-full px-8 max-w-\[(\d+)px\]/g)].map((match) => Number(match[1]) - 64)
}

function registryIcon(module: ZhiYanSectionModuleId): string {
  return renderToStaticMarkup(createElement(getZhiYanSectionModule(module).icon, { className: 'h-5 w-5', strokeWidth: 1.8 }))
}

describe('PageHeader', () => {
  it('shows the registry icon in its section tone, the title, one description and the actions', () => {
    const html = renderToStaticMarkup(createElement(PageHeader, {
      module: 'textbook',
      title: '教材编写工作台',
      description: '当前阶段：大纲设计',
      actions: createElement('button', { type: 'button' }, '打开项目')
    }))

    expect(html).toContain('bg-ds-domain-teaching-soft text-ds-domain-teaching')
    expect(html).toContain(registryIcon('textbook'))
    expect(html).toContain('教材编写工作台</h1>')
    expect(html).toContain('当前阶段：大纲设计</p>')
    expect(html).toContain('<button type="button">打开项目</button>')
  })

  it('leaves out the description and action slots when a page has none', () => {
    const html = renderToStaticMarkup(createElement(PageHeader, { module: 'file-manager', title: '文件管理' }))

    expect(html).toContain('bg-ds-subtle text-ds-muted')
    expect(html).not.toMatch(/<p[\s>]/)
    expect(html.match(/<div/g)).toHaveLength(2)
  })
})

describe('tool pages', () => {
  const pages: Array<[ZhiYanSectionModuleId, ReactElement, number]> = [
    ['syllabus', createElement(LessonPlanPage), 720],
    ['literature', createElement(LiteraturePage, { onStartChat: vi.fn() }), 720],
    ['bioinformatics', createElement(BioinformaticsPage, { onStartChat: vi.fn() }), 720],
    ['ppt-gen', createElement(CoursewarePage), 720],
    ['textbook', createElement(TextbookWorkbenchPage), 720],
    ['file-manager', createElement(FileManagerWorkspacePage, { onStartChat: vi.fn() }), 1152]
  ]

  it.each(pages)('renders the %s page with the registry icon in one shared header and one content width', (module, page, width) => {
    // 教案 starts once a writing space is chosen.
    const initial = useWriteWorkspaceStore.getInitialState()
    const previous = initial.workspaceRoot
    initial.workspaceRoot = '/write'
    const html = renderToStaticMarkup(page)
    initial.workspaceRoot = previous
    const header = html.match(/<header[\s\S]*?<\/header>/)?.[0] ?? ''

    expect(html.match(/<h1/g)).toHaveLength(1)
    expect(header).toContain('<h1')
    expect(header).toContain(registryIcon(module))
    expect(new Set(pageContentWidths(html))).toEqual(new Set([width]))
    expect(html).not.toMatch(/\bmax-w-(?:[2-7]xl|screen-\w+)\b/)
  })
})
