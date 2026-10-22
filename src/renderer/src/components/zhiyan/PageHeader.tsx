import type { ReactElement, ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import type { ZhiYanModuleSectionId } from './zhiyan-module-registry'

export const ICON_TONE_CLASSES: Record<ZhiYanModuleSectionId, string> = {
  teaching: 'bg-ds-domain-teaching-soft text-ds-domain-teaching',
  research: 'bg-ds-domain-research-soft text-ds-domain-research',
  capabilities: 'bg-ds-subtle text-ds-muted'
}

// §5.3: 32px side gutters around at most 720px of content on start pages and 1152px on work pages.
const PAGE_WIDTH_CLASSES = {
  start: 'max-w-[784px]',
  work: 'max-w-[1216px]'
} as const

export type PageWidth = keyof typeof PAGE_WIDTH_CLASSES

export const PAGE_HEADER_ACTION_CLASS =
  'inline-flex items-center gap-2 rounded-lg border border-ds-border bg-ds-card px-3 py-2 text-small font-semibold text-ds-text transition-colors hover:bg-ds-hover disabled:opacity-50'

export function PageColumn({
  width,
  className = '',
  children
}: {
  width: PageWidth
  className?: string
  children: ReactNode
}): ReactElement {
  return <div className={`mx-auto w-full px-8 ${PAGE_WIDTH_CLASSES[width]} ${className}`}>{children}</div>
}

type PageHeaderProps = {
  icon: LucideIcon
  tone: ZhiYanModuleSectionId
  title: string
  description?: ReactNode
  actions?: ReactNode
}

export function PageHeader({ icon: Icon, tone, title, description, actions }: PageHeaderProps): ReactElement {
  return (
    <header className="mb-6 flex items-center gap-4">
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${ICON_TONE_CLASSES[tone]}`}>
        <Icon className="h-5 w-5" strokeWidth={1.8} />
      </div>
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-title font-semibold text-ds-text">{title}</h1>
        {description ? <p className="mt-0.5 text-small text-ds-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  )
}
