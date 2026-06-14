import { describe, expect, it } from 'vitest'
import type { SlideSpec, SourceVisualAsset } from './courseware'
import { assignApprovedVisualsToSlides } from './courseware-visual-assignment'

function slide(id: string, title: string, bullets: string[] = []): SlideSpec {
  return {
    id,
    sectionId: 'section-1',
    kind: 'content',
    title,
    bullets,
    speakerNotes: `${title}讲稿`,
    evidenceRefs: []
  }
}

function asset(
  id: string,
  caption: string,
  status: SourceVisualAsset['status'] = 'approved'
): SourceVisualAsset {
  return {
    id,
    sourceKind: 'pptx',
    sourceIndex: 1,
    mediaType: 'image/png',
    role: status === 'rejected' ? 'decorative' : 'figure',
    status,
    confidence: 0.9,
    occurrences: [1],
    caption,
    nearbyText: caption,
    imageDataUrl: 'data:image/png;base64,AA=='
  }
}

describe('assignApprovedVisualsToSlides', () => {
  it('matches approved source visuals to the most relevant editable slide', () => {
    const result = assignApprovedVisualsToSlides(
      [
        slide('slide-1', 'B细胞抗原呈递', ['BCR摄取抗原并通过MHC II呈递']),
        slide('slide-2', '三级淋巴结构', ['TLS中的B细胞成熟'])
      ],
      [
        asset('asset-tls', '肿瘤三级淋巴结构 TLS'),
        asset('asset-apc', 'B细胞抗原呈递与MHC II')
      ]
    )

    expect(result.slides[0].visual?.figureId).toBe('asset-apc')
    expect(result.slides[1].visual?.figureId).toBe('asset-tls')
    expect(result.unmatchedAssetIds).toEqual([])
  })

  it('preserves explicit assignments and ignores rejected decorative images', () => {
    const result = assignApprovedVisualsToSlides(
      [{
        ...slide('slide-1', 'B细胞'),
        visual: { type: 'source-figure', figureId: 'manual', title: '手工配图' }
      }],
      [asset('logo', '课程徽标', 'rejected'), asset('unused', 'B细胞')]
    )

    expect(result.slides[0].visual?.figureId).toBe('manual')
    expect(result.unmatchedAssetIds).toEqual(['unused'])
  })
})
