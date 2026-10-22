import type { ReactElement, ReactNode } from 'react'
import type { ArtifactVersion } from '@shared/artifact'
import { ArtifactVersionMenu } from './ArtifactVersionMenu'

type ArtifactTopBarProps = {
  title: string
  /** Project or course name; “未归档” until projects arrive in P3. */
  projectLabel?: string
  /** Teacher-readable stage, such as “图片审核”. */
  stage?: string
  /** Key-point tags the AI understood (P2). */
  tags?: ReactNode
  /** Registered artifact id; the version menu appears once the artifact is registered. */
  artifactId?: string | null
  onRestored?: (version: ArtifactVersion) => void
  /** Export and other artifact actions, at most one primary button (§5.4). */
  actions?: ReactNode
}

/** The top bar of an AI work page: artifact name, its key points, the version menu and export. */
export function ArtifactTopBar({
  title,
  projectLabel = '未归档',
  stage,
  tags,
  artifactId,
  onRestored,
  actions
}: ArtifactTopBarProps): ReactElement {
  return (
    <header
      data-testid="artifact-top-bar"
      className="flex min-h-14 shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-ds-border-muted bg-ds-card px-8 py-2"
    >
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-heading font-semibold text-ds-text">{title}</h1>
        <p className="truncate text-caption text-ds-muted">
          {projectLabel}
          {stage ? ` · ${stage}` : ''}
        </p>
      </div>
      {tags ? <div className="flex min-w-0 flex-wrap items-center gap-1.5">{tags}</div> : null}
      <div className="flex shrink-0 items-center gap-2">
        {artifactId ? <ArtifactVersionMenu artifactId={artifactId} onRestored={onRestored} /> : null}
        {actions}
      </div>
    </header>
  )
}
