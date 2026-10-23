import { useState, type ReactElement } from 'react'
import { ChevronDown, ChevronRight, Loader2, ShieldCheck } from 'lucide-react'
import { SELF_CHECK_LABELS, type SelfCheckSuggestion } from '@shared/self-check'
import type { SelfCheckState } from '../../lib/self-check'

type SelfCheckPanelProps = {
  state: SelfCheckState
  /** Applies a suggestion's fix, saving a version; throws with a message when it cannot. */
  onAccept: (suggestion: SelfCheckSuggestion) => Promise<void>
  /** Another change is under way, so nothing can be accepted now. */
  busy?: boolean
}

/**
 * “AI 已自查：N 处建议” (Task 4.1.1) in the AI column: each suggestion can be accepted, which saves
 * the fix as a new version, or ignored.
 */
export function SelfCheckPanel({ state, onAccept, busy = false }: SelfCheckPanelProps): ReactElement {
  const [expanded, setExpanded] = useState(true)
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const [accepting, setAccepting] = useState<string | null>(null)
  const [error, setError] = useState('')
  const shown = state.suggestions.filter((suggestion) => !dismissed.has(suggestion.id))

  const dismiss = (id: string): void => setDismissed((current) => new Set([...current, id]))

  const accept = async (suggestion: SelfCheckSuggestion): Promise<void> => {
    setAccepting(suggestion.id)
    setError('')
    try {
      await onAccept(suggestion)
      dismiss(suggestion.id)
    } catch (acceptError) {
      setError(acceptError instanceof Error ? acceptError.message : '没有改成，请稍后再试。')
    } finally {
      setAccepting(null)
    }
  }

  const headline = shown.length > 0 ? `AI 已自查：${shown.length} 处建议` : 'AI 已自查：没有发现问题'
  return (
    <div className="rounded-xl border border-ds-border-muted bg-ds-subtle px-3 py-2" data-testid="self-check-panel">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
        disabled={shown.length === 0}
        className="flex w-full items-center gap-2 text-left text-small font-semibold text-ds-text"
      >
        <ShieldCheck className={`h-4 w-4 shrink-0 ${shown.length > 0 ? 'text-ds-warning' : 'text-ds-success'}`} strokeWidth={1.8} />
        <span className="min-w-0 flex-1">{headline}</span>
        {shown.length > 0 ? (expanded ? <ChevronDown className="h-4 w-4 text-ds-muted" /> : <ChevronRight className="h-4 w-4 text-ds-muted" />) : null}
      </button>
      {state.checking ? (
        <p role="status" className="mt-1 flex items-center gap-1.5 text-caption text-ds-muted">
          <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.8} />
          正在到 PubMed 核验引用……
        </p>
      ) : null}
      {state.unchecked > 0 ? (
        <p className="mt-1 text-caption text-ds-muted">有 {state.unchecked} 条引用暂时没能联网核验。</p>
      ) : null}
      {error ? <p role="alert" className="mt-1 text-caption text-ds-danger">{error}</p> : null}
      {expanded && shown.length > 0 ? (
        <ul className="mt-2 space-y-2">
          {shown.map((suggestion) => (
            <li key={suggestion.id} className="rounded-lg border border-ds-border-muted bg-ds-card px-3 py-2">
              <p className="text-small text-ds-text">
                <span className="mr-1.5 rounded bg-accent-soft px-1.5 py-0.5 text-caption font-semibold text-accent-strong">
                  {SELF_CHECK_LABELS[suggestion.check]}
                </span>
                {suggestion.title}
              </p>
              <p className="mt-1 text-caption leading-5 text-ds-muted">{suggestion.detail}</p>
              <div className="mt-2 flex gap-2">
                {suggestion.fix ? (
                  <button
                    type="button"
                    onClick={() => void accept(suggestion)}
                    disabled={busy || accepting !== null}
                    className="inline-flex items-center gap-1 rounded-lg bg-accent px-2.5 py-1 text-caption font-semibold text-white hover:bg-accent-strong disabled:opacity-50"
                  >
                    {accepting === suggestion.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.8} /> : null}
                    采纳
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => dismiss(suggestion.id)}
                  disabled={accepting === suggestion.id}
                  className="rounded-lg border border-ds-border px-2.5 py-1 text-caption font-semibold text-ds-text hover:bg-ds-hover"
                >
                  忽略
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
