import { useState, type ReactElement } from 'react'
import { Check, ChevronDown, ChevronRight, Loader2, Undo2 } from 'lucide-react'
import type { RevisionResult } from '@shared/artifact-revision'
import { countChangedPlaces, diffText } from '@shared/text-diff'
import { TextChangeHighlight } from './TextChangeHighlight'

/** “已修改案例导入，3 处变化”. */
export function revisionHeadline(result: RevisionResult): string {
  if (result.changes.length === 0) return 'AI 看过了，这部分没有需要修改的地方'
  const places = result.changes.reduce(
    (total, change) => total + countChangedPlaces(diffText(change.before, change.after)),
    0
  )
  const refs = result.changes.map((change) => change.ref).join('、')
  return `已修改${refs}，${places} 处变化`
}

type RevisionResultCardProps = {
  result: RevisionResult
  /** 保留: closes the card; doing nothing also keeps the change. */
  onKeep: () => void
  /** 撤销: restores `result.undoVersion`, itself saved as a new version. */
  onUndo: () => void
  undoing?: boolean
  undone?: boolean
}

/** The latest change in the AI side panel: what changed, where, and keep or undo (§6.2). */
export function RevisionResultCard({ result, onKeep, onUndo, undoing = false, undone = false }: RevisionResultCardProps): ReactElement {
  const [expanded, setExpanded] = useState(false)
  const hasChanges = result.changes.length > 0
  return (
    <div data-testid="revision-result" className="rounded-xl border border-ds-border-muted bg-ds-card p-3">
      <p className="text-small font-semibold text-ds-text">
        {undone ? '已撤销这次修改' : revisionHeadline(result)}
      </p>
      {!undone && hasChanges ? <p className="mt-0.5 text-caption text-ds-muted">{result.summary}</p> : null}
      {result.rebased && !undone ? (
        <p className="mt-1.5 text-caption text-ds-warning">你在提问后改过内容，已按最新内容修改。</p>
      ) : null}
      {result.discardedOutsideScope && !undone ? (
        <p className="mt-1.5 text-caption text-ds-warning">AI 还改动了所选范围以外的内容，这部分已丢弃。</p>
      ) : null}
      {hasChanges && !undone ? (
        <>
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            aria-expanded={expanded}
            className="mt-2 inline-flex items-center gap-1 text-caption font-medium text-ds-muted hover:text-ds-ink"
          >
            {expanded
              ? <ChevronDown className="h-3.5 w-3.5" strokeWidth={1.9} />
              : <ChevronRight className="h-3.5 w-3.5" strokeWidth={1.9} />}
            查看改动
          </button>
          {expanded ? (
            <div className="mt-2 max-h-72 space-y-3 overflow-y-auto rounded-lg bg-ds-subtle p-2.5">
              {result.changes.map((change) => (
                <div key={change.ref}>
                  {result.changes.length > 1 ? <p className="mb-1 text-caption font-semibold text-ds-muted">{change.ref}</p> : null}
                  <TextChangeHighlight before={change.before} after={change.after} className="text-small" />
                </div>
              ))}
            </div>
          ) : null}
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={onKeep}
              disabled={undoing}
              className="inline-flex items-center gap-1.5 rounded-lg border border-ds-border px-3 py-1.5 text-small font-semibold text-ds-text transition-colors hover:bg-ds-hover disabled:opacity-50"
            >
              <Check className="h-4 w-4" strokeWidth={1.9} />
              保留
            </button>
            <button
              type="button"
              onClick={onUndo}
              disabled={undoing}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-small font-semibold text-ds-muted transition-colors hover:bg-ds-hover hover:text-ds-ink disabled:opacity-50"
            >
              {undoing ? <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.9} /> : <Undo2 className="h-4 w-4" strokeWidth={1.9} />}
              {undoing ? '正在撤销…' : '撤销'}
            </button>
          </div>
        </>
      ) : null}
    </div>
  )
}
