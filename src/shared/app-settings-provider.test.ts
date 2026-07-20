import { describe, expect, it } from 'vitest'
import {
  defaultClawSettings,
  defaultKunRuntimeSettings,
  defaultModelProviderSettings,
  defaultScheduleSettings,
  defaultWriteSettings,
  resolveKunRuntimeSettings,
  type AppSettingsV1
} from './app-settings'

function settings(): AppSettingsV1 {
  return {
    version: 1,
    locale: 'en',
    theme: 'system',
    uiFontScale: 'small',
    provider: {
      ...defaultModelProviderSettings(),
      providers: [
        ...defaultModelProviderSettings().providers,
        {
          id: 'custom',
          name: 'Custom Provider',
          apiKey: 'sk-custom',
          baseUrl: 'https://custom.example/v1',
          models: ['custom-model']
        }
      ]
    },
    agents: {
      kun: {
        ...defaultKunRuntimeSettings(),
        providerId: 'custom',
        model: 'custom-model'
      }
    },
    workspaceRoot: '/tmp/workspace',
    log: { enabled: false, retentionDays: 7 },
    notifications: { turnComplete: true },
    showTechnicalMetrics: false,
    teacherProfile: {
      name: '',
      school: '',
      department: '',
      courses: [],
      researchTopics: []
    },
    teacherProjects: [],
    moduleContext: { projects: {}, recent: {} },
    appBehavior: { openAtLogin: false, startMinimized: false, closeToTray: false },
    write: defaultWriteSettings(),
    claw: defaultClawSettings(),
    schedule: defaultScheduleSettings(),
    guiUpdate: { channel: 'stable' }
  }
}

describe('model provider settings', () => {
  it('offers ready-to-configure presets for major Chinese model providers', () => {
    const providers = defaultModelProviderSettings().providers

    expect(providers.map((provider) => provider.id)).toEqual([
      'deepseek',
      'kimi',
      'qwen',
      'glm'
    ])
    expect(providers.find((provider) => provider.id === 'kimi')).toMatchObject({
      name: 'Kimi',
      baseUrl: 'https://api.moonshot.cn/v1',
      models: expect.arrayContaining(['kimi-k3', 'kimi-k2.6'])
    })
    expect(providers.find((provider) => provider.id === 'qwen')).toMatchObject({
      name: '通义千问',
      baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      models: expect.arrayContaining(['qwen3.7-plus', 'qwen3.7-max'])
    })
    expect(providers.find((provider) => provider.id === 'glm')).toMatchObject({
      name: '智谱 GLM',
      baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
      models: expect.arrayContaining(['glm-5.2', 'glm-5'])
    })
  })

  it('resolves Kun runtime credentials from the selected provider', () => {
    const runtime = resolveKunRuntimeSettings(settings())

    expect(runtime.apiKey).toBe('sk-custom')
    expect(runtime.baseUrl).toBe('https://custom.example/v1')
  })
})
