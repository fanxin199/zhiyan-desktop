import type { WebContents } from 'electron'

const SAFE_EXTERNAL_PROTOCOLS = new Set(['http:', 'https:', 'mailto:'])

export type WindowNavigationDecision = 'allow' | 'external' | 'deny'

export function isSafeOpenExternalUrl(value: string): boolean {
  try {
    const parsed = new URL(value)
    if (!SAFE_EXTERNAL_PROTOCOLS.has(parsed.protocol)) return false
    if ((parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
      (parsed.username || parsed.password)) {
      return false
    }
    return true
  } catch {
    return false
  }
}

function isTrustedRendererUrl(value: string, trustedRendererUrl: string): boolean {
  try {
    const candidate = new URL(value)
    const trusted = new URL(trustedRendererUrl)
    return (
      candidate.protocol === trusted.protocol &&
      candidate.host === trusted.host &&
      candidate.pathname === trusted.pathname
    )
  } catch {
    return false
  }
}

function hasTrustedRendererOrigin(value: string, trustedRendererUrl: string): boolean {
  try {
    const candidate = new URL(value)
    const trusted = new URL(trustedRendererUrl)
    return candidate.protocol === trusted.protocol && candidate.host === trusted.host
  } catch {
    return false
  }
}

export function classifyWindowNavigation(
  value: string,
  trustedRendererUrl: string
): WindowNavigationDecision {
  if (isTrustedRendererUrl(value, trustedRendererUrl)) return 'allow'
  if (hasTrustedRendererOrigin(value, trustedRendererUrl)) return 'deny'
  return isSafeOpenExternalUrl(value) ? 'external' : 'deny'
}

export function installWindowSecurity(
  webContents: WebContents,
  options: {
    trustedRendererUrl: string
    openExternal: (url: string) => Promise<unknown>
    onBlocked?: (url: string, decision: Exclude<WindowNavigationDecision, 'allow'>) => void
  }
): void {
  const openExternal = (url: string): void => {
    void options.openExternal(url).catch(() => undefined)
  }
  const handleNavigation = (event: Electron.Event, url: string): void => {
    const decision = classifyWindowNavigation(url, options.trustedRendererUrl)
    if (decision === 'allow') return
    event.preventDefault()
    options.onBlocked?.(url, decision)
    if (decision === 'external') openExternal(url)
  }

  webContents.on('will-navigate', handleNavigation)
  webContents.on('will-redirect', handleNavigation)
  webContents.setWindowOpenHandler(({ url }) => {
    const decision = classifyWindowNavigation(url, options.trustedRendererUrl)
    if (decision !== 'allow') options.onBlocked?.(url, decision)
    if (decision === 'external') openExternal(url)
    return { action: 'deny' }
  })
}
