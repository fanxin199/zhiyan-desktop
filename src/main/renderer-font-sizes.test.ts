import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const UNTOKENIZED_FONT_SIZE =
  /(?<![\w/-])(?:[\w-]+:)*!?text-(?:\[(?:length:)?(?:\d|\.\d|clamp\(|calc\()[^\]]*\]|xs|sm|base|lg|xl|[2-9]xl|ui-[a-z-]+)(?![\w/-])/g
const THUMBNAIL_FONT_SIZE = /(?<![\w/-])text-thumb-[a-z]+(?![\w/-])/
const SLIDE_THUMBNAIL_FILES = ['src/renderer/src/components/zhiyan/CoursewarePage.tsx']

function rendererSourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return rendererSourceFiles(path)
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : []
  })
}

const sources = [...rendererSourceFiles(resolve('src/renderer/src')), resolve('src/renderer/index.html')].map((path) => ({
  file: relative(resolve('.'), path).replace(/\\/g, '/'),
  text: readFileSync(path, 'utf8')
}))

describe('renderer font sizes', () => {
  it('uses only the typography tokens for font sizes', () => {
    const violations = sources.flatMap(({ file, text }) =>
      text.split('\n').flatMap((line, index) =>
        [...line.matchAll(UNTOKENIZED_FONT_SIZE)].map((match) => `${file}:${index + 1} ${match[0].trim()}`)
      )
    )

    expect(violations).toEqual([])
  })

  it('keeps slide thumbnail sizes inside the slide preview', () => {
    const filesUsingThumbnailSizes = sources.filter(({ text }) => THUMBNAIL_FONT_SIZE.test(text)).map(({ file }) => file)

    expect(filesUsingThumbnailSizes).toEqual(SLIDE_THUMBNAIL_FILES)
  })
})
