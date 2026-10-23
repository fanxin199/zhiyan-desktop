import type { IntentBrief } from '@shared/intent-brief'
import type { TextbookAudience, TextbookMetadata, TextbookProject, TextbookSection } from '@shared/textbook'

/** An outline with more sections than this is checked before writing, even in 自动完成 (§6.4). */
export const LONG_TEXTBOOK_SECTIONS = 12

export function textbookAudienceFromText(text: string): TextbookAudience {
  if (/留学生|国际|international/iu.test(text)) return 'international'
  if (/研究生|硕士|博士|graduate/iu.test(text)) return 'graduate'
  return 'undergraduate'
}

/** Metadata and outline brief from the key points read from the teacher's sentence (Task 2.4.1). */
export function textbookRequestFromBrief(
  metadata: TextbookMetadata,
  brief: IntentBrief,
  sentence: string,
  teacherName = ''
): { metadata: TextbookMetadata; teacherBrief: string } {
  const value = (key: string): string => brief.fields.find((field) => field.key === key)?.value.trim() ?? ''
  const bookTitle = value('bookTitle')
  const chapter = value('chapter')
  return {
    metadata: {
      ...metadata,
      title: bookTitle || chapter || metadata.title,
      subject: bookTitle || metadata.subject,
      audience: value('audience') ? textbookAudienceFromText(value('audience')) : metadata.audience,
      author: metadata.author || teacherName,
      writingGoal: sentence.trim() || metadata.writingGoal
    },
    teacherBrief: [
      sentence.trim(),
      chapter ? `本次编写：${chapter}` : '',
      value('requirements') ? `出版社要求：${value('requirements')}` : ''
    ].filter(Boolean).join('\n')
  }
}

/** Sections still without text, in book order. */
export function sectionsToWrite(project: TextbookProject): TextbookSection[] {
  return project.sections.filter((section) => !section.content.trim())
}

const ASCII_WORD = /[A-Za-z0-9_-]/u

/**
 * Replaces a term in every section (Task 2.4.2). Latin terms match whole words only, so “IL-2”
 * does not touch “IL-21”; Chinese terms match wherever they appear.
 */
export function replaceTermAcrossSections(
  sections: TextbookSection[],
  from: string,
  to: string
): { sections: TextbookSection[]; count: number; changedSections: number } {
  const term = from.trim()
  const replacement = to.trim()
  if (!term || !replacement || term === replacement) return { sections, count: 0, changedSections: 0 }
  const guardStart = ASCII_WORD.test(term[0])
  const guardEnd = ASCII_WORD.test(term[term.length - 1])
  let count = 0
  let changedSections = 0
  const next = sections.map((section) => {
    let result = ''
    let index = 0
    let changed = false
    for (let found = section.content.indexOf(term); found >= 0; found = section.content.indexOf(term, found + term.length)) {
      const before = section.content[found - 1] ?? ''
      const after = section.content[found + term.length] ?? ''
      if ((guardStart && ASCII_WORD.test(before)) || (guardEnd && ASCII_WORD.test(after))) continue
      result += section.content.slice(index, found) + replacement
      index = found + term.length
      count += 1
      changed = true
    }
    if (!changed) return section
    changedSections += 1
    return { ...section, content: result + section.content.slice(index) }
  })
  return { sections: next, count, changedSections }
}
