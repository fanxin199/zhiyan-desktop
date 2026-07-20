import {
  DEFAULT_DEEPSEEK_BASE_URL,
  DEFAULT_MODEL_PROVIDER_ID,
  type AppSettingsV1,
  type KunRuntimeSettingsV1,
  type ModelProviderProfilePatchV1,
  type ModelProviderProfileV1,
  type ModelProviderSettingsPatchV1,
  type ModelProviderSettingsV1
} from './app-settings-types'
import { getKunRuntimeSettings } from './app-settings-kun'
import { normalizeDeepseekBaseUrl } from './app-settings-normalizers'
import { DEFAULT_COMPOSER_MODEL_IDS } from './default-composer-models'

const DEFAULT_MODEL_PROVIDER_NAME = 'DeepSeek'

export type ModelProviderPreset = Omit<ModelProviderProfileV1, 'apiKey'> & {
  recommendedModel: string
  consoleUrl: string
}

export const MODEL_PROVIDER_PRESETS: readonly ModelProviderPreset[] = [
  {
    id: DEFAULT_MODEL_PROVIDER_ID,
    name: DEFAULT_MODEL_PROVIDER_NAME,
    baseUrl: DEFAULT_DEEPSEEK_BASE_URL,
    models: DEFAULT_COMPOSER_MODEL_IDS.filter((id) => id !== 'auto'),
    recommendedModel: 'deepseek-v4-pro',
    consoleUrl: 'https://platform.deepseek.com/api_keys'
  },
  {
    id: 'kimi',
    name: 'Kimi',
    baseUrl: 'https://api.moonshot.cn/v1',
    models: ['kimi-k3', 'kimi-k2.6', 'kimi-k2.5'],
    recommendedModel: 'kimi-k3',
    consoleUrl: 'https://platform.moonshot.cn/console/api-keys'
  },
  {
    id: 'qwen',
    name: '通义千问',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    models: ['qwen3.7-plus', 'qwen3.7-max', 'qwen3.6-flash'],
    recommendedModel: 'qwen3.7-plus',
    consoleUrl: 'https://bailian.console.aliyun.com/'
  },
  {
    id: 'glm',
    name: '智谱 GLM',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    models: ['glm-5.2', 'glm-5', 'glm-4.7'],
    recommendedModel: 'glm-5.2',
    consoleUrl: 'https://bigmodel.cn/usercenter/proj-mgmt/apikeys'
  }
]

export function defaultModelProviderSettings(): ModelProviderSettingsV1 {
  const providers = defaultModelProviderProfiles('', DEFAULT_DEEPSEEK_BASE_URL)
  const defaultProvider = providers[0]
  return {
    apiKey: defaultProvider?.apiKey ?? '',
    baseUrl: defaultProvider?.baseUrl ?? DEFAULT_DEEPSEEK_BASE_URL,
    providers
  }
}

export function normalizeModelProviderSettings(
  input: ModelProviderSettingsPatchV1 | undefined
): ModelProviderSettingsV1 {
  const defaults = defaultModelProviderSettings()
  const apiKey = typeof input?.apiKey === 'string' ? input.apiKey.trim() : defaults.apiKey
  const baseUrl =
    typeof input?.baseUrl === 'string' && input.baseUrl.trim()
      ? normalizeDeepseekBaseUrl(input.baseUrl)
      : defaults.baseUrl
  const rawProviders = Array.isArray(input?.providers) ? input.providers : []
  const providersById = new Map<string, ModelProviderProfileV1>()
  const defaultProfiles = defaultModelProviderProfiles(apiKey, baseUrl)
  const defaultProvider = defaultProfiles[0] ?? defaultModelProviderProfile(apiKey, baseUrl)
  for (const provider of defaultProfiles) providersById.set(provider.id, provider)
  for (const rawProvider of rawProviders) {
    const provider = normalizeModelProviderProfile(rawProvider)
    if (!provider) continue
    providersById.set(provider.id, provider.id === DEFAULT_MODEL_PROVIDER_ID
      ? {
          ...defaultProvider,
          ...provider,
          apiKey,
          baseUrl
        }
      : provider)
  }
  const providers = [...providersById.values()]
  return {
    apiKey,
    baseUrl,
    providers
  }
}

export function mergeModelProviderSettings(
  current: ModelProviderSettingsV1,
  patch: ModelProviderSettingsPatchV1 | undefined
): ModelProviderSettingsV1 {
  return normalizeModelProviderSettings({
    ...current,
    ...(patch ?? {})
  })
}

export function getModelProviderSettings(settings: AppSettingsV1): ModelProviderSettingsV1 {
  return normalizeModelProviderSettings((settings as { provider?: ModelProviderSettingsPatchV1 }).provider)
}

export function modelProviderSettingsPatch(
  provider: ModelProviderSettingsPatchV1 | undefined
): ModelProviderSettingsPatchV1 {
  return provider ? { ...provider } : {}
}

export function resolveModelProviderApiKey(settings: AppSettingsV1): string {
  return getDefaultModelProviderProfile(settings).apiKey.trim()
}

export function resolveModelProviderBaseUrl(settings: AppSettingsV1): string {
  return normalizeDeepseekBaseUrl(getDefaultModelProviderProfile(settings).baseUrl)
}

export function getDefaultModelProviderProfile(settings: AppSettingsV1): ModelProviderProfileV1 {
  return getModelProviderProfile(settings, DEFAULT_MODEL_PROVIDER_ID)
}

export function getModelProviderProfile(
  settings: AppSettingsV1,
  providerId: string | undefined
): ModelProviderProfileV1 {
  const provider = getModelProviderSettings(settings)
  const id = normalizeProviderId(providerId || DEFAULT_MODEL_PROVIDER_ID)
  return provider.providers.find((profile) => profile.id === id) ?? provider.providers[0] ?? defaultModelProviderProfile(provider.apiKey, provider.baseUrl)
}

export function listModelProviderModelIds(settings: AppSettingsV1): string[] {
  const ids = new Set<string>()
  for (const provider of getModelProviderSettings(settings).providers) {
    for (const model of provider.models) {
      const trimmed = model.trim()
      if (trimmed) ids.add(trimmed)
    }
  }
  return [...ids].sort((a, b) => a.localeCompare(b))
}

export function resolveKunRuntimeSettings(settings: AppSettingsV1): KunRuntimeSettingsV1 {
  const runtime = getKunRuntimeSettings(settings)
  const provider = getModelProviderProfile(settings, runtime.providerId)
  const runtimeApiKey = runtime.apiKey?.trim() ?? ''
  const runtimeBaseUrl = runtime.baseUrl?.trim() ?? ''
  const providerBaseUrl = provider.baseUrl.trim() || DEFAULT_DEEPSEEK_BASE_URL

  return {
    ...runtime,
    apiKey: runtimeApiKey || provider.apiKey.trim(),
    baseUrl:
      runtimeBaseUrl && runtimeBaseUrl !== DEFAULT_DEEPSEEK_BASE_URL
        ? normalizeDeepseekBaseUrl(runtimeBaseUrl)
        : normalizeDeepseekBaseUrl(providerBaseUrl)
  }
}

function defaultModelProviderProfile(apiKey: string, baseUrl: string): ModelProviderProfileV1 {
  return {
    id: DEFAULT_MODEL_PROVIDER_ID,
    name: DEFAULT_MODEL_PROVIDER_NAME,
    apiKey: apiKey.trim(),
    baseUrl: normalizeDeepseekBaseUrl(baseUrl),
    models: DEFAULT_COMPOSER_MODEL_IDS.filter((id) => id !== 'auto')
  }
}

function defaultModelProviderProfiles(apiKey: string, baseUrl: string): ModelProviderProfileV1[] {
  return MODEL_PROVIDER_PRESETS.map((preset) => ({
    id: preset.id,
    name: preset.name,
    apiKey: preset.id === DEFAULT_MODEL_PROVIDER_ID ? apiKey.trim() : '',
    baseUrl: preset.id === DEFAULT_MODEL_PROVIDER_ID
      ? normalizeDeepseekBaseUrl(baseUrl)
      : preset.baseUrl,
    models: [...preset.models]
  }))
}

function normalizeModelProviderProfile(
  input: ModelProviderProfilePatchV1 | undefined
): ModelProviderProfileV1 | null {
  const id = normalizeProviderId(input?.id)
  if (!id) return null
  const name = typeof input?.name === 'string' && input.name.trim() ? input.name.trim() : id
  const baseUrl =
    typeof input?.baseUrl === 'string' && input.baseUrl.trim()
      ? normalizeDeepseekBaseUrl(input.baseUrl)
      : DEFAULT_DEEPSEEK_BASE_URL
  const models = normalizeProviderModels(input?.models)
  return {
    id,
    name,
    apiKey: typeof input?.apiKey === 'string' ? input.apiKey.trim() : '',
    baseUrl,
    models
  }
}

function normalizeProviderModels(models: unknown): string[] {
  if (!Array.isArray(models)) return []
  const ids = new Set<string>()
  for (const model of models) {
    if (typeof model !== 'string') continue
    const trimmed = model.trim()
    if (trimmed) ids.add(trimmed)
  }
  return [...ids].sort((a, b) => a.localeCompare(b))
}

function normalizeProviderId(value: unknown): string {
  return typeof value === 'string'
    ? value.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64)
    : ''
}
