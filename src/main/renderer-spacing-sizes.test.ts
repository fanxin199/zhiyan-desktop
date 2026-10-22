import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import postcss, { type Root } from 'postcss'
import tailwindcss, { type Config } from 'tailwindcss'
import { describe, expect, it } from 'vitest'

// Utilities that take spacing-scale steps, fractions or arbitrary lengths.
const SIZE_UTILITY = String.raw`(?:(?:min-|max-)?[wh]|size|gap(?:-[xy])?|[mp][xytrblse]?|space-[xy]|inset(?:-[xy])?|top|right|bottom|left|start|end|translate-[xy]|basis|indent|scroll-[mp][xytrblse]?|border-spacing(?:-[xy])?)`
// Steps such as 4 or 4.5, fractions such as 1/2 and arbitrary values such as [18px].
const SIZE_VALUE = String.raw`(?:\d*\.?\d+(?:\/\d+)?|\[[^\[\]\s]+\])`
const SIZE_CLASS = new RegExp(String.raw`(?<![\w/-])(?:[\w-]+:)*!?(-?${SIZE_UTILITY}-${SIZE_VALUE})(?![\w/-])`, 'g')
// Tailwind escapes selector characters with a backslash, and commas as the code point \2c followed by a space.
const CLASS_SELECTOR = /\.((?:\\[\da-f]{1,6} ?|\\.|[\w-])+)/gi
const CSS_ESCAPE = /\\(?:([\da-f]{1,6}) ?|(.))/gi

function rendererSourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return rendererSourceFiles(path)
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : []
  })
}

function sizeClasses(text: string): string[] {
  return [...text.matchAll(SIZE_CLASS)].map((match) => match[1])
}

function sizeClassUsages(): Array<{ name: string; location: string }> {
  return rendererSourceFiles(resolve('src/renderer/src')).flatMap((path) => {
    const file = relative(resolve('.'), path).replace(/\\/g, '/')
    return readFileSync(path, 'utf8')
      .split('\n')
      .flatMap((line, index) => sizeClasses(line).map((name) => ({ name, location: `${file}:${index + 1}` })))
  })
}

async function compileUtilities(candidates: string[]): Promise<Root> {
  const configUrl = pathToFileURL(resolve('tailwind.config.js')).href
  const { default: config } = (await import(/* @vite-ignore */ configUrl)) as { default: Config }
  const result = await postcss([tailwindcss({ ...config, content: [{ raw: candidates.join(' ') }] })])
    .process('@tailwind utilities;', { from: undefined })
  return result.root
}

function generatedClassNames(root: Root): Set<string> {
  const names = new Set<string>()
  root.walkRules((rule) => {
    for (const match of rule.selector.matchAll(CLASS_SELECTOR)) {
      names.add(match[1].replace(CSS_ESCAPE, (_, codePoint?: string, char?: string) =>
        codePoint ? String.fromCodePoint(parseInt(codePoint, 16)) : (char ?? '')
      ))
    }
  })
  return names
}

describe('renderer spacing and sizes', () => {
  it('generates CSS for every numeric or arbitrary size and spacing class used by the renderer', async () => {
    const usages = sizeClassUsages()
    const used = [...new Set(usages.map(({ name }) => name))]
    const generated = generatedClassNames(await compileUtilities(used))

    expect(used.length).toBeGreaterThan(200)
    expect(usages.filter(({ name }) => !generated.has(name)).map(({ name, location }) => `${location} ${name}`)).toEqual([])
  })

  it('flags steps missing from the spacing scale, such as h-5.5', async () => {
    const found = sizeClasses('<Icon className="h-5.5 w-4.5 mt-13 md:-translate-y-1/2 !max-w-[min(42vw,240px)] gap-3.5 text-body" />')
    const generated = generatedClassNames(await compileUtilities(found))

    expect(found).toEqual(['h-5.5', 'w-4.5', 'mt-13', '-translate-y-1/2', 'max-w-[min(42vw,240px)]', 'gap-3.5'])
    expect(found.filter((name) => !generated.has(name))).toEqual(['h-5.5', 'w-4.5', 'mt-13'])
  })
})
