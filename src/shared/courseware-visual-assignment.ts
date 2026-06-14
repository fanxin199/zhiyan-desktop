import type { SlideSpec, SourceVisualAsset } from './courseware'

export type CoursewareVisualAssignmentResult = {
  slides: SlideSpec[]
  unmatchedAssetIds: string[]
}

function searchTerms(value: string): Set<string> {
  const normalized = value.toLowerCase().replace(/\s+/g, ' ')
  const terms = new Set(normalized.match(/[a-z0-9][a-z0-9.+-]{1,}|[\u3400-\u9fff]{2,}/g) ?? [])
  for (const sequence of normalized.match(/[\u3400-\u9fff]{2,}/g) ?? []) {
    for (let index = 0; index < sequence.length - 1; index += 1) {
      terms.add(sequence.slice(index, index + 2))
    }
  }
  return terms
}

function relevance(slide: SlideSpec, asset: SourceVisualAsset): number {
  const slideTerms = searchTerms([
    slide.title,
    slide.subtitle ?? '',
    ...slide.bullets,
    slide.speakerNotes
  ].join(' '))
  const assetTerms = searchTerms([
    asset.caption ?? '',
    asset.nearbyText ?? '',
    asset.sourceName ?? ''
  ].join(' '))
  let score = 0
  for (const term of assetTerms) {
    if (!slideTerms.has(term)) continue
    score += term.length > 2 ? 3 : 1
  }
  return score
}

export function assignApprovedVisualsToSlides(
  sourceSlides: SlideSpec[],
  sourceAssets: SourceVisualAsset[]
): CoursewareVisualAssignmentResult {
  const slides = sourceSlides.map((slide) => ({ ...slide }))
  const openSlideIndexes = slides
    .map((slide, index) => ({ slide, index }))
    .filter(({ slide }) =>
      slide.kind !== 'title' &&
      slide.kind !== 'references' &&
      !slide.visual?.figureId
    )
    .map(({ index }) => index)
  const assets = sourceAssets.filter((asset) =>
    asset.status === 'approved' &&
    asset.role !== 'decorative' &&
    Boolean(asset.imageDataUrl || asset.assetPath)
  )
  const unmatchedAssetIds: string[] = []

  for (const asset of assets) {
    if (openSlideIndexes.length === 0) {
      unmatchedAssetIds.push(asset.id)
      continue
    }
    let bestPosition = 0
    let bestScore = -1
    openSlideIndexes.forEach((slideIndex, position) => {
      const score = relevance(slides[slideIndex], asset)
      if (score > bestScore) {
        bestPosition = position
        bestScore = score
      }
    })
    const [slideIndex] = openSlideIndexes.splice(bestPosition, 1)
    const slide = slides[slideIndex]
    slides[slideIndex] = {
      ...slide,
      visual: {
        type: 'source-figure',
        title: asset.caption || asset.sourceName || '教材原图',
        figureId: asset.id
      }
    }
  }

  return { slides, unmatchedAssetIds }
}
