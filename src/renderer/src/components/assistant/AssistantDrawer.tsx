import { useState, type ReactElement } from 'react'
import { ArrowLeft, ArrowRight, List, Plus, Sparkles, X } from 'lucide-react'
import type { ChatBlock, NormalizedThread, RuntimeConnectionStatus } from '../../agent/types'
import { formatRelativeTime } from '../../lib/format-relative-time'
import type { AssistantHandOff } from '../../lib/assistant-store'
import type { ToolRequest } from '../../lib/tool-request'
import { IntentComposer } from '../ai-work/IntentComposer'
import { MessageTimeline } from '../chat/MessageTimeline'
import { recentThreadFeatureLabel, recentThreadTitle } from '../zhiyan/ZhiYanDashboard'

type AssistantDrawerProps = {
  open: boolean
  onClose: () => void
  /** Where the teacher is, e.g. “文稿 · 第八章教案”; sent along with every message. */
  contextLabel: string
  threads: NormalizedThread[]
  activeThreadId: string | null
  blocks: ChatBlock[]
  liveReasoning: string
  liveAssistant: string
  runtimeConnection: RuntimeConnectionStatus
  busy: boolean
  /** Sends a message, or opens the tool that makes the requested deliverable and returns it. */
  onSend: (text: string, options?: { answerInChat?: boolean }) => ToolRequest | null
  /** Requests already handed to a tool, each with a way back to answering in the chat. */
  handOffs: AssistantHandOff[]
  onDismissHandOff: (id: number) => void
  onNewConversation: () => void
  onSelectThread: (threadId: string) => void
  onInterrupt: () => void
  onRetryConnection: () => void
  onOpenSettings: () => void
}

/** Conversations the teacher can return to, latest first, with readable names. */
export function assistantConversationList(threads: NormalizedThread[]): Array<{ thread: NormalizedThread; title: string }> {
  return threads
    .filter((thread) => !thread.archived && thread.status !== 'archived')
    .map((thread) => ({ thread, title: recentThreadTitle(thread) }))
    .filter((item): item is { thread: NormalizedThread; title: string } => item.title !== null)
    .sort((left, right) => right.thread.updatedAt.localeCompare(left.thread.updatedAt))
}

/**
 * The AI assistant (Task 1.5): a panel that opens over any page. It knows the page and the open
 * artifact, keeps 新对话 and 全部对话, and hands requests for a deliverable to the tool that makes it.
 */
export function AssistantDrawer({
  open,
  onClose,
  contextLabel,
  threads,
  activeThreadId,
  blocks,
  liveReasoning,
  liveAssistant,
  runtimeConnection,
  busy,
  onSend,
  handOffs,
  onDismissHandOff,
  onNewConversation,
  onSelectThread,
  onInterrupt,
  onRetryConnection,
  onOpenSettings
}: AssistantDrawerProps): ReactElement | null {
  const [input, setInput] = useState('')
  const [view, setView] = useState<'chat' | 'list'>('chat')

  if (!open) return null

  const send = (): void => {
    const text = input.trim()
    if (!text) return
    setInput('')
    onSend(text)
  }

  return (
    <aside
      data-testid="assistant-drawer"
      aria-label="AI 助手"
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose()
      }}
      className="ds-no-drag absolute inset-y-0 right-0 z-40 flex w-[420px] max-w-full flex-col border-l border-ds-border-muted bg-ds-main shadow-xl"
    >
      <header className="flex h-12 shrink-0 items-center gap-1 border-b border-ds-border-muted px-3">
        {view === 'list' ? (
          <button type="button" onClick={() => setView('chat')} className="rounded-lg p-1.5 text-ds-muted hover:bg-ds-hover hover:text-ds-ink" aria-label="返回对话">
            <ArrowLeft className="h-4 w-4" strokeWidth={1.8} />
          </button>
        ) : null}
        <span className="inline-flex flex-1 items-center gap-2 text-heading font-semibold text-ds-text">
          <Sparkles className="h-4 w-4 text-accent" strokeWidth={1.8} />
          {view === 'list' ? '全部对话' : 'AI 助手'}
        </span>
        {view === 'chat' ? (
          <>
            <button
              type="button"
              onClick={() => setView('list')}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-small text-ds-muted hover:bg-ds-hover hover:text-ds-ink"
            >
              <List className="h-4 w-4" strokeWidth={1.8} />
              全部对话
            </button>
            <button
              type="button"
              onClick={onNewConversation}
              disabled={runtimeConnection !== 'ready'}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-small text-ds-muted hover:bg-ds-hover hover:text-ds-ink disabled:opacity-50"
            >
              <Plus className="h-4 w-4" strokeWidth={1.8} />
              新对话
            </button>
          </>
        ) : null}
        <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-ds-muted hover:bg-ds-hover hover:text-ds-ink" aria-label="关闭 AI 助手" title="关闭（Esc）">
          <X className="h-4 w-4" strokeWidth={1.8} />
        </button>
      </header>

      {view === 'list' ? (
        <ul className="min-h-0 flex-1 divide-y divide-ds-border-muted overflow-y-auto">
          {assistantConversationList(threads).map(({ thread, title }) => (
            <li key={thread.id}>
              <button
                type="button"
                onClick={() => {
                  onSelectThread(thread.id)
                  setView('chat')
                }}
                className={`w-full px-4 py-2.5 text-left transition-colors hover:bg-ds-hover ${thread.id === activeThreadId ? 'bg-ds-subtle' : ''}`}
              >
                <span className="block truncate text-small font-semibold text-ds-text">{title}</span>
                <span className="block text-caption text-ds-muted">
                  {recentThreadFeatureLabel(thread)} · {formatRelativeTime(thread.updatedAt, 'zh-CN')}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <>
          <div className="flex min-h-0 flex-1 flex-col">
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
            {handOffs.length > 0 ? (
              <ul className="shrink-0 space-y-2 border-t border-ds-border-muted px-4 py-3">
                {handOffs.map((handOff) => (
                  <li key={handOff.id} className="rounded-xl border border-ds-border-muted bg-ds-subtle px-3 py-2">
                    <p className="flex items-center gap-1.5 text-small font-semibold text-ds-text">
                      <ArrowRight className="h-4 w-4 text-accent" strokeWidth={1.9} />
                      已打开「{handOff.request.label}」，并填好了你的要求
                    </p>
                    <p className="mt-0.5 truncate text-caption text-ds-muted">{handOff.text}</p>
                    <button
                      type="button"
                      onClick={() => {
                        onDismissHandOff(handOff.id)
                        onSend(handOff.text, { answerInChat: true })
                      }}
                      className="mt-1 text-caption font-medium text-ds-muted underline-offset-2 hover:text-ds-ink hover:underline"
                    >
                      改为在对话里回答
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          <div className="shrink-0 border-t border-ds-border-muted p-3">
            <p className="mb-2 truncate text-caption text-ds-muted" title={contextLabel}>将参考：{contextLabel}</p>
            <IntentComposer
              variant="panel"
              value={input}
              onChange={setInput}
              onSubmit={send}
              placeholder="问问题，或说一件要做的事"
              busy={busy}
              onStop={onInterrupt}
              autoFocus
            />
          </div>
        </>
      )}
    </aside>
  )
}
