import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import AppShell, { ShellLayers } from './AppShell'

describe('AppShell', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('keeps the macOS app shell on the same full-height flex chain as desktop titlebar platforms', () => {
    vi.stubGlobal('window', {
      dsGui: { platform: 'darwin' }
    })

    const html = renderToStaticMarkup(createElement(AppShell))

    expect(html).toContain('flex h-full min-h-0 flex-col bg-transparent')
    expect(html).toContain('flex min-h-0 flex-1 flex-col')
    expect(html).not.toContain('ds-windows-titlebar')
  })

  it('keeps the workbench mounted under settings and makes it inert while settings is open', () => {
    const open = renderToStaticMarkup(createElement(ShellLayers, { route: 'ppt-gen', settingsOpen: true }))
    const closed = renderToStaticMarkup(createElement(ShellLayers, { route: 'ppt-gen', settingsOpen: false }))

    expect(open).toContain('<div inert="" class="flex min-h-0 flex-1 flex-col"><div class="h-full bg-ds-main"></div></div>')
    expect(closed).toContain('<div class="flex min-h-0 flex-1 flex-col"><div class="h-full bg-ds-main"></div></div>')
    expect(closed).not.toContain('inert')
  })
})
