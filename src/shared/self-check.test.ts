import { describe, expect, it } from 'vitest'
import {
  applyReplacements,
  citedIdentifiers,
  fixedText,
  grantStructureSuggestions,
  lessonTimingSuggestions,
  localSelfCheck,
  looksLikeGrant,
  slideLengthSuggestions,
  termConsistencySuggestions,
  unverifiedCitationSuggestion
} from './self-check'

describe('termConsistencySuggestions', () => {
  it('suggests the most common form for a term written several ways', () => {
    const text = 'IL-2 促进 T 细胞增殖。IL-2 与 IL2 受体结合，IL-2R 不同。'
    const [suggestion] = termConsistencySuggestions(text)
    expect(suggestion.title).toBe('IL-2 / IL2 写法不一致')
    expect(suggestion.fix).toEqual({ type: 'replace', edits: [{ find: 'IL2', replace: 'IL-2' }] })
    expect(applyReplacements(text, [{ find: 'IL2', replace: 'IL-2' }])).toBe('IL-2 促进 T 细胞增殖。IL-2 与 IL-2 受体结合，IL-2R 不同。')
  })

  it('stays quiet when every term is written one way', () => {
    expect(termConsistencySuggestions('CD8 T 细胞和 CD4 T 细胞，CD8 更多。')).toEqual([])
  })

  it('replaces whole words only', () => {
    expect(applyReplacements('CD8 和 CD80', [{ find: 'CD8', replace: 'CD-8' }])).toBe('CD-8 和 CD80')
  })
})

describe('lessonTimingSuggestions', () => {
  const plan = [
    '# 教案', '', '| 计划学时 | 2 学时 |', '', '## 教学过程设计', '',
    '### 导入（10 分钟）', '', '### 新课讲授（60 分钟）', '', '### 小结（10 分钟）', ''
  ].join('\n')

  it('offers adjusted minutes when the segments do not add up', () => {
    const [suggestion] = lessonTimingSuggestions(plan)
    expect(suggestion.title).toBe('各环节合计 80 分钟，计划 90 分钟')
    expect(suggestion.fix?.type).toBe('content')
    expect(lessonTimingSuggestions(suggestion.fix?.type === 'content' ? suggestion.fix.markdown : '')).toEqual([])
  })
})

describe('grantStructureSuggestions', () => {
  it('names missing parts and research content the technical route leaves out', () => {
    const grant = [
      '# 申请书', '## 一、科学问题', '…',
      '## 二、研究内容', '### （一）肿瘤微环境中 B 细胞的分型', '…', '### （二）B 细胞促进免疫治疗的机制', '…',
      '## 三、技术路线', '通过单细胞测序明确肿瘤微环境中 B 细胞亚群。'
    ].join('\n')
    const titles = grantStructureSuggestions(grant).map((suggestion) => suggestion.title)
    expect(titles).toEqual(['缺少“创新点”部分', '技术路线没有覆盖 1 项研究内容'])
  })
})

describe('citations', () => {
  it('finds each PMID and DOI once', () => {
    const text = '见 PMID: 40123456 与 doi:10.1016/j.immuni.2025.01.001。又见 PMID 40123456。'
    expect(citedIdentifiers(text)).toEqual([
      { raw: 'PMID: 40123456', pmid: '40123456' },
      { raw: '10.1016/j.immuni.2025.01.001', doi: '10.1016/j.immuni.2025.01.001' }
    ])
  })

  it('marks an unknown identifier 待核实 once', () => {
    const identifier = { raw: 'PMID: 12345678', pmid: '12345678' }
    const suggestion = unverifiedCitationSuggestion(identifier, '见 PMID: 12345678。')!
    expect(suggestion.title).toBe('PMID 12345678 在 PubMed 中没有找到')
    const marked = applyReplacements('见 PMID: 12345678。', suggestion.fix?.type === 'replace' ? suggestion.fix.edits : [])
    expect(marked).toBe('见 PMID: 12345678（待核实）。')
    expect(unverifiedCitationSuggestion(identifier, marked)).toBeNull()
  })
})

describe('slideLengthSuggestions', () => {
  const slide = (id: string, bullets: string[]) => ({ id, sectionId: 's', kind: 'content' as const, title: id, bullets, speakerNotes: '讲稿', evidenceRefs: [] })

  it('asks the AI to shorten crowded slides only', () => {
    const [suggestion] = slideLengthSuggestions([
      slide('a', ['一', '二', '三']),
      slide('b', ['1', '2', '3', '4', '5', '6']),
      slide('c', ['很长'.repeat(70)])
    ])
    expect(suggestion.title).toBe('2 页文字偏多')
    expect(suggestion.fix).toMatchObject({ type: 'revise-slides', slideIds: ['b', 'c'] })
    expect(slideLengthSuggestions([slide('a', ['一'])])).toEqual([])
  })
})

describe('localSelfCheck', () => {
  it('checks grant structure only for applications', () => {
    const text = '# 课题\n## 研究内容\n…\n## 技术路线\n…'
    expect(looksLikeGrant(text)).toBe(true)
    expect(localSelfCheck('document', text).map((item) => item.check)).toContain('grant-structure')
    expect(localSelfCheck('document', '# 读书笔记\n## 摘要\n…')).toEqual([])
    expect(looksLikeGrant('# 正文', '2026 国自然申请书')).toBe(true)
  })

  it('gives fixed text for fixes that need no AI', () => {
    const [suggestion] = termConsistencySuggestions('IL-2 IL-2 IL2')
    expect(fixedText('IL-2 IL-2 IL2', suggestion)).toBe('IL-2 IL-2 IL-2')
    expect(fixedText('x', { id: 'r', check: 'grant-structure', title: '', detail: '', fix: { type: 'revise', instruction: '补' } })).toBeNull()
  })
})
