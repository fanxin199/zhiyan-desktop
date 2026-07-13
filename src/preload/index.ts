import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { DsGuiApi } from '../shared/ds-gui-api'

const api = {
  platform: process.platform,
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (partial) =>
    ipcRenderer.invoke('settings:set', partial),
  runtimeRequest: (path, method, body) =>
    ipcRenderer.invoke('runtime:request', { path, method, body }),
  fetchUpstreamModels: () => ipcRenderer.invoke('upstream:models'),
  getPythonRuntimeStatus: () => ipcRenderer.invoke('python:runtime-status'),
  getPythonRuntimeManifest: () => ipcRenderer.invoke('python:runtime-manifest'),
  installPythonRuntime: (confirmed) => ipcRenderer.invoke('python:runtime-install', { confirmed }),
  uninstallPythonRuntime: (confirmed) => ipcRenderer.invoke('python:runtime-uninstall', { confirmed }),
  onPythonRuntimeInstallProgress: (handler) => {
    const wrapped = (_: Electron.IpcRendererEvent, progress: Parameters<typeof handler>[0]) => handler(progress)
    ipcRenderer.on('python:runtime-install-progress', wrapped)
    return () => ipcRenderer.removeListener('python:runtime-install-progress', wrapped)
  },
  pickWorkspaceDirectory: (defaultPath) =>
    ipcRenderer.invoke('workspace:pick-directory', defaultPath),
  pickFile: (options) =>
    ipcRenderer.invoke('file:pick-file', options),
  getPathForFile: (file) =>
    webUtils.getPathForFile(file as never),
  readFileBinary: (filePath) =>
    ipcRenderer.invoke('file:read-binary', filePath),
  extractLegacyWordText: (path) =>
    ipcRenderer.invoke('file:extract-legacy-word-text', { path }),
  inspectPdf: (path) =>
    ipcRenderer.invoke('file:inspect-pdf', { path }),
  analyzeCoursewareSource: (path) =>
    ipcRenderer.invoke('courseware:analyze-source', { path }),
  loadCoursewareProject: (path) =>
    ipcRenderer.invoke('courseware:load-project', { path }),
  extractPdfRange: (path, pageStart, pageEnd) =>
    ipcRenderer.invoke('file:extract-pdf-range', { path, pageStart, pageEnd }),
  searchPubMed: (request) =>
    ipcRenderer.invoke('literature:search-pubmed', request),
  generateCoursewareBlueprint: (input) =>
    ipcRenderer.invoke('courseware:generate-blueprint', input),
  generateCoursewareSlides: (input) =>
    ipcRenderer.invoke('courseware:generate-slides', input),
  onCoursewareSlideGenerationProgress: (handler) => {
    const wrapped = (
      _: Electron.IpcRendererEvent,
      payload: Parameters<typeof handler>[0]
    ) => handler(payload)
    ipcRenderer.on('courseware:slide-generation-progress', wrapped)
    return () => ipcRenderer.removeListener('courseware:slide-generation-progress', wrapped)
  },
  regenerateCoursewareSlide: (input) =>
    ipcRenderer.invoke('courseware:regenerate-slide', input),
  exportCoursewarePackage: (request) =>
    ipcRenderer.invoke('courseware:export-package', request),
  generateTextbookOutline: (input) =>
    ipcRenderer.invoke('textbook:generate-outline', input),
  parseTextbookFormatRules: (input) =>
    ipcRenderer.invoke('textbook:parse-format-rules', input),
  generateTextbookSection: (input) =>
    ipcRenderer.invoke('textbook:generate-section', input),
  reviseTextbookSection: (input) =>
    ipcRenderer.invoke('textbook:revise-section', input),
  checkTextbookProject: (input) =>
    ipcRenderer.invoke('textbook:check-project', input),
  exportTextbookProject: (input) =>
    ipcRenderer.invoke('textbook:export-project', input),
  loadTextbookProject: (path) =>
    ipcRenderer.invoke('textbook:load-project', { path }),
  listSkills: (workspaceRoot) =>
    ipcRenderer.invoke('skill:list', { workspaceRoot }),
  saveSkillFile: (rootPath, skillName, content) =>
    ipcRenderer.invoke('skill:save-file', { rootPath, skillName, content }),
  openSkillRoot: (rootPath) =>
    ipcRenderer.invoke('skill:open-root', rootPath),
  getDeepseekConfigFile: () =>
    ipcRenderer.invoke('deepseek:config:read'),
  setDeepseekConfigFile: (content) =>
    ipcRenderer.invoke('deepseek:config:write', content),
  openDeepseekConfigDir: () =>
    ipcRenderer.invoke('deepseek:config:open-dir'),
  getGitBranches: (workspaceRoot) =>
    ipcRenderer.invoke('git:branches', workspaceRoot),
  switchGitBranch: (workspaceRoot, branch) =>
    ipcRenderer.invoke('git:switch-branch', { workspaceRoot, branch }),
  createAndSwitchGitBranch: (workspaceRoot, branch) =>
    ipcRenderer.invoke('git:create-and-switch-branch', { workspaceRoot, branch }),
  listEditors: () => ipcRenderer.invoke('editor:list'),
  openEditorPath: (options) =>
    ipcRenderer.invoke('editor:open-path', options),
  listWorkspaceDirectory: (options) =>
    ipcRenderer.invoke('file:list-workspace-directory', options),
  resolveWorkspaceFile: (options) =>
    ipcRenderer.invoke('file:resolve-workspace', options),
  readWorkspaceFile: (options) =>
    ipcRenderer.invoke('file:read-workspace', options),
  readWorkspaceImage: (options) =>
    ipcRenderer.invoke('file:read-workspace-image', options),
  writeWorkspaceFile: (payload) =>
    ipcRenderer.invoke('file:write-workspace', payload),
  createWorkspaceFile: (payload) =>
    ipcRenderer.invoke('file:create-workspace', payload),
  createWorkspaceDirectory: (payload) =>
    ipcRenderer.invoke('file:create-workspace-directory', payload),
  saveWorkspaceClipboardImage: (payload) =>
    ipcRenderer.invoke('file:save-workspace-clipboard-image', payload),
  readClipboardImage: () =>
    ipcRenderer.invoke('clipboard:read-image'),
  renameWorkspaceEntry: (payload) =>
    ipcRenderer.invoke('file:rename-workspace-entry', payload),
  deleteWorkspaceEntry: (payload) =>
    ipcRenderer.invoke('file:delete-workspace-entry', payload),
  watchWorkspaceFile: (payload) =>
    ipcRenderer.invoke('file:watch-workspace', payload),
  unwatchWorkspaceFile: (watchId) =>
    ipcRenderer.invoke('file:unwatch-workspace', watchId),
  onWorkspaceFileChanged: (handler) => {
    const wrapped = (
      _: Electron.IpcRendererEvent,
      payload: Parameters<typeof handler>[0]
    ) => handler(payload)
    ipcRenderer.on('file:workspace-changed', wrapped)
    return () => ipcRenderer.removeListener('file:workspace-changed', wrapped)
  },
  exportWriteDocument: (payload) =>
    ipcRenderer.invoke('write:export', payload),
  copyWriteDocumentAsRichText: (payload) =>
    ipcRenderer.invoke('write:copy-rich-text', payload),
  requestWriteInlineCompletion: (payload) =>
    ipcRenderer.invoke('write:inline-completion', payload),
  listWriteInlineCompletionDebugEntries: () =>
    ipcRenderer.invoke('write:inline-completion-debug:list'),
  clearWriteInlineCompletionDebugEntries: () =>
    ipcRenderer.invoke('write:inline-completion-debug:clear'),
  startSse: (threadId, sinceSeq, streamId) =>
    ipcRenderer.invoke('runtime:sse:start', { threadId, sinceSeq, streamId }),
  stopSse: (streamId) => ipcRenderer.invoke('runtime:sse:stop', streamId),
  onSseEvent: (handler) => {
    const wrapped = (
      _: Electron.IpcRendererEvent,
      payload: Parameters<typeof handler>[0]
    ) => handler(payload)
    ipcRenderer.on('runtime:sse-event', wrapped)
    return () => ipcRenderer.removeListener('runtime:sse-event', wrapped)
  },
  onSseEnd: (handler) => {
    const wrapped = (
      _: Electron.IpcRendererEvent,
      payload: Parameters<typeof handler>[0]
    ) => handler(payload)
    ipcRenderer.on('runtime:sse-end', wrapped)
    return () => ipcRenderer.removeListener('runtime:sse-end', wrapped)
  },
  onSseError: (handler) => {
    const wrapped = (
      _: Electron.IpcRendererEvent,
      payload: Parameters<typeof handler>[0]
    ) => handler(payload)
    ipcRenderer.on('runtime:sse-error', wrapped)
    return () => ipcRenderer.removeListener('runtime:sse-error', wrapped)
  },
  runDesktopCommand: (command) =>
    ipcRenderer.invoke('desktop:command', command),
  openExternal: (url) => ipcRenderer.invoke('shell:open-external', url),
  showTurnCompleteNotification: (payload) => ipcRenderer.invoke('notification:turn-complete', payload),
  getAppVersion: () => ipcRenderer.invoke('app:version'),
  getGuiUpdateState: () => ipcRenderer.invoke('gui:update-state'),
  checkGuiUpdate: (channel) =>
    ipcRenderer.invoke('gui:update-check', channel),
  downloadGuiUpdate: (channel) =>
    ipcRenderer.invoke('gui:update-download', channel),
  installGuiUpdate: () => ipcRenderer.invoke('gui:update-install'),
  onGuiUpdateState: (handler) => {
    const wrapped = (
      _: Electron.IpcRendererEvent,
      payload: Parameters<typeof handler>[0]
    ) => handler(payload)
    ipcRenderer.on('gui:update-state', wrapped)
    return () => ipcRenderer.removeListener('gui:update-state', wrapped)
  },
  logError: (category, message, detail) =>
    ipcRenderer.invoke('log:error', { category, message, detail }),
  getLogPath: () => ipcRenderer.invoke('log:get-path'),
  openLogDir: () => ipcRenderer.invoke('log:open-dir')
} satisfies DsGuiApi

contextBridge.exposeInMainWorld('dsGui', api)
