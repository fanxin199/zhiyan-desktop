import type { ReactElement, ReactNode } from 'react'
import { Eye, EyeOff } from 'lucide-react'

export type InlineNotice = {
  tone: 'success' | 'error' | 'info'
  message: string
}

export function SecretInput({
  value,
  onChange,
  visible,
  onToggleVisibility,
  placeholder,
  autoComplete,
  invalid = false,
  showLabel,
  hideLabel,
  className = ''
}: {
  value: string
  onChange: (value: string) => void
  visible: boolean
  onToggleVisibility: () => void
  placeholder?: string
  autoComplete?: string
  invalid?: boolean
  showLabel: string
  hideLabel: string
  className?: string
}): ReactElement {
  return (
    <div
      className={`flex w-full min-w-0 items-stretch overflow-hidden rounded-xl bg-ds-card shadow-sm ${className} ${
        invalid
          ? 'border border-ds-warning/30 focus-within:border-ds-warning focus-within:ring-1 focus-within:ring-ds-warning/40'
          : 'border border-ds-border focus-within:border-accent/40 focus-within:ring-1 focus-within:ring-accent/30'
      }`}
    >
      <input
        type={visible ? 'text' : 'password'}
        autoComplete={autoComplete}
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent px-3 py-2 text-body text-ds-ink focus:outline-none"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <button
        type="button"
        aria-label={visible ? hideLabel : showLabel}
        title={visible ? hideLabel : showLabel}
        onClick={onToggleVisibility}
        className="shrink-0 border-l border-ds-border-muted px-3 text-ds-muted transition hover:bg-ds-hover hover:text-ds-ink"
      >
        {visible ? <EyeOff className="h-4 w-4" strokeWidth={1.75} /> : <Eye className="h-4 w-4" strokeWidth={1.75} />}
      </button>
    </div>
  )
}

export function SectionJumpButton({
  label,
  onClick
}: {
  label: string
  onClick: () => void
}): ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full border border-ds-border bg-ds-card px-3 py-1.5 text-caption font-medium text-ds-muted shadow-sm transition hover:bg-ds-hover hover:text-ds-ink"
    >
      {label}
    </button>
  )
}

export function InlineNoticeView({
  notice
}: {
  notice: InlineNotice
}): ReactElement {
  const className =
    notice.tone === 'error'
      ? 'border-ds-danger/30 bg-ds-danger-soft text-ds-danger'
      : notice.tone === 'success'
        ? 'border-ds-success/30 bg-ds-success-soft text-ds-success'
        : 'border-ds-border bg-ds-main/50 text-ds-muted'

  return (
    <div className={`rounded-xl border px-3 py-2 text-small leading-5 ${className}`}>
      {notice.message}
    </div>
  )
}

export function SettingsCard({
  title,
  children,
  className = ''
}: {
  title: string
  children: ReactNode
  className?: string
}): ReactElement {
  return (
    <section
      className={`rounded-2xl border border-ds-border bg-ds-card/95 shadow-sm ${className}`}
    >
      <div className="border-b border-ds-border-muted px-5 py-3">
        <h2 className="text-heading font-semibold text-ds-ink">{title}</h2>
      </div>
      <div className="divide-y divide-ds-border-muted px-2 py-1">{children}</div>
    </section>
  )
}

export function SettingRow({
  title,
  description,
  control,
  wideControl = false
}: {
  title: string
  description?: string
  control: ReactNode
  wideControl?: boolean
}): ReactElement {
  return (
    <div
      className={`flex gap-3 px-3 py-4 ${
        wideControl
          ? 'flex-col sm:gap-3.5'
          : 'flex-col sm:flex-row sm:items-start sm:justify-between sm:gap-8'
      }`}
    >
      <div className={`min-w-0 ${wideControl ? 'w-full max-w-none shrink-0' : 'flex-1'}`}>
        <div className="text-body font-semibold text-ds-ink">{title}</div>
        {description ? (
          <p className="mt-0.5 text-small leading-relaxed text-ds-muted">{description}</p>
        ) : null}
      </div>
      <div className={`w-full min-w-0 ${wideControl ? '' : 'sm:max-w-[420px]'}`}>
        {control}
      </div>
    </div>
  )
}

export function Toggle({
  checked,
  onChange,
  disabled = false
}: {
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}): ReactElement {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-disabled={disabled}
      disabled={disabled}
      onClick={() => {
        if (!disabled) onChange(!checked)
      }}
      className={`relative h-7 w-12 shrink-0 rounded-full transition ${
        checked ? 'bg-ds-success' : 'bg-ds-faint'
      } ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
    >
      <span
        className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition ${
          checked ? 'left-6' : 'left-0.5'
        }`}
      />
    </button>
  )
}
