import { describe, expect, it, vi } from 'vitest'
import * as workbench from './Workbench'

type WorkbenchModule = typeof workbench & {
  startModuleTask?: (options: {
    prompt: string
    workspaceRoot?: string
    setRoute: (route: 'chat') => void
    createThread: (options?: { workspaceRoot?: string }) => Promise<void>
    sendMessage: (prompt: string, mode: string) => Promise<boolean>
    setInput: (value: string) => void
  }) => Promise<boolean>
}

describe('module task launch', () => {
  it('creates a chat thread and immediately sends the module task', async () => {
    const startModuleTask = (workbench as WorkbenchModule).startModuleTask
    const setRoute = vi.fn()
    const createThread = vi.fn(async () => undefined)
    const sendMessage = vi.fn(async () => true)
    const setInput = vi.fn()

    expect(startModuleTask).toBeTypeOf('function')
    await expect(startModuleTask?.({
      prompt: 'Read this paper',
      workspaceRoot: 'D:\\papers',
      setRoute,
      createThread,
      sendMessage,
      setInput
    })).resolves.toBe(true)
    expect(setRoute).toHaveBeenCalledWith('chat')
    expect(createThread).toHaveBeenCalledWith({ workspaceRoot: 'D:\\papers' })
    expect(sendMessage).toHaveBeenCalledWith('Read this paper', 'agent')
    expect(setInput).not.toHaveBeenCalled()
  })
})
