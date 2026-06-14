import {
  useLayoutEffect,
  useRef,
  type ChangeEvent,
  type ReactElement,
  type TextareaHTMLAttributes
} from 'react'

type ResizableTextAreaProps = Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  'value' | 'onChange'
> & {
  value: string
  onChange: (event: ChangeEvent<HTMLTextAreaElement>) => void
}

export function ResizableTextArea({
  value,
  onChange,
  className = '',
  rows = 3,
  ...props
}: ResizableTextAreaProps): ReactElement {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  useLayoutEffect(() => {
    const element = textareaRef.current
    if (!element) return
    element.style.height = 'auto'
    element.style.height = `${element.scrollHeight + 2}px`
  }, [value])

  function handleChange(event: ChangeEvent<HTMLTextAreaElement>): void {
    const element = event.currentTarget
    element.style.height = 'auto'
    element.style.height = `${element.scrollHeight + 2}px`
    onChange(event)
  }

  return (
    <div className="relative min-w-0">
      <textarea
        {...props}
        ref={textareaRef}
        data-resizable-textarea="true"
        value={value}
        rows={rows}
        onChange={handleChange}
        className={`block min-h-[92px] w-full resize-y overflow-y-auto whitespace-pre-wrap break-words !pr-8 [overflow-wrap:anywhere] ${className}`}
      />
      <span
        aria-hidden="true"
        data-resize-marker="true"
        className="pointer-events-none absolute bottom-[7px] right-[7px] h-4 w-4 opacity-65"
      >
        <span className="absolute bottom-0 right-0 h-px w-3 rotate-[-45deg] bg-accent" />
        <span className="absolute bottom-[4px] right-0 h-px w-2 rotate-[-45deg] bg-accent" />
      </span>
    </div>
  )
}
