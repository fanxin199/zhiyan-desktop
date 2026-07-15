import { describe, expect, it, vi } from 'vitest'
import { classifyWindowNavigation, installWindowSecurity } from './window-security'

describe('window security policy', () => {
  it('allows only the configured renderer document in the application window', () => {
    const trustedFile = 'file:///C:/Program%20Files/ZhiYan/resources/app.asar/out/renderer/index.html'

    expect(classifyWindowNavigation(`${trustedFile}#write`, trustedFile)).toBe('allow')
    expect(classifyWindowNavigation('file:///C:/Users/teacher/Documents/notes.html', trustedFile)).toBe('deny')
  })

  it('does not treat arbitrary same-origin development paths as renderer pages', () => {
    const trustedDevUrl = 'http://localhost:5173/'

    expect(classifyWindowNavigation('http://localhost:5173/?preview=1', trustedDevUrl)).toBe('allow')
    expect(classifyWindowNavigation('http://localhost:5173/@fs/C:/secret.txt', trustedDevUrl)).toBe('deny')
  })

  it('opens safe web and mail links externally while denying active or local schemes', () => {
    const trustedDevUrl = 'http://localhost:5173/'

    expect(classifyWindowNavigation('https://pubmed.ncbi.nlm.nih.gov/123/', trustedDevUrl)).toBe('external')
    expect(classifyWindowNavigation('mailto:teacher@example.edu', trustedDevUrl)).toBe('external')
    expect(classifyWindowNavigation('javascript:alert(1)', trustedDevUrl)).toBe('deny')
    expect(classifyWindowNavigation('data:text/html,unsafe', trustedDevUrl)).toBe('deny')
  })

  it('prevents untrusted in-app navigation and denies every new window', () => {
    const listeners = new Map<string, (...args: unknown[]) => void>()
    const setWindowOpenHandler = vi.fn()
    const openExternal = vi.fn(async () => undefined)
    const webContents = {
      on: vi.fn((event: string, listener: (...args: unknown[]) => void) => {
        listeners.set(event, listener)
      }),
      setWindowOpenHandler
    }
    installWindowSecurity(webContents as never, {
      trustedRendererUrl: 'file:///app/renderer/index.html',
      openExternal
    })

    const preventDefault = vi.fn()
    listeners.get('will-navigate')?.({ preventDefault }, 'javascript:alert(1)')
    expect(preventDefault).toHaveBeenCalledOnce()

    const windowHandler = setWindowOpenHandler.mock.calls[0]?.[0] as
      | ((details: { url: string }) => { action: string })
      | undefined
    expect(windowHandler?.({ url: 'https://example.com/' })).toEqual({ action: 'deny' })
    expect(openExternal).toHaveBeenCalledWith('https://example.com/')
  })
})
