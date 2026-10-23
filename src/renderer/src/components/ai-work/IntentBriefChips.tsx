import { useState, type KeyboardEvent, type ReactElement } from 'react'
import { HelpCircle } from 'lucide-react'
import { INTENT_SOURCE_LABELS, type IntentBrief, type IntentField } from '@shared/intent-brief'

type IntentBriefChipsProps = {
  brief: IntentBrief
  /** The teacher typed a new value; the caller records it as theirs (`updateIntentField`). */
  onChange: (key: string, value: string) => void
}

function FieldChip({ field, onEdit }: { field: IntentField; onEdit: () => void }): ReactElement {
  const missing = field.required && !field.value
  const fromElsewhere = field.value && field.source !== 'teacher' && field.source !== 'default'
  return (
    <button
      type="button"
      onClick={onEdit}
      title={missing ? `${field.label}：待补充，点击填写` : `${INTENT_SOURCE_LABELS[field.source]}，点击修改`}
      className={`inline-flex max-w-full items-center gap-1.5 rounded-lg border px-2.5 py-1 text-small transition-colors ${
        missing
          ? 'border-dashed border-ds-warning bg-ds-warning-soft text-ds-warning'
          : 'border-ds-border bg-ds-card text-ds-text hover:bg-ds-hover'
      }`}
    >
      <span className="shrink-0 text-ds-muted">{field.label}</span>
      <span className="truncate font-medium">{field.value || '待补充'}</span>
      {field.value && field.source === 'default' ? (
        <span className="shrink-0 rounded bg-ds-subtle px-1 text-caption text-ds-muted">默认</span>
      ) : null}
      {fromElsewhere ? <span className="shrink-0 text-caption text-ds-faint">{INTENT_SOURCE_LABELS[field.source]}</span> : null}
    </button>
  )
}

/**
 * The key points a tool will work from (Task 2.1.2): each shows its value and where it came from,
 * defaults are marked “默认”, missing required points ask to be filled, and any can be clicked to edit.
 */
export function IntentBriefChips({ brief, onChange }: IntentBriefChipsProps): ReactElement {
  const [editing, setEditing] = useState<{ key: string; draft: string } | null>(null)

  const commit = (): void => {
    if (!editing) return
    onChange(editing.key, editing.draft)
    setEditing(null)
  }
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.nativeEvent.isComposing) return
    if (event.key === 'Enter') commit()
    if (event.key === 'Escape') setEditing(null)
  }

  return (
    <section aria-label="要点" data-testid="intent-brief" className="space-y-2">
      {brief.question ? (
        <p role="status" className="flex items-start gap-1.5 text-small text-ds-text">
          <HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-accent" strokeWidth={1.8} />
          {brief.question}
        </p>
      ) : null}
      <ul className="flex flex-wrap gap-2">
        {brief.fields.map((field) => (
          <li key={field.key} className="max-w-full">
            {editing?.key === field.key ? (
              <label className="inline-flex items-center gap-1.5 rounded-lg border border-accent bg-ds-card px-2.5 py-1 text-small">
                <span className="shrink-0 text-ds-muted">{field.label}</span>
                <input
                  autoFocus
                  value={editing.draft}
                  onChange={(event) => setEditing({ key: field.key, draft: event.target.value })}
                  onKeyDown={onKeyDown}
                  onBlur={commit}
                  className="w-40 bg-transparent text-ds-text outline-none"
                />
              </label>
            ) : (
              <FieldChip field={field} onEdit={() => setEditing({ key: field.key, draft: field.value })} />
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
