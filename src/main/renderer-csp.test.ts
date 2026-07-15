import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('renderer content security policy', () => {
  it('allows blob image URLs for local attachment previews', () => {
    const html = readFileSync(resolve('src/renderer/index.html'), 'utf8')
    const csp = html.match(/Content-Security-Policy"[\s\S]*?content="([^"]+)"/)?.[1] ?? ''
    const imgSrc = csp.match(/img-src\s+([^;]+)/)?.[1] ?? ''

    expect(imgSrc.split(/\s+/)).toContain('blob:')
  })

  it('blocks embedded content, base URL changes, and form submission', () => {
    const html = readFileSync(resolve('src/renderer/index.html'), 'utf8')
    const csp = html.match(/Content-Security-Policy"[\s\S]*?content="([^"]+)"/)?.[1] ?? ''

    expect(csp).toContain("object-src 'none'")
    expect(csp).toContain("frame-src 'none'")
    expect(csp).toContain("base-uri 'none'")
    expect(csp).toContain("form-action 'none'")
    expect(csp).not.toContain("'unsafe-eval'")
  })

  it('keeps dangerous Electron renderer capabilities disabled', () => {
    const source = readFileSync(resolve('src/main/index.ts'), 'utf8')

    expect(source).toMatch(/nodeIntegration:\s*false/u)
    expect(source).toMatch(/webviewTag:\s*false/u)
  })
})
