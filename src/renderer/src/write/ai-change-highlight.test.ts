import { EditorState } from '@codemirror/state'
import { describe, expect, it } from 'vitest'
import { aiChangeHighlightField, aiChangeRanges, setAiChangeHighlights } from './ai-change-highlight'

function marks(state: EditorState): Array<[number, number]> {
  const ranges: Array<[number, number]> = []
  state.field(aiChangeHighlightField).between(0, state.doc.length, (from, to) => {
    ranges.push([from, to])
  })
  return ranges
}

describe('AI change highlights', () => {
  it('finds the added text of a change in the new document', () => {
    const content = '# 第八章\n\n## 一、导入\n讲述慢阻肺病例，提出问题。\n'
    const ranges = aiChangeRanges(content, { before: '## 一、导入\n讲述哮喘病例。\n', after: '## 一、导入\n讲述慢阻肺病例，提出问题。\n' })

    expect(ranges.map((range) => content.slice(range.from, range.to))).toEqual(['慢阻肺', '，提出问题'])
    expect(aiChangeRanges(content, { before: 'x', after: '不在文中' })).toEqual([])
  })

  it('marks the ranges, follows later edits and clears on request', () => {
    let state = EditorState.create({ doc: '讲述慢阻肺病例。', extensions: [aiChangeHighlightField] })
    state = state.update({ effects: setAiChangeHighlights.of([{ from: 2, to: 5 }, { from: 40, to: 50 }]) }).state
    expect(marks(state)).toEqual([[2, 5]])

    state = state.update({ changes: { from: 0, insert: '先' } }).state
    expect(marks(state)).toEqual([[3, 6]])

    state = state.update({ effects: setAiChangeHighlights.of([]) }).state
    expect(marks(state)).toEqual([])
  })
})
