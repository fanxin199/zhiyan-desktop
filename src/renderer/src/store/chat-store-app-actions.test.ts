import type i18next from 'i18next'
import { describe, expect, it, vi } from 'vitest'
import { createAppActions } from './chat-store-app-actions'
import type { ChatState, ChatStoreSet } from './chat-store-types'

function harness(initial: Partial<ChatState>): { actions: ReturnType<typeof createAppActions>; state: () => ChatState } {
  let state = { route: 'dashboard', settingsOpen: false, settingsSection: 'general', ...initial } as ChatState
  const set: ChatStoreSet = (partial) => {
    state = { ...state, ...(typeof partial === 'function' ? partial(state) : partial) }
  }
  const actions = createAppActions({
    set,
    get: () => state,
    i18n: {} as typeof i18next,
    persistComposerModel: vi.fn(),
    readStoredComposerModel: vi.fn(() => ''),
    mergeComposerPickList: vi.fn(() => []),
    getComposerModelLoadPromise: vi.fn(() => null),
    setComposerModelLoadPromise: vi.fn(),
    applyTheme: vi.fn(),
    applyUiFontScale: vi.fn(),
    workspaceLabelFromPath: vi.fn((root: string) => root),
    normalizeWorkspaceRoot: vi.fn((root?: string | null) => root ?? '')
  })
  return { actions, state: () => state }
}

describe('settings overlay actions', () => {
  it('opens settings over the current page without changing the route', () => {
    const store = harness({ route: 'ppt-gen' })

    store.actions.openSettings('agents')

    expect(store.state()).toMatchObject({ route: 'ppt-gen', settingsOpen: true, settingsSection: 'agents' })
  })

  it('closes settings back to the same page', () => {
    const store = harness({ route: 'write', settingsOpen: true })

    store.actions.closeSettings()

    expect(store.state()).toMatchObject({ route: 'write', settingsOpen: false })
  })
})
