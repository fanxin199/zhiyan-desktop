import { create } from 'zustand'
import { readBrowserStorageItem, writeBrowserStorageItem } from './browser-storage'
import type { ToolModuleId, ToolPrefill, ToolRequest } from './tool-request'

const ASSISTANT_THREAD_KEY = 'zhiyan.assistant.thread'

export type AssistantHandOff = { id: number; text: string; request: ToolRequest }

type AssistantState = {
  open: boolean
  /** The assistant's own conversation; module pages keep theirs. */
  threadId: string | null
  /** A request waiting in the input box of the tool it was handed to. */
  prefill: (ToolPrefill & { moduleId: ToolModuleId }) | null
  handOffs: AssistantHandOff[]
  setOpen: (open: boolean) => void
  rememberThread: (threadId: string | null) => void
  handOff: (request: ToolRequest, text: string) => void
  /** Fills a tool's input box without a note in the assistant, e.g. for a next step on a tool page. */
  prefillTool: (request: ToolRequest, text: string, materials?: Array<{ name: string; text: string }>) => void
  dismissHandOff: (id: number) => void
  clearHandOffs: () => void
  clearPrefill: () => void
}

/**
 * State of the AI assistant (Task 1.5). It lives outside the workbench because the workbench is
 * rebuilt on every page change, and both the open panel and a handed-off request must survive it.
 */
export const useAssistantStore = create<AssistantState>((set) => ({
  open: false,
  threadId: readBrowserStorageItem(ASSISTANT_THREAD_KEY) || null,
  prefill: null,
  handOffs: [],
  setOpen: (open) => set({ open }),
  rememberThread: (threadId) => {
    writeBrowserStorageItem(ASSISTANT_THREAD_KEY, threadId ?? '')
    set({ threadId })
  },
  handOff: (request, text) => {
    const id = Date.now()
    set((state) => ({
      prefill: { moduleId: request.moduleId, id, text },
      handOffs: [...state.handOffs, { id, text, request }]
    }))
  },
  prefillTool: (request, text, materials) => set({
    prefill: { moduleId: request.moduleId, id: Date.now(), text, ...(materials?.length ? { materials } : {}) }
  }),
  dismissHandOff: (id) => set((state) => ({ handOffs: state.handOffs.filter((item) => item.id !== id) })),
  clearHandOffs: () => set({ handOffs: [] }),
  clearPrefill: () => set({ prefill: null })
}))
