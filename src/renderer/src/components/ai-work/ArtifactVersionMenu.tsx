import { useEffect, useRef, useState, type ReactElement } from 'react'
import { ChevronDown, History, Loader2 } from 'lucide-react'
import type { ArtifactVersion, ArtifactVersionSource } from '@shared/artifact'
import { formatRelativeTime } from '../../lib/format-relative-time'

const SOURCE_LABELS: Record<ArtifactVersionSource, string> = {
  'ai-generate': 'AI 生成',
  'ai-revise': 'AI 修改',
  'teacher-edit': '手动修改',
  restore: '恢复'
}

export function artifactVersionSourceLabel(source: ArtifactVersionSource): string {
  return SOURCE_LABELS[source]
}

type VersionApi = Pick<Window['dsGui'], 'listArtifactVersions' | 'restoreArtifactVersion'>

type ArtifactVersionMenuProps = {
  artifactId: string
  /** Called after an earlier version has been written back, so the page can reload the artifact. */
  onRestored?: (version: ArtifactVersion) => void
  api?: VersionApi
}

/**
 * The version menu in the artifact top bar. Every AI change and editing session is a version;
 * restoring writes the old content back as a new version, so any restore can itself be undone.
 */
export function ArtifactVersionMenu({ artifactId, onRestored, api }: ArtifactVersionMenuProps): ReactElement {
  const bridge = (): VersionApi => api ?? window.dsGui
  const [open, setOpen] = useState(false)
  const [versions, setVersions] = useState<ArtifactVersion[] | null>(null)
  const [restoring, setRestoring] = useState<number | null>(null)
  const [error, setError] = useState('')
  const menuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    let active = true
    setError('')
    void bridge().listArtifactVersions(artifactId)
      .then((list) => { if (active) setVersions(list) })
      .catch(() => { if (active) setError('暂时无法读取版本记录。') })
    return () => { active = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- bridge() only resolves the injected or global API.
  }, [api, artifactId, open])

  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent): void => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  const restore = async (version: number): Promise<void> => {
    setRestoring(version)
    setError('')
    try {
      const restored = await bridge().restoreArtifactVersion(artifactId, version)
      setVersions(await bridge().listArtifactVersions(artifactId))
      onRestored?.(restored)
    } catch (restoreError) {
      setError(restoreError instanceof Error ? restoreError.message : '恢复失败，请稍后再试。')
    } finally {
      setRestoring(null)
    }
  }

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 rounded-lg border border-ds-border bg-ds-card px-2.5 py-1.5 text-small font-medium text-ds-text transition-colors hover:bg-ds-hover"
      >
        <History className="h-4 w-4" strokeWidth={1.8} />
        版本
        <ChevronDown className="h-3.5 w-3.5 text-ds-faint" strokeWidth={1.9} />
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-30 mt-2 max-h-96 w-80 overflow-y-auto rounded-2xl border border-ds-border-muted bg-ds-elevated p-1.5 shadow-lg"
        >
          {error ? <p className="px-3 py-2 text-small text-ds-danger">{error}</p> : null}
          {versions === null && !error ? (
            <p className="flex items-center gap-2 px-3 py-2 text-small text-ds-muted">
              <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.8} />
              正在读取版本…
            </p>
          ) : null}
          {versions?.length === 0 ? <p className="px-3 py-2 text-small text-ds-muted">还没有保存过版本。</p> : null}
          {versions?.map((version, index) => (
            <div key={version.version} role="menuitem" className="flex items-start gap-2 rounded-xl px-3 py-2 hover:bg-ds-subtle">
              <div className="min-w-0 flex-1">
                <p className="truncate text-small font-semibold text-ds-text">
                  第 {version.version} 版{version.summary ? ` · ${version.summary}` : ''}
                </p>
                <p className="text-caption text-ds-muted">
                  {artifactVersionSourceLabel(version.source)} · {formatRelativeTime(version.createdAt, 'zh-CN')}
                </p>
              </div>
              {index === 0 ? (
                <span className="shrink-0 rounded-md bg-ds-subtle px-1.5 py-0.5 text-caption text-ds-muted">当前</span>
              ) : (
                <button
                  type="button"
                  onClick={() => void restore(version.version)}
                  disabled={restoring !== null}
                  className="shrink-0 rounded-md border border-ds-border px-2 py-0.5 text-caption font-semibold text-ds-text hover:bg-ds-hover disabled:opacity-50"
                >
                  {restoring === version.version ? '正在恢复…' : '恢复'}
                </button>
              )}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}
