import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react'
import { AlertCircle, CheckCircle2, Loader2, RefreshCw } from 'lucide-react'
import type {
  PythonCapabilityPackInstallResult,
  PythonRuntimeManagerResult,
  PythonRuntimeStatusV1
} from '@shared/python-runtime'

export type AnalysisRequirement = 'base' | 'bioinformatics'

export type AnalysisPreflightAction =
  | 'none'
  | 'install-core'
  | 'repair-core'
  | 'install-base'
  | 'repair-base'
  | 'install-bioinformatics'
  | 'repair-bioinformatics'

export type AnalysisEnvironmentPreflightModel = {
  ready: boolean
  tone: 'checking' | 'ready' | 'warning' | 'danger'
  title: string
  description: string
  action: AnalysisPreflightAction
  actionLabel?: string
}

type AnalysisPreflightInstallApi = {
  installPythonRuntime: (confirmed: boolean) => Promise<PythonRuntimeManagerResult>
  installBaseSciencePack: (confirmed: boolean) => Promise<PythonCapabilityPackInstallResult>
  installBioinformaticsPack: (confirmed: boolean) => Promise<PythonCapabilityPackInstallResult>
}

const CHECKING_MODEL: AnalysisEnvironmentPreflightModel = {
  ready: false,
  tone: 'checking',
  title: '正在检查分析环境',
  description: '正在确认当前任务是否可以直接开始。',
  action: 'none'
}

export function resolveAnalysisEnvironmentPreflight(
  status: PythonRuntimeStatusV1 | null,
  requirement: AnalysisRequirement
): AnalysisEnvironmentPreflightModel {
  if (!status || status.state === 'checking') return CHECKING_MODEL

  if (status.state === 'not-installed' || status.source !== 'managed') {
    return {
      ready: false,
      tone: 'warning',
      title: '需要安装科研分析引擎',
      description: '安装后即可在应用内完成统计、绘图和数据处理。',
      action: 'install-core',
      actionLabel: '一键安装'
    }
  }

  if (status.state === 'broken') {
    return {
      ready: false,
      tone: 'danger',
      title: '科研分析引擎需要修复',
      description: '修复不会影响教学、写作功能或已经填写的任务内容。',
      action: 'repair-core',
      actionLabel: '一键修复'
    }
  }

  const basePack = status.capabilityPacks.find((pack) => pack.id === 'base-science')
  if (!basePack || basePack.state === 'not-installed') {
    return {
      ready: false,
      tone: 'warning',
      title: '需要安装基础分析组件',
      description: '安装后即可运行表格统计、科研绘图和常用数据处理。',
      action: 'install-base',
      actionLabel: '一键安装'
    }
  }
  if (basePack.state !== 'ready') {
    return {
      ready: false,
      tone: 'warning',
      title: '基础分析组件需要修复',
      description: '修复完成后即可继续当前分析任务。',
      action: 'repair-base',
      actionLabel: basePack.state === 'upgrade-required' ? '立即升级' : '一键修复'
    }
  }

  if (requirement === 'bioinformatics') {
    const bioinformaticsPack = status.capabilityPacks.find((pack) => pack.id === 'bioinformatics')
    if (!bioinformaticsPack || bioinformaticsPack.state === 'not-installed') {
      return {
        ready: false,
        tone: 'warning',
        title: '需要安装单细胞分析扩展',
        description: '该扩展用于单细胞数据读取、聚类和基础可视化。',
        action: 'install-bioinformatics',
        actionLabel: '一键安装'
      }
    }
    if (bioinformaticsPack.state !== 'ready') {
      return {
        ready: false,
        tone: 'warning',
        title: '单细胞分析扩展需要修复',
        description: '修复完成后即可继续当前单细胞分析任务。',
        action: 'repair-bioinformatics',
        actionLabel: bioinformaticsPack.state === 'upgrade-required' ? '立即升级' : '一键修复'
      }
    }
  }

  return {
    ready: true,
    tone: 'ready',
    title: '可以直接分析',
    description: requirement === 'bioinformatics'
      ? '单细胞分析所需组件已准备好。'
      : '当前任务所需的基础分析能力已准备好。',
    action: 'none'
  }
}

function ensureInstallSucceeded(
  result: PythonRuntimeManagerResult | PythonCapabilityPackInstallResult
): void {
  if (!result.ok) throw new Error(result.message)
}

export async function runAnalysisPreflightAction(
  action: AnalysisPreflightAction,
  api: AnalysisPreflightInstallApi
): Promise<void> {
  if (action === 'none') return
  if (action === 'install-core' || action === 'repair-core') {
    ensureInstallSucceeded(await api.installPythonRuntime(true))
    ensureInstallSucceeded(await api.installBaseSciencePack(true))
    return
  }
  if (action === 'install-base' || action === 'repair-base') {
    ensureInstallSucceeded(await api.installBaseSciencePack(true))
    return
  }
  ensureInstallSucceeded(await api.installBioinformaticsPack(true))
}

function progressLabel(phase: string): string {
  switch (phase) {
    case 'preparing': return '正在准备安装'
    case 'downloading': return '正在下载安装文件'
    case 'verifying': return '正在检查安装文件'
    case 'installing': return '正在安装所需组件'
    case 'testing': return '正在确认分析能力'
    case 'activating': return '正在完成设置'
    case 'complete': return '安装完成，正在重新检查'
    default: return '正在准备分析环境'
  }
}

export function useAnalysisEnvironmentPreflight(
  enabled: boolean,
  requirement: AnalysisRequirement
): {
  model: AnalysisEnvironmentPreflightModel
  busy: boolean
  busyLabel: string
  errorMessage: string
  deferred: boolean
  onAction: () => Promise<void>
  onDefer: () => void
  onResume: () => void
} {
  const [status, setStatus] = useState<PythonRuntimeStatusV1 | null>(null)
  const [busy, setBusy] = useState(false)
  const [busyLabel, setBusyLabel] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [deferred, setDeferred] = useState(false)
  const model = useMemo(
    () => resolveAnalysisEnvironmentPreflight(status, requirement),
    [requirement, status]
  )

  const refresh = useCallback(async (): Promise<void> => {
    if (!enabled || typeof window === 'undefined' || !window.dsGui?.getPythonRuntimeStatus) return
    try {
      setErrorMessage('')
      setStatus(await window.dsGui.getPythonRuntimeStatus())
    } catch {
      setErrorMessage('暂时无法检查分析环境，请重新检查。')
    }
  }, [enabled])

  useEffect(() => {
    if (!enabled) return
    void refresh()
  }, [enabled, refresh, requirement])

  useEffect(() => {
    if (!enabled || typeof window === 'undefined' || !window.dsGui) return
    const disposers = [
      window.dsGui.onPythonRuntimeInstallProgress?.((progress) => setBusyLabel(progressLabel(progress.phase))),
      window.dsGui.onBaseSciencePackInstallProgress?.((phase) => setBusyLabel(progressLabel(phase))),
      window.dsGui.onBioinformaticsPackInstallProgress?.((phase) => setBusyLabel(progressLabel(phase)))
    ].filter((dispose): dispose is () => void => typeof dispose === 'function')
    return () => disposers.forEach((dispose) => dispose())
  }, [enabled])

  const onAction = useCallback(async (): Promise<void> => {
    if (!enabled || model.action === 'none' || !window.dsGui) return
    setBusy(true)
    setDeferred(false)
    setErrorMessage('')
    setBusyLabel('正在准备分析环境')
    try {
      await runAnalysisPreflightAction(model.action, window.dsGui)
      await refresh()
    } catch (installError) {
      setErrorMessage(installError instanceof Error ? installError.message : '准备分析环境失败，请重试。')
    } finally {
      setBusy(false)
      setBusyLabel('')
    }
  }, [enabled, model.action, refresh])

  const onResume = useCallback(() => {
    setDeferred(false)
    void refresh()
  }, [refresh])

  return {
    model,
    busy,
    busyLabel,
    errorMessage,
    deferred,
    onAction,
    onDefer: () => setDeferred(true),
    onResume
  }
}

export function AnalysisEnvironmentPreflight({
  model,
  busy,
  busyLabel = '',
  errorMessage = '',
  deferred = false,
  onAction,
  onDefer,
  onResume
}: {
  model: AnalysisEnvironmentPreflightModel
  busy: boolean
  busyLabel?: string
  errorMessage?: string
  deferred?: boolean
  onAction: () => void
  onDefer: () => void
  onResume?: () => void
}): ReactElement {
  if (deferred && !model.ready) {
    return (
      <div className="flex flex-col gap-2 rounded-xl border border-ds-border-muted bg-ds-main px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between" data-testid="analysis-environment-preflight">
        <p className="text-ui-body-sm text-ds-muted">分析环境尚未准备好，已填写的任务内容会保留。</p>
        <button type="button" onClick={onResume} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-ds-border px-3 py-2 text-ui-body-sm font-semibold text-ds-text transition hover:bg-ds-hover">
          <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.8} />
          重新检查
        </button>
      </div>
    )
  }

  const ready = model.tone === 'ready'
  const danger = model.tone === 'danger'
  return (
    <div
      className={`rounded-xl border px-4 py-3 ${
        ready
          ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/10'
          : danger
            ? 'border-red-200 bg-red-50 dark:border-red-500/30 dark:bg-red-500/10'
            : 'border-amber-200 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10'
      }`}
      data-testid="analysis-environment-preflight"
    >
      <div className="flex items-start gap-3">
        {model.tone === 'checking' || busy
          ? <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-accent" strokeWidth={1.8} />
          : ready
            ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" strokeWidth={1.8} />
            : <AlertCircle className={`mt-0.5 h-4 w-4 shrink-0 ${danger ? 'text-red-600' : 'text-amber-600'}`} strokeWidth={1.8} />}
        <div className="min-w-0 flex-1">
          <p className="text-ui-body-sm font-semibold text-ds-text">{model.title}</p>
          <p className="mt-1 text-ui-caption leading-relaxed text-ds-muted">{busy && busyLabel ? busyLabel : model.description}</p>
          {errorMessage ? <p className="mt-2 text-ui-caption font-semibold text-red-600 dark:text-red-300">{errorMessage}</p> : null}
        </div>
      </div>
      {!model.ready && model.action !== 'none' ? (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onDefer} disabled={busy} className="rounded-lg border border-ds-border bg-ds-card px-3 py-2 text-ui-body-sm font-semibold text-ds-text transition hover:bg-ds-hover disabled:opacity-50">
            稍后安装
          </button>
          <button type="button" onClick={onAction} disabled={busy} className="inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-3 py-2 text-ui-body-sm font-semibold text-white transition hover:opacity-95 disabled:opacity-50">
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.8} /> : null}
            {busy ? '正在处理' : model.actionLabel}
          </button>
        </div>
      ) : null}
    </div>
  )
}
