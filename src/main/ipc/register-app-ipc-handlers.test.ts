import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { dialog } from 'electron'
import JSZip from 'jszip'
import {
  defaultClawSettings,
  defaultKunRuntimeSettings,
  defaultModelProviderSettings,
  defaultScheduleSettings,
  defaultWriteSettings,
  type AppSettingsV1
} from '../../shared/app-settings'
import { registerAppIpcHandlers } from './register-app-ipc-handlers'
import { ArtifactRegistry } from '../services/artifact-service'
import { ArtifactVersionStore } from '../services/artifact-version-service'
import { emptyPythonRuntimeStatus } from '../../shared/python-runtime'

const handlers = new Map<string, (event: unknown, payload?: unknown) => Promise<unknown>>()
const exportCoursewarePackage = vi.hoisted(() => vi.fn())

vi.mock('../services/courseware-export-service', () => ({ exportCoursewarePackage }))

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
    aiMode: 'deep',
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
    artifactRegistry: {
      register: vi.fn(),
      update: vi.fn(),
      get: vi.fn(),
      list: vi.fn(async () => [])
    } as never,
    artifactVersions: {
      createVersion: vi.fn(),
      listVersions: vi.fn(async () => []),
      restoreVersion: vi.fn()
    } as never,
    artifactRevisions: { revise: vi.fn() } as never,
    documents: { create: vi.fn(async () => ({ ok: true })) } as never,
    getMainWindow: () => null,
    applySettingsPatch,
    runtimeRequest: vi.fn() as never,
    fetchUpstreamModels: vi.fn() as never,
    inspectPythonRuntime: vi.fn(async () => emptyPythonRuntimeStatus('2026-07-13T00:00:00.000Z')),
    getPythonRuntimeManifest: vi.fn() as never,
    installManagedPythonRuntime: vi.fn() as never,
    uninstallManagedPythonRuntime: vi.fn() as never,
    installBaseScienceCapabilityPack: vi.fn() as never,
    installBioinformaticsCapabilityPack: vi.fn() as never,
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

  it('requires explicit teacher confirmation before installing the science pack', async () => {
    const installBaseScienceCapabilityPack = vi.fn(async () => ({
      ok: true as const,
      packVersion: '2026.07.1',
      environmentPath: 'environment.json'
    }))
    registerAppIpcHandlers(registerOptions({ installBaseScienceCapabilityPack }))

    const handler = handlers.get('python:base-science-install')
    await expect(handler?.({}, { confirmed: false })).rejects.toThrow(/explicit confirmation/u)
    await expect(handler?.({}, { confirmed: true })).resolves.toMatchObject({
      ok: true,
      packVersion: '2026.07.1'
    })
    expect(installBaseScienceCapabilityPack).toHaveBeenCalledOnce()
  })

  it('requires explicit teacher confirmation before installing bioinformatics', async () => {
    const installBioinformaticsCapabilityPack = vi.fn(async () => ({
      ok: true as const,
      packVersion: '2026.07.1',
      environmentPath: 'bio-environment.json'
    }))
    registerAppIpcHandlers(registerOptions({ installBioinformaticsCapabilityPack }))

    const handler = handlers.get('python:bioinformatics-install')
    await expect(handler?.({}, { confirmed: false })).rejects.toThrow(/explicit confirmation/u)
    await expect(handler?.({}, { confirmed: true })).resolves.toMatchObject({ ok: true })
    expect(installBioinformaticsCapabilityPack).toHaveBeenCalledOnce()
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

  it('rejects document extraction when the file was not authorized by the picker', async () => {
    registerAppIpcHandlers(registerOptions())

    const inspectPdf = handlers.get('file:inspect-pdf')
    await expect(inspectPdf?.({}, { path: '/tmp/private.pdf' })).rejects.toThrow(
      /selected through the file picker/u
    )
  })

  it('rejects workspace file access for roots that were not configured or selected', async () => {
    registerAppIpcHandlers(registerOptions())

    const readWorkspace = handlers.get('file:read-workspace')
    await expect(readWorkspace?.({}, {
      path: '/tmp/private/notes.md',
      workspaceRoot: '/tmp/private'
    })).rejects.toThrow(/workspace must be selected or configured/iu)
  })

  it('authorizes a workspace root after the teacher selects its directory', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'zhiyan-workspace-ipc-'))
    try {
      const canonicalDir = await realpath(dir)
      vi.mocked(dialog.showOpenDialog).mockResolvedValue({
        canceled: false,
        filePaths: [dir],
        bookmarks: []
      })
      registerAppIpcHandlers(registerOptions())

      await expect(handlers.get('workspace:pick-directory')?.({}, undefined)).resolves.toEqual({
        canceled: false,
        path: dir
      })
      await expect(handlers.get('file:list-workspace-directory')?.({}, {
        workspaceRoot: dir
      })).resolves.toMatchObject({ ok: true, root: canonicalDir })
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('registers artifacts only inside a configured or selected workspace', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'zhiyan-artifact-ipc-'))
    try {
      const workspace = join(dir, 'workspace')
      const other = join(dir, 'other')
      await Promise.all([mkdir(workspace), mkdir(other)])
      await writeFile(join(workspace, '教案.md'), '# 教案', 'utf8')
      await writeFile(join(other, '教案.md'), '# 教案', 'utf8')
      const artifactRegistry = new ArtifactRegistry({ dataDirectory: join(dir, 'data') })
      registerAppIpcHandlers(registerOptions({
        artifactRegistry,
        store: { load: vi.fn(async () => ({ ...settings(), workspaceRoot: workspace })) } as never
      }))
      const input = (root: string) => ({
        kind: 'lesson-plan',
        title: '第八章教案',
        toolId: 'syllabus',
        workspaceRoot: root,
        storage: { type: 'file', path: join(root, '教案.md') }
      })

      await expect(handlers.get('artifact:register')?.({}, input(workspace))).resolves.toMatchObject({
        title: '第八章教案',
        currentVersion: 0
      })
      await expect(handlers.get('artifact:register')?.({}, input(other))).rejects.toThrow(/workspace must be selected or configured/iu)
      await expect(handlers.get('artifact:register')?.({}, { ...input(workspace), kind: 'spreadsheet' })).rejects.toThrow()
      await expect(handlers.get('artifact:list')?.({}, { toolId: 'syllabus' })).resolves.toMatchObject([
        { title: '第八章教案', available: true }
      ])
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('saves, restores and revises artifacts only while their workspace is authorized', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'zhiyan-artifact-version-ipc-'))
    try {
      const workspace = join(dir, 'workspace')
      await mkdir(workspace)
      const path = join(workspace, '教案.md')
      await writeFile(path, '# 初稿', 'utf8')
      const artifactRegistry = new ArtifactRegistry({ dataDirectory: join(dir, 'data') })
      const artifact = await artifactRegistry.register({
        kind: 'lesson-plan', title: '教案', toolId: 'syllabus', workspaceRoot: workspace, storage: { type: 'file', path }
      })
      const artifactVersions = new ArtifactVersionStore({ registry: artifactRegistry })
      let configuredRoot = workspace
      const revise = vi.fn(async () => ({ ok: true }))
      registerAppIpcHandlers(registerOptions({
        artifactRegistry,
        artifactVersions,
        artifactRevisions: { revise } as never,
        store: { load: vi.fn(async () => ({ ...settings(), workspaceRoot: configuredRoot })) } as never
      }))

      await expect(handlers.get('artifact:create-version')?.({}, {
        id: artifact.id, source: 'ai-generate', summary: '生成初稿'
      })).resolves.toMatchObject({ version: 1 })
      await expect(handlers.get('artifact:create-version')?.({}, {
        id: artifact.id, source: 'restore', summary: '伪造恢复'
      })).rejects.toThrow()
      await expect(handlers.get('artifact:list-versions')?.({}, { id: artifact.id })).resolves.toHaveLength(1)

      await expect(handlers.get('artifact:revise')?.({}, {
        artifactId: artifact.id, baseVersion: 1, scope: { type: 'whole' }, instruction: '润色'
      })).resolves.toEqual({ ok: true })
      await expect(handlers.get('artifact:revise')?.({}, {
        artifactId: artifact.id, baseVersion: 1, scope: { type: 'whole' }, instruction: ''
      })).rejects.toThrow()

      configuredRoot = join(dir, 'elsewhere')
      await expect(handlers.get('artifact:restore-version')?.({}, { id: artifact.id, version: 1 }))
        .rejects.toThrow(/workspace must be selected or configured/iu)
      await expect(handlers.get('artifact:revise')?.({}, {
        artifactId: artifact.id, baseVersion: 1, scope: { type: 'whole' }, instruction: '润色'
      })).rejects.toThrow(/workspace must be selected or configured/iu)
      expect(revise).toHaveBeenCalledOnce()

      await expect(handlers.get('documents:create')?.({}, {
        workspaceRoot: join(dir, 'unknown'), template: 'paper', instruction: '写论文', materials: []
      })).rejects.toThrow(/workspace must be selected or configured/iu)
      configuredRoot = workspace
      await expect(handlers.get('documents:create')?.({}, {
        workspaceRoot: workspace, template: 'paper', instruction: '写论文', materials: []
      })).resolves.toEqual({ ok: true })
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('records an exported courseware project without letting the registry fail the export', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'zhiyan-courseware-artifact-ipc-'))
    try {
      const outputDirectory = join(dir, 'output')
      await mkdir(outputDirectory)
      const projectPath = join(outputDirectory, '呼吸系统.zhiyan-courseware')
      const zip = new JSZip()
      zip.file('project.json', '{}')
      await writeFile(projectPath, await zip.generateAsync({ type: 'nodebuffer' }))
      exportCoursewarePackage.mockResolvedValue({ ok: true, projectPath })
      vi.mocked(dialog.showOpenDialog).mockResolvedValue({ canceled: false, filePaths: [outputDirectory], bookmarks: [] })
      const artifactRegistry = new ArtifactRegistry({ dataDirectory: join(dir, 'data') })
      registerAppIpcHandlers(registerOptions({
        artifactRegistry,
        artifactVersions: new ArtifactVersionStore({ registry: artifactRegistry })
      }))
      await handlers.get('workspace:pick-directory')?.({}, undefined)
      const exportRequest = {
        project: {
          version: 2,
          request: {
            sourcePath: join(dir, 'source.pdf'), pageStart: 1, pageEnd: 1, topic: '呼吸系统', durationMinutes: 45,
            audience: 'undergraduate', focus: '', includeRecentLiterature: false, maxLiteratureResults: 6
          },
          sourceDocument: { kind: 'pdf', path: join(dir, 'source.pdf'), pageCount: 1, searchable: true },
          blueprint: {
            title: '呼吸系统', audience: 'undergraduate', durationMinutes: 45, teachingGoal: '理解通气与换气。',
            sections: [{ id: 'section-1', title: '通气', objective: '建立主线。', summary: '肺通气。', slideCount: 1, emphasis: [] }]
          },
          slides: [{
            id: 'slide-1', sectionId: 'section-1', kind: 'content', title: '肺通气', bullets: ['呼吸肌运动'],
            speakerNotes: '说明肺通气。', visual: { type: 'none' }, evidenceRefs: []
          }],
          sourceVisuals: [],
          evidence: [],
          generatedAt: '2026-10-23T00:00:00.000Z'
        },
        outputDirectory
      }
      const handler = handlers.get('courseware:export-package')

      await expect(handler?.({}, exportRequest)).resolves.toMatchObject({ ok: true })
      await expect(artifactRegistry.list()).resolves.toMatchObject([
        { kind: 'courseware', title: '呼吸系统', toolId: 'ppt-gen', stage: '已导出', currentVersion: 1 }
      ])

      exportCoursewarePackage.mockResolvedValue({ ok: true, projectPath: join(outputDirectory, 'missing.zhiyan-courseware') })
      await expect(handler?.({}, exportRequest)).resolves.toMatchObject({ ok: true })
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
