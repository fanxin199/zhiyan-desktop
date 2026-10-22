import {
  useLayoutEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
  type ReactElement
} from 'react'
import { ArrowUp, Paperclip, Square, X } from 'lucide-react'

export type IntentAttachment = { id: string; name: string }

/** Enter sends and Shift+Enter starts a new line; keys pressed while an input method is composing are left alone. */
export function composerKeyAction(event: {
  key: string
  shiftKey: boolean
  isComposing?: boolean
}): 'submit' | null {
  if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return null
  return 'submit'
}

type IntentComposerProps = {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  placeholder: string
  /** `start` is the large box on a start page; `panel` sits at the bottom of the AI side panel. */
  variant?: 'start' | 'panel'
  attachments?: IntentAttachment[]
  /** Files dropped, pasted or picked; omit to hide the attach button. */
  onAddFiles?: (files: File[]) => void
  onRemoveAttachment?: (id: string) => void
  busy?: boolean
  onStop?: () => void
  autoFocus?: boolean
}

/**
 * The one input box used across the app (§5.4): it grows with its text, takes dropped or pasted
 * materials as chips, sends on Enter and inserts a line on Shift+Enter.
 */
export function IntentComposer({
  value,
  onChange,
  onSubmit,
  placeholder,
  variant = 'start',
  attachments = [],
  onAddFiles,
  onRemoveAttachment,
  busy = false,
  onStop,
  autoFocus = false
}: IntentComposerProps): ReactElement {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [dragging, setDragging] = useState(false)

  // Grow with the text up to the max-height set below, then scroll.
  useLayoutEffect(() => {
    const element = textareaRef.current
    if (!element) return
    element.style.height = 'auto'
    element.style.height = `${element.scrollHeight}px`
  }, [value])

  const submit = (): void => {
    if (busy) return
    if (!value.trim() && attachments.length === 0) {
      textareaRef.current?.focus()
      return
    }
    onSubmit()
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (composerKeyAction({ key: event.key, shiftKey: event.shiftKey, isComposing: event.nativeEvent.isComposing }) !== 'submit') return
    event.preventDefault()
    submit()
  }

  const handleDrop = (event: DragEvent<HTMLDivElement>): void => {
    setDragging(false)
    if (!onAddFiles || event.dataTransfer.files.length === 0) return
    event.preventDefault()
    onAddFiles([...event.dataTransfer.files])
  }

  const handlePaste = (event: ClipboardEvent<HTMLTextAreaElement>): void => {
    if (!onAddFiles || event.clipboardData.files.length === 0) return
    event.preventDefault()
    onAddFiles([...event.clipboardData.files])
  }

  const large = variant === 'start'
  return (
    <div
      data-testid="intent-composer"
      onDragOver={(event) => {
        if (!onAddFiles) return
        event.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      className={`rounded-xl border bg-ds-card transition-colors ${
        dragging ? 'border-accent bg-accent-soft' : 'border-ds-border focus-within:border-accent'
      } ${large ? 'p-3' : 'p-2'}`}
    >
      {attachments.length > 0 ? (
        <ul className="mb-2 flex flex-wrap gap-1.5" aria-label="已添加的材料">
          {attachments.map((attachment) => (
            <li
              key={attachment.id}
              className="inline-flex max-w-full items-center gap-1 rounded-lg border border-ds-border-muted bg-ds-subtle px-2 py-1 text-small text-ds-text"
            >
              <span className="truncate">{attachment.name}</span>
              {onRemoveAttachment ? (
                <button
                  type="button"
                  onClick={() => onRemoveAttachment(attachment.id)}
                  className="rounded p-0.5 text-ds-muted hover:bg-ds-hover hover:text-ds-ink"
                  aria-label={`移除 ${attachment.name}`}
                >
                  <X className="h-3 w-3" strokeWidth={2} />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        rows={large ? 3 : 2}
        autoFocus={autoFocus}
        placeholder={placeholder}
        className={`max-h-72 w-full resize-none bg-transparent px-1 text-body leading-6 text-ds-ink outline-none placeholder:text-ds-faint ${
          large ? 'min-h-[84px]' : 'min-h-[52px]'
        }`}
      />
      <div className="mt-2 flex items-center justify-between gap-2">
        {onAddFiles ? (
          <>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-small text-ds-muted transition-colors hover:bg-ds-hover hover:text-ds-ink"
            >
              <Paperclip className="h-4 w-4" strokeWidth={1.8} />
              添加材料
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              hidden
              onChange={(event) => {
                const files = [...(event.target.files ?? [])]
                event.target.value = ''
                if (files.length > 0) onAddFiles(files)
              }}
            />
          </>
        ) : <span />}
        {busy && onStop ? (
          <button
            type="button"
            onClick={onStop}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-ds-ink text-ds-main transition-colors hover:bg-ds-ink/80"
            aria-label="停止"
            title="停止"
          >
            <Square className="h-3.5 w-3.5 fill-current" strokeWidth={2.4} />
          </button>
        ) : (
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-white transition-colors hover:bg-accent/90 disabled:opacity-50"
            aria-label="发送"
            title={busy ? 'AI 正在处理，完成后可以继续发送' : '发送（Enter）'}
          >
            <ArrowUp className="h-4 w-4" strokeWidth={2.2} />
          </button>
        )}
      </div>
    </div>
  )
}
