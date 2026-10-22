import { describe, expect, it } from 'vitest'
import { countChangedPlaces, diffText, tokenizeForDiff } from './text-diff'

function rebuild(segments: ReturnType<typeof diffText>, side: 'before' | 'after'): string {
  return segments
    .filter((segment) => segment.type === 'equal' || segment.type === (side === 'before' ? 'delete' : 'insert'))
    .map((segment) => segment.text)
    .join('')
}

describe('diffText', () => {
  it('compares Chinese by character and other text by word', () => {
    expect(tokenizeForDiff('案例导入 uses ABO血型。')).toEqual(['案', '例', '导', '入', ' ', 'uses', ' ', 'ABO', '血', '型', '。'])

    expect(diffText('案例导入：低血压', '案例导入：高血压急症')).toEqual([
      { type: 'equal', text: '案例导入：' },
      { type: 'delete', text: '低' },
      { type: 'insert', text: '高' },
      { type: 'equal', text: '血压' },
      { type: 'insert', text: '急症' }
    ])
    expect(diffText('the quick fox', 'the slow fox')).toEqual([
      { type: 'equal', text: 'the ' },
      { type: 'delete', text: 'quick' },
      { type: 'insert', text: 'slow' },
      { type: 'equal', text: ' fox' }
    ])
  })

  it('always rebuilds both texts exactly', () => {
    const before = '# 第八章\n\n一、导入：讲述哮喘病例。\n二、新课讲授：肺通气的动力与阻力。\n'
    const after = '# 第八章 呼吸\n\n一、导入：讲述慢阻肺病例，提出问题。\n二、新课讲授：肺通气的动力与阻力。\n三、小结。\n'
    const segments = diffText(before, after)

    expect(rebuild(segments, 'before')).toBe(before)
    expect(rebuild(segments, 'after')).toBe(after)
    // Title, illness, the added question and the added summary.
    expect(countChangedPlaces(segments)).toBe(4)
  })

  it('handles empty and identical texts', () => {
    expect(diffText('', '')).toEqual([])
    expect(diffText('同样', '同样')).toEqual([{ type: 'equal', text: '同样' }])
    expect(diffText('', '新增')).toEqual([{ type: 'insert', text: '新增' }])
    expect(diffText('删除', '')).toEqual([{ type: 'delete', text: '删除' }])
    expect(countChangedPlaces(diffText('同样', '同样'))).toBe(0)
  })

  it('shows a complete rewrite of a long text as removed and added instead of running out of memory', () => {
    const before = '甲乙丙丁'.repeat(2500)
    const after = '子丑寅卯'.repeat(2500)

    expect(diffText(before, after)).toEqual([{ type: 'delete', text: before }, { type: 'insert', text: after }])
  })

  it('stays fast on long texts with small edits', () => {
    const paragraph = '肺通气是指肺与外界环境之间的气体交换过程。'.repeat(400)
    const started = Date.now()
    const segments = diffText(paragraph, `${paragraph.slice(0, 4000)}（补充：胸膜腔负压）${paragraph.slice(4000)}`)

    expect(Date.now() - started).toBeLessThan(1000)
    expect(countChangedPlaces(segments)).toBe(1)
  })
})
