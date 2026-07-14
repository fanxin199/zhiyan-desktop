import type { ReactElement, RefObject } from 'react'
import { AlertCircle, Check, ChevronDown, Copy, Download, FileCode2, FilePenLine, Loader2, Sparkles } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { WriteExportFormat } from '@shared/write-export'
import type { WritePreviewMode, WriteSaveStatus } from '../../write/write-workspace-store'
import { SidebarTitlebarToggleButton } from '../sidebar/SidebarPrimitives'
import {
  WRITE_EXPORT_FORMATS,
  exportFormatLabel,
  modeButtonClass,
  toolbarIconButtonClass,
  toolbarMenuButtonClass,
  type WriteModeMenuItem
} from './write-workspace-view-utils'

type Props = {
  activeFileIsText: boolean
  activeFileName: string
  activeFilePath: string
  assistantOpen: boolean
  exportInFlight: boolean
  exportMenuOpen: boolean
  exportMenuRef: RefObject<HTMLDivElement | null>
  leftSidebarCollapsed: boolean
  liveModeActive: boolean
  modeMenuItems: WriteModeMenuItem[]
  modeMenuOpen: boolean
  modeMenuRef: RefObject<HTMLDivElement | null>
  onCopyRichText: () => void
  onExportFile: (format: WriteExportFormat) => void
  onToggleLeftSidebar: () => void
  readOnly: boolean
  saveLabel: string
  saveStatus: WriteSaveStatus
  setAssistantOpen: (open: boolean) => void
  setExportMenuOpen: (open: boolean | ((open: boolean) => boolean)) => void
  setModeMenuOpen: (open: boolean | ((open: boolean) => boolean)) => void
  setPreviewMode: (mode: WritePreviewMode) => void
}

export function WriteWorkspaceToolbar({
  activeFileIsText,
  activeFileName,
  activeFilePath,
  assistantOpen,
  exportInFlight,
  exportMenuOpen,
  exportMenuRef,
  leftSidebarCollapsed,
  liveModeActive,
  modeMenuItems,
  modeMenuOpen,
  modeMenuRef,
  onCopyRichText,
  onExportFile,
  onToggleLeftSidebar,
  readOnly,
  saveLabel,
  saveStatus,
  setAssistantOpen,
  setExportMenuOpen,
  setModeMenuOpen,
  setPreviewMode
}: Props): ReactElement {
  const { t } = useTranslation('common')
  return (
    <div className="ds-stage-inset -mx-3 shrink-0 sm:-mx-4 md:-mx-6 lg:-mx-8">
      <header
        data-testid="write-compact-toolbar"
        className="ds-topbar-surface relative z-10 mt-2 flex min-h-12 w-full items-center overflow-visible rounded-[16px]"
      >
        <div className="flex w-full min-w-0 items-center gap-2 px-3 py-1.5 sm:px-4 md:pl-5 md:pr-2">
          <div
            className={`flex min-w-0 flex-1 items-center gap-2 ${
              leftSidebarCollapsed ? 'ds-window-controls-safe-inset' : ''
            }`}
          >
            {leftSidebarCollapsed ? (
              <SidebarTitlebarToggleButton
                onClick={onToggleLeftSidebar}
                title={t('sidebarExpand')}
                ariaLabel={t('sidebarExpand')}
              />
            ) : null}
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent/9 text-accent">
              <FilePenLine className="h-3.5 w-3.5" strokeWidth={1.9} />
            </span>
            <div className="min-w-0 truncate text-[14px] font-semibold tracking-[-0.01em] text-ds-ink">
              {activeFileName}
            </div>
            <span
              className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                readOnly
                  ? 'bg-slate-500/10 text-slate-500'
                  : saveStatus === 'error'
                    ? 'bg-red-500/10 text-red-600 dark:text-red-300'
                    : saveStatus === 'dirty'
                      ? 'bg-amber-500/10 text-amber-600 dark:text-amber-300'
                      : saveStatus === 'saving'
                        ? 'bg-sky-500/10 text-sky-600 dark:text-sky-300'
                        : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300'
              }`}
              aria-label={saveLabel}
              title={saveLabel}
            >
              {saveStatus === 'saving' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
              ) : saveStatus === 'error' ? (
                <AlertCircle className="h-3.5 w-3.5" strokeWidth={2} />
              ) : saveStatus === 'dirty' ? (
                <span className="h-1.5 w-1.5 rounded-full bg-current" />
              ) : (
                <Check className="h-3.5 w-3.5" strokeWidth={2.2} />
              )}
            </span>
          </div>

          <div
            ref={modeMenuRef}
            className="relative flex shrink-0 items-center gap-0.5 rounded-xl border border-ds-border-muted bg-white/60 p-0.5 dark:bg-white/[0.06]"
          >
            <button
              type="button"
              onClick={() => setPreviewMode('live')}
              disabled={!activeFileIsText}
              className={`${modeButtonClass(liveModeActive)} gap-1.5 ${!activeFileIsText ? 'cursor-not-allowed opacity-45' : ''}`}
              title={t('writeModeLive')}
              aria-label={t('writeModeLive')}
            >
              <FileCode2 className="h-4 w-4" strokeWidth={1.85} />
              <span className="hidden text-[12.5px] font-semibold sm:inline">{t('writeModeLiveShort')}</span>
            </button>
            <button
              type="button"
              onClick={() => setModeMenuOpen((open) => !open)}
              disabled={!activeFileIsText}
              className={`${modeButtonClass(modeMenuOpen || !liveModeActive)} px-2 ${!activeFileIsText ? 'cursor-not-allowed opacity-45' : ''}`}
              title={t('writeModePreview')}
              aria-label={t('writeModePreview')}
              aria-haspopup="menu"
              aria-expanded={modeMenuOpen}
            >
              <ChevronDown
                className={`h-4 w-4 transition ${modeMenuOpen ? 'rotate-180' : ''}`}
                strokeWidth={1.9}
              />
            </button>
            {modeMenuOpen ? (
              <div
                role="menu"
                className="absolute left-0 top-full z-30 mt-2 min-w-[188px] overflow-hidden rounded-2xl border border-slate-200 bg-white p-1.5 shadow-[0_18px_40px_rgba(15,23,42,0.12)] dark:border-white/10 dark:bg-[#131722]"
              >
                {modeMenuItems.map((item) => (
                  <button
                    key={item.mode}
                    type="button"
                    role="menuitem"
                    disabled={!activeFileIsText}
                    onClick={() => {
                      setPreviewMode(item.mode)
                      setModeMenuOpen(false)
                    }}
                    className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-[13px] transition ${
                      item.active
                        ? 'bg-accent/12 text-accent'
                        : 'text-ds-ink hover:bg-slate-100'
                    } ${!activeFileIsText ? 'cursor-not-allowed opacity-40' : ''}`}
                  >
                    <span className="flex items-center gap-2">
                      {item.icon}
                      <span>{item.shortLabel}</span>
                    </span>
                    {item.active ? (
                      <span className="text-[11px] font-semibold uppercase tracking-[0.08em]">
                        ON
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="flex shrink-0 items-center gap-0.5">
            <button
              type="button"
              onClick={() => setAssistantOpen(!assistantOpen)}
              className={toolbarIconButtonClass(assistantOpen)}
              title={t('writeToggleAssistant')}
              aria-label={t('writeToggleAssistant')}
            >
              <Sparkles className="h-4 w-4" strokeWidth={1.85} />
            </button>
            <div ref={exportMenuRef} className="relative">
              <button
                type="button"
                onClick={() => setExportMenuOpen((open) => !open)}
                disabled={!activeFilePath || !activeFileIsText || exportInFlight}
                className={`${toolbarMenuButtonClass(exportMenuOpen)} disabled:cursor-not-allowed disabled:opacity-40`}
                title={exportInFlight ? t('writeExporting') : t('writeExport')}
                aria-label={exportInFlight ? t('writeExporting') : t('writeExport')}
                aria-haspopup="menu"
                aria-expanded={exportMenuOpen}
              >
                {exportInFlight ? (
                  <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.85} />
                ) : (
                  <Download className="h-4 w-4" strokeWidth={1.85} />
                )}
                <span className="sr-only">{t('writeExport')}</span>
                <ChevronDown className="h-3.5 w-3.5 opacity-70" strokeWidth={1.9} />
              </button>
              {exportMenuOpen ? (
                <div
                  role="menu"
                  className="absolute right-0 top-full z-30 mt-2 w-52 overflow-hidden rounded-2xl border border-ds-border bg-ds-card/95 p-1.5 shadow-[0_22px_48px_rgba(15,23,42,0.16)] backdrop-blur-xl"
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={onCopyRichText}
                    className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-[13px] text-ds-ink transition hover:bg-ds-hover/80"
                  >
                    <span>{t('writeCopyRichText')}</span>
                    <Copy className="h-3.5 w-3.5 text-ds-faint" strokeWidth={1.9} />
                  </button>
                  <div className="my-1 h-px bg-ds-border-muted" />
                  {WRITE_EXPORT_FORMATS.map((format) => (
                    <button
                      key={format}
                      type="button"
                      role="menuitem"
                      onClick={() => onExportFile(format)}
                      className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-[13px] text-ds-ink transition hover:bg-ds-hover/80"
                    >
                      <span>{exportFormatLabel(format, t)}</span>
                      <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-ds-faint">
                        {format}
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </header>
    </div>
  )
}
