import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postcss from 'postcss'
import { describe, expect, it } from 'vitest'

type Rgba = { r: number; g: number; b: number; a: number }

const THEMES = {
  light: [':root'],
  dark: [':root', "[data-theme='dark']", "[data-theme='dark'] .ds-workbench-shell"]
} as const

const SURFACES = ['--ds-bg-main', '--ds-bg-canvas', '--ds-surface-card', '--ds-surface-subtle']
const TEXT_ON_SURFACES = [
  '--ds-text',
  '--ds-text-muted',
  '--ds-accent',
  '--ds-accent-strong',
  '--ds-success',
  '--ds-danger',
  '--ds-warning',
  '--ds-skill'
]
const PAIRS: Array<[foreground: string, background: string]> = [
  ['#ffffff', '--ds-accent-fill'],
  ['#ffffff', '--ds-danger-fill'],
  ['#ffffff', '--ds-success-fill'],
  ['--ds-accent-strong', '--ds-accent-soft'],
  ['--ds-danger', '--ds-danger-soft'],
  ['--ds-success', '--ds-success-soft'],
  ['--ds-warning', '--ds-warning-soft'],
  ['--ds-skill', '--ds-skill-soft'],
  ['--ds-domain-teaching', '--ds-domain-teaching-soft'],
  ['--ds-domain-research', '--ds-domain-research-soft']
]

const stylesheet = postcss.parse(readFileSync(resolve('src/renderer/src/styles/base-shell.css'), 'utf8'))

function themeVariables(selectors: readonly string[]): Map<string, string> {
  const variables = new Map<string, string>()
  for (const selector of selectors) {
    stylesheet.each((node) => {
      if (node.type !== 'rule' || node.selector !== selector) return
      node.each((child) => {
        if (child.type === 'decl' && child.prop.startsWith('--')) variables.set(child.prop, child.value)
      })
    })
  }
  return variables
}

function resolveValue(variables: Map<string, string>, value: string, depth = 0): string {
  if (depth > 10) throw new Error(`CSS variable cycle near ${value}`)
  return value.replace(/var\((--[\w-]+)(?:,\s*([^)]*))?\)/g, (_match, name: string, fallback?: string) => {
    const next = variables.get(name) ?? fallback
    if (next === undefined) throw new Error(`Undefined CSS variable ${name}`)
    return resolveValue(variables, next, depth + 1)
  })
}

function parseColor(value: string): Rgba {
  const hex = value.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)
  if (hex) {
    const digits = hex[1].length === 3 ? [...hex[1]].map((digit) => digit + digit).join('') : hex[1]
    return {
      r: parseInt(digits.slice(0, 2), 16),
      g: parseInt(digits.slice(2, 4), 16),
      b: parseInt(digits.slice(4, 6), 16),
      a: 1
    }
  }
  const rgb = value.trim().match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+))?\s*\)$/)
  if (rgb) {
    return { r: Number(rgb[1]), g: Number(rgb[2]), b: Number(rgb[3]), a: rgb[4] === undefined ? 1 : Number(rgb[4]) }
  }
  throw new Error(`Unsupported color value: ${value}`)
}

function over(top: Rgba, bottom: Rgba): Rgba {
  const mix = (front: number, back: number): number => front * top.a + back * (1 - top.a)
  return { r: mix(top.r, bottom.r), g: mix(top.g, bottom.g), b: mix(top.b, bottom.b), a: 1 }
}

function luminance({ r, g, b }: Rgba): number {
  const channel = (value: number): number => {
    const c = value / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

function contrastRatio(foreground: Rgba, background: Rgba): number {
  const [lighter, darker] = [luminance(foreground), luminance(background)].sort((a, b) => b - a)
  return (lighter + 0.05) / (darker + 0.05)
}

function lowContrastPairs(theme: keyof typeof THEMES): string[] {
  const variables = themeVariables(THEMES[theme])
  const color = (token: string): Rgba => parseColor(token.startsWith('--') ? resolveValue(variables, `var(${token})`) : token)
  const page = color('--ds-bg-main')
  const pairs = [
    ...SURFACES.flatMap((surface) => TEXT_ON_SURFACES.map((text): [string, string] => [text, surface])),
    ...PAIRS
  ]
  return pairs.flatMap(([foreground, background]) => {
    const surface = over(color(background), page)
    const ratio = contrastRatio(over(color(foreground), surface), surface)
    return ratio >= 4.5 ? [] : [`${theme}: ${foreground} on ${background} = ${ratio.toFixed(2)}`]
  })
}

describe('renderer theme contrast', () => {
  it('keeps text tokens at WCAG AA contrast in the light theme', () => {
    expect(lowContrastPairs('light')).toEqual([])
  })

  it('keeps text tokens at WCAG AA contrast in the dark theme', () => {
    expect(lowContrastPairs('dark')).toEqual([])
  })
})
