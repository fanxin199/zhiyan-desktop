import { app, dialog, ipcMain, shell, type BrowserWindow, type WebContents } from 'electron'
import { watch, type FSWatcher } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { dirname, join } from 'node:path'
import { mkdir, readFile, realpath, stat, writeFile } from 'node:fs/promises'
import { z } from 'zod'
import {
  getKunRuntimeSettings,
  type AppSettingsPatch,
  type AppSettingsV1
} from '../../shared/app-settings'
import type {
  DesktopCommand,
  RuntimeRequestResult,
  SystemNotificationResult,
  TurnCompleteNotificationPayload,
  UpstreamModelsResult,
  WorkspacePickResult
} from '../../shared/ds-gui-api'
import type { GuiUpdateDownloadResult, GuiUpdateInfo, GuiUpdateInstallResult, GuiUpdateState } from '../../shared/gui-update'
import {
  coursewareBlueprintGenerationPayloadSchema,
  coursewareExportPayloadSchema,
  coursewarePdfInspectPayloadSchema,
  coursewarePdfRangePayloadSchema,
  coursewareSourcePathPayloadSchema,
  coursewareSlideRegenerationPayloadSchema,
  coursewareSlidesGenerationPayloadSchema,
  deepseekConfigContentSchema,
  desktopCommandSchema,
  defaultPathSchema,
  filePickPayloadSchema,
  gitBranchPayloadSchema,
  guiUpdateChannelSchema,
  logErrorPayloadSchema,
  legacyWordTextExtractPayloadSchema,
  notificationPayloadSchema,
  openEditorPathPayloadSchema,
  pubMedSearchPayloadSchema,
  rootPathSchema,
  runtimeRequestPayloadSchema,
  shellOpenExternalUrlSchema,
  skillListPayloadSchema,
  skillSaveFilePayloadSchema,
  settingsPatchSchema,
  streamIdSchema,
  textbookCheckPayloadSchema,
  textbookExportPayloadSchema,
  textbookFormatRulesParsePayloadSchema,
  textbookLoadProjectPayloadSchema,
  textbookOutlineGenerationPayloadSchema,
  textbookSectionGenerationPayloadSchema,
  textbookSectionRevisionPayloadSchema,
  workspaceDirectoryCreatePayloadSchema,
  workspaceClipboardImageSavePayloadSchema,
  workspaceDirectoryTargetPayloadSchema,
  workspaceEntryDeletePayloadSchema,
  workspaceEntryRenamePayloadSchema,
  workspaceFileCreatePayloadSchema,
  workspaceFileTargetPayloadSchema,
  workspaceFileWatchPayloadSchema,
  workspaceFileWritePayloadSchema,
  writeExportPayloadSchema,
  writeRichClipboardPayloadSchema,
  writeInlineCompletionPayloadSchema,
  workspaceRootSchema
} from './app-ipc-schemas'
import type { JsonSettingsStore } from '../settings-store'
import { createAndSwitchGitBranch, getGitBranches, switchGitBranch } from '../services/git-service'
import {
  createWorkspaceDirectory,
  createWorkspaceFile,
  deleteWorkspaceEntry,
  expandHomePath,
  listEditorsResult,
  listWorkspaceDirectory,
  normalizeSkillFolderName,
  openEditorPath,
  openPathWithShell,
  readClipboardImage,
  readWorkspaceImage,
  readWorkspaceFile,
  renameWorkspaceEntry,
  resolveWorkspaceFile,
  saveWorkspaceClipboardImage,
  writeWorkspaceFile
} from '../services/workspace-service'
import {
  clearWriteInlineCompletionDebugEntries,
  listWriteInlineCompletionDebugEntries,
  requestWriteInlineCompletion
} from '../services/write-inline-completion-service'
import { copyWriteDocumentAsRichText, exportWriteDocument } from '../services/write-export-service'
import { listGuiSkills } from '../services/skill-service'
import { syncBuiltinSkills } from '../services/builtin-skill-service'
import { extractPdfRange, inspectPdf } from '../services/courseware-pdf-service'
import { searchPubMed } from '../services/pubmed-service'
import {
  generateCoursewareBlueprint,
  generateCoursewareSlides,
  regenerateCoursewareSlide
} from '../services/courseware-generation-service'
import { exportCoursewarePackage } from '../services/courseware-export-service'
import { loadCoursewareProject } from '../services/courseware-project-service'
import { analyzeCoursewareSource } from '../services/courseware-source-service'
import { extractLegacyWordText } from '../services/legacy-word-text-service'
import {
  checkTextbookProject,
  exportTextbookProject,
  generateTextbookOutline,
  generateTextbookSection,
  loadTextbookProject,
  parseTextbookFormatRules,
  reviseTextbookSection
} from '../services/textbook-service'

type GuiUpdaterModule = typeof import('../gui-updater')
import type {
  PythonCapabilityPackInstallPhase,
  PythonCapabilityPackInstallResult,
  PythonRuntimeInstallProgress,
  PythonRuntimeManagerResult,
  PythonRuntimeManifest,
  PythonRuntimeStatusV1
} from '../../shared/python-runtime'

const MAX_BINARY_READ_BYTES = 100 * 1024 * 1024

type WorkspaceFileWatchRecord = {
  watcher: FSWatcher
  sender: WebContents
  path: string
  workspaceRoot: string
  timer: ReturnType<typeof setTimeout> | null
}

type RegisterAppIpcHandlersOptions = {
  store: JsonSettingsStore
  getMainWindow: () => BrowserWindow | null
  applySettingsPatch: (partial: AppSettingsPatch) => Promise<AppSettingsV1>
  runtimeRequest: (
    path: string,
    method?: string,
    body?: string
  ) => Promise<RuntimeRequestResult>
  fetchUpstreamModels: () => Promise<UpstreamModelsResult>
  inspectPythonRuntime: () => Promise<PythonRuntimeStatusV1>
  getPythonRuntimeManifest: () => PythonRuntimeManifest
  installManagedPythonRuntime: (
    onProgress: (progress: PythonRuntimeInstallProgress) => void
  ) => Promise<PythonRuntimeManagerResult>
  uninstallManagedPythonRuntime: () => Promise<PythonRuntimeManagerResult>
  installBaseScienceCapabilityPack: (
    onProgress: (phase: PythonCapabilityPackInstallPhase) => void
  ) => Promise<PythonCapabilityPackInstallResult>
  resolveKunConfigPath: () => string
  showTurnCompleteNotification: (
    payload: TurnCompleteNotificationPayload
  ) => Promise<SystemNotificationResult>
  getAppVersion: () => string
  readGuiUpdateState: () => Promise<GuiUpdateState>
  loadGuiUpdaterModule: () => Promise<GuiUpdaterModule>
  resolveLogDirectory: () => string
  logError: (category: string, message: string, detail?: unknown) => void
}

function parseIpcPayload<T>(channel: string, schema: z.ZodType<T>, payload: unknown): T {
  const parsed = schema.safeParse(payload)
  if (parsed.success) return parsed.data
  const issue = parsed.error.issues[0]
  throw new Error(`Invalid payload for ${channel}: ${issue?.message ?? 'Bad request.'}`)
}


function runDesktopCommand(
  command: DesktopCommand,
  sender: WebContents,
  getMainWindow: () => BrowserWindow | null
): void {
  const mainWindow = getMainWindow()
  const contents = mainWindow && !mainWindow.isDestroyed() ? mainWindow.webContents : sender

  switch (command) {
    case 'undo':
      contents.undo()
      return
    case 'redo':
      contents.redo()
      return
    case 'cut':
      contents.cut()
      return
    case 'copy':
      contents.copy()
      return
    case 'paste':
      contents.paste()
      return
    case 'selectAll':
      contents.selectAll()
      return
    case 'reload':
      contents.reload()
      return
    case 'zoomIn':
      contents.setZoomLevel(contents.getZoomLevel() + 1)
      return
    case 'zoomOut':
      contents.setZoomLevel(contents.getZoomLevel() - 1)
      return
    case 'resetZoom':
      contents.setZoomLevel(0)
      return
    case 'toggleDevTools':
      contents.toggleDevTools()
      return
    case 'minimize':
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.minimize()
      return
    case 'toggleMaximize':
      if (!mainWindow || mainWindow.isDestroyed()) return
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize()
      } else {
        mainWindow.maximize()
      }
      return
    case 'close':
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.close()
      return
    case 'quit':
      app.quit()
      return
  }
}

export function registerAppIpcHandlers(options: RegisterAppIpcHandlersOptions): void {
  const {
    store,
    getMainWindow,
    applySettingsPatch,
    runtimeRequest,
    fetchUpstreamModels,
    inspectPythonRuntime,
    getPythonRuntimeManifest,
    installManagedPythonRuntime,
    uninstallManagedPythonRuntime,
    installBaseScienceCapabilityPack,
    resolveKunConfigPath,
    showTurnCompleteNotification,
    getAppVersion,
    readGuiUpdateState,
    loadGuiUpdaterModule,
    resolveLogDirectory,
    logError
  } = options
  const authorizedBinaryReadPaths = new Set<string>()
  const workspaceFileWatchers = new Map<string, WorkspaceFileWatchRecord>()

  const normalizeAuthorizedPath = (path: string): string =>
    process.platform === 'win32' ? path.toLowerCase() : path

  const authorizeBinaryReadPath = async (path: string): Promise<void> => {
    authorizedBinaryReadPaths.add(normalizeAuthorizedPath(await realpath(path)))
  }

  const isBinaryReadPathAuthorized = async (path: string): Promise<boolean> => {
    try {
      return authorizedBinaryReadPaths.has(normalizeAuthorizedPath(await realpath(path)))
    } catch {
      return false
    }
  }

  const disposeWorkspaceFileWatch = (watchId: string): boolean => {
    const record = workspaceFileWatchers.get(watchId)
    if (!record) return false
    if (record.timer) clearTimeout(record.timer)
    try {
      record.watcher.close()
    } catch (error) {
      logError('workspace-watch', 'Failed to close workspace file watcher', {
        watchId,
        message: error instanceof Error ? error.message : String(error)
      })
    }
    workspaceFileWatchers.delete(watchId)
    return true
  }

  const disposeWorkspaceFileWatchesForSender = (sender: WebContents): void => {
    for (const [watchId, record] of workspaceFileWatchers) {
      if (record.sender.id === sender.id) {
        disposeWorkspaceFileWatch(watchId)
      }
    }
  }

  const emitWorkspaceFileChange = async (watchId: string): Promise<void> => {
    const record = workspaceFileWatchers.get(watchId)
    if (!record) return
    const changedAt = new Date().toISOString()
    try {
      const result = await readWorkspaceFile({
        path: record.path,
        workspaceRoot: record.workspaceRoot
      })
      const latest = workspaceFileWatchers.get(watchId)
      if (!latest || latest.sender.isDestroyed()) return
      if (result.ok) {
        latest.sender.send('file:workspace-changed', {
          ok: true,
          watchId,
          workspaceRoot: latest.workspaceRoot,
          path: result.path,
          content: result.content,
          size: result.size,
          truncated: result.truncated,
          changedAt
        })
        return
      }
      latest.sender.send('file:workspace-changed', {
        ok: false,
        watchId,
        workspaceRoot: latest.workspaceRoot,
        path: latest.path,
        message: result.message,
        changedAt
      })
    } catch (error) {
      const latest = workspaceFileWatchers.get(watchId)
      if (!latest || latest.sender.isDestroyed()) return
      latest.sender.send('file:workspace-changed', {
        ok: false,
        watchId,
        workspaceRoot: latest.workspaceRoot,
        path: latest.path,
        message: error instanceof Error ? error.message : String(error),
        changedAt
      })
    }
  }

  const scheduleWorkspaceFileChange = (watchId: string): void => {
    const record = workspaceFileWatchers.get(watchId)
    if (!record) return
    if (record.timer) clearTimeout(record.timer)
    record.timer = setTimeout(() => {
      const latest = workspaceFileWatchers.get(watchId)
      if (!latest) return
      latest.timer = null
      void emitWorkspaceFileChange(watchId)
    }, 90)
  }

  ipcMain.handle('settings:get', async () => store.load())
  ipcMain.handle('settings:set', async (_, partial: unknown) =>
    applySettingsPatch(
      parseIpcPayload('settings:set', settingsPatchSchema, partial) as AppSettingsPatch
    )
  )

  ipcMain.handle('runtime:request', async (_, payload: unknown) => {
    const request = parseIpcPayload('runtime:request', runtimeRequestPayloadSchema, payload)
    return runtimeRequest(request.path, request.method, request.body)
  })

  ipcMain.handle('upstream:models', async () => fetchUpstreamModels())
  ipcMain.handle('python:runtime-status', async () => inspectPythonRuntime())
  ipcMain.handle('python:runtime-manifest', async () => getPythonRuntimeManifest())
  const explicitConfirmationSchema = z.object({ confirmed: z.literal(true, {
    error: 'Managed Python changes require explicit confirmation.'
  }) }).strict()
  ipcMain.handle('python:runtime-install', async (event, payload: unknown) => {
    parseIpcPayload('python:runtime-install', explicitConfirmationSchema, payload)
    return installManagedPythonRuntime((progress) => {
      if (!event.sender.isDestroyed()) event.sender.send('python:runtime-install-progress', progress)
    })
  })
  ipcMain.handle('python:runtime-uninstall', async (_, payload: unknown) => {
    parseIpcPayload('python:runtime-uninstall', explicitConfirmationSchema, payload)
    return uninstallManagedPythonRuntime()
  })
  ipcMain.handle('python:base-science-install', async (event, payload: unknown) => {
    parseIpcPayload('python:base-science-install', explicitConfirmationSchema, payload)
    return installBaseScienceCapabilityPack((phase) => {
      if (!event.sender.isDestroyed()) event.sender.send('python:base-science-install-progress', phase)
    })
  })

  ipcMain.handle('workspace:pick-directory', async (_, defaultPath: unknown): Promise<WorkspacePickResult> => {
    const normalizedDefaultPath = parseIpcPayload(
      'workspace:pick-directory',
      z.object({ defaultPath: defaultPathSchema }).strict(),
      { defaultPath }
    ).defaultPath
    const options: Electron.OpenDialogOptions = {
      title: 'Select working directory',
      defaultPath: normalizedDefaultPath,
      properties: ['openDirectory', 'createDirectory', 'dontAddToRecent']
    }
    const mainWindow = getMainWindow()
    const result = mainWindow
      ? await dialog.showOpenDialog(mainWindow, options)
      : await dialog.showOpenDialog(options)
    return {
      canceled: result.canceled,
      path: result.canceled ? null : (result.filePaths[0] ?? null)
    }
  })

  ipcMain.handle('file:pick-file', async (_, payload: unknown): Promise<WorkspacePickResult> => {
    const request = parseIpcPayload('file:pick-file', filePickPayloadSchema, payload ?? {})
    const options: Electron.OpenDialogOptions = {
      title: 'Select file',
      defaultPath: request.defaultPath,
      filters: request.filters,
      properties: ['openFile', 'dontAddToRecent']
    }
    const mainWindow = getMainWindow()
    const result = mainWindow
      ? await dialog.showOpenDialog(mainWindow, options)
      : await dialog.showOpenDialog(options)
    const path = result.canceled ? null : (result.filePaths[0] ?? null)
    if (path) await authorizeBinaryReadPath(path)
    return {
      canceled: result.canceled,
      path
    }
  })

  ipcMain.handle('file:read-binary', async (_, filePath: unknown): Promise<{ ok: true; data: string; size: number } | { ok: false; message: string }> => {
    if (typeof filePath !== 'string' || !filePath.trim()) {
      return { ok: false, message: 'File path is required.' }
    }
    try {
      if (!await isBinaryReadPathAuthorized(filePath)) {
        return { ok: false, message: 'File must be selected through the file picker before it can be read.' }
      }
      const info = await stat(filePath)
      if (!info.isFile()) {
        return { ok: false, message: 'Path is not a file.' }
      }
      if (info.size > MAX_BINARY_READ_BYTES) {
        return { ok: false, message: 'File is too large to read.' }
      }
      const buf = await readFile(filePath)
      return { ok: true, data: buf.toString('base64'), size: buf.length }
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : String(error)
      }
    }
  })

  ipcMain.handle('file:extract-legacy-word-text', async (_, payload: unknown) =>
    extractLegacyWordText(
      parseIpcPayload('file:extract-legacy-word-text', legacyWordTextExtractPayloadSchema, payload).path
    )
  )

  ipcMain.handle('file:extract-pdf-range', async (_, payload: unknown) => {
    const request = parseIpcPayload(
      'file:extract-pdf-range',
      coursewarePdfRangePayloadSchema,
      payload
    )
    return extractPdfRange(request.path, request.pageStart, request.pageEnd)
  })

  ipcMain.handle('file:inspect-pdf', async (_, payload: unknown) => {
    const request = parseIpcPayload(
      'file:inspect-pdf',
      coursewarePdfInspectPayloadSchema,
      payload
    )
    return inspectPdf(request.path)
  })

  ipcMain.handle('courseware:analyze-source', async (_, payload: unknown) => {
    const request = parseIpcPayload(
      'courseware:analyze-source',
      coursewareSourcePathPayloadSchema,
      payload
    )
    return analyzeCoursewareSource(request.path)
  })

  ipcMain.handle('courseware:load-project', async (_, payload: unknown) => {
    const request = parseIpcPayload(
      'courseware:load-project',
      coursewareSourcePathPayloadSchema,
      payload
    )
    return loadCoursewareProject(request.path)
  })

  ipcMain.handle('literature:search-pubmed', async (_, payload: unknown) =>
    searchPubMed(
      parseIpcPayload('literature:search-pubmed', pubMedSearchPayloadSchema, payload)
    )
  )

  ipcMain.handle('courseware:generate-blueprint', async (_, payload: unknown) =>
    generateCoursewareBlueprint(
      await store.load(),
      parseIpcPayload(
        'courseware:generate-blueprint',
        coursewareBlueprintGenerationPayloadSchema,
        payload
      )
    )
  )

  ipcMain.handle('courseware:generate-slides', async (event, payload: unknown) => {
    const input = parseIpcPayload(
      'courseware:generate-slides',
      coursewareSlidesGenerationPayloadSchema,
      payload
    )
    return generateCoursewareSlides(
      await store.load(),
      input,
      fetch,
      (progress) => event.sender.send('courseware:slide-generation-progress', progress)
    )
  })

  ipcMain.handle('courseware:regenerate-slide', async (_, payload: unknown) =>
    regenerateCoursewareSlide(
      await store.load(),
      parseIpcPayload(
        'courseware:regenerate-slide',
        coursewareSlideRegenerationPayloadSchema,
        payload
      )
    )
  )

  ipcMain.handle('courseware:export-package', async (_, payload: unknown) => {
    const request = parseIpcPayload(
      'courseware:export-package',
      coursewareExportPayloadSchema,
      payload
    )
    return exportCoursewarePackage({
      ...request,
      outputDirectory: request.outputDirectory || dirname(request.project.request.sourcePath)
    })
  })

  ipcMain.handle('textbook:generate-outline', async (_, payload: unknown) =>
    generateTextbookOutline(
      await store.load(),
      parseIpcPayload('textbook:generate-outline', textbookOutlineGenerationPayloadSchema, payload)
    )
  )

  ipcMain.handle('textbook:parse-format-rules', async (_, payload: unknown) =>
    parseTextbookFormatRules(
      await store.load(),
      parseIpcPayload('textbook:parse-format-rules', textbookFormatRulesParsePayloadSchema, payload)
    )
  )

  ipcMain.handle('textbook:generate-section', async (_, payload: unknown) =>
    generateTextbookSection(
      await store.load(),
      parseIpcPayload('textbook:generate-section', textbookSectionGenerationPayloadSchema, payload)
    )
  )

  ipcMain.handle('textbook:revise-section', async (_, payload: unknown) =>
    reviseTextbookSection(
      await store.load(),
      parseIpcPayload('textbook:revise-section', textbookSectionRevisionPayloadSchema, payload)
    )
  )

  ipcMain.handle('textbook:check-project', async (_, payload: unknown) =>
    checkTextbookProject(
      await store.load(),
      parseIpcPayload('textbook:check-project', textbookCheckPayloadSchema, payload)
    )
  )

  ipcMain.handle('textbook:export-project', async (_, payload: unknown) =>
    exportTextbookProject(
      parseIpcPayload('textbook:export-project', textbookExportPayloadSchema, payload)
    )
  )

  ipcMain.handle('textbook:load-project', async (_, payload: unknown) => {
    const request = parseIpcPayload('textbook:load-project', textbookLoadProjectPayloadSchema, payload)
    return loadTextbookProject(request.path)
  })

  ipcMain.handle(
    'skill:save-file',
    async (_, payload: unknown) => {
      const request = parseIpcPayload('skill:save-file', skillSaveFilePayloadSchema, payload)
      try {
        const rootPath = expandHomePath(request.rootPath)
        if (!rootPath) {
          return { ok: false as const, message: 'Skill directory is required.' }
        }
        const skillName = normalizeSkillFolderName(request.skillName)
        const skillDir = join(rootPath, skillName)
        const filePath = join(skillDir, 'SKILL.md')
        await mkdir(skillDir, { recursive: true })
        await writeFile(filePath, request.content, 'utf8')
        return { ok: true as const, path: filePath }
      } catch (error) {
        return {
          ok: false as const,
          message: error instanceof Error ? error.message : String(error)
        }
      }
    }
  )

  ipcMain.handle('skill:list', async (_, payload: unknown) => {
    const request = parseIpcPayload('skill:list', skillListPayloadSchema, payload)
    const settings = await store.load()
    await syncBuiltinSkills({
      dataDir: expandHomePath(getKunRuntimeSettings(settings).dataDir)
    })
    return listGuiSkills(settings, request.workspaceRoot)
  })

  ipcMain.handle('skill:open-root', async (_, rootPath: unknown) => {
    const normalizedRootPath = parseIpcPayload('skill:open-root', rootPathSchema, rootPath)
    try {
      const target = expandHomePath(normalizedRootPath)
      if (!target) {
        return { ok: false as const, message: 'Skill directory is required.' }
      }
      await mkdir(target, { recursive: true })
      return openPathWithShell(target)
    } catch (error) {
      return {
        ok: false as const,
        message: error instanceof Error ? error.message : String(error)
      }
    }
  })

  ipcMain.handle('deepseek:config:read', async () => {
    const path = resolveKunConfigPath()
    try {
      const content = await readFile(path, 'utf8')
      return { path, content, exists: true as const }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return { path, content: '', exists: false as const }
      }
      throw error
    }
  })

  ipcMain.handle('deepseek:config:write', async (_, content: unknown) => {
    const validatedContent = parseIpcPayload(
      'deepseek:config:write',
      deepseekConfigContentSchema,
      content
    )
    const path = resolveKunConfigPath()
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, validatedContent, 'utf8')
    return { ok: true as const, path }
  })

  ipcMain.handle('deepseek:config:open-dir', async () => {
    try {
      const path = resolveKunConfigPath()
      const dirPath = dirname(path)
      await mkdir(dirPath, { recursive: true })
      return openPathWithShell(dirPath)
    } catch (error) {
      return {
        ok: false as const,
        message: error instanceof Error ? error.message : String(error)
      }
    }
  })

  ipcMain.handle('git:branches', async (_, workspaceRoot: unknown) =>
    getGitBranches(parseIpcPayload('git:branches', workspaceRootSchema, workspaceRoot))
  )
  ipcMain.handle(
    'git:switch-branch',
    async (_, payload: unknown) => {
      const request = parseIpcPayload('git:switch-branch', gitBranchPayloadSchema, payload)
      return switchGitBranch(request.workspaceRoot, request.branch)
    }
  )
  ipcMain.handle(
    'git:create-and-switch-branch',
    async (_, payload: unknown) => {
      const request = parseIpcPayload(
        'git:create-and-switch-branch',
        gitBranchPayloadSchema,
        payload
      )
      return createAndSwitchGitBranch(request.workspaceRoot, request.branch)
    }
  )

  ipcMain.handle('editor:list', async () => listEditorsResult())
  ipcMain.handle('editor:open-path', async (_, payload: unknown) =>
    openEditorPath(parseIpcPayload('editor:open-path', openEditorPathPayloadSchema, payload))
  )

  ipcMain.handle('file:resolve-workspace', async (_, payload: unknown) =>
    resolveWorkspaceFile(
      parseIpcPayload('file:resolve-workspace', workspaceFileTargetPayloadSchema, payload)
    )
  )
  ipcMain.handle('file:list-workspace-directory', async (_, payload: unknown) =>
    listWorkspaceDirectory(
      parseIpcPayload('file:list-workspace-directory', workspaceDirectoryTargetPayloadSchema, payload)
    )
  )
  ipcMain.handle('file:read-workspace', async (_, payload: unknown) =>
    readWorkspaceFile(
      parseIpcPayload('file:read-workspace', workspaceFileTargetPayloadSchema, payload)
    )
  )
  ipcMain.handle('file:read-workspace-image', async (_, payload: unknown) =>
    readWorkspaceImage(
      parseIpcPayload('file:read-workspace-image', workspaceFileTargetPayloadSchema, payload)
    )
  )
  ipcMain.handle('file:write-workspace', async (_, payload: unknown) =>
    writeWorkspaceFile(
      parseIpcPayload('file:write-workspace', workspaceFileWritePayloadSchema, payload)
    )
  )
  ipcMain.handle('file:create-workspace', async (_, payload: unknown) =>
    createWorkspaceFile(
      parseIpcPayload('file:create-workspace', workspaceFileCreatePayloadSchema, payload)
    )
  )
  ipcMain.handle('file:create-workspace-directory', async (_, payload: unknown) =>
    createWorkspaceDirectory(
      parseIpcPayload('file:create-workspace-directory', workspaceDirectoryCreatePayloadSchema, payload)
    )
  )
  ipcMain.handle('file:save-workspace-clipboard-image', async (_, payload: unknown) =>
    saveWorkspaceClipboardImage(
      parseIpcPayload(
        'file:save-workspace-clipboard-image',
        workspaceClipboardImageSavePayloadSchema,
        payload
      )
    )
  )
  ipcMain.handle('clipboard:read-image', async () => readClipboardImage())
  ipcMain.handle('file:rename-workspace-entry', async (_, payload: unknown) =>
    renameWorkspaceEntry(
      parseIpcPayload('file:rename-workspace-entry', workspaceEntryRenamePayloadSchema, payload)
    )
  )
  ipcMain.handle('file:delete-workspace-entry', async (_, payload: unknown) =>
    deleteWorkspaceEntry(
      parseIpcPayload('file:delete-workspace-entry', workspaceEntryDeletePayloadSchema, payload)
    )
  )
  ipcMain.handle('file:watch-workspace', async (event, payload: unknown) => {
    const request = parseIpcPayload('file:watch-workspace', workspaceFileWatchPayloadSchema, payload)
    const initial = await readWorkspaceFile(request)
    let watchedPath: string
    let initialContent: string
    let initialSize: number
    let initialTruncated: boolean
    if (initial.ok) {
      watchedPath = initial.path
      initialContent = initial.content
      initialSize = initial.size
      initialTruncated = initial.truncated
    } else {
      const initialImage = await readWorkspaceImage(request)
      if (!initialImage.ok) return initial
      watchedPath = initialImage.path
      initialContent = ''
      initialSize = initialImage.size
      initialTruncated = false
    }

    const watchId = randomUUID()
    try {
      const watcher = watch(watchedPath, { persistent: false }, () => {
        scheduleWorkspaceFileChange(watchId)
      })
      workspaceFileWatchers.set(watchId, {
        watcher,
        sender: event.sender,
        path: watchedPath,
        workspaceRoot: request.workspaceRoot,
        timer: null
      })
      event.sender.once('destroyed', () => disposeWorkspaceFileWatchesForSender(event.sender))
      return {
        ok: true as const,
        watchId,
        path: watchedPath,
        content: initialContent,
        size: initialSize,
        truncated: initialTruncated,
        startedAt: new Date().toISOString()
      }
    } catch (error) {
      return {
        ok: false as const,
        message: error instanceof Error ? error.message : String(error)
      }
    }
  })
  ipcMain.handle('file:unwatch-workspace', async (_, watchId: unknown) =>
    disposeWorkspaceFileWatch(parseIpcPayload('file:unwatch-workspace', streamIdSchema, watchId))
  )
  ipcMain.handle('write:export', async (_, payload: unknown) =>
    exportWriteDocument(
      parseIpcPayload('write:export', writeExportPayloadSchema, payload),
      { parentWindow: getMainWindow() }
    )
  )
  ipcMain.handle('write:copy-rich-text', async (_, payload: unknown) =>
    copyWriteDocumentAsRichText(
      parseIpcPayload('write:copy-rich-text', writeRichClipboardPayloadSchema, payload)
    )
  )
  ipcMain.handle('write:inline-completion', async (_, payload: unknown) =>
    requestWriteInlineCompletion(
      await store.load(),
      parseIpcPayload('write:inline-completion', writeInlineCompletionPayloadSchema, payload)
    )
  )
  ipcMain.handle('write:inline-completion-debug:list', async () => listWriteInlineCompletionDebugEntries())
  ipcMain.handle('write:inline-completion-debug:clear', async () => {
    clearWriteInlineCompletionDebugEntries()
    return true
  })
  ipcMain.handle('desktop:command', async (event, command: unknown) => {
    runDesktopCommand(
      parseIpcPayload('desktop:command', desktopCommandSchema, command),
      event.sender,
      getMainWindow
    )
  })
  ipcMain.handle('shell:open-external', async (_, url: unknown) => {
    const validatedUrl = parseIpcPayload('shell:open-external', shellOpenExternalUrlSchema, url)
    await shell.openExternal(validatedUrl)
  })
  ipcMain.handle('notification:turn-complete', async (_, payload: unknown) =>
    showTurnCompleteNotification(
      parseIpcPayload('notification:turn-complete', notificationPayloadSchema, payload)
    )
  )
  ipcMain.handle('app:version', async () => getAppVersion())
  ipcMain.handle('gui:update-state', async () => readGuiUpdateState())
  ipcMain.handle('gui:update-check', async (_, channel: unknown): Promise<GuiUpdateInfo> => {
    const module = await loadGuiUpdaterModule()
    return module.checkGuiUpdate(
      parseIpcPayload(
        'gui:update-check',
        z.object({ channel: guiUpdateChannelSchema }).strict(),
        { channel }
      ).channel
    )
  })
  ipcMain.handle('gui:update-download', async (_, channel: unknown): Promise<GuiUpdateDownloadResult> => {
    const module = await loadGuiUpdaterModule()
    return module.downloadGuiUpdate(
      parseIpcPayload(
        'gui:update-download',
        z.object({ channel: guiUpdateChannelSchema }).strict(),
        { channel }
      ).channel
    )
  })
  ipcMain.handle('gui:update-install', async (): Promise<GuiUpdateInstallResult> => {
    const module = await loadGuiUpdaterModule()
    return module.installGuiUpdate()
  })

  ipcMain.handle('log:error', async (_, payload: unknown) => {
    const request = parseIpcPayload('log:error', logErrorPayloadSchema, payload)
    logError(request.category, request.message, request.detail)
  })
  ipcMain.handle('log:get-path', async () => resolveLogDirectory())
  ipcMain.handle('log:open-dir', async () => {
    const dir = resolveLogDirectory()
    try {
      await mkdir(dir, { recursive: true })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return { ok: false, message }
    }
    const error = await shell.openPath(dir)
    if (error) return { ok: false, message: error }
    return { ok: true }
  })
}
