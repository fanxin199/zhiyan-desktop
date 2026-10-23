import { useEffect, useRef } from 'react'

/** Calls `onEscape` when Esc is pressed while `active`, so every overlay closes the same way (Task 4.3.1). */
export function useEscapeKey(active: boolean, onEscape: () => void): void {
  const handler = useRef(onEscape)
  handler.current = onEscape
  useEffect(() => {
    if (!active) return
    const listener = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing) return
      event.preventDefault()
      handler.current()
    }
    document.addEventListener('keydown', listener)
    return () => document.removeEventListener('keydown', listener)
  }, [active])
}
