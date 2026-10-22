import type { ReactElement } from 'react'
import { ClipboardPaste, FilePenLine, FilePlus2, FolderOpen, ListTodo, RefreshCw, Sparkles } from 'lucide-react'
import { useTranslation } from 'react-i18next'

export function WriteWorkspaceStart({
  onAskAssistant,
  onCreateDraft,
  onOrganizeMaterial,
  onPickWorkspace,
  onRefreshWorkspace,
  workspaceName,
  workspacePathLabel
}: {
  onAskAssistant: () => void
  onCreateDraft: () => void
  onOrganizeMaterial: () => void
  onPickWorkspace: () => void
  onRefreshWorkspace: () => void
  workspaceName: string
  workspacePathLabel: string
}): ReactElement {
  const { t } = useTranslation('common')
  return (
    <div className="write-start-shell relative h-full min-h-[420px] overflow-auto rounded-[28px] bg-[linear-gradient(180deg,rgba(255,255,255,0.82),rgba(247,250,255,0.62))] px-5 py-5 dark:bg-[linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.025))] sm:px-8 sm:py-8">
      <div className="write-start-grid mx-auto grid min-h-full w-full max-w-6xl gap-6">
        <section className="write-start-hero min-w-0 py-4">
          <div className="inline-flex items-center gap-2 rounded-full border border-accent/15 bg-accent/10 px-3 py-1.5 text-caption font-semibold text-accent">
            <Sparkles className="h-3.5 w-3.5" strokeWidth={1.9} />
            <span>{t('writeStudio')}</span>
          </div>
          <h2 className="write-start-heading mt-5 max-w-[12ch] text-display font-semibold leading-[1.08] tracking-[0] text-ds-ink">
            {t('writeStartTitle')}
          </h2>
          <p className="write-start-copy mt-4 max-w-[56ch] text-heading leading-7 text-ds-muted">
            {t('writeStartSub')}
          </p>

          <div className="write-start-primary-actions mt-7 grid gap-3">
            <button
              type="button"
              onClick={onCreateDraft}
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-accent px-5 text-body font-semibold text-white shadow-lg shadow-accent/20 transition hover:brightness-110"
            >
              <FilePlus2 className="h-4 w-4" strokeWidth={1.9} />
              {t('writeStartNewDraft')}
            </button>
            <button
              type="button"
              onClick={onOrganizeMaterial}
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-ds-border bg-ds-card px-5 text-body font-semibold text-ds-ink shadow-sm transition hover:bg-ds-elevated"
            >
              <ClipboardPaste className="h-4 w-4 text-accent-strong" strokeWidth={1.9} />
              {t('writeStartOrganizeMaterial')}
            </button>
            <button
              type="button"
              onClick={onPickWorkspace}
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-ds-border bg-ds-card px-5 text-body font-semibold text-ds-ink shadow-sm transition hover:bg-ds-elevated"
            >
              <FolderOpen className="h-4 w-4 text-ds-skill" strokeWidth={1.9} />
              {t('writeStartChangeWorkspace')}
            </button>
          </div>

          <div className="write-start-shortcuts mt-7 grid gap-3">
            <button
              type="button"
              onClick={onRefreshWorkspace}
              className="group flex min-h-[82px] items-center gap-3 rounded-2xl border border-ds-border-muted bg-ds-card px-4 py-3 text-left transition hover:border-accent/25 hover:bg-ds-card"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent-strong">
                <RefreshCw className="h-5 w-5" strokeWidth={1.9} />
              </span>
              <span className="min-w-0">
                <span className="block text-body font-semibold text-ds-ink">
                  {t('writeStartRefresh')}
                </span>
                <span className="mt-1 block text-small leading-5 text-ds-faint">
                  {t('writeStartRefreshSub')}
                </span>
              </span>
            </button>
            <button
              type="button"
              onClick={onAskAssistant}
              className="group flex min-h-[82px] items-center gap-3 rounded-2xl border border-ds-border-muted bg-ds-card px-4 py-3 text-left transition hover:border-accent/25 hover:bg-ds-card"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-ds-success-soft text-ds-success">
                <ListTodo className="h-5 w-5" strokeWidth={1.9} />
              </span>
              <span className="min-w-0">
                <span className="block text-body font-semibold text-ds-ink">
                  {t('writeStartAskAi')}
                </span>
                <span className="mt-1 block text-small leading-5 text-ds-faint">
                  {t('writeStartAskAiSub')}
                </span>
              </span>
            </button>
          </div>
        </section>

        <aside className="write-start-card min-w-0 rounded-[24px] border border-ds-border-muted bg-ds-card p-5 shadow-[0_18px_48px_rgba(15,23,42,0.07)]">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-caption font-semibold text-ds-faint">
                {t('writeStartWorkspaceLabel')}
              </div>
              <div className="mt-1 truncate text-title font-semibold text-ds-ink">
                {workspaceName}
              </div>
            </div>
            <span className="shrink-0 rounded-full bg-ds-success-soft px-2.5 py-1 text-caption font-semibold text-ds-success">
              {t('writeStartReadyLabel')}
            </span>
          </div>

          <div className="mt-5 rounded-[20px] border border-ds-border-muted bg-ds-card p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.64)] dark:shadow-none">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-accent/10 text-accent">
                <FilePenLine className="h-5 w-5" strokeWidth={1.9} />
              </span>
              <div className="min-w-0">
                <div className="truncate text-heading font-semibold text-ds-ink">
                  {t('writeStartPreviewTitle')}
                </div>
                <div className="mt-1 text-small leading-5 text-ds-faint">
                  {t('writeStartPreviewSub')}
                </div>
              </div>
            </div>
            <div className="mt-6 space-y-3" aria-hidden="true">
              <div className="h-3 w-2/3 rounded-full bg-ds-hover" />
              <div className="h-2.5 w-full rounded-full bg-ds-hover" />
              <div className="h-2.5 w-11/12 rounded-full bg-ds-hover" />
              <div className="h-2.5 w-4/5 rounded-full bg-ds-hover" />
              <div className="pt-2">
                <div className="h-2.5 w-1/2 rounded-full bg-accent/15" />
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-ds-border-muted bg-ds-subtle/45 px-4 py-3">
            <div className="text-caption font-semibold text-ds-faint">
              {t('writeStartWorkspacePath')}
            </div>
            <div className="mt-2 break-all font-mono text-caption leading-5 text-ds-muted" title={workspacePathLabel}>
              {workspacePathLabel}
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
