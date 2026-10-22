import type { ReactElement } from 'react'

/** Something a teacher still has to provide before a primary action can run. */
export type MissingRequirement = {
  label: string
  /** Id of the field or section to bring into view. */
  targetId: string
}

/** Names what is still missing, such as “还差：选择教材、填写授课主题”. */
export function missingRequirementsText(missing: MissingRequirement[]): string {
  return `还差：${missing.map((item) => item.label).join('、')}`
}

/** Scrolls to the first missing item and focuses it when it is a field. */
export function focusFirstMissingRequirement(missing: MissingRequirement[]): void {
  const target = missing[0] && typeof document !== 'undefined'
    ? document.getElementById(missing[0].targetId)
    : null
  if (!target) return
  target.scrollIntoView({ block: 'center', behavior: 'smooth' })
  target.focus({ preventScroll: true })
}

/**
 * Primary buttons stay clickable when something is missing; clicking them shows this line and moves
 * to the first missing item instead of leaving the teacher with a greyed-out button.
 */
export function MissingRequirementsHint({
  missing,
  className = ''
}: {
  missing: MissingRequirement[]
  className?: string
}): ReactElement | null {
  if (missing.length === 0) return null
  return (
    <p role="status" className={`text-small font-medium text-ds-warning ${className}`.trim()}>
      {missingRequirementsText(missing)}
    </p>
  )
}
