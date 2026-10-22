import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const stylesheets = ['base-shell.css', 'surfaces-write.css', 'markdown-code.css', 'write-editor.css']
  .map((name) => readFileSync(resolve('src/renderer/src/styles', name), 'utf8'))
  .join('\n')

describe('renderer stage surface', () => {
  it('paints the decorative glow behind page content instead of over it', () => {
    expect(stylesheets).not.toMatch(/\.ds-stage-surface::(?:before|after)/)
    expect(stylesheets).toMatch(/\.ds-stage-surface\s*\{[^}]*radial-gradient/)
  })
})
