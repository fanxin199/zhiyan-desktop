import type { ReactElement } from 'react'

export function RuntimeBanner({
  message,
  onOpenSettings,
  onRetryConnection,
  runtimeReady,
  stageInsetClass,
  t
}: {
  message: string
  onOpenSettings: () => void
  onRetryConnection: () => void
  runtimeReady: boolean
  stageInsetClass: string
  t: (key: string) => string
}): ReactElement {
  return (
    <div className="ds-no-drag shrink-0 border-b border-ds-warning/30 bg-ds-warning-soft backdrop-blur-lg">
      <div className={`${stageInsetClass} flex w-full min-w-0 items-start justify-between gap-3 py-3`}>
        <p className="min-w-0 flex-1 text-body leading-6 text-ds-warning">
          {message}
        </p>
        <div className="flex shrink-0 items-center gap-2">
          {!runtimeReady ? (
            <>
              <button
                type="button"
                className="rounded-lg border border-ds-warning/30 bg-ds-elevated px-3 py-1 text-caption font-medium text-ds-warning transition hover:bg-ds-warning-soft"
                onClick={onRetryConnection}
              >
                {t('retryConnection')}
              </button>
              <button
                type="button"
                className="rounded-lg px-3 py-1 text-caption font-medium text-ds-warning/80 transition hover:bg-ds-warning-soft"
                onClick={onOpenSettings}
              >
                {t('openSettings')}
              </button>
            </>
          ) : null}
        </div>
      </div>
    </div>
  )
}
