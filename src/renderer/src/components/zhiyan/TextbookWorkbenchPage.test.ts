import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { mergeIntentBrief } from '@shared/intent-brief'
import type { TextbookMetadata, TextbookSection } from '@shared/textbook'
import { TEXTBOOK_EXAMPLES, TextbookWorkbenchPage } from './TextbookWorkbenchPage'
import { replaceTermAcrossSections, textbookRequestFromBrief } from './textbook-flow'

const metadata: TextbookMetadata = {
  title: '生物医学课程教材', subject: '生物医学', audience: 'undergraduate', author: '',
  writingGoal: '', citationStyle: 'gbt7714', outputFormats: ['markdown', 'docx', 'project']
}

function section(id: string, content: string): TextbookSection {
  return { id, chapterId: 'c1', title: id, path: '1.1', content, status: 'draft', referenceKeys: [], teacherNotes: '' }
}

describe('TextbookWorkbenchPage start state', () => {
  it('asks for one sentence and the publisher’s requirements; typesetting waits under 更多设置', () => {
    const html = renderToStaticMarkup(createElement(TextbookWorkbenchPage))

    expect(html.match(/data-testid="intent-composer"/g)).toHaveLength(1)
    expect(html).toContain('出版社要求')
    expect(html).toContain('读取文件')
    expect(html).toContain('更多设置（作者、引用格式、排版要求）')
    expect(html).toContain(TEXTBOOK_EXAMPLES[0])
    // Fonts, sizes and line spacing are no longer part of the first step.
    expect(html).not.toContain('data-format-rules-panel="auto-parse"')
    expect(html).not.toContain('正文字体')
    expect(html).not.toContain('自然基金撰写')
  })

  it('fills the input box with a request from the AI assistant', () => {
    const html = renderToStaticMarkup(createElement(TextbookWorkbenchPage, { prefill: { id: 1, text: '编写免疫学第三章' } }))

    expect(html).toContain('编写免疫学第三章')
  })
})

describe('textbook flow', () => {
  it('turns the key points into the book details and the outline brief', () => {
    const brief = mergeIntentBrief('textbook', {
      teacher: { bookTitle: '医学免疫学', chapter: '第三章 抗原', audience: '研究生' },
      material: { requirements: '每节不超过 3000 字' }
    })

    const request = textbookRequestFromBrief(metadata, brief, '编写《医学免疫学》第三章抗原', '王老师')

    expect(request.metadata).toMatchObject({
      title: '医学免疫学', subject: '医学免疫学', audience: 'graduate', author: '王老师', writingGoal: '编写《医学免疫学》第三章抗原'
    })
    expect(request.teacherBrief.split('\n')).toEqual([
      '编写《医学免疫学》第三章抗原',
      '本次编写：第三章 抗原',
      '出版社要求：每节不超过 3000 字'
    ])
  })

  it('replaces a term in every section, whole words only for Latin terms', () => {
    const sections = [
      section('a', 'IL-2 促进 T 细胞增殖；IL-21 不同。IL-2。'),
      section('b', '本节不涉及。'),
      section('c', '抗原提呈细胞即 APC，抗原提呈细胞。')
    ]

    const latin = replaceTermAcrossSections(sections, 'IL-2', '白细胞介素-2')
    expect(latin.sections[0].content).toBe('白细胞介素-2 促进 T 细胞增殖；IL-21 不同。白细胞介素-2。')
    expect(latin).toMatchObject({ count: 2, changedSections: 1 })
    expect(latin.sections[1]).toBe(sections[1])

    const chinese = replaceTermAcrossSections(sections, '抗原提呈细胞', '抗原呈递细胞')
    expect(chinese.sections[2].content).toBe('抗原呈递细胞即 APC，抗原呈递细胞。')
    expect(replaceTermAcrossSections(sections, 'X', 'X').count).toBe(0)
  })
})
