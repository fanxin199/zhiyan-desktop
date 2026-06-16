import { describe, expect, it } from 'vitest'
import {
  createSectionsFromOutline,
  inferTextbookFormatRulesFromGuidelines,
  parseTextbookProject,
  textbookOutlineSchema,
  textbookProjectSchema
} from './textbook'

describe('textbook contracts', () => {
  it('creates editable section files from a confirmed outline', () => {
    const outline = textbookOutlineSchema.parse({
      title: '医学免疫学',
      rationale: '按免疫识别、活化和效应主线组织。',
      chapters: [{
        id: 'chapter-1',
        title: '免疫系统概论',
        writingGoal: '建立全书主线。',
        sections: [{
          id: 'section-1',
          chapterId: 'chapter-1',
          title: '免疫系统的基本功能',
          writingGoal: '解释免疫防御、稳态和监视。',
          estimatedWords: 2500,
          keyConcepts: ['immune surveillance'],
          confirmed: true
        }]
      }]
    })

    expect(createSectionsFromOutline(outline)).toEqual([{
      id: 'section-1',
      chapterId: 'chapter-1',
      title: '免疫系统的基本功能',
      path: 'chapters/ch01-sec01.md',
      content: '',
      status: 'draft',
      referenceKeys: [],
      teacherNotes: ''
    }])
  })

  it('keeps publisher rules and references in a project payload', () => {
    const now = new Date().toISOString()
    const result = textbookProjectSchema.safeParse({
      version: 1,
      metadata: {
        title: '医学免疫学',
        subject: '医学免疫学',
        audience: 'undergraduate',
        author: 'Teacher',
        writingGoal: '用于本科教学。',
        citationStyle: 'gbt7714',
        outputFormats: ['markdown', 'docx', 'project']
      },
      publisherGuidelines: '正文小四号，1.5 倍行距。',
      formatRules: {
        fontFamily: 'SimSun',
        fontSizePt: 12,
        lineSpacing: 1.5,
        headingPattern: '章、节编号',
        symbolRules: '中文标点',
        unresolvedRules: ['图表宽度需人工复核']
      },
      sections: [],
      references: [{
        key: 'pmid-40123456',
        title: 'B cells in tumor immunity',
        sourceType: 'abstract',
        pmid: '40123456',
        year: 2025,
        authors: ['Wang Li']
      }],
      checks: [],
      createdAt: now,
      updatedAt: now
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.publisherGuidelines).toContain('小四号')
      expect(result.data.references[0].key).toBe('pmid-40123456')
      expect(result.data.formatRules.unresolvedRules).toHaveLength(1)
    }
  })

  it('parses a persisted project without migration side effects', () => {
    const now = new Date().toISOString()
    const parsed = parseTextbookProject({
      version: 1,
      metadata: {
        title: 'Tumor Immunology',
        subject: 'Tumor immunology',
        audience: 'graduate',
        citationStyle: 'vancouver'
      },
      publisherGuidelines: '',
      sections: [],
      references: [],
      checks: [],
      createdAt: now,
      updatedAt: now
    })

    expect(parsed.metadata.title).toBe('Tumor Immunology')
    expect(parsed.formatRules.fontFamily).toBe('Microsoft YaHei')
    expect(parsed.metadata.outputFormats).toContain('docx')
  })

  it('infers common Chinese publisher format rules from pasted guidelines', () => {
    const rules = inferTextbookFormatRulesFromGuidelines(
      '正文宋体小四，1.5 倍行距。章标题使用一级标题，节标题使用二级标题。中文标点使用全角。图表宽度按出版社模板复核。'
    )

    expect(rules.fontFamily).toBe('SimSun')
    expect(rules.fontSizePt).toBe(12)
    expect(rules.lineSpacing).toBe(1.5)
    expect(rules.headingPattern).toContain('章标题')
    expect(rules.symbolRules).toContain('中文标点')
    expect(rules.unresolvedRules.join('\n')).toContain('图表')
  })
})
