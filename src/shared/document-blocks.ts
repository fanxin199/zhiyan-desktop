import { splitMarkdownSections } from './artifact-revision'

export type MarkdownBlock = {
  /** The section's id from `splitMarkdownSections`, used as the revision scope. */
  sectionId: string
  title: string
  level: number
  /** Text between this heading and the next heading of any level. */
  body: string
}

/**
 * A document as canvas cards (Tasks 2.2.2, 2.5): one block per level-2 part and level-3 subpart. The
 * text before the first part (title and any header table) is returned as `intro`.
 */
export function markdownBlocks(markdown: string): { intro: string; blocks: MarkdownBlock[] } {
  const sections = splitMarkdownSections(markdown).filter((section) => section.level >= 2 && section.level <= 3)
  const headings = splitMarkdownSections(markdown)
  const bodyEnd = (start: number): number => headings.find((section) => section.start > start)?.start ?? markdown.length
  const firstPart = sections[0]?.start ?? markdown.length
  return {
    intro: markdown.slice(0, firstPart).replace(/^#[ \t].*\n?/u, '').trim(),
    blocks: sections.map((section) => {
      const headingEnd = markdown.indexOf('\n', section.start)
      const bodyStart = headingEnd < 0 ? markdown.length : headingEnd + 1
      return { sectionId: section.id, title: section.title, level: section.level, body: markdown.slice(bodyStart, bodyEnd(section.start)).trim() }
    })
  }
}
