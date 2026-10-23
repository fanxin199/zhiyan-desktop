import type { ArtifactKind } from './artifact'
import { splitMarkdownSections } from './artifact-revision'
import type { SlideSpec } from './courseware'
import { adjustLessonTiming, checkLessonTiming, lessonPlanHours } from './lesson-plan'

/**
 * 交付前自查 (Task 4.1): checks a finished result before it is handed in. Each finding is a
 * suggestion the teacher accepts or ignores; accepting applies its fix as a new version.
 */
export type SelfCheckFix =
  /** Exact replacements of whole words in the text. */
  | { type: 'replace'; edits: Array<{ find: string; replace: string }> }
  /** The whole text, already corrected (such as adjusted lesson timing). */
  | { type: 'content'; markdown: string }
  /** A change only the AI can make, as a “说一句就改” request on a part or the whole. */
  | { type: 'revise'; sectionTitle?: string; instruction: string }
  /** Rewrites some courseware slides with a “说一句就改” request. */
  | { type: 'revise-slides'; slideIds: string[]; instruction: string }

export type SelfCheckId = 'citation' | 'terms' | 'timing' | 'grant-structure' | 'slide-length'

export type SelfCheckSuggestion = {
  id: string
  check: SelfCheckId
  /** One line, such as “IL-2 有 2 种写法”. */
  title: string
  detail: string
  fix?: SelfCheckFix
}

export const SELF_CHECK_LABELS: Record<SelfCheckId, string> = {
  citation: '引用核验',
  terms: '术语一致',
  timing: '教案时长',
  'grant-structure': '申请书结构',
  'slide-length': '课件文字量'
}

const WORD_CHAR = /[A-Za-z0-9]/u

function isWholeWord(text: string, index: number, length: number): boolean {
  return !WORD_CHAR.test(text[index - 1] ?? '') && !WORD_CHAR.test(text[index + length] ?? '')
}

function occurrences(text: string, term: string): number[] {
  const found: number[] = []
  for (let index = text.indexOf(term); index >= 0; index = text.indexOf(term, index + term.length)) {
    if (isWholeWord(text, index, term.length)) found.push(index)
  }
  return found
}

/** Applies whole-word replacements, as an accepted “术语一致” suggestion does. */
export function applyReplacements(text: string, edits: Array<{ find: string; replace: string }>): string {
  let result = text
  for (const edit of edits) {
    const positions = occurrences(result, edit.find)
    for (const index of positions.reverse()) {
      result = result.slice(0, index) + edit.replace + result.slice(index + edit.find.length)
    }
  }
  return result
}

/** The text after a fix that needs no AI, or null when the fix is a request to the AI. */
export function fixedText(markdown: string, suggestion: SelfCheckSuggestion): string | null {
  const fix = suggestion.fix
  if (fix?.type === 'replace') return applyReplacements(markdown, fix.edits)
  if (fix?.type === 'content') return fix.markdown
  return null
}

// Gene, protein and cell-marker names such as IL-2, IL2, CD8, TNF-α, COVID-19.
const MARKER = /[A-Za-z]{2,6}(?:-?(?:\d{1,3}[A-Za-z]?|[αβγδκ]))+/gu

/**
 * Terms written more than one way, such as “IL-2” and “IL2” (Task 4.1.2): the less common forms are
 * suggested to follow the most common one.
 */
export function termConsistencySuggestions(markdown: string): SelfCheckSuggestion[] {
  const forms = new Map<string, Map<string, number>>()
  for (const match of markdown.matchAll(MARKER)) {
    const surface = match[0]
    if (!isWholeWord(markdown, match.index ?? 0, surface.length)) continue
    const key = surface.replace(/-/gu, '').toLowerCase()
    const counts = forms.get(key) ?? new Map<string, number>()
    counts.set(surface, (counts.get(surface) ?? 0) + 1)
    forms.set(key, counts)
  }
  const suggestions: SelfCheckSuggestion[] = []
  for (const [key, counts] of forms) {
    if (counts.size < 2) continue
    const ranked = [...counts.entries()].sort((left, right) => right[1] - left[1] || right[0].length - left[0].length)
    const preferred = ranked[0][0]
    const others = ranked.slice(1).map(([form]) => form)
    suggestions.push({
      id: `terms:${key}`,
      check: 'terms',
      title: `${[preferred, ...others].join(' / ')} 写法不一致`,
      detail: `统一为“${preferred}”（${ranked.map(([form, count]) => `${form} ${count} 处`).join('，')}）。`,
      fix: { type: 'replace', edits: others.map((form) => ({ find: form, replace: preferred })) }
    })
  }
  return suggestions
}

/** Task 4.1.2: a lesson plan's segments should add up to its planned hours. */
export function lessonTimingSuggestions(markdown: string): SelfCheckSuggestion[] {
  const timing = checkLessonTiming(markdown, lessonPlanHours(markdown))
  if (timing.status !== 'mismatch') return []
  return [{
    id: 'timing',
    check: 'timing',
    title: `各环节合计 ${timing.total} 分钟，计划 ${timing.planned} 分钟`,
    detail: '按比例调整各环节时长，使合计与计划学时一致。',
    fix: { type: 'content', markdown: adjustLessonTiming(markdown, timing.planned) }
  }]
}

const GRANT_PARTS: Array<{ label: string; pattern: RegExp }> = [
  { label: '科学问题', pattern: /科学问题/u },
  { label: '研究内容', pattern: /研究内容/u },
  { label: '技术路线', pattern: /技术路线|研究方案/u },
  { label: '创新点', pattern: /创新/u }
]

/** Adjacent Chinese character pairs, a rough measure of how much two passages talk about the same thing. */
function characterPairs(text: string): string[] {
  const pairs: string[] = []
  for (const run of text.match(/[\u4e00-\u9fff]{2,}/gu) ?? []) {
    for (let index = 0; index < run.length - 1; index += 1) pairs.push(run.slice(index, index + 2))
  }
  return pairs
}

/**
 * 国自然 applications (Task 4.1.2): the scientific question, research content, technical route and
 * innovation must all be there, and the technical route should cover every research content item.
 */
export function grantStructureSuggestions(markdown: string): SelfCheckSuggestion[] {
  const sections = splitMarkdownSections(markdown)
  const find = (pattern: RegExp) => sections.find((section) => pattern.test(section.title))
  const suggestions: SelfCheckSuggestion[] = []
  for (const part of GRANT_PARTS) {
    if (find(part.pattern)) continue
    suggestions.push({
      id: `grant:${part.label}`,
      check: 'grant-structure',
      title: `缺少“${part.label}”部分`,
      detail: '国自然申请书需要科学问题、研究内容、技术路线和创新点前后对应。',
      fix: { type: 'revise', instruction: `补上“${part.label}”部分，并与申请书中已有的科学问题、研究内容和技术路线相互对应，不改动其他部分。` }
    })
  }
  const content = find(/研究内容/u)
  const route = find(/技术路线|研究方案/u)
  if (content && route) {
    const items = sections.filter((section) => section.level === content.level + 1 && section.start > content.start && section.start < content.end)
    const routeText = markdown.slice(route.start, route.end)
    const uncovered = items.filter((item) => {
      const pairs = characterPairs(item.title.replace(/^[（(]?[一二三四五六七八九十\d]+[)）、.．]\s*/u, ''))
      return pairs.length > 0 && pairs.filter((pair) => routeText.includes(pair)).length / pairs.length < 0.4
    })
    if (uncovered.length > 0) {
      suggestions.push({
        id: 'grant:route-coverage',
        check: 'grant-structure',
        title: `技术路线没有覆盖 ${uncovered.length} 项研究内容`,
        detail: `未见对应：${uncovered.map((item) => `“${item.title}”`).join('、')}。`,
        fix: { type: 'revise', sectionTitle: route.title, instruction: `让技术路线逐条对应研究内容，补上${uncovered.map((item) => `“${item.title}”`).join('、')}的实施步骤。` }
      })
    }
  }
  return suggestions
}

export type CitedIdentifier = { raw: string; pmid?: string; doi?: string }

const CITED = /(?:PMID[:：\s]*(\d{6,9}))|(?:DOI[:：\s]*|https?:\/\/doi\.org\/)?(10\.\d{4,9}\/[^\s，。；;,)）\]】"'<>]+)/giu

/** PMIDs and DOIs cited in a text, once each, for checking against PubMed. */
export function citedIdentifiers(markdown: string): CitedIdentifier[] {
  const seen = new Set<string>()
  const found: CitedIdentifier[] = []
  for (const match of markdown.matchAll(CITED)) {
    const pmid = match[1]
    const doi = match[2]?.replace(/[.]+$/u, '')
    const key = pmid ? `pmid:${pmid}` : `doi:${doi?.toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)
    found.push(pmid ? { raw: match[0], pmid } : { raw: doi ?? match[0], doi })
  }
  return found
}

export const UNVERIFIED_MARK = '（待核实）'

/** A cited identifier PubMed does not know: marked 待核实 in the text when accepted. */
export function unverifiedCitationSuggestion(identifier: CitedIdentifier, markdown: string): SelfCheckSuggestion | null {
  if (markdown.includes(`${identifier.raw}${UNVERIFIED_MARK}`)) return null
  const label = identifier.pmid ? `PMID ${identifier.pmid}` : `DOI ${identifier.doi}`
  return {
    id: `citation:${label}`,
    check: 'citation',
    title: `${label} 在 PubMed 中没有找到`,
    detail: '可能写错了编号，或是 PubMed 未收录的文献。采纳后在正文中标“待核实”，请对照原文确认。',
    fix: { type: 'replace', edits: [{ find: identifier.raw, replace: `${identifier.raw}${UNVERIFIED_MARK}` }] }
  }
}

/** Courseware (Task 4.1.2): a slide is for the class to read at a glance, so words go to the notes. */
export const SLIDE_LIMITS = { bullets: 5, characters: 120 } as const

export function slideLengthSuggestions(slides: SlideSpec[]): SelfCheckSuggestion[] {
  const crowded = slides.flatMap((slide, index) => {
    const characters = slide.bullets.join('').length
    return slide.bullets.length > SLIDE_LIMITS.bullets || characters > SLIDE_LIMITS.characters ? [{ slide, number: index + 1 }] : []
  })
  if (crowded.length === 0) return []
  return [{
    id: 'slide-length',
    check: 'slide-length',
    title: `${crowded.length} 页文字偏多`,
    detail: `第 ${crowded.map((item) => item.number).join('、')} 页超过 ${SLIDE_LIMITS.bullets} 条或 ${SLIDE_LIMITS.characters} 字，课堂上不易看清。`,
    fix: {
      type: 'revise-slides',
      slideIds: crowded.map((item) => item.slide.id),
      instruction: `精简页面文字：不超过 ${SLIDE_LIMITS.bullets} 条、合计不超过 ${SLIDE_LIMITS.characters} 字，保留关键术语，删去的解释移到讲稿里。`
    }
  }]
}

/** A 国自然-style application: named so, or with at least two of its parts as headings. */
export function looksLikeGrant(markdown: string, title = ''): boolean {
  if (/国自然|自然科学基金|NSFC|基金申请|申请书/iu.test(title)) return true
  const titles = splitMarkdownSections(markdown).map((section) => section.title)
  return GRANT_PARTS.filter((part) => titles.some((heading) => part.pattern.test(heading))).length >= 2
}

/** The checks that need no network, by kind of result. */
export function localSelfCheck(kind: ArtifactKind | undefined, markdown: string, title = ''): SelfCheckSuggestion[] {
  return [
    ...(kind === 'lesson-plan' ? lessonTimingSuggestions(markdown) : []),
    ...(kind === 'document' && looksLikeGrant(markdown, title) ? grantStructureSuggestions(markdown) : []),
    ...termConsistencySuggestions(markdown)
  ]
}
