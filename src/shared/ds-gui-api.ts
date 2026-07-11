import type { AppSettingsPatch, AppSettingsV1 } from './app-settings'
import type { EditorListResult, EditorOpenResult, OpenEditorPathOptions } from './editor'
import type { GitBranchesResult } from './git-branches'
import type {
  GuiUpdateChannel,
  GuiUpdateDownloadResult,
  GuiUpdateInfo,
  GuiUpdateInstallResult,
  GuiUpdateState
} from './gui-update'
import type {
  ClipboardImageReadResult,
  WorkspaceClipboardImageSavePayload,
  WorkspaceClipboardImageSaveResult,
  WorkspaceFileReadResult,
  WorkspaceImageReadResult,
  WorkspaceDirectoryCreatePayload,
  WorkspaceDirectoryCreateResult,
  WorkspaceDirectoryListResult,
  WorkspaceDirectoryTarget,
  WorkspaceEntryRenamePayload,
  WorkspaceEntryRenameResult,
  WorkspaceEntryDeletePayload,
  WorkspaceEntryDeleteResult,
  WorkspaceFileChangePayload,
  WorkspaceFileCreatePayload,
  WorkspaceFileCreateResult,
  WorkspaceFileResolveResult,
  WorkspaceFileTarget,
  WorkspaceFileWatchPayload,
  WorkspaceFileWatchResult,
  WorkspaceFileWritePayload,
  WorkspaceFileWriteResult
} from './workspace-file'
import type {
  WriteInlineCompletionDebugEntry,
  WriteInlineCompletionRequest,
  WriteInlineCompletionResult
} from './write-inline-completion'
import type {
  WriteExportPayload,
  WriteExportResult,
  WriteRichClipboardPayload,
  WriteRichClipboardResult
} from './write-export'
import type {
  CoursewareBlueprintGenerationInput,
  CoursewareExportRequest,
  CoursewareExportResult,
  CoursewareGenerationResult,
  CoursewareProject,
  CoursewareSourceAnalysisResult,
  CoursewareSlideGenerationInput,
  CoursewareSlideGenerationProgress,
  CoursewareSlideRegenerationInput,
  PdfInspectResult,
  PdfRangeExtractResult,
  PubMedSearchRequest,
  PubMedSearchResult,
  SlideSpec,
  CoursewareBlueprint
} from './courseware'
import type {
  TextbookCheckInput,
  TextbookCheckResult,
  TextbookExportInput,
  TextbookExportResult,
  TextbookFormatRules,
  TextbookFormatRulesParseInput,
  TextbookGenerationResult,
  TextbookOutline,
  TextbookOutlineGenerationInput,
  TextbookProject,
  TextbookSection,
  TextbookSectionGenerationInput,
  TextbookSectionRevisionInput
} from './textbook'
export type {
  PythonArchitecture,
  PythonCapabilityPackId,
  PythonCapabilityPackState,
  PythonCapabilityPackStatus,
  PythonInterpreterInfo,
  PythonRuntimeSource,
  PythonRuntimeState,
  PythonRuntimeStatusV1,
  PythonRuntimeTeacherSummary
} from './python-runtime'

export type RuntimeRequestResult = { ok: boolean; status: number; body: string }
export type WorkspacePickResult = { canceled: boolean; path: string | null }
export type PathOpenResult = { ok: boolean; message?: string }
export type LegacyWordTextExtractResult =
  | { ok: true; text: string; truncated: boolean }
  | { ok: false; message: string }
export const DESKTOP_COMMANDS = [
  'undo',
  'redo',
  'cut',
  'copy',
  'paste',
  'selectAll',
  'reload',
  'zoomIn',
  'zoomOut',
  'resetZoom',
  'toggleDevTools',
  'minimize',
  'toggleMaximize',
  'close',
  'quit'
] as const
export type DesktopCommand = typeof DESKTOP_COMMANDS[number]
export type SkillSaveResult = { ok: true; path: string } | { ok: false; message: string }
export type SkillListItem = {
  id: string
  name: string
  description?: string
  root: string
  entryPath: string
  scope: 'builtin' | 'project' | 'global'
  legacy: boolean
  dependencies?: SkillDependencyStatus[]
}
export type SkillDependencyStatus = {
  id: string
  label: string
  kind: 'command'
  required: boolean
  available: boolean
  installHint?: string
}
export type SkillListResult =
  | { ok: true; skills: SkillListItem[]; validationErrors: Array<{ root: string; message: string }> }
  | { ok: false; message: string }
export type DeepseekConfigFileResult = { path: string; content: string; exists: boolean }
export type DeepseekConfigSaveResult = { ok: true; path: string }
export type TurnCompleteNotificationPayload = {
  threadId?: string
  title: string
  body: string
}
export type SystemNotificationResult =
  | { ok: true; shown: boolean; reason?: string }
  | { ok: false; message: string }
export type UpstreamModelsResult =
  | { ok: true; modelIds: string[]; modelGroups?: ModelProviderModelGroup[] }
  | { ok: false; message: string }
export type ModelProviderModelGroup = {
  providerId: string
  label: string
  modelIds: string[]
}
export type SseEventPayload = { streamId: string; data: unknown }
export type SseEndPayload = { streamId: string }
export type SseErrorPayload = { streamId: string; status?: number; message?: string }

export type DsGuiApi = {
  platform: string
  getSettings: () => Promise<AppSettingsV1>
  setSettings: (partial: AppSettingsPatch) => Promise<AppSettingsV1>
  runtimeRequest: (path: string, method?: string, body?: string) => Promise<RuntimeRequestResult>
  fetchUpstreamModels: () => Promise<UpstreamModelsResult>
  pickWorkspaceDirectory: (defaultPath?: string) => Promise<WorkspacePickResult>
  pickFile: (options?: { defaultPath?: string; filters?: Array<{ name: string; extensions: string[] }> }) => Promise<WorkspacePickResult>
  getPathForFile: (file: unknown) => string
  readFileBinary: (filePath: string) => Promise<{ ok: true; data: string; size: number } | { ok: false; message: string }>
  extractLegacyWordText: (path: string) => Promise<LegacyWordTextExtractResult>
  inspectPdf: (path: string) => Promise<PdfInspectResult>
  analyzeCoursewareSource: (path: string) => Promise<CoursewareSourceAnalysisResult>
  loadCoursewareProject: (path: string) => Promise<CoursewareProject>
  extractPdfRange: (
    path: string,
    pageStart: number,
    pageEnd: number
  ) => Promise<PdfRangeExtractResult>
  searchPubMed: (request: PubMedSearchRequest) => Promise<PubMedSearchResult>
  generateCoursewareBlueprint: (
    input: CoursewareBlueprintGenerationInput
  ) => Promise<
    | { ok: true; blueprint: CoursewareBlueprint; repaired: boolean }
    | Exclude<CoursewareGenerationResult<CoursewareBlueprint>, { ok: true }>
  >
  generateCoursewareSlides: (
    input: CoursewareSlideGenerationInput
  ) => Promise<CoursewareGenerationResult<SlideSpec[]>>
  onCoursewareSlideGenerationProgress: (
    handler: (progress: CoursewareSlideGenerationProgress) => void
  ) => () => void
  regenerateCoursewareSlide: (
    input: CoursewareSlideRegenerationInput
  ) => Promise<CoursewareGenerationResult<SlideSpec>>
  exportCoursewarePackage: (
    request: CoursewareExportRequest
  ) => Promise<CoursewareExportResult>
  generateTextbookOutline: (
    input: TextbookOutlineGenerationInput
  ) => Promise<TextbookGenerationResult<TextbookOutline>>
  parseTextbookFormatRules: (
    input: TextbookFormatRulesParseInput
  ) => Promise<TextbookGenerationResult<TextbookFormatRules>>
  generateTextbookSection: (
    input: TextbookSectionGenerationInput
  ) => Promise<TextbookGenerationResult<{ section: TextbookSection }>>
  reviseTextbookSection: (
    input: TextbookSectionRevisionInput
  ) => Promise<TextbookGenerationResult<{ section: TextbookSection }>>
  checkTextbookProject: (
    input: TextbookCheckInput
  ) => Promise<TextbookGenerationResult<TextbookCheckResult>>
  exportTextbookProject: (input: TextbookExportInput) => Promise<TextbookExportResult>
  loadTextbookProject: (path: string) => Promise<TextbookProject>
  listSkills: (workspaceRoot?: string) => Promise<SkillListResult>
  saveSkillFile: (rootPath: string, skillName: string, content: string) => Promise<SkillSaveResult>
  openSkillRoot: (rootPath: string) => Promise<PathOpenResult>
  getDeepseekConfigFile: () => Promise<DeepseekConfigFileResult>
  setDeepseekConfigFile: (content: string) => Promise<DeepseekConfigSaveResult>
  openDeepseekConfigDir: () => Promise<PathOpenResult>
  getGitBranches: (workspaceRoot: string) => Promise<GitBranchesResult>
  switchGitBranch: (workspaceRoot: string, branch: string) => Promise<GitBranchesResult>
  createAndSwitchGitBranch: (workspaceRoot: string, branch: string) => Promise<GitBranchesResult>
  listEditors: () => Promise<EditorListResult>
  openEditorPath: (options: OpenEditorPathOptions) => Promise<EditorOpenResult>
  listWorkspaceDirectory: (options: WorkspaceDirectoryTarget) => Promise<WorkspaceDirectoryListResult>
  resolveWorkspaceFile: (options: WorkspaceFileTarget) => Promise<WorkspaceFileResolveResult>
  readWorkspaceFile: (options: WorkspaceFileTarget) => Promise<WorkspaceFileReadResult>
  readWorkspaceImage: (options: WorkspaceFileTarget) => Promise<WorkspaceImageReadResult>
  writeWorkspaceFile: (payload: WorkspaceFileWritePayload) => Promise<WorkspaceFileWriteResult>
  createWorkspaceFile: (payload: WorkspaceFileCreatePayload) => Promise<WorkspaceFileCreateResult>
  createWorkspaceDirectory: (
    payload: WorkspaceDirectoryCreatePayload
  ) => Promise<WorkspaceDirectoryCreateResult>
  saveWorkspaceClipboardImage: (
    payload: WorkspaceClipboardImageSavePayload
  ) => Promise<WorkspaceClipboardImageSaveResult>
  readClipboardImage: () => Promise<ClipboardImageReadResult>
  renameWorkspaceEntry: (
    payload: WorkspaceEntryRenamePayload
  ) => Promise<WorkspaceEntryRenameResult>
  deleteWorkspaceEntry: (
    payload: WorkspaceEntryDeletePayload
  ) => Promise<WorkspaceEntryDeleteResult>
  watchWorkspaceFile: (payload: WorkspaceFileWatchPayload) => Promise<WorkspaceFileWatchResult>
  unwatchWorkspaceFile: (watchId: string) => Promise<boolean>
  onWorkspaceFileChanged: (handler: (payload: WorkspaceFileChangePayload) => void) => () => void
  requestWriteInlineCompletion: (
    payload: WriteInlineCompletionRequest
  ) => Promise<WriteInlineCompletionResult>
  listWriteInlineCompletionDebugEntries: () => Promise<WriteInlineCompletionDebugEntry[]>
  clearWriteInlineCompletionDebugEntries: () => Promise<boolean>
  exportWriteDocument: (payload: WriteExportPayload) => Promise<WriteExportResult>
  copyWriteDocumentAsRichText: (
    payload: WriteRichClipboardPayload
  ) => Promise<WriteRichClipboardResult>
  startSse: (threadId: string, sinceSeq: number, streamId?: string) => Promise<{ streamId: string }>
  stopSse: (streamId: string) => Promise<boolean>
  onSseEvent: (handler: (payload: SseEventPayload) => void) => () => void
  onSseEnd: (handler: (payload: SseEndPayload) => void) => () => void
  onSseError: (handler: (payload: SseErrorPayload) => void) => () => void
  runDesktopCommand: (command: DesktopCommand) => Promise<void>
  openExternal: (url: string) => Promise<void>
  showTurnCompleteNotification: (
    payload: TurnCompleteNotificationPayload
  ) => Promise<SystemNotificationResult>
  getAppVersion: () => Promise<string>
  getGuiUpdateState: () => Promise<GuiUpdateState>
  checkGuiUpdate: (channel?: GuiUpdateChannel) => Promise<GuiUpdateInfo>
  downloadGuiUpdate: (channel?: GuiUpdateChannel) => Promise<GuiUpdateDownloadResult>
  installGuiUpdate: () => Promise<GuiUpdateInstallResult>
  onGuiUpdateState: (handler: (payload: GuiUpdateState) => void) => () => void
  logError: (category: string, message: string, detail?: unknown) => Promise<void>
  getLogPath: () => Promise<string>
  openLogDir: () => Promise<{ ok: boolean; message?: string }>
}
