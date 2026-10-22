import { useMemo, type ReactElement } from 'react'
import { diffText } from '@shared/text-diff'

/**
 * Shows an AI change inline (§6.2): added text on a light green background, removed text struck
 * through in red. Chinese compares by character and other text by word.
 */
export function TextChangeHighlight({
  before,
  after,
  className = ''
}: {
  before: string
  after: string
  className?: string
}): ReactElement {
  const segments = useMemo(() => diffText(before, after), [before, after])
  return (
    <div className={`whitespace-pre-wrap break-words text-body leading-prose text-ds-ink ${className}`.trim()}>
      {segments.map((segment, index) => {
        if (segment.type === 'insert') {
          return (
            <ins key={index} className="rounded-sm bg-ds-success-soft text-ds-ink no-underline" data-change="insert">
              {segment.text}
            </ins>
          )
        }
        if (segment.type === 'delete') {
          return (
            <del key={index} className="text-ds-danger line-through" data-change="delete">
              {segment.text}
            </del>
          )
        }
        return <span key={index}>{segment.text}</span>
      })}
    </div>
  )
}
