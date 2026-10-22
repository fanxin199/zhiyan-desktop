import { useRef, type PointerEvent, type ReactElement, type ReactNode } from 'react'
import { ArrowRight, PanelRightClose, PanelRightOpen, Sparkles } from 'lucide-react'

export const AI_SIDE_PANEL_DEFAULT_WIDTH = 360
export const AI_SIDE_PANEL_MIN_WIDTH = 320
export const AI_SIDE_PANEL_MAX_WIDTH = 480

export function clampAiSidePanelWidth(width: number): number {
  if (!Number.isFinite(width)) return AI_SIDE_PANEL_DEFAULT_WIDTH
  return Math.min(AI_SIDE_PANEL_MAX_WIDTH, Math.max(AI_SIDE_PANEL_MIN_WIDTH, Math.round(width)))
}

export type AiNextStep = {
  id: string
  label: string
  description?: string
  onSelect: () => void
}

type AiSidePanelProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  width?: number
  onWidthChange?: (width: number) => void
  /** The conversation with the AI about this artifact. */
  children: ReactNode
  /** The result of the latest “说一句就改”, with keep and undo. */
  revision?: ReactNode
  /** “AI 已自查” suggestions. */
  checks?: ReactNode
  nextSteps?: AiNextStep[]
  /** The panel's input box, normally an IntentComposer with variant="panel". */
  composer: ReactNode
}

/**
 * The AI column on the right of every AI work page (§4.3): conversation, the latest change, self
 * check and next steps above one input box. It can be dragged between 320 and 480px and collapsed.
 */
export function AiSidePanel({
  open,
  onOpenChange,
  width = AI_SIDE_PANEL_DEFAULT_WIDTH,
  onWidthChange,
  children,
  revision,
  checks,
  nextSteps = [],
  composer
}: AiSidePanelProps): ReactElement {
  const dragStart = useRef<{ x: number; width: number } | null>(null)

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => onOpenChange(true)}
        className="flex h-full w-11 shrink-0 flex-col items-center gap-2 border-l border-ds-border-muted bg-ds-card pt-4 text-ds-muted transition-colors hover:text-ds-ink"
        aria-label="展开 AI 助手"
        title="展开 AI 助手"
      >
        <PanelRightOpen className="h-4 w-4" strokeWidth={1.8} />
        <Sparkles className="h-4 w-4 text-accent" strokeWidth={1.8} />
      </button>
    )
  }

  const startResize = (event: PointerEvent<HTMLDivElement>): void => {
    if (!onWidthChange) return
    dragStart.current = { x: event.clientX, width }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const resize = (event: PointerEvent<HTMLDivElement>): void => {
    if (!dragStart.current || !onWidthChange) return
    // The handle is on the left edge, so dragging left widens the panel.
    onWidthChange(clampAiSidePanelWidth(dragStart.current.width + dragStart.current.x - event.clientX))
  }

  return (
    <aside
      data-testid="ai-side-panel"
      className="relative flex h-full shrink-0 flex-col border-l border-ds-border-muted bg-ds-card"
      style={{ width: clampAiSidePanelWidth(width) }}
    >
      {onWidthChange ? (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="调整 AI 助手宽度"
          onPointerDown={startResize}
          onPointerMove={resize}
          onPointerUp={() => { dragStart.current = null }}
          className="absolute inset-y-0 -left-1 w-2 cursor-col-resize"
        />
      ) : null}
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-ds-border-muted px-4">
        <span className="inline-flex items-center gap-2 text-heading font-semibold text-ds-text">
          <Sparkles className="h-4 w-4 text-accent" strokeWidth={1.8} />
          AI 助手
        </span>
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          className="rounded-lg p-1.5 text-ds-muted transition-colors hover:bg-ds-hover hover:text-ds-ink"
          aria-label="收起 AI 助手"
          title="收起 AI 助手"
        >
          <PanelRightClose className="h-4 w-4" strokeWidth={1.8} />
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {revision ? <section aria-label="修改结果" className="mb-3">{revision}</section> : null}
        {checks ? <section aria-label="AI 自查" className="mb-3">{checks}</section> : null}
        <section aria-label="对话">{children}</section>
        {nextSteps.length > 0 ? (
          <section aria-label="下一步" className="mt-4 border-t border-ds-border-muted pt-3">
            <h2 className="mb-2 text-small font-semibold text-ds-muted">下一步</h2>
            <ul className="space-y-1.5">
              {nextSteps.map((step) => (
                <li key={step.id}>
                  <button
                    type="button"
                    onClick={step.onSelect}
                    className="group flex w-full items-center gap-2 rounded-lg border border-ds-border-muted px-3 py-2 text-left transition-colors hover:bg-ds-hover"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-small font-semibold text-ds-text">{step.label}</span>
                      {step.description ? (
                        <span className="block text-caption text-ds-muted">{step.description}</span>
                      ) : null}
                    </span>
                    <ArrowRight className="h-4 w-4 shrink-0 text-ds-faint group-hover:text-accent" strokeWidth={1.8} />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
      <div className="shrink-0 border-t border-ds-border-muted p-3">{composer}</div>
    </aside>
  )
}
