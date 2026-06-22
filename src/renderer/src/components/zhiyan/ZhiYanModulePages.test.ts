import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import {
  BioinformaticsPage,
  buildResearchTaskPrompt,
  GrantWritingPage,
  GRANT_CONFIG,
  LiteraturePage,
  PaperPolishPage,
  ReviewWritingPage,
  BIOINFORMATICS_CONFIG
} from './ZhiYanModulePages'

const noop = vi.fn()

describe('ZhiYanModulePages research task entries', () => {
  it('renders task input entries for all research modules', () => {
    const pages = [
      renderToStaticMarkup(createElement(PaperPolishPage, { onStartChat: noop })),
      renderToStaticMarkup(createElement(LiteraturePage, { onStartChat: noop })),
      renderToStaticMarkup(createElement(ReviewWritingPage, { onStartChat: noop })),
      renderToStaticMarkup(createElement(GrantWritingPage, { onStartChat: noop })),
      renderToStaticMarkup(createElement(BioinformaticsPage, { onStartChat: noop }))
    ]

    for (const html of pages) {
      expect(html).toContain('选择任务类型')
      expect(html).toContain('添加本地文件')
      expect(html).toContain('可点选示例填入上方输入框')
      expect(html).toContain('核心功能特点')
    }

    expect(pages[0]).toContain('发送写作任务')
    expect(pages[1]).toContain('发送文献任务')
    expect(pages[2]).toContain('发送综述任务')
    expect(pages[3]).toContain('发送基金任务')
    expect(pages[4]).toContain('发送分析任务')
  })

  it('renders write workbench entry only for writing-oriented research modules', () => {
    const paper = renderToStaticMarkup(createElement(PaperPolishPage, {
      onStartChat: noop,
      onOpenWrite: noop
    }))
    const literature = renderToStaticMarkup(createElement(LiteraturePage, {
      onStartChat: noop,
      onOpenWrite: noop
    }))
    const review = renderToStaticMarkup(createElement(ReviewWritingPage, {
      onStartChat: noop,
      onOpenWrite: noop
    }))
    const grant = renderToStaticMarkup(createElement(GrantWritingPage, {
      onStartChat: noop,
      onOpenWrite: noop
    }))
    const bioinformatics = renderToStaticMarkup(createElement(BioinformaticsPage, {
      onStartChat: noop,
      onOpenWrite: noop
    }))

    expect(paper).toContain('打开写作工作台')
    expect(review).toContain('打开写作工作台')
    expect(grant).toContain('打开写作工作台')
    expect(literature).not.toContain('打开写作工作台')
    expect(bioinformatics).not.toContain('打开写作工作台')
  })
})

describe('buildResearchTaskPrompt', () => {
  it('returns null when user input and files are both empty', () => {
    const task = GRANT_CONFIG.taskEntry!.taskTypes[0]
    expect(buildResearchTaskPrompt(GRANT_CONFIG, task, '  ', [])).toBeNull()
  })

  it('includes task type and selected file paths', () => {
    const task = GRANT_CONFIG.taskEntry!.taskTypes[0]
    const prompt = buildResearchTaskPrompt(GRANT_CONFIG, task, '请建立项目主线', [{
      name: 'grant.md',
      path: 'D:\\project\\grant.md'
    }])

    expect(prompt).toContain('项目 Blueprint')
    expect(prompt).toContain('grant.md：D:\\project\\grant.md')
    expect(prompt).toContain('请建立项目主线')
  })

  it('keeps grant-writing evidence and fabrication constraints', () => {
    const task = GRANT_CONFIG.taskEntry!.taskTypes[1]
    const prompt = buildResearchTaskPrompt(GRANT_CONFIG, task, '请修改立项依据', [])

    expect(prompt).toContain('不编造实验结果')
    expect(prompt).toContain('PMID/DOI')
    expect(prompt).toContain('空泛表述')
  })

  it('keeps downstream data analysis QC and interpretation constraints', () => {
    const task = BIOINFORMATICS_CONFIG.taskEntry!.taskTypes[0]
    const prompt = buildResearchTaskPrompt(BIOINFORMATICS_CONFIG, task, '分析差异结果表', [])

    expect(prompt).toContain('先检查数据格式、列名、样本分组、阈值')
    expect(prompt).toContain('转录特征不能直接等同功能结论')
    expect(prompt).toContain('不从原始 FASTQ 开始')
  })
})
