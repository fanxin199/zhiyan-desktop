import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { dialog } from 'electron'
import {
  defaultClawSettings,
  defaultKunRuntimeSettings,
  defaultModelProviderSettings,
  defaultScheduleSettings,
  defaultWriteSettings,
  type AppSettingsV1
} from '../../shared/app-settings'
import { registerAppIpcHandlers } from './register-app-ipc-handlers'
import { emptyPythonRuntimeStatus } from '../../shared/python-runtime'

const handlers = new Map<string, (event: unknown, payload?: unknown) => Promise<unknown>>()

vi.mock('electron', () => ({
  app: {
    quit: vi.fn()
  },
  dialog: {
    showOpenDialog: vi.fn()
  },
  shell: {},
  ipcMain: {
    handle: vi.fn((channel: string, handler: (event: unknown, payload?: unknown) => Promise<unknown>) => {
      handlers.set(channel, handler)
    })
  }
}))

function settings(): AppSettingsV1 {
  return {
    version: 1,
    locale: 'en',
    theme: 'system',
    uiFontScale: 'small',
    provider: defaultModelProviderSettings(),
    agents: {
      kun: defaultKunRuntimeSettings()
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

function registerOptions(overrides: Partial<Parameters<typeof registerAppIpcHandlers>[0]> = {}) {
  const applySettingsPatch = vi.fn(async () => settings())
  return {
    store: { load: vi.fn(async () => settings()) } as never,
    getMainWindow: () => null,
    applySettingsPatch,
    runtimeRequest: vi.fn() as never,
    fetchUpstreamModels: vi.fn() as never,
    inspectPythonRuntime: vi.fn(async () => emptyPythonRuntimeStatus('2026-07-13T00:00:00.000Z')),
    getPythonRuntimeManifest: vi.fn() as never,
    installManagedPythonRuntime: vi.fn() as never,
    uninstallManagedPythonRuntime: vi.fn() as never,
    resolveKunConfigPath: () => '/tmp/kun.json',
    showTurnCompleteNotification: vi.fn() as never,
    getAppVersion: () => '0.1.0',
    readGuiUpdateState: vi.fn() as never,
    loadGuiUpdaterModule: vi.fn() as never,
    resolveLogDirectory: () => '/tmp/logs',
    logError: vi.fn(),
    ...overrides
  }
}

describe('registerAppIpcHandlers', () => {
  beforeEach(() => {
    handlers.clear()
    vi.mocked(dialog.showOpenDialog).mockReset()
  })

  it('exposes the inspected Python runtime status', async () => {
    const inspectPythonRuntime = vi.fn(async () => emptyPythonRuntimeStatus('2026-07-13T00:00:00.000Z'))
    registerAppIpcHandlers(registerOptions({ inspectPythonRuntime }))

    await expect(handlers.get('python:runtime-status')?.({})).resolves.toMatchObject({
      version: 1,
      state: 'not-installed'
    })
    expect(inspectPythonRuntime).toHaveBeenCalledOnce()
  })

  it('requires explicit teacher confirmation before installing managed Python', async () => {
    const installManagedPythonRuntime = vi.fn(async () => ({ ok: true as const }))
    registerAppIpcHandlers(registerOptions({ installManagedPythonRuntime }))

    const handler = handlers.get('python:runtime-install')
    await expect(handler?.({}, { confirmed: false })).rejects.toThrow(/explicit confirmation/u)
    await expect(handler?.({}, { confirmed: true })).resolves.toEqual({ ok: true })
    expect(installManagedPythonRuntime).toHaveBeenCalledOnce()
  })

  it('requires explicit teacher confirmation before uninstalling managed Python', async () => {
    const uninstallManagedPythonRuntime = vi.fn(async () => ({ ok: true as const }))
    registerAppIpcHandlers(registerOptions({ uninstallManagedPythonRuntime }))

    const handler = handlers.get('python:runtime-uninstall')
    await expect(handler?.({}, { confirmed: false })).rejects.toThrow(/explicit confirmation/u)
    await expect(handler?.({}, { confirmed: true })).resolves.toEqual({ ok: true })
    expect(uninstallManagedPythonRuntime).toHaveBeenCalledOnce()
  })

  it('rejects invalid settings patches at the handler boundary', async () => {
    const applySettingsPatch = vi.fn(async () => settings())

    registerAppIpcHandlers(registerOptions({ applySettingsPatch }))

    const handler = handlers.get('settings:set')
    expect(handler).toBeTypeOf('function')
    await expect(
      handler?.({}, { agents: { kun: { mysteryFlag: true } } })
    ).rejects.toThrow(/Invalid payload for settings:set/)
    expect(applySettingsPatch).not.toHaveBeenCalled()
  })

  it('passes valid settings patches through to applySettingsPatch', async () => {
    const applySettingsPatch = vi.fn(async () => settings())

    registerAppIpcHandlers(registerOptions({ applySettingsPatch }))

    const payload = {
      theme: 'dark' as const,
      agents: {
        kun: {
          port: 9000
        }
      }
    }
    const handler = handlers.get('settings:set')
    await expect(handler?.({}, payload)).resolves.toEqual(settings())
    expect(applySettingsPatch).toHaveBeenCalledWith(payload)
  })

  it('accepts the full settings snapshot emitted by SettingsView auto-apply', async () => {
    const applySettingsPatch = vi.fn(async () => settings())

    registerAppIpcHandlers(registerOptions({ applySettingsPatch }))

    const payload = { ...settings(), locale: 'zh' as const }
    const handler = handlers.get('settings:set')
    await expect(handler?.({}, payload)).resolves.toEqual(settings())
    expect(applySettingsPatch).toHaveBeenCalledWith(payload)
  })

  it('routes desktop command IPC calls to the focused window and web contents', async () => {
    const webContents = {
      undo: vi.fn(),
      redo: vi.fn(),
      cut: vi.fn(),
      copy: vi.fn(),
      paste: vi.fn(),
      selectAll: vi.fn(),
      reload: vi.fn(),
      getZoomLevel: vi.fn(() => 0),
      setZoomLevel: vi.fn(),
      toggleDevTools: vi.fn()
    }
    const mainWindow = {
      isDestroyed: vi.fn(() => false),
      webContents,
      minimize: vi.fn(),
      isMaximized: vi.fn(() => false),
      maximize: vi.fn(),
      unmaximize: vi.fn(),
      close: vi.fn()
    }

    registerAppIpcHandlers(registerOptions({
      getMainWindow: () => mainWindow as never
    }))

    const handler = handlers.get('desktop:command')
    await handler?.({ sender: webContents }, 'copy')
    await handler?.({ sender: webContents }, 'zoomIn')
    await handler?.({ sender: webContents }, 'toggleMaximize')
    await handler?.({ sender: webContents }, 'close')

    expect(webContents.copy).toHaveBeenCalledTimes(1)
    expect(webContents.setZoomLevel).toHaveBeenCalledWith(1)
    expect(mainWindow.maximize).toHaveBeenCalledTimes(1)
    expect(mainWindow.close).toHaveBeenCalledTimes(1)
  })

  it('validates file picker payloads before opening the dialog', async () => {
    registerAppIpcHandlers(registerOptions())

    const handler = handlers.get('file:pick-file')
    await expect(
      handler?.({}, { filters: [{ name: 'Bad', extensions: ['../secret'] }] })
    ).rejects.toThrow(/Invalid payload for file:pick-file/)
    expect(dialog.showOpenDialog).not.toHaveBeenCalled()
  })

  it('only reads binary files that were authorized by the file picker', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'zhiyan-ipc-'))
    const filePath = join(dir, 'source.pdf')
    await writeFile(filePath, 'pdf-bytes')
    try {
      vi.mocked(dialog.showOpenDialog).mockResolvedValue({
        canceled: false,
        filePaths: [filePath],
        bookmarks: []
      })

      registerAppIpcHandlers(registerOptions())

      const readBinary = handlers.get('file:read-binary')
      await expect(readBinary?.({}, filePath)).resolves.toEqual({
        ok: false,
        message: 'File must be selected through the file picker before it can be read.'
      })

      const pickFile = handlers.get('file:pick-file')
      await expect(pickFile?.({}, {
        filters: [{ name: 'PDF', extensions: ['pdf'] }]
      })).resolves.toEqual({ canceled: false, path: filePath })

      await expect(readBinary?.({}, filePath)).resolves.toEqual({
        ok: true,
        data: Buffer.from('pdf-bytes').toString('base64'),
        size: 9
      })
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
