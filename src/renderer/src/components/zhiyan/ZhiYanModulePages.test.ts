import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import JSZip from 'jszip'
import {
  BioinformaticsPage,
  buildResearchTaskDisplayText,
  buildResearchTaskPrompt,
  buildSyllabusTaskDisplayText,
  extractResearchTaskFileText,
  GrantWritingPage,
  GRANT_CONFIG,
  LITERATURE_CONFIG,
  LiteraturePage,
  loadSyllabusTeacherProfileDefaults,
  buildSyllabusIdentityPromptSections,
  PAPER_CONFIG,
  PaperPolishPage,
  REVIEW_CONFIG,
  ReviewWritingPage,
  SyllabusPage,
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

  it('renders local conversation slots for research writing tasks when active', () => {
    const pages = [
      renderToStaticMarkup(createElement(PaperPolishPage, {
        onStartChat: noop,
        showInlineConversation: true,
        inlineConversation: createElement('div', null, '文本写作对话')
      })),
      renderToStaticMarkup(createElement(ReviewWritingPage, {
        onStartChat: noop,
        showInlineConversation: true,
        inlineConversation: createElement('div', null, '综述撰写对话')
      })),
      renderToStaticMarkup(createElement(GrantWritingPage, {
        onStartChat: noop,
        showInlineConversation: true,
        inlineConversation: createElement('div', null, '自然基金撰写对话')
      })),
      renderToStaticMarkup(createElement(BioinformaticsPage, {
        onStartChat: noop,
        showInlineConversation: true,
        inlineConversation: createElement('div', null, '科研数据分析对话')
      }))
    ]

    expect(pages[0]).toContain('文本写作对话')
    expect(pages[1]).toContain('综述撰写对话')
    expect(pages[2]).toContain('自然基金撰写对话')
    expect(pages[3]).toContain('科研数据分析对话')
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

    expect(prompt).toContain('项目蓝图')
    expect(prompt).toContain('grant.md：D:\\project\\grant.md')
    expect(prompt).toContain('请建立项目主线')
  })

  it('appends project context to research task prompts when provided', () => {
    const task = LITERATURE_CONFIG.taskEntry!.taskTypes[0]
    const prompt = buildResearchTaskPrompt(LITERATURE_CONFIG, task, '请精读这篇论文', [], {
      name: 'TLS 文献精读',
      type: 'research',
      summary: '文献阅读 · 单篇 PDF 精读'
    })

    expect(prompt).toContain('## 当前项目上下文')
    expect(prompt).toContain('项目名称：TLS 文献精读')
    expect(prompt).toContain('项目类型：科研')
    expect(prompt).toContain('项目摘要：文献阅读 · 单篇 PDF 精读')
    expect(prompt).toContain('如果当前任务与该项目主题明显不一致，先询问老师是否切换项目或新建任务。')
  })

  it('embeds extracted PDF text in the task prompt instead of only passing a local path', () => {
    const task = LITERATURE_CONFIG.taskEntry!.taskTypes[0]
    const files = [{
      name: 'paper.pdf',
      path: 'D:\\papers\\paper.pdf',
      extractedText: 'Results: B cells form tertiary lymphoid structures.'
    }] as unknown as Array<{ name: string; path: string }>

    const prompt = buildResearchTaskPrompt(LITERATURE_CONFIG, task, '请精读这篇论文', files)

    expect(prompt).toContain('Results: B cells form tertiary lymphoid structures.')
  })

  it('keeps the research task display text concise when source files are attached', () => {
    const task = LITERATURE_CONFIG.taskEntry!.taskTypes[0]
    const displayText = buildResearchTaskDisplayText(LITERATURE_CONFIG, task, [{
      name: 'paper.pdf',
      path: 'D:\\papers\\paper.pdf',
      extractedText: 'Long source text that must not be shown in the conversation.'
    }])

    expect(displayText).toBe('文献阅读 · 单篇 PDF 精读：paper.pdf')
    expect(displayText).not.toContain('Long source text')
  })

  it('uses conditional project inspiration and does not require external verification for uploaded papers', () => {
    const task = LITERATURE_CONFIG.taskEntry!.taskTypes[0]
    const prompt = buildResearchTaskPrompt(LITERATURE_CONFIG, task, '请精读这篇论文', [])

    expect(prompt).toContain('仅当用户明确说明自己的课题或研究方向时')
    expect(prompt).toContain('无需逐条联网核实参考文献、PMID、DOI')
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

  it('uses teacher-facing Chinese labels for writing blueprints and data analysis', () => {
    expect(PAPER_CONFIG.taskEntry!.taskTypes[0].label).toBe('建立写作蓝图')
    expect(REVIEW_CONFIG.taskEntry!.taskTypes[0].label).toBe('综述蓝图')
    expect(GRANT_CONFIG.taskEntry!.taskTypes[0].label).toBe('项目蓝图')
    expect(BIOINFORMATICS_CONFIG.title).toBe('科研数据分析')
  })
})

describe('SyllabusPage task handoff', () => {
  it('loads teacher profile defaults for lesson-plan identity fields', async () => {
    const getSettings = vi.fn(async () => ({
      teacherProfile: {
        name: '李老师',
        school: '某某医科大学',
        department: '基础医学院免疫学系',
        courses: ['医学免疫学'],
        researchTopics: ['B 细胞亚群']
      }
    }))
    vi.stubGlobal('window', { dsGui: { getSettings } })

    await expect(loadSyllabusTeacherProfileDefaults()).resolves.toEqual({
      teacher: '李老师',
      school: '某某医科大学',
      department: '基础医学院免疫学系'
    })
    expect(getSettings).toHaveBeenCalledTimes(1)
  })

  it('injects resolved teacher identity values into the lesson-plan prompt sections', () => {
    const sections = buildSyllabusIdentityPromptSections({
      teacher: '李老师',
      school: '某某医科大学',
      department: '基础医学院免疫学系'
    })

    const promptText = [
      ...sections.basicInfoLines,
      ...sections.writingInstructionLines
    ].join('\n')

    expect(promptText).toContain('某某医科大学')
    expect(promptText).toContain('基础医学院免疫学系')
    expect(promptText).toContain('李老师')
    expect(promptText).not.toContain('用户未填写')
    expect(promptText).not.toContain('留空')
  })

  it('renders an inline conversation slot when a lesson-plan task is active', () => {
    const html = renderToStaticMarkup(createElement(SyllabusPage, {
      onStartChat: noop,
      showInlineConversation: true,
      inlineConversation: createElement('div', null, '教案生成对话')
    }))

    expect(html).toContain('教案生成对话')
  })

  it('keeps the lesson-plan task display text free of source content and templates', () => {
    const displayText = buildSyllabusTaskDisplayText({
      courseName: '医学免疫学',
      topic: '移植免疫',
      fileName: 'chapter.pdf'
    })

    expect(displayText).toBe('智能教案生成：移植免疫')
    expect(displayText).not.toContain('chapter.pdf')
    expect(displayText).not.toContain('教案模板')
  })
})

describe('research task file extraction', () => {
  it('reads plain text files into research task context', async () => {
    await expect(extractResearchTaskFileText({
      name: 'notes.md',
      dataBase64: 'IyBCIGNlbGwgcmVzdWx0cw=='
    })).resolves.toMatchObject({ kind: 'text', text: '# B cell results' })
  })

  it('reads DOCX paragraph text into research task context', async () => {
    const archive = new JSZip()
    archive.file('word/document.xml', [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>',
      '<w:p><w:r><w:t>TLS recruit B cells</w:t></w:r></w:p>',
      '<w:p><w:r><w:t>into tumor tissue</w:t></w:r></w:p>',
      '</w:body></w:document>'
    ].join(''))
    await expect(extractResearchTaskFileText({
      name: 'manuscript.docx',
      dataBase64: await archive.generateAsync({ type: 'base64' })
    })).resolves.toMatchObject({
      kind: 'docx',
      text: expect.stringContaining('TLS recruit B cells\ninto tumor tissue')
    })
  })

  it('reads XLSX cells into research task context', async () => {
    const archive = new JSZip()
    archive.file('xl/sharedStrings.xml', [
      '<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
      '<si><t>gene</t></si><si><t>count</t></si><si><t>MS4A1</t></si>',
      '</sst>'
    ].join(''))
    archive.file('xl/worksheets/sheet1.xml', [
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>',
      '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>',
      '<row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2"><v>42</v></c></row>',
      '</sheetData></worksheet>'
    ].join(''))
    await expect(extractResearchTaskFileText({
      name: 'counts.xlsx',
      dataBase64: await archive.generateAsync({ type: 'base64' })
    })).resolves.toMatchObject({
      kind: 'xlsx',
      text: expect.stringContaining('gene\tcount\nMS4A1\t42')
    })
  })
})
