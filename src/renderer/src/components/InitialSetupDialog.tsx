import { type CSSProperties, type ReactElement, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  getActiveAgentApiKey,
  getKunRuntimeSettings,
  getModelProviderProfile,
  getModelProviderSettings,
  MODEL_PROVIDER_PRESETS,
  normalizeAppSettings,
  type AppSettingsPatch,
  type AppSettingsV1,
  type ModelProviderProfileV1
} from '@shared/app-settings'
import { rendererRuntimeClient } from '../agent/runtime-client'
import { applyTheme } from '../lib/apply-theme'
import { useChatStore } from '../store/chat-store'
import { Eye, EyeOff, ExternalLink, Sparkles, Sun, Moon, Monitor, X } from 'lucide-react'

type ThemePref = AppSettingsV1['theme']
type SetupFormPatch = AppSettingsPatch
type MaskedInputStyle = CSSProperties & { WebkitTextSecurity?: 'disc' }

const themeOptions: { value: ThemePref; icon: typeof Sun; labelKey: string }[] = [
  { value: 'system', icon: Monitor, labelKey: 'themeSystem' },
  { value: 'light', icon: Sun, labelKey: 'themeLight' },
  { value: 'dark', icon: Moon, labelKey: 'themeDark' }
]
export function InitialSetupDialog(): ReactElement {
  const { t } = useTranslation('settings')
  const initialSetupMode = useChatStore((s) => s.initialSetupMode)
  const closeInitialSetup = useChatStore((s) => s.closeInitialSetup)
  const applyI18n = useChatStore((s) => s.applyI18nFromSettings)
  const reloadUiSettings = useChatStore((s) => s.reloadUiSettings)
  const probeRuntime = useChatStore((s) => s.probeRuntime)

  const [form, setForm] = useState<AppSettingsV1 | null>(null)
  const [showApiKey, setShowApiKey] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isPreview = initialSetupMode === 'preview'
  const providerSettings = form ? getModelProviderSettings(form) : null
  const kun = form ? getKunRuntimeSettings(form) : null
  const activeProvider = form ? getModelProviderProfile(form, kun?.providerId) : null
  const activePreset = MODEL_PROVIDER_PRESETS.find((preset) => preset.id === activeProvider?.id)

  useEffect(() => {
    let cancelled = false
    void rendererRuntimeClient
      .getSettings({ forceRefresh: true })
      .then((s) => {
        if (!cancelled) setForm(s)
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      })
    return () => { cancelled = true }
  }, [])

  const updateForm = (patch: SetupFormPatch) => {
    if (!form) return
    const next = normalizeAppSettings({
      ...form,
      ...patch,
      provider: {
        ...form.provider,
        ...(patch.provider ?? {})
      }
    } as AppSettingsV1)
    setForm(next)
  }

  const updateActiveProvider = (patch: Partial<ModelProviderProfileV1>): void => {
    if (!providerSettings || !activeProvider) return
    const providers = providerSettings.providers.map((provider) =>
      provider.id === activeProvider.id ? { ...provider, ...patch } : provider
    )
    updateForm({
      provider: {
        ...(activeProvider.id === 'deepseek'
          ? {
              apiKey: patch.apiKey ?? activeProvider.apiKey,
              baseUrl: patch.baseUrl ?? activeProvider.baseUrl
            }
          : {}),
        providers
      }
    })
  }

  const handleProviderChange = (providerId: string): void => {
    if (!form || !providerSettings) return
    const provider = providerSettings.providers.find((item) => item.id === providerId)
    if (!provider) return
    const preset = MODEL_PROVIDER_PRESETS.find((item) => item.id === providerId)
    updateForm({
      agents: {
        kun: {
          ...form.agents.kun,
          providerId,
          apiKey: '',
          baseUrl: '',
          model: preset?.recommendedModel ?? provider.models[0] ?? form.agents.kun.model
        }
      }
    })
  }

  const handleThemeChange = (theme: ThemePref) => {
    if (!form) return
    updateForm({ theme })
    applyTheme(theme)
  }

  const handleClose = () => {
    setError(null)
    closeInitialSetup()
    void reloadUiSettings()
  }

  const handleOpenOfficialApiPage = () => {
    if (typeof window.dsGui?.openExternal !== 'function') return
    if (!activePreset?.consoleUrl) return
    void window.dsGui.openExternal(activePreset.consoleUrl).catch(() => undefined)
  }

  const handleSave = async () => {
    if (!form) return
    if (!getActiveAgentApiKey(form).trim()) {
      setError(t('firstRunApiKeyValidation'))
      return
    }
    setSaving(true)
    setError(null)
    try {
      const next = await rendererRuntimeClient.setSettings(form)
      setForm(next)
      await applyI18n(next.locale)
      await reloadUiSettings()
      await probeRuntime('user')
      const runtimeState = useChatStore.getState()
      if (runtimeState.runtimeConnection !== 'ready') {
        throw new Error(runtimeState.error || '无法连接 AI 服务，请检查 API Key 和服务地址。')
      }
      closeInitialSetup()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  if (!form) {
    return (
      <div className="ds-no-drag fixed inset-0 z-50 grid place-items-center bg-ds-overlay p-4 backdrop-blur-md">
        <div className="rounded-xl border border-ds-border bg-ds-card/95 px-5 py-4 text-body leading-5 text-ds-muted shadow-panel backdrop-blur-xl">
          {t('loading')}
        </div>
      </div>
    )
  }

  const selectedTheme = form.theme
  const choiceButtonClass = (active: boolean): string =>
    [
      'flex min-h-10 min-w-0 items-center justify-center gap-2 rounded-xl border px-3 py-2 text-body leading-5 font-medium transition-all duration-200 sm:min-h-11 sm:px-4',
      active
        ? 'border-accent bg-accent/10 text-accent-strong shadow-sm'
        : 'border-ds-border bg-ds-card text-ds-muted hover:border-ds-border hover:bg-ds-elevated'
    ].join(' ')
  const fieldClass =
    'w-full rounded-xl border border-ds-border bg-ds-card px-4 py-3 text-heading text-ds-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] outline-none transition placeholder:text-ds-faint focus:border-accent/70 focus:ring-2 focus:ring-accent/15 dark:shadow-none'
  const labelClass = 'text-body leading-5 font-semibold text-ds-ink'
  const apiKeyMaskStyle: MaskedInputStyle | undefined =
    !showApiKey && activeProvider?.apiKey ? { WebkitTextSecurity: 'disc' } : undefined

  return (
    <div className="ds-no-drag fixed inset-0 z-50 overflow-y-auto bg-ds-overlay p-3 backdrop-blur-[18px] dark:backdrop-blur-[22px] sm:p-6">
      <div className="flex min-h-full items-center justify-center">
        <section
          role="dialog"
          aria-modal="true"
          aria-labelledby="initial-setup-title"
          className="flex h-[calc(100dvh-24px)] max-h-[calc(100dvh-24px)] w-full max-w-[640px] flex-col overflow-hidden rounded-2xl border border-ds-border-muted bg-ds-elevated text-ds-ink shadow-[0_28px_86px_rgba(88,105,136,0.22)] backdrop-blur-2xl dark:shadow-[0_28px_92px_rgba(0,0,0,0.55)] sm:h-auto sm:max-h-[calc(100dvh-48px)]"
        >
        <div className="shrink-0 border-b border-ds-border-muted bg-ds-elevated px-5 py-4 sm:px-7 sm:py-6">
          <div className="flex items-start justify-between gap-3">
            <div className="inline-flex min-w-0 items-center gap-2 rounded-lg border border-accent/20 bg-accent/5 px-3 py-1.5 text-small font-semibold text-accent-strong">
              <Sparkles className="h-3.5 w-3.5" strokeWidth={1.9} />
              <span className="min-w-0 truncate">{t(isPreview ? 'firstRunPreviewBadge' : 'firstRunBadge')}</span>
            </div>
            <button
              type="button"
              onClick={handleClose}
              aria-label={t('firstRunClose')}
              title={t('firstRunClose')}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-ds-border bg-ds-card text-ds-muted transition hover:border-ds-border hover:text-ds-ink"
            >
              <X className="h-[18px] w-[18px]" strokeWidth={1.8} />
            </button>
          </div>
          <h1 id="initial-setup-title" className="mt-3 text-title font-semibold leading-tight text-ds-ink sm:mt-4 sm:text-display">
            {t('firstRunTitle')}
          </h1>
          <p className="mt-2.5 text-body leading-6 text-ds-muted sm:text-heading">
            {t('firstRunSubtitle')}
          </p>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4 sm:space-y-5 sm:px-7 sm:py-6">
          <div className="space-y-2.5 sm:space-y-3.5">
            <label className={labelClass}>
              {t('theme')}
            </label>
            <div className="grid grid-cols-1 gap-2 sm:gap-2.5 sm:grid-cols-3">
              {themeOptions.map(({ value, icon: Icon, labelKey }) => {
                const isActive = selectedTheme === value
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => handleThemeChange(value)}
                    className={choiceButtonClass(isActive)}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="min-w-0 text-center leading-tight">{t(labelKey)}</span>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="space-y-2.5 sm:space-y-3.5">
            <label className={labelClass}>
              {t('language')}
            </label>
            <div className="grid grid-cols-1 gap-2 sm:gap-2.5 min-[440px]:grid-cols-2">
              {(['en', 'zh'] as const).map((lang) => {
                const isActive = form.locale === lang
                return (
                  <button
                    key={lang}
                    type="button"
                    onClick={() => {
                      updateForm({ locale: lang })
                      void applyI18n(lang)
                    }}
                    className={choiceButtonClass(isActive)}
                  >
                    <span className="min-w-0 text-center leading-tight">{lang === 'en' ? 'English' : '简体中文'}</span>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="space-y-2.5 sm:space-y-3.5">
            <label className={labelClass}>
              {t('firstRunProvider')}
            </label>
            <div className="grid grid-cols-2 gap-2 sm:gap-2.5">
              {providerSettings?.providers.map((provider) => {
                const isActive = activeProvider?.id === provider.id
                return (
                  <button
                    key={provider.id}
                    type="button"
                    onClick={() => handleProviderChange(provider.id)}
                    className={choiceButtonClass(isActive)}
                  >
                    <span className="min-w-0 text-center leading-tight">{provider.name}</span>
                  </button>
                )
              })}
            </div>
            <p className="text-small leading-5 text-ds-muted">
              {t('firstRunProviderHint')}
            </p>
          </div>

          <div className="space-y-2.5 sm:space-y-3.5">
            <label className={labelClass}>
              {t('apiKey')}
            </label>
            <div className="relative">
              <input
                type="text"
                value={activeProvider?.apiKey ?? ''}
                onChange={(e) => updateActiveProvider({ apiKey: e.target.value })}
                placeholder="sk-..."
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                style={apiKeyMaskStyle}
                className={`${fieldClass} pr-12 font-mono placeholder:font-sans`}
              />
              <button
                type="button"
                onClick={() => setShowApiKey((v) => !v)}
                className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-ds-faint transition-colors hover:bg-ds-subtle hover:text-ds-muted"
              >
                {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <div className="grid gap-3 rounded-xl border border-ds-border-muted bg-ds-hover px-4 py-3 text-small text-ds-muted min-[560px]:grid-cols-[1fr_auto] min-[560px]:items-center">
              <p className="min-w-0 leading-6">
                {t('firstRunBuyApiHint')}
              </p>
              {activePreset ? (
                <button
                  type="button"
                  onClick={handleOpenOfficialApiPage}
                  className="inline-flex min-h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-accent/25 bg-accent/5 px-3 py-1.5 text-small font-semibold text-accent-strong transition hover:bg-accent/10"
                >
                  <span className="min-w-0 text-center leading-tight">{t('firstRunBuyApiAction')}</span>
                  <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.9} />
                </button>
              ) : null}
            </div>
          </div>

          <div className="space-y-2.5 sm:space-y-3.5">
            <label className={labelClass}>
              {t('baseUrl')}
            </label>
            <input
              type="text"
              value={activeProvider?.baseUrl ?? ''}
              onChange={(e) => updateActiveProvider({ baseUrl: e.target.value })}
              placeholder={activePreset?.baseUrl ?? 'https://api.example.com/v1'}
              className={fieldClass}
            />
          </div>
        </div>

        <div className="shrink-0 space-y-3 border-t border-ds-border-muted bg-ds-card px-5 pb-4 pt-3.5 sm:space-y-4 sm:px-7 sm:pb-6 sm:pt-4">
          {error && (
            <div className="rounded-xl border border-ds-danger/30 bg-ds-danger-soft px-4 py-3 text-small text-ds-danger">
              {error}
            </div>
          )}

          <div className="flex flex-col-reverse gap-3 sm:grid sm:grid-cols-[0.85fr_1fr]">
            <button
              type="button"
              onClick={handleClose}
              className="min-h-11 rounded-xl border border-ds-border bg-ds-card px-4 py-2 text-heading font-semibold text-ds-ink transition hover:border-ds-border hover:bg-ds-elevated"
            >
              {t('firstRunClose')}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={handleSave}
              className="min-h-11 rounded-xl bg-accent px-4 py-2 text-heading font-semibold text-white shadow-lg shadow-accent/20 transition hover:opacity-95 disabled:opacity-50"
            >
              {saving ? t('firstRunSaving') : t('firstRunSave')}
            </button>
          </div>

          <p className="text-center text-small leading-6 text-ds-faint">
            {t(isPreview ? 'firstRunPreviewHint' : 'firstRunChangeLater')}
          </p>
        </div>
        </section>
      </div>
    </div>
  )
}
