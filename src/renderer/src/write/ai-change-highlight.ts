import { StateEffect, StateField, type Extension } from '@codemirror/state'
import { Decoration, EditorView, type DecorationSet } from '@codemirror/view'
import { diffText } from '@shared/text-diff'

export type TextRange = { from: number; to: number }

/** Replaces the highlighted AI changes; an empty list clears them. */
export const setAiChangeHighlights = StateEffect.define<TextRange[]>()

const aiChangeMark = Decoration.mark({ class: 'cm-ai-change' })

/**
 * Marks text the AI just added (§6.2). The marks follow later edits and are replaced or cleared
 * when the teacher keeps or undoes the change.
 */
export const aiChangeHighlightField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, transaction) {
    let next = value.map(transaction.changes)
    for (const effect of transaction.effects) {
      if (!effect.is(setAiChangeHighlights)) continue
      const length = transaction.state.doc.length
      next = Decoration.set(
        effect.value
          .map((range) => ({ from: Math.max(0, Math.min(range.from, length)), to: Math.max(0, Math.min(range.to, length)) }))
          .filter((range) => range.to > range.from)
          .map((range) => aiChangeMark.range(range.from, range.to)),
        true
      )
    }
    return next
  },
  provide: (field) => EditorView.decorations.from(field)
})

export function aiChangeHighlightExtension(): Extension {
  return aiChangeHighlightField
}

/**
 * Where the added text of a change sits in the new document: the changed passage is found by its
 * new text, then each inserted run inside it becomes a range.
 */
export function aiChangeRanges(content: string, change: { before: string; after: string }): TextRange[] {
  const start = content.indexOf(change.after)
  if (start < 0 || !change.after) return []
  const ranges: TextRange[] = []
  let offset = start
  for (const segment of diffText(change.before, change.after)) {
    if (segment.type === 'delete') continue
    if (segment.type === 'insert' && segment.text.trim()) ranges.push({ from: offset, to: offset + segment.text.length })
    offset += segment.text.length
  }
  return ranges
}
