import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { CoursewareRequest, SlideSpec, SourceVisualAsset } from '@shared/courseware'
import { mergeIntentBrief } from '@shared/intent-brief'
import { COURSEWARE_EXAMPLES, CoursewarePage } from './CoursewarePage'
import {
  coursewareRequestFromBrief,
  speakerNotesChanged,
  visualReviewMessage,
  visualReviewSummary,
  withRegeneratedNotes
} from './courseware-flow'

const request: CoursewareRequest = {
  sourcePath: 'C:\\books\\生理学.pdf', pageStart: 1, pageEnd: 20, topic: '', durationMinutes: 90,
  audience: 'undergraduate', focus: '', includeRecentLiterature: false, literatureQuery: '', maxLiteratureResults: 6
}

function asset(id: string, extra: Partial<SourceVisualAsset> = {}): SourceVisualAsset {
  return {
    id, sourceKind: 'pdf', sourceIndex: 1, mediaType: 'image/png', role: 'figure', status: 'approved',
    confidence: 0.9, occurrences: [1], imageDataUrl: 'data:image/png;base64,AA==', ...extra
  }
}

function slide(extra: Partial<SlideSpec> = {}): SlideSpec {
  return {
    id: 'slide-1', sectionId: 'section-1', kind: 'content', title: '肺通气', bullets: ['呼吸肌运动'],
    speakerNotes: '说明肺通气。', visual: { type: 'none' }, evidenceRefs: [], ...extra
  }
}

describe('CoursewarePage start state', () => {
  it('asks for one sentence and a textbook, with examples, instead of the old form', () => {
    const html = renderToStaticMarkup(createElement(CoursewarePage))

    expect(html.match(/data-testid="intent-composer"/g)).toHaveLength(1)
    expect(html).toContain('选择教材 PDF 或 PPTX')
    expect(html).toContain(COURSEWARE_EXAMPLES[0])
    expect(html).not.toContain('课件生成流程')
    expect(html).not.toContain('授课对象</h2>')
  })

  it('fills the input box with a request from the AI assistant', () => {
    const html = renderToStaticMarkup(createElement(CoursewarePage, { prefill: { id: 1, text: '做一套呼吸系统的课件' } }))

    expect(html).toContain('做一套呼吸系统的课件')
  })
})

describe('courseware flow', () => {
  it('turns the key points into the courseware request', () => {
    const brief = mergeIntentBrief('ppt-gen', {
      teacher: { topic: '呼吸系统', audience: '临床医学研究生', duration: '2 学时' },
      material: { source: '生理学.pdf' }
    })

    expect(coursewareRequestFromBrief(request, brief, '做一套呼吸系统的课件，研究生，2 学时')).toMatchObject({
      topic: '呼吸系统',
      audience: 'graduate',
      durationMinutes: 90,
      focus: '做一套呼吸系统的课件，研究生，2 学时'
    })
    expect(coursewareRequestFromBrief(request, mergeIntentBrief('ppt-gen', { teacher: { topic: '免疫' } }), '').audience)
      .toBe('undergraduate')
  })

  it('asks the teacher to look only at undecided or low-confidence images', () => {
    const review = visualReviewSummary([
      asset('sure'),
      asset('unsure', { confidence: 0.4 }),
      asset('pending', { status: 'pending', confidence: 0.7 }),
      asset('rejected', { status: 'rejected', confidence: 0.2 }),
      asset('logo', { role: 'decorative', status: 'pending' })
    ])

    expect(review).toEqual({ selected: 2, uncertainIds: ['unsure', 'pending'] })
    expect(visualReviewMessage(review)).toBe('AI 已选 2 张教材图片，其中 2 张需要你看一眼。')
  })

  it('notices rewritten notes and can take only the notes from a regenerated slide', () => {
    const edited = slide({ bullets: ['老师改过的正文'] })
    const regenerated = slide({ bullets: ['AI 的正文'], speakerNotes: '按新正文写的讲稿。' })

    expect(speakerNotesChanged(edited, regenerated)).toBe(true)
    expect(withRegeneratedNotes(edited, regenerated)).toEqual(slide({ bullets: ['老师改过的正文'], speakerNotes: '按新正文写的讲稿。' }))
  })
})
