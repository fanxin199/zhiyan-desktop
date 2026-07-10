import type { ReactElement } from 'react'
import { FilePenLine, Loader2, MessageSquareText } from 'lucide-react'
import type { RuntimeConnectionStatus, ChatBlock } from '../../agent/types'
import type { QueuedUserMessage } from '../../store/chat-store-types'
import type { ModelProviderModelGroup } from '@shared/ds-gui-api'
import { MessageTimeline } from '../chat/MessageTimeline'
import { FloatingComposer } from '../chat/FloatingComposer'
import type { ComposerReasoningEffort } from '../chat/FloatingComposerModelPicker'

type Props = {
  title: string
  busyLabel?: string
  readyLabel?: string
  input: string
  setInput: (value: string) => void
  mode: 'plan' | 'agent'
  setMode: (value: 'plan' | 'agent') => void
  busy: boolean
  runtimeConnection: RuntimeConnectionStatus
  activeThreadId: string | null
  blocks: ChatBlock[]
  liveReasoning: string
  liveAssistant: string
  composerModel: string
  composerPickList: string[]
  composerModelGroups?: ModelProviderModelGroup[]
  composerReasoningEffort: ComposerReasoningEffort
  setComposerModel: (modelId: string) => void
  setComposerReasoningEffort: (effort: ComposerReasoningEffort) => void
  queuedMessages: QueuedUserMessage[]
  removeQueuedMessage: (id: string) => void
  writeDraftActionLabel?: string
  canCreateWriteDraft?: boolean
  onCreateWriteDraft?: () => void
  onSend: () => void
  onInterrupt: (options?: { discard?: boolean }) => void
  onRetryConnection: () => void
  onOpenSettings: () => void
}

export function ModuleConversationPanel({
  title,
  busyLabel = '正在处理',
  readyLabel = '已完成',
  input,
  setInput,
  mode,
  setMode,
  busy,
  runtimeConnection,
  activeThreadId,
  blocks,
  liveReasoning,
  liveAssistant,
  composerModel,
  composerPickList,
  composerModelGroups = [],
  composerReasoningEffort,
  setComposerModel,
  setComposerReasoningEffort,
  queuedMessages,
  removeQueuedMessage,
  writeDraftActionLabel = '整理到自由写作台',
  canCreateWriteDraft = false,
  onCreateWriteDraft,
  onSend,
  onInterrupt,
  onRetryConnection,
  onOpenSettings
}: Props): ReactElement {
  return (
    <section className="flex min-h-[600px] flex-col overflow-hidden rounded-xl border border-ds-border-muted bg-ds-card shadow-sm">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-ds-border-muted px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <MessageSquareText className="h-4 w-4 shrink-0 text-accent" strokeWidth={1.9} />
          <h2 className="truncate text-[14px] font-semibold text-ds-text">{title}</h2>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {onCreateWriteDraft && canCreateWriteDraft ? (
            <button
              type="button"
              onClick={onCreateWriteDraft}
              className="inline-flex items-center gap-1.5 rounded-lg border border-accent/20 bg-accent/10 px-2.5 py-1.5 text-[12px] font-semibold text-accent transition hover:bg-accent/20"
            >
              <FilePenLine className="h-3.5 w-3.5" strokeWidth={1.9} />
              {writeDraftActionLabel}
            </button>
          ) : null}
          <span className="inline-flex items-center gap-1.5 text-[12px] text-ds-muted">
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" strokeWidth={1.9} /> : null}
            {busy ? busyLabel : readyLabel}
          </span>
        </div>
      </header>
      <div className="min-h-0 flex-1 bg-ds-main/35 dark:bg-transparent">
        <MessageTimeline
          blocks={blocks}
          liveReasoning={liveReasoning}
          live={liveAssistant}
          activeThreadId={activeThreadId}
          runtimeConnection={runtimeConnection}
          onRetryConnection={onRetryConnection}
          onOpenSettings={onOpenSettings}
          onSelectSuggestion={setInput}
        />
      </div>
      <div className="shrink-0 border-t border-ds-border-muted bg-ds-card px-4 pb-4 pt-3">
        <FloatingComposer
          variant="compact"
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
          hideModelPicker
          queuedMessages={queuedMessages}
          onRemoveQueuedMessage={removeQueuedMessage}
          onSend={onSend}
          onInterrupt={onInterrupt}
          hideBtwCommand
        />
      </div>
    </section>
  )
}
