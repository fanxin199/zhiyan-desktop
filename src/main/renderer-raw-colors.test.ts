import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const PALETTE = 'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose'
const COLOR_UTILITY = String.raw`(?:bg|text|border(?:-[trblxy])?|ring(?:-offset)?|divide|outline|fill|stroke|from|via|to|shadow|decoration|caret|placeholder|accent)`
const PALETTE_CLASS = new RegExp(
  String.raw`(?<![\w/\[.-])(?:[\w-]+:)*!?${COLOR_UTILITY}-(?:${PALETTE})-\d{2,3}(?:\/(?:\d+|\[[^\]]+\]))?(?![\w/-])`,
  'g'
)
const WHITE_OR_BLACK_CLASS = new RegExp(
  String.raw`(?<![\w/\[.-])(?:[\w-]+:)*!?${COLOR_UTILITY}-(?:white|black)(?:\/(?:\d+|\[[^\]]+\]))?(?![\w/-])`,
  'g'
)
// Text and icons on solid fills stay white, and switch thumbs stay white in both themes.
const ALLOWED_WHITE = /^(?:[\w-]+:)*!?(?:text-white(?:\/\d+)?|bg-white|fill-white|stroke-white)$/
const HEX_COLOR = /#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g
const LEGACY_ACCENT = /rgba\(0,\s*136,\s*255/g
// Syntax highlighting themes need literal colors for the highlighter.
const HEX_EXEMPT_FILES = ['src/renderer/src/lib/code-highlighting.ts']

function sourceFiles(dir: string, pattern: RegExp): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(path, pattern)
    return pattern.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : []
  })
}

function read(paths: string[]): Array<{ file: string; text: string }> {
  return paths.map((path) => ({ file: relative(resolve('.'), path).replace(/\\/g, '/'), text: readFileSync(path, 'utf8') }))
}

function matchesByLine(sources: Array<{ file: string; text: string }>, pattern: RegExp): string[] {
  return sources.flatMap(({ file, text }) =>
    text.split('\n').flatMap((line, index) => [...line.matchAll(pattern)].map((match) => `${file}:${index + 1} ${match[0].trim()}`))
  )
}

const components = read(sourceFiles(resolve('src/renderer/src'), /\.tsx?$/))

// Accent text on an accent tint is about 4:1; such text uses text-accent-strong (Task 4.3.1).
const STRING_LITERAL = /"[^"\n]*"|'[^'\n]*'|`[^`\n]*`/g
const ACCENT_TINT = /(?:^|\s)(?:[\w-]+:)*bg-accent(?:-soft|\/\d+)(?=\s|$)/
const PLAIN_ACCENT_TEXT = /(?:^|\s)(?:[\w-]+:)*text-accent(?=\s|$)/

function accentTextOnTint(sources: Array<{ file: string; text: string }>): string[] {
  return matchesByLine(sources, STRING_LITERAL).filter((entry) => {
    const classes = entry.slice(entry.indexOf(' ') + 2, -1)
    return ACCENT_TINT.test(classes) && PLAIN_ACCENT_TEXT.test(classes)
  })
}
const stylesheets = read(sourceFiles(resolve('src/renderer/src/styles'), /\.css$/))

describe('renderer raw colors', () => {
  it('uses semantic color tokens instead of Tailwind palette classes', () => {
    expect(matchesByLine(components, PALETTE_CLASS)).toEqual([])
  })

  it('limits white and black to text on fills and switch thumbs', () => {
    const violations = matchesByLine(components, WHITE_OR_BLACK_CLASS).filter(
      (entry) => !ALLOWED_WHITE.test(entry.slice(entry.indexOf(' ') + 1))
    )
    expect(violations).toEqual([])
  })

  it('uses the strong accent for text on an accent tint', () => {
    expect(accentTextOnTint(components)).toEqual([])
  })

  it('keeps hex colors and the legacy accent out of components and stylesheets', () => {
    const hexSources = components.filter(({ file }) => !HEX_EXEMPT_FILES.includes(file))
    expect(matchesByLine(hexSources, HEX_COLOR)).toEqual([])
    expect(matchesByLine([...components, ...stylesheets], LEGACY_ACCENT)).toEqual([])
  })
})
