import type { ReactElement, ReactNode } from 'react'

export type MarketplaceNotice = {
  tone: 'success' | 'error' | 'info'
  message: string
}

export function TabButton({
  active,
  tone = 'default',
  onClick,
  children
}: {
  active: boolean
  tone?: 'default' | 'skill'
  onClick: () => void
  children: ReactNode
}): ReactElement {
  const activeClass =
    tone === 'skill'
      ? 'bg-ds-skill-soft text-ds-skill shadow-sm'
      : 'bg-ds-card text-ds-ink shadow-sm'

  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-4 py-2 text-heading font-semibold transition ${
        active ? activeClass : 'text-ds-muted hover:text-ds-ink'
      }`}
    >
      {children}
    </button>
  )
}


export function NoticeView({ notice }: { notice: MarketplaceNotice }): ReactElement {
  const className =
    notice.tone === 'error'
      ? 'border-ds-danger/30 bg-ds-danger-soft text-ds-danger'
      : notice.tone === 'success'
        ? 'border-ds-success/30 bg-ds-success-soft text-ds-success'
        : 'border-ds-border bg-ds-subtle text-ds-muted'
  return (
    <div className={`mt-4 rounded-xl border px-3 py-2 text-small leading-5 ${className}`}>
      {notice.message}
    </div>
  )
}
