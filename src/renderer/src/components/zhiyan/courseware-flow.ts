import type { CoursewareAudience, CoursewareRequest, SlideSpec, SourceVisualAsset } from '@shared/courseware'
import type { IntentBrief } from '@shared/intent-brief'
import { plannedLessonMinutes } from '@shared/lesson-plan'

/** Below this the image matcher is unsure, so the teacher takes a look (Task 2.3.2). */
export const UNCERTAIN_VISUAL_CONFIDENCE = 0.6

/** A deck longer than this gets its outline checked even in 自动完成 (§6.4). */
export const LONG_DECK_SLIDES = 25

export function audienceFromText(text: string): CoursewareAudience {
  if (/留学生|国际|international/iu.test(text)) return 'international'
  if (/研究生|硕士|博士|graduate/iu.test(text)) return 'graduate'
  return 'undergraduate'
}

/** The courseware request with the key points read from the teacher's sentence (Task 2.3.1). */
export function coursewareRequestFromBrief(
  request: CoursewareRequest,
  brief: IntentBrief,
  sentence: string
): CoursewareRequest {
  const value = (key: string): string => brief.fields.find((field) => field.key === key)?.value.trim() ?? ''
  const minutes = plannedLessonMinutes(value('duration'))
  return {
    ...request,
    topic: value('topic') || request.topic,
    audience: value('audience') ? audienceFromText(value('audience')) : request.audience,
    durationMinutes: minutes ? Math.max(20, Math.min(600, minutes)) : request.durationMinutes,
    // The teacher's own sentence is what the deck should emphasise.
    focus: sentence.trim() || request.focus
  }
}

export type VisualReview = {
  /** Images that will go into the deck. */
  selected: number
  /** Images to look at: not yet decided, or kept with low confidence. */
  uncertainIds: string[]
}

export function visualReviewSummary(assets: SourceVisualAsset[]): VisualReview {
  const usable = assets.filter((asset) => asset.role !== 'decorative' && (asset.imageDataUrl || asset.assetPath))
  return {
    selected: usable.filter((asset) => asset.status === 'approved').length,
    uncertainIds: usable
      .filter((asset) => asset.status === 'pending' || (asset.status === 'approved' && asset.confidence < UNCERTAIN_VISUAL_CONFIDENCE))
      .map((asset) => asset.id)
  }
}

export function visualReviewMessage(review: VisualReview): string {
  return `AI 已选 ${review.selected} 张教材图片，其中 ${review.uncertainIds.length} 张需要你看一眼。`
}

/** A slide whose notes the AI rewrote along with its content (Task 2.3.4). */
export function speakerNotesChanged(before: SlideSpec, after: SlideSpec): boolean {
  return before.speakerNotes.trim() !== after.speakerNotes.trim()
}

/**
 * Keeps the teacher's slide content and takes only the new notes, for “按正文更新讲稿” after the
 * teacher edited a slide by hand.
 */
export function withRegeneratedNotes(current: SlideSpec, regenerated: SlideSpec): SlideSpec {
  return { ...current, speakerNotes: regenerated.speakerNotes }
}
