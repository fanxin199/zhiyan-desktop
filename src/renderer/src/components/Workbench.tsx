import type { ReactElement } from 'react'
import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useShallow } from 'zustand/react/shallow'
import { DEFAULT_COMPOSER_MODEL_IDS } from '@shared/default-composer-models'
import type { SkillListItem } from '@shared/ds-gui-api'
import type { ClipboardImageReadResult } from '@shared/workspace-file'
import type { AttachmentReference } from '../agent/types'
import type { SendMessageOverrides } from '../store/chat-store-types'
import type { CoreRuntimeInfoJson, CoreRuntimeSkillJson } from '../agent/kun-contract'
import { getProvider } from '../agent/registry'
import { useChatStore } from '../store/chat-store'
import { prepareImageAttachmentUpload } from '../lib/image-attachment-upload'
import { isChatAttachmentUploadEnabled } from '../lib/attachment-upload-availability'
import { normalizeWorkspaceRoot } from '../lib/workspace-path'
import {
  buildComposerFileContextPrompt,
  mergeComposerFileReferences,
  type ComposerFileContextEntry
} from '../lib/composer-file-references'
import { composeWritePrompt } from '../write/quoted-selection'
import { useWriteWorkspaceStore } from '../write/write-workspace-store'
import { ZhiYanSidebar } from './zhiyan/ZhiYanSidebar'
import { ZhiYanDashboard } from './zhiyan/ZhiYanDashboard'
import {
  BioinformaticsPage,
  FileManagerPage,
  GrantWritingPage,
  LiteraturePage,
  PaperPolishPage,
  PptGenPage,
  ReviewWritingPage,
  SyllabusPage,
  TextbookPage
} from './zhiyan/ZhiYanModulePages'
import { MessageTimeline } from './chat/MessageTimeline'
import { FloatingComposer, type ComposerFileReference } from './chat/FloatingComposer'
import {
  composerReasoningEffortRequestValue,
  type ComposerReasoningEffort
} from './chat/FloatingComposerModelPicker'
import { SessionHeader } from './SessionHeader'
import { RuntimeBanner } from './RuntimeBanner'
import { SidebarTitlebarToggleButton } from './sidebar/SidebarPrimitives'
import { WriteAssistantPanel } from './write/WriteAssistantPanel'
import { WriteSidebar } from './write/WriteSidebar'
import { WriteWorkspaceView } from './write/WriteWorkspaceView'
import { ModuleConversationPanel } from './zhiyan/ModuleConversationPanel'

const PluginMarketplaceView = lazy(() =>
  import('./PluginMarketplaceView').then((module) => ({ default: module.PluginMarketplaceView }))
)

const COMPOSER_FILE_CONTEXT_MAX_CHARS_PER_FILE = 60_000
const COMPOSER_FILE_CONTEXT_MAX_TOTAL_CHARS = 180_000

type ModuleTaskStartOptions = {
  prompt: string
  workspaceRoot?: string
  displayText?: string
  navigateToChat?: boolean
  setRoute: (route: 'chat') => void
  createThread: (options?: { workspaceRoot?: string }) => Promise<void>
  sendMessage: (prompt: string, mode: string, overrides?: SendMessageOverrides) => Promise<boolean>
  setInput: (value: string) => void
}

export async function startModuleTask({
  prompt,
  workspaceRoot,
  displayText,
  navigateToChat = true,
  setRoute,
  createThread,
  sendMessage,
  setInput
}: ModuleTaskStartOptions): Promise<boolean> {
  if (navigateToChat) setRoute('chat')
  await createThread(workspaceRoot ? { workspaceRoot } : undefined)
  const sent = displayText
    ? await sendMessage(prompt, 'agent', { displayText })
    : await sendMessage(prompt, 'agent')
  if (!sent) setInput(displayText ?? prompt)
  return sent
}

function mergeSkillCommands(
  runtimeSkills: CoreRuntimeSkillJson[],
  localSkills: SkillListItem[]
): CoreRuntimeSkillJson[] {
  const merged = new Map<string, CoreRuntimeSkillJson>()
  for (const skill of localSkills) {
    merged.set(skill.id, {
      id: skill.id,
      name: skill.name,
      description: skill.description,
      root: skill.root,
      legacy: skill.legacy,
      scope: skill.scope
    })
  }
  for (const skill of runtimeSkills) {
    const existing = merged.get(skill.id)
    merged.set(skill.id, existing ? {
      ...skill,
      ...existing,
      triggers: skill.triggers ?? existing.triggers,
      allowedTools: skill.allowedTools ?? existing.allowedTools
    } : skill)
  }
  return [...merged.values()]
}

function clipboardImageToFile(image: Extract<ClipboardImageReadResult, { ok: true }>): File {
  const binary = atob(image.dataBase64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return new File([bytes], image.name, { type: image.mimeType })
}

function clipComposerFileContext(
  content: string,
  remainingChars: number,
  sourceTruncated: boolean
): { content: string; truncated: boolean; consumed: number } {
  const limit = Math.max(0, Math.min(COMPOSER_FILE_CONTEXT_MAX_CHARS_PER_FILE, remainingChars))
  const clipped = content.slice(0, limit)
  return {
    content: clipped,
    truncated: sourceTruncated || clipped.length < content.length,
    consumed: clipped.length
  }
}

export function Workbench(): ReactElement {
  const { t } = useTranslation('common')
  const {
    activeThreadId,
    blocks,
    busy,
    composerModel,
    composerModelGroups,
    composerPickList,
    createThread,
    createWriteThread,
    ensureWriteThreadForWorkspace,
    error,
    interrupt,
    liveAssistant,
    liveReasoning,
    openBioinformatics,
    openDashboard,
    openFileManager,
    openGrantWriting,
    openLiterature,
    openPaperPolish,
    openPptGen,
    openReviewWriting,
    openSettings,
    openSyllabus,
    openTextbook,
    openWrite,
    probeRuntime,
    queuedMessages,
    removeQueuedMessage,
    route,
    runtimeConnection,
    sendMessage,
    setComposerModel,
    setError,
    setRoute,
    threads,
    workspaceRoot
  } = useChatStore(useShallow((state) => ({
    activeThreadId: state.activeThreadId,
    blocks: state.blocks,
    busy: state.busy,
    composerModel: state.composerModel,
    composerModelGroups: state.composerModelGroups,
    composerPickList: state.composerPickList,
    createThread: state.createThread,
    createWriteThread: state.createWriteThread,
    ensureWriteThreadForWorkspace: state.ensureWriteThreadForWorkspace,
    error: state.error,
    interrupt: state.interrupt,
    liveAssistant: state.liveAssistant,
    liveReasoning: state.liveReasoning,
    openBioinformatics: state.openBioinformatics,
    openDashboard: state.openDashboard,
    openFileManager: state.openFileManager,
    openGrantWriting: state.openGrantWriting,
    openLiterature: state.openLiterature,
    openPaperPolish: state.openPaperPolish,
    openPptGen: state.openPptGen,
    openReviewWriting: state.openReviewWriting,
    openSettings: state.openSettings,
    openSyllabus: state.openSyllabus,
    openTextbook: state.openTextbook,
    openWrite: state.openWrite,
    probeRuntime: state.probeRuntime,
    queuedMessages: state.queuedMessages,
    removeQueuedMessage: state.removeQueuedMessage,
    route: state.route,
    runtimeConnection: state.runtimeConnection,
    sendMessage: state.sendMessage,
    setComposerModel: state.setComposerModel,
    setError: state.setError,
    setRoute: state.setRoute,
    threads: state.threads,
    workspaceRoot: state.workspaceRoot
  })))
  const [input, setInput] = useState('')
  const [mode, setMode] = useState<'plan' | 'agent'>('agent')
  const [composerReasoningEffort, setComposerReasoningEffort] =
    useState<ComposerReasoningEffort>('max')
  const [runtimeInfo, setRuntimeInfo] = useState<CoreRuntimeInfoJson | null>(null)
  const [runtimeSkills, setRuntimeSkills] = useState<CoreRuntimeSkillJson[]>([])
  const [composerAttachments, setComposerAttachments] = useState<AttachmentReference[]>([])
  const [composerFileReferences, setComposerFileReferences] = useState<ComposerFileReference[]>([])
  const [attachmentUploadBusy, setAttachmentUploadBusy] = useState(false)
  const [attachmentUploadError, setAttachmentUploadError] = useState<string | null>(null)
  const [leftSidebarCollapsed, setLeftSidebarCollapsed] = useState(false)
  const [literatureConversationVisible, setLiteratureConversationVisible] = useState(false)
  const [literatureConversationThreadId, setLiteratureConversationThreadId] = useState<string | null>(null)
  const writeAssistantOpen = useWriteWorkspaceStore((state) => state.assistantOpen)
  const setWriteAssistantOpen = useWriteWorkspaceStore((state) => state.setAssistantOpen)
  const writeAssistantModel = useWriteWorkspaceStore((state) => state.assistantModel)
  const setWriteAssistantModel = useWriteWorkspaceStore((state) => state.setAssistantModel)

  const activeSkillWorkspace = useMemo(
    () => threads.find((thread) => thread.id === activeThreadId)?.workspace || workspaceRoot || '',
    [activeThreadId, threads, workspaceRoot]
  )
  const writeAssistantPickList = useMemo(() => {
    const ordered = new Set<string>(DEFAULT_COMPOSER_MODEL_IDS)
    for (const id of composerPickList) {
      if (id.trim()) ordered.add(id.trim())
    }
    if (writeAssistantModel.trim()) ordered.add(writeAssistantModel.trim())
    return [...ordered]
  }, [composerPickList, writeAssistantModel])

  useEffect(() => {
    let cancelled = false
    const provider = getProvider()
    const runtimeReady = runtimeConnection === 'ready'
    const localSkillsTask = typeof window.dsGui?.listSkills === 'function'
      ? window.dsGui.listSkills(activeSkillWorkspace || undefined)
      : Promise.resolve({ ok: true as const, skills: [], validationErrors: [] })
    void Promise.allSettled([
      runtimeReady && provider.getRuntimeInfo ? provider.getRuntimeInfo() : Promise.resolve(null),
      runtimeReady && provider.listSkills ? provider.listSkills() : Promise.resolve([]),
      localSkillsTask
    ]).then(([runtimeResult, skillsResult, localSkillsResult]) => {
      if (cancelled) return
      setRuntimeInfo(runtimeResult.status === 'fulfilled' ? runtimeResult.value : null)
      const runtimeSkillList = skillsResult.status === 'fulfilled' ? skillsResult.value : []
      const localSkillList =
        localSkillsResult.status === 'fulfilled' && localSkillsResult.value.ok
          ? localSkillsResult.value.skills
          : []
      setRuntimeSkills(mergeSkillCommands(runtimeSkillList, localSkillList))
    })
    return () => {
      cancelled = true
    }
  }, [activeSkillWorkspace, runtimeConnection])

  useEffect(() => {
    if (route !== 'chat') setComposerFileReferences([])
  }, [route])

  const attachmentUploadEnabled = isChatAttachmentUploadEnabled({
    runtimeConnection,
    route,
    mode,
    attachmentStoreAvailable: runtimeInfo?.capabilities.attachments.available
  })
  const webAccessAvailable =
    runtimeInfo?.capabilities.web.fetch.available === true ||
    runtimeInfo?.capabilities.web.search.available === true

  const handlePickAttachments = async (files: File[]): Promise<void> => {
    if (!files.length || !attachmentUploadEnabled) return
    const provider = getProvider()
    if (typeof provider.uploadAttachment !== 'function') {
      setAttachmentUploadError(t('composerAttachmentUnavailable'))
      return
    }
    setAttachmentUploadBusy(true)
    setAttachmentUploadError(null)
    try {
      const capabilities = runtimeInfo?.capabilities.attachments
      if (!capabilities) throw new Error(t('composerAttachmentUnavailable'))
      const workspace =
        threads.find((thread) => thread.id === activeThreadId)?.workspace || workspaceRoot || undefined
      const uploaded: AttachmentReference[] = []
      for (const file of files) {
        if (!file.type.startsWith('image/')) continue
        const prepared = await prepareImageAttachmentUpload(file, capabilities)
        const attachment = await provider.uploadAttachment({
          name: file.name || 'image',
          mimeType: prepared.mimeType,
          dataBase64: prepared.dataBase64,
          textFallback: prepared.textFallback,
          ...(activeThreadId ? { threadId: activeThreadId } : {}),
          ...(workspace ? { workspace } : {})
        })
        uploaded.push({
          id: attachment.id,
          name: attachment.name,
          mimeType: attachment.mimeType,
          width: attachment.width,
          height: attachment.height,
          previewUrl: `data:${prepared.mimeType};base64,${prepared.dataBase64}`
        })
      }
      setComposerAttachments((current) => {
        const byId = new Map(current.map((attachment) => [attachment.id, attachment]))
        for (const attachment of uploaded) byId.set(attachment.id, attachment)
        return [...byId.values()]
      })
    } catch (uploadError) {
      setAttachmentUploadError(
        uploadError instanceof Error ? uploadError.message : String(uploadError)
      )
    } finally {
      setAttachmentUploadBusy(false)
    }
  }

  const handlePasteClipboardImage = async (
    options: { silentNoImage?: boolean } = {}
  ): Promise<void> => {
    if (!attachmentUploadEnabled) return
    const image = await window.dsGui.readClipboardImage()
    if (!image.ok) {
      if (!options.silentNoImage) setAttachmentUploadError(image.message)
      return
    }
    await handlePickAttachments([clipboardImageToFile(image)])
  }

  const readComposerFileContextEntries = async (
    references: ComposerFileReference[],
    workspace: string
  ): Promise<ComposerFileContextEntry[]> => {
    const entries: ComposerFileContextEntry[] = []
    let remainingChars = COMPOSER_FILE_CONTEXT_MAX_TOTAL_CHARS
    for (const reference of references) {
      if (remainingChars <= 0) break
      const result = await window.dsGui.readWorkspaceFile({
        workspaceRoot: workspace,
        path: reference.relativePath || reference.path
      })
      if (!result.ok) throw new Error(result.message)
      const clipped = clipComposerFileContext(result.content, remainingChars, result.truncated)
      remainingChars -= clipped.consumed
      entries.push({
        relativePath: reference.relativePath,
        content: clipped.content,
        ...(clipped.truncated ? { truncated: true } : {})
      })
    }
    return entries
  }

  const sendWritePrompt = (value: string): void => {
    const userPrompt = value.trim()
    if (!userPrompt) return
    const writeState = useWriteWorkspaceStore.getState()
    const targetWorkspace = writeState.workspaceRoot || workspaceRoot
    const prompt = composeWritePrompt(userPrompt, writeState.quotedSelections, {
      workspaceRoot: targetWorkspace,
      activeFilePath: writeState.activeFilePath
    })
    setInput('')
    void (async () => {
      const threadId = await ensureWriteThreadForWorkspace(targetWorkspace)
      if (!threadId) {
        setInput(userPrompt)
        return
      }
      const reasoningEffort = composerReasoningEffortRequestValue(composerReasoningEffort)
      const sent = await sendMessage(prompt, 'agent', {
        ...(writeState.assistantModel.trim() ? { model: writeState.assistantModel.trim() } : {}),
        ...(reasoningEffort ? { reasoningEffort } : {})
      })
      if (sent) useWriteWorkspaceStore.getState().clearQuotedSelections()
    })()
  }

  const handleSend = (): void => {
    void (async () => {
      const userPrompt = input.trim()
      if (route === 'write') {
        sendWritePrompt(userPrompt)
        return
      }
      const attachmentIds = composerAttachments.map((attachment) => attachment.id)
      if (!userPrompt && attachmentIds.length === 0 && composerFileReferences.length === 0) return
      const fallbackPrompt = composerFileReferences.length > 0
        ? t('composerFileOnlyPrompt')
        : t('composerImageOnlyPrompt')
      let prompt = userPrompt || fallbackPrompt
      const displayText = userPrompt || undefined
      if (composerFileReferences.length > 0) {
        const workspace = normalizeWorkspaceRoot(
          threads.find((thread) => thread.id === activeThreadId)?.workspace || workspaceRoot
        )
        if (!workspace) {
          setError(t('workspaceRequiredToCreateThread'))
          return
        }
        try {
          const fileContext = await readComposerFileContextEntries(
            composerFileReferences,
            workspace
          )
          prompt = buildComposerFileContextPrompt(prompt, fileContext)
        } catch (readError) {
          setError(readError instanceof Error ? readError.message : String(readError))
          return
        }
      }
      setInput('')
      setComposerAttachments([])
      setComposerFileReferences([])
      const reasoningEffort = composerReasoningEffortRequestValue(composerReasoningEffort)
      void sendMessage(prompt, 'agent', {
        ...(displayText ? { displayText } : {}),
        ...(reasoningEffort ? { reasoningEffort } : {}),
        ...(attachmentIds.length
          ? { attachmentIds, attachments: composerAttachments }
          : {})
      })
    })()
  }

  const openWriteMode = (): void => {
    void openWrite()
  }
  const handleModuleQuickPrompt = (
    prompt: string,
    options?: {
      workspaceRoot?: string
      displayText?: string
      stayInModule?: boolean
    }
  ): void => {
    void startModuleTask({
      prompt,
      workspaceRoot: options?.workspaceRoot,
      displayText: options?.displayText,
      navigateToChat: !options?.stayInModule,
      setRoute,
      createThread,
      sendMessage,
      setInput
    }).then((sent) => {
      if (!options?.stayInModule) return
      setLiteratureConversationVisible(sent)
      setLiteratureConversationThreadId(sent ? useChatStore.getState().activeThreadId : null)
    })
  }
  const renderRuntimeBanner = (message: string): ReactElement => (
    <RuntimeBanner
      message={message}
      runtimeReady={runtimeConnection === 'ready'}
      stageInsetClass="ds-stage-inset"
      t={t}
      onOpenSettings={() => openSettings('agents')}
      onRetryConnection={() => void probeRuntime('user')}
    />
  )
  const moduleRoutes = [
    'dashboard',
    'syllabus',
    'ppt-gen',
    'paper-polish',
    'literature',
    'review-writing',
    'grant-writing',
    'textbook',
    'bioinformatics',
    'file-manager'
  ]
  const needsStageSidebarRestore =
    leftSidebarCollapsed && (moduleRoutes.includes(route) || route === 'plugins')

  return (
    <div className="ds-workbench-shell ds-drag flex h-full min-h-0 w-full min-w-0 bg-ds-main">
      {!leftSidebarCollapsed ? (
        <div className="min-h-0 w-[264px] shrink-0 border-r border-ds-border-muted">
          {route === 'write' ? (
            <WriteSidebar
              onOpenDashboard={openDashboard}
              onOpenSettings={(section) => openSettings(section)}
              onToggleSidebar={() => setLeftSidebarCollapsed(true)}
            />
          ) : (
            <ZhiYanSidebar
              activeRoute={moduleRoutes.includes(route) ? route : route === 'chat' ? 'chat' : route}
              onOpenDashboard={openDashboard}
              onOpenSyllabus={openSyllabus}
              onOpenPptGen={openPptGen}
              onOpenPaperPolish={openPaperPolish}
              onOpenLiterature={openLiterature}
              onOpenReviewWriting={openReviewWriting}
              onOpenGrantWriting={openGrantWriting}
              onOpenTextbook={openTextbook}
              onOpenBioinformatics={openBioinformatics}
              onOpenWrite={openWriteMode}
              onOpenFileManager={openFileManager}
              onOpenSettings={(section) => openSettings(section)}
              onOpenChat={() => setRoute('chat')}
              onToggleSidebar={() => setLeftSidebarCollapsed(true)}
            />
          )}
        </div>
      ) : null}

      <main className="ds-stage-surface relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {needsStageSidebarRestore ? (
          <div className="pointer-events-none absolute left-3 top-3 z-40">
            <SidebarTitlebarToggleButton
              onClick={() => setLeftSidebarCollapsed(false)}
              title={t('sidebarExpand')}
              ariaLabel={t('sidebarExpand')}
              className="pointer-events-auto border border-ds-border-muted bg-ds-card/90 shadow-sm backdrop-blur"
            />
          </div>
        ) : null}
        {route === 'dashboard' ? (
          <ZhiYanDashboard
            onOpenSyllabus={openSyllabus}
            onOpenPptGen={openPptGen}
            onOpenPaperPolish={openPaperPolish}
            onOpenLiterature={openLiterature}
            onOpenReviewWriting={openReviewWriting}
            onOpenGrantWriting={openGrantWriting}
            onOpenTextbook={openTextbook}
            onOpenBioinformatics={openBioinformatics}
            onOpenChat={() => setRoute('chat')}
            onOpenWrite={openWriteMode}
            className="ds-no-drag"
          />
        ) : route === 'syllabus' ? (
          <SyllabusPage onStartChat={handleModuleQuickPrompt} className="ds-no-drag" />
        ) : route === 'ppt-gen' ? (
          <PptGenPage onStartChat={handleModuleQuickPrompt} className="ds-no-drag" />
        ) : route === 'paper-polish' ? (
          <PaperPolishPage
            onStartChat={handleModuleQuickPrompt}
            onOpenWrite={openWriteMode}
            className="ds-no-drag"
          />
        ) : route === 'literature' ? (
          <LiteraturePage
            onStartChat={handleModuleQuickPrompt}
            showInlineConversation={
              literatureConversationVisible && literatureConversationThreadId === activeThreadId
            }
            inlineConversation={
              <ModuleConversationPanel
                title="文献解读"
                busy={busy}
                input={input}
                setInput={setInput}
                mode={mode}
                setMode={setMode}
                runtimeConnection={runtimeConnection}
                activeThreadId={activeThreadId}
                blocks={blocks}
                liveReasoning={liveReasoning}
                liveAssistant={liveAssistant}
                composerModel={composerModel}
                composerPickList={composerPickList}
                composerModelGroups={composerModelGroups}
                composerReasoningEffort={composerReasoningEffort}
                setComposerModel={setComposerModel}
                setComposerReasoningEffort={setComposerReasoningEffort}
                queuedMessages={queuedMessages}
                removeQueuedMessage={removeQueuedMessage}
                onSend={handleSend}
                onInterrupt={(options) => void interrupt(options)}
                onRetryConnection={() => void probeRuntime('user')}
                onOpenSettings={() => openSettings('agents')}
              />
            }
            className="ds-no-drag"
          />
        ) : route === 'review-writing' ? (
          <ReviewWritingPage
            onStartChat={handleModuleQuickPrompt}
            onOpenWrite={openWriteMode}
            className="ds-no-drag"
          />
        ) : route === 'grant-writing' ? (
          <GrantWritingPage
            onStartChat={handleModuleQuickPrompt}
            onOpenWrite={openWriteMode}
            className="ds-no-drag"
          />
        ) : route === 'textbook' ? (
          <TextbookPage onStartChat={handleModuleQuickPrompt} className="ds-no-drag" />
        ) : route === 'bioinformatics' ? (
          <BioinformaticsPage onStartChat={handleModuleQuickPrompt} className="ds-no-drag" />
        ) : route === 'file-manager' ? (
          <FileManagerPage onStartChat={handleModuleQuickPrompt} className="ds-no-drag" />
        ) : route === 'plugins' ? (
          <Suspense fallback={<div className="h-full bg-ds-main" />}>
            <PluginMarketplaceView />
          </Suspense>
        ) : route === 'write' ? (
          <>
            {runtimeConnection !== 'ready'
              ? renderRuntimeBanner(error?.trim() || t('writeRuntimeUnavailable'))
              : null}
            <div className="flex min-h-0 flex-1">
              <WriteWorkspaceView
                leftSidebarCollapsed={leftSidebarCollapsed}
                onToggleLeftSidebar={() => setLeftSidebarCollapsed((value) => !value)}
                input={input}
                setInput={setInput}
                onSubmitPrompt={sendWritePrompt}
              />
              {writeAssistantOpen ? (
                <div className="h-full w-[420px] shrink-0 border-l border-ds-border-muted">
                  <WriteAssistantPanel
                    input={input}
                    setInput={setInput}
                    mode={mode}
                    setMode={setMode}
                    busy={busy}
                    runtimeConnection={runtimeConnection}
                    activeThreadId={activeThreadId}
                    blocks={blocks}
                    liveReasoning={liveReasoning}
                    liveAssistant={liveAssistant}
                    composerModel={writeAssistantModel}
                    composerPickList={writeAssistantPickList}
                    composerModelGroups={composerModelGroups}
                    composerReasoningEffort={composerReasoningEffort}
                    setComposerModel={setWriteAssistantModel}
                    setComposerReasoningEffort={setComposerReasoningEffort}
                    queuedMessages={queuedMessages}
                    removeQueuedMessage={removeQueuedMessage}
                    onSend={handleSend}
                    onInterrupt={(options) => void interrupt(options)}
                    onRetryConnection={() => void probeRuntime('user')}
                    onOpenSettings={() => openSettings('agents')}
                    onNewConversation={() => {
                      setInput('')
                      void createWriteThread(
                        useWriteWorkspaceStore.getState().workspaceRoot || workspaceRoot
                      )
                    }}
                    onCollapse={() => setWriteAssistantOpen(false)}
                    className="h-full max-h-full w-full"
                  />
                </div>
              ) : null}
            </div>
          </>
        ) : (
          <>
            {error ? renderRuntimeBanner(error) : null}
            <section className="ds-chat-stage ds-drag flex min-h-0 min-w-0 flex-1 flex-col">
              <header className="chat-topbar ds-topbar-surface relative z-10 mt-3 flex min-h-[46px] shrink-0 items-center rounded-[24px] px-4">
                {leftSidebarCollapsed ? (
                  <SidebarTitlebarToggleButton
                    onClick={() => setLeftSidebarCollapsed(false)}
                    title={t('sidebarExpand')}
                    ariaLabel={t('sidebarExpand')}
                  />
                ) : null}
                <SessionHeader compact className="min-w-0 flex-1" />
                <button
                  type="button"
                  onClick={() => void createThread()}
                  disabled={runtimeConnection !== 'ready'}
                  className="ds-no-drag inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-2 text-[12px] font-semibold text-white disabled:opacity-40"
                >
                  <Plus className="h-3.5 w-3.5" />
                  新对话
                </button>
              </header>
              <MessageTimeline
                blocks={blocks}
                liveReasoning={liveReasoning}
                live={liveAssistant}
                activeThreadId={activeThreadId}
                runtimeConnection={runtimeConnection}
                onRetryConnection={() => void probeRuntime('user')}
                onOpenSettings={() => openSettings('agents')}
                onSelectSuggestion={setInput}
              />
              <div className="flex shrink-0 justify-center px-4 pb-3">
                <FloatingComposer
                  input={input}
                  setInput={setInput}
                  mode={mode}
                  setMode={setMode}
                  busy={busy}
                  runtimeReady={runtimeConnection === 'ready'}
                  hasActiveThread={Boolean(activeThreadId)}
                  composerModel={composerModel}
                  composerPickList={composerPickList}
                  composerModelGroups={composerModelGroups}
                  composerReasoningEffort={composerReasoningEffort}
                  onComposerModelChange={setComposerModel}
                  onComposerReasoningEffortChange={setComposerReasoningEffort}
                  onSend={handleSend}
                  attachments={composerAttachments}
                  attachmentUploadEnabled={attachmentUploadEnabled}
                  attachmentUploadBusy={attachmentUploadBusy}
                  attachmentUploadError={attachmentUploadError}
                  fileReferenceEnabled
                  fileReferences={composerFileReferences}
                  webAccessAvailable={webAccessAvailable}
                  skillCommands={runtimeSkills}
                  onPickAttachments={(files) => void handlePickAttachments(files)}
                  onPasteClipboardImage={(options) => void handlePasteClipboardImage(options)}
                  onRemoveAttachment={(id) =>
                    setComposerAttachments((current) =>
                      current.filter((attachment) => attachment.id !== id)
                    )
                  }
                  onAddFileReference={(reference) =>
                    setComposerFileReferences((current) =>
                      mergeComposerFileReferences(current, reference)
                    )
                  }
                  onRemoveFileReference={(relativePath) =>
                    setComposerFileReferences((current) =>
                      current.filter((reference) => reference.relativePath !== relativePath)
                    )
                  }
                  queuedMessages={queuedMessages}
                  onRemoveQueuedMessage={removeQueuedMessage}
                  onInterrupt={(options) => void interrupt(options)}
                />
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  )
}
