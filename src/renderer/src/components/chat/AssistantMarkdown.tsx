import type { ReactElement } from 'react'
import { useEffect, useState } from 'react'

type StreamdownAssistantComponent = typeof import('./StreamdownAssistant').StreamdownAssistant

let loadedRenderer: StreamdownAssistantComponent | null = null
let rendererPromise: Promise<StreamdownAssistantComponent> | null = null

/** Loads the Markdown renderer once; it is split out of the main bundle because it is large. */
export function loadStreamdownAssistant(): Promise<StreamdownAssistantComponent> {
  rendererPromise ??= import('./StreamdownAssistant').then((module) => {
    loadedRenderer = module.StreamdownAssistant
    return loadedRenderer
  })
  return rendererPromise
}

/**
 * Renders an assistant reply as Markdown. Until the renderer has loaded, the reply is shown as plain
 * text. The switch is a state update rather than a Suspense boundary: replies restored together
 * with the writing page kept their Suspense fallback after the renderer loaded, leaving `**` and
 * list markers visible.
 */
export function AssistantMarkdown({
  text,
  streaming,
  className
}: {
  text: string
  streaming: boolean
  className?: string
}): ReactElement {
  const [Renderer, setRenderer] = useState<StreamdownAssistantComponent | null>(() => loadedRenderer)

  useEffect(() => {
    if (Renderer) return
    let active = true
    void loadStreamdownAssistant().then((component) => {
      if (active) setRenderer(() => component)
    })
    return () => {
      active = false
    }
  }, [Renderer])

  if (!Renderer) {
    return (
      <div className={['whitespace-pre-wrap', className].filter(Boolean).join(' ')} data-markdown-pending="">
        {text}
      </div>
    )
  }
  return <Renderer text={text} streaming={streaming} className={className} />
}
