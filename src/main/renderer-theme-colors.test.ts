import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import postcss, { type Root } from 'postcss'
import tailwindcss, { type Config } from 'tailwindcss'
import { describe, expect, it } from 'vitest'

const COLOR_UTILITY = String.raw`(?:bg|text|border(?:-[trblxy])?|ring(?:-offset)?|divide|outline|fill|stroke|from|via|to|shadow|decoration|caret)`
const THEME_COLOR = String.raw`(?:ds-[A-Za-z]+(?:-[A-Za-z]+)*|(?:accent|primary|muted)(?:-(?:foreground|soft))?|foreground|background|border|sidebar)`
const THEME_COLOR_CLASS = new RegExp(
  String.raw`(?<![\w/-])(?:[\w-]+:)*!?(${COLOR_UTILITY}-${THEME_COLOR}(?:\/\d+)?)(?![\w/-])`,
  'g'
)

function rendererSourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return rendererSourceFiles(path)
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : []
  })
}

function themeColorClassesInRenderer(): string[] {
  const classes = new Set<string>()
  for (const file of rendererSourceFiles(resolve('src/renderer/src'))) {
    for (const match of readFileSync(file, 'utf8').matchAll(THEME_COLOR_CLASS)) {
      classes.add(match[1])
    }
  }
  return [...classes].sort()
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
    for (const match of rule.selector.matchAll(/\.((?:\\.|[\w-])+)/g)) {
      names.add(match[1].replace(/\\(.)/g, '$1'))
    }
  })
  return names
}

describe('renderer theme colors', () => {
  it('generates CSS for every theme color class used by the renderer', async () => {
    const used = themeColorClassesInRenderer()
    const generated = generatedClassNames(await compileUtilities(used))

    expect(used.length).toBeGreaterThan(50)
    expect(used.filter((name) => !generated.has(name))).toEqual([])
  })

  it('defines the text and muted card aliases and supports opacity modifiers', async () => {
    const root = await compileUtilities(['text-ds-text', 'bg-ds-card-muted', 'bg-accent/10'])

    expect([...generatedClassNames(root)].sort()).toEqual(['bg-accent/10', 'bg-ds-card-muted', 'text-ds-text'])
    expect(root.toString()).toContain('color-mix(in srgb, var(--ds-accent-fill) calc(0.1 * 100%), transparent)')
  })

  it('maps accent fills, typography and radii to design tokens', async () => {
    const root = await compileUtilities(['bg-accent', 'text-accent', 'text-body', 'leading-prose', 'rounded-xl', 'rounded-2xl'])
    const rule = (className: string): string => {
      let text = ''
      root.walkRules((candidate) => {
        if (candidate.selector === `.${className}`) text = candidate.toString()
      })
      return text
    }

    expect(rule('bg-accent')).toContain('var(--ds-accent-fill)')
    expect(rule('text-accent')).toContain('var(--ds-accent)')
    expect(rule('text-accent')).not.toContain('--ds-accent-fill')
    expect(rule('text-body')).toContain('font-size: var(--ds-font-body)')
    expect(rule('leading-prose')).toContain('line-height: var(--ds-leading-prose)')
    expect(rule('rounded-xl')).toContain('border-radius: 12px')
    expect(rule('rounded-2xl')).toContain('border-radius: 1rem')
  })
})
