import { useEffect, useState, type ReactElement, type ReactNode } from 'react'
import { FileText } from 'lucide-react'
import type { ArtifactListInput, ArtifactListItem } from '@shared/artifact'
import { formatRelativeTime } from '../../lib/format-relative-time'
import { PageColumn, PageHeader } from '../zhiyan/PageHeader'
import type { ZhiYanSectionModuleId } from '../zhiyan/zhiyan-module-registry'

export const AI_WORK_EXAMPLE_LIMIT = 3

type AiWorkPageProps = {
  module: ZhiYanSectionModuleId
  title: string
  description?: string
  /** Start: one sentence and materials. Work: the artifact on the left and the AI on the right. */
  state: 'start' | 'work'
  /** Start state content, normally an IntentComposer, AiWorkExamples and AiWorkRecentArtifacts. */
  start?: ReactNode
  topBar?: ReactNode
  canvas?: ReactNode
  sidePanel?: ReactNode
  className?: string
}

/**
 * The page every AI tool uses (§4.3): a start state with one input box, and a work state with the
 * artifact top bar, the artifact canvas and the AI side panel.
 */
export function AiWorkPage({
  module,
  title,
  description,
  state,
  start,
  topBar,
  canvas,
  sidePanel,
  className = ''
}: AiWorkPageProps): ReactElement {
  if (state === 'start') {
    return (
      <div data-ai-work-state="start" className={`h-full overflow-y-auto bg-ds-main ${className}`}>
        <PageColumn width="start" className="pb-12 pt-8">
          <PageHeader module={module} title={title} description={description} />
          {start}
        </PageColumn>
      </div>
    )
  }
  return (
    <div data-ai-work-state="work" className={`flex h-full min-h-0 flex-col bg-ds-main ${className}`}>
      {topBar}
      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1 overflow-y-auto">{canvas}</div>
        {sidePanel}
      </div>
    </div>
  )
}

/** At most three examples (§3.3); choosing one fills the input box. */
export function AiWorkExamples({
  examples,
  onSelect
}: {
  examples: string[]
  onSelect: (example: string) => void
}): ReactElement | null {
  const visible = examples.slice(0, AI_WORK_EXAMPLE_LIMIT)
  if (visible.length === 0) return null
  return (
    <section className="mt-4" aria-label="示例">
      <h2 className="mb-2 text-small font-semibold text-ds-muted">可以这样说</h2>
      <ul className="space-y-1.5">
        {visible.map((example) => (
          <li key={example}>
            <button
              type="button"
              onClick={() => onSelect(example)}
              className="w-full rounded-lg border border-ds-border-muted bg-ds-card px-3 py-2 text-left text-small text-ds-text transition-colors hover:bg-ds-hover"
            >
              {example}
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

type ListArtifacts = (filter?: ArtifactListInput) => Promise<ArtifactListItem[]>

/** Recent artifacts made by this tool, so a teacher can continue where they left off. */
export function AiWorkRecentArtifacts({
  toolId,
  onOpen,
  listArtifacts = typeof window === 'undefined' ? undefined : window.dsGui?.listArtifacts,
  limit = 5
}: {
  toolId: string
  onOpen: (artifact: ArtifactListItem) => void
  listArtifacts?: ListArtifacts
  limit?: number
}): ReactElement | null {
  const [artifacts, setArtifacts] = useState<ArtifactListItem[]>([])

  useEffect(() => {
    if (typeof listArtifacts !== 'function') return
    let active = true
    void listArtifacts({ toolId, limit })
      .then((items) => { if (active) setArtifacts(items) })
      .catch(() => undefined)
    return () => { active = false }
  }, [limit, listArtifacts, toolId])

  if (artifacts.length === 0) return null
  return (
    <section className="mt-8" aria-label="最近的成果">
      <h2 className="mb-2 text-small font-semibold text-ds-muted">最近的成果</h2>
      <ul className="divide-y divide-ds-border-muted rounded-xl border border-ds-border-muted bg-ds-card">
        {artifacts.map((artifact) => (
          <li key={artifact.id}>
            <button
              type="button"
              onClick={() => onOpen(artifact)}
              disabled={!artifact.available}
              title={artifact.available ? undefined : '文件已被移走或删除'}
              className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-ds-hover disabled:cursor-not-allowed disabled:opacity-60"
            >
              <FileText className="h-4 w-4 shrink-0 text-ds-muted" strokeWidth={1.8} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-small font-semibold text-ds-text">{artifact.title}</span>
                <span className="block text-caption text-ds-muted">
                  {artifact.available ? artifact.stage || '进行中' : '文件已被移走'} · {formatRelativeTime(artifact.updatedAt, 'zh-CN')}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
