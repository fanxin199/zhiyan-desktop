import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { posix } from 'node:path'
import { XMLParser } from 'fast-xml-parser'
import { imageSize } from 'image-size'
import JSZip from 'jszip'
import type {
  CoursewareSourceAnalysisResult,
  SourceVisualAsset
} from '../../shared/courseware'

type XmlRecord = Record<string, unknown>

type PictureOccurrence = {
  slideNumber: number
  mediaPath: string
  sourceName: string
  crop?: SourceVisualAsset['crop']
  areaRatio: number
  slideText: string
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
  parseAttributeValue: true
})

function isRecord(value: unknown): value is XmlRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return []
  return Array.isArray(value) ? value : [value]
}

function namedNodes(value: unknown, key: string, out: unknown[] = []): unknown[] {
  if (Array.isArray(value)) {
    for (const item of value) namedNodes(item, key, out)
    return out
  }
  if (!isRecord(value)) return out
  for (const [name, child] of Object.entries(value)) {
    if (name === key) out.push(...asArray(child))
    namedNodes(child, key, out)
  }
  return out
}

function textNodes(value: unknown, out: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) textNodes(item, out)
    return out
  }
  if (!isRecord(value)) return out
  for (const [name, child] of Object.entries(value)) {
    if (name === 't' && (typeof child === 'string' || typeof child === 'number')) {
      const text = String(child).trim()
      if (text) out.push(text)
    } else {
      textNodes(child, out)
    }
  }
  return out
}

function attribute(record: unknown, name: string): string {
  if (!isRecord(record)) return ''
  const value = record[`@_${name}`] ?? record[`@_r:${name}`]
  return value === undefined ? '' : String(value)
}

function numberAttribute(record: unknown, name: string): number {
  const value = Number(attribute(record, name))
  return Number.isFinite(value) ? value : 0
}

function firstNamedRecord(value: unknown, key: string): XmlRecord | null {
  return namedNodes(value, key).find(isRecord) ?? null
}

function mediaType(path: string): string | null {
  const extension = path.split('.').pop()?.toLowerCase()
  switch (extension) {
    case 'png': return 'image/png'
    case 'jpg':
    case 'jpeg': return 'image/jpeg'
    case 'gif': return 'image/gif'
    case 'svg': return 'image/svg+xml'
    default: return null
  }
}

function slideNumber(path: string): number {
  return Number(path.match(/slide(\d+)\.xml$/)?.[1] ?? 0)
}

function relationshipMap(xml: string): Map<string, string> {
  const parsed = parser.parse(xml) as unknown
  const relations = namedNodes(parsed, 'Relationship').filter(isRecord)
  return new Map(relations
    .map((relation): [string, string] => [
      attribute(relation, 'Id'),
      attribute(relation, 'Target')
    ])
    .filter(([id, target]) => Boolean(id && target)))
}

function pictureOccurrence(
  picture: unknown,
  relationships: Map<string, string>,
  slide: number,
  slideText: string,
  slideWidth: number,
  slideHeight: number
): PictureOccurrence | null {
  const blip = firstNamedRecord(picture, 'blip')
  const relationshipId = attribute(blip, 'embed')
  const target = relationships.get(relationshipId)
  if (!target) return null
  const mediaPath = posix.normalize(posix.join('ppt/slides', target))
  if (!mediaPath.startsWith('ppt/media/')) return null

  const transform = firstNamedRecord(picture, 'xfrm')
  const offset = firstNamedRecord(transform, 'off')
  const extent = firstNamedRecord(transform, 'ext')
  const x = numberAttribute(offset, 'x')
  const y = numberAttribute(offset, 'y')
  const width = numberAttribute(extent, 'cx')
  const height = numberAttribute(extent, 'cy')
  const crop = slideWidth > 0 && slideHeight > 0 && width > 0 && height > 0
    ? {
        x: Math.max(0, Math.min(1, x / slideWidth)),
        y: Math.max(0, Math.min(1, y / slideHeight)),
        width: Math.max(0.0001, Math.min(1, width / slideWidth)),
        height: Math.max(0.0001, Math.min(1, height / slideHeight))
      }
    : undefined
  const areaRatio = slideWidth > 0 && slideHeight > 0
    ? (width * height) / (slideWidth * slideHeight)
    : 0
  return {
    slideNumber: slide,
    mediaPath,
    sourceName: posix.basename(mediaPath),
    crop,
    areaRatio,
    slideText
  }
}

function captionFor(text: string): string | undefined {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  return lines.find((line) => /^(figure|fig\.?|图)\s*\d+/i.test(line)) ?? lines[0]
}

export async function extractPptxCoursewareSourceFromBuffer(
  data: Buffer | Uint8Array,
  path: string
): Promise<CoursewareSourceAnalysisResult> {
  try {
    const zip = await JSZip.loadAsync(data)
    const presentationXml = await zip.file('ppt/presentation.xml')?.async('string')
    if (!presentationXml) {
      return { ok: false, code: 'READ_FAILED', message: 'PPTX 缺少 presentation.xml。' }
    }
    const presentation = parser.parse(presentationXml) as unknown
    const slideSize = firstNamedRecord(presentation, 'sldSz')
    const slideWidth = numberAttribute(slideSize, 'cx') || 12_192_000
    const slideHeight = numberAttribute(slideSize, 'cy') || 6_858_000

    const slidePaths = Object.keys(zip.files)
      .filter((entry) => /^ppt\/slides\/slide\d+\.xml$/.test(entry))
      .sort((left, right) => slideNumber(left) - slideNumber(right))
    const pageTexts: string[] = []
    const occurrences: PictureOccurrence[] = []

    for (const slidePath of slidePaths) {
      const number = slideNumber(slidePath)
      const xml = await zip.file(slidePath)?.async('string')
      if (!xml) continue
      const parsed = parser.parse(xml) as unknown
      const text = textNodes(parsed).join('\n')
      pageTexts.push(`--- 幻灯片 ${number} ---\n${text}`)
      const relPath = `ppt/slides/_rels/slide${number}.xml.rels`
      const relXml = await zip.file(relPath)?.async('string')
      const relationships = relationshipMap(relXml ?? '<Relationships/>')
      for (const picture of namedNodes(parsed, 'pic')) {
        const occurrence = pictureOccurrence(
          picture,
          relationships,
          number,
          text,
          slideWidth,
          slideHeight
        )
        if (occurrence) occurrences.push(occurrence)
      }
    }

    const byMedia = new Map<string, PictureOccurrence[]>()
    for (const occurrence of occurrences) {
      const group = byMedia.get(occurrence.mediaPath) ?? []
      group.push(occurrence)
      byMedia.set(occurrence.mediaPath, group)
    }

    const assets: SourceVisualAsset[] = []
    for (const [mediaPath, mediaOccurrences] of byMedia) {
      const type = mediaType(mediaPath)
      const file = zip.file(mediaPath)
      if (!type || !file) continue
      const buffer = await file.async('nodebuffer')
      const dimensions = imageSize(buffer)
      const repeatedRatio = mediaOccurrences.length / Math.max(1, slidePaths.length)
      const maxAreaRatio = Math.max(...mediaOccurrences.map((item) => item.areaRatio))
      const decorative =
        (mediaOccurrences.length > 1 && repeatedRatio >= 0.5) ||
        maxAreaRatio < 0.02 ||
        (dimensions.width ?? 0) < 128 ||
        (dimensions.height ?? 0) < 80
      const first = mediaOccurrences[0]
      const hash = createHash('sha256').update(buffer).digest('hex').slice(0, 24)
      assets.push({
        id: `pptx-${hash}`,
        sourceKind: 'pptx',
        sourceIndex: first.slideNumber,
        sourceName: first.sourceName,
        mediaType: type,
        role: decorative ? 'decorative' : 'figure',
        status: decorative ? 'rejected' : 'approved',
        confidence: decorative ? 0.95 : 0.82,
        occurrences: [...new Set(mediaOccurrences.map((item) => item.slideNumber))],
        caption: captionFor(first.slideText),
        nearbyText: first.slideText,
        ...(dimensions.width ? { width: dimensions.width } : {}),
        ...(dimensions.height ? { height: dimensions.height } : {}),
        ...(first.crop ? { crop: first.crop } : {}),
        imageDataUrl: `data:${type};base64,${buffer.toString('base64')}`
      })
    }

    const deduplicatedAssets = new Map<string, SourceVisualAsset>()
    for (const asset of assets) {
      const existing = deduplicatedAssets.get(asset.id)
      if (!existing) {
        deduplicatedAssets.set(asset.id, asset)
        continue
      }
      const occurrences = [...new Set([...existing.occurrences, ...asset.occurrences])]
        .sort((left, right) => left - right)
      const repeated = occurrences.length > 1 &&
        occurrences.length / Math.max(1, slidePaths.length) >= 0.5
      deduplicatedAssets.set(asset.id, {
        ...existing,
        sourceIndex: Math.min(existing.sourceIndex, asset.sourceIndex),
        occurrences,
        role: repeated ? 'decorative' : existing.role,
        status: repeated ? 'rejected' : existing.status,
        confidence: repeated ? Math.max(existing.confidence, 0.95) : existing.confidence
      })
    }

    return {
      ok: true,
      document: {
        kind: 'pptx',
        path,
        pageCount: slidePaths.length,
        searchable: pageTexts.some((text) => text.trim().length > 0)
      },
      text: pageTexts.join('\n\n'),
      assets: [...deduplicatedAssets.values()]
    }
  } catch (error) {
    return {
      ok: false,
      code: 'READ_FAILED',
      message: error instanceof Error ? error.message : String(error)
    }
  }
}

export async function extractPptxCoursewareSource(
  path: string
): Promise<CoursewareSourceAnalysisResult> {
  return extractPptxCoursewareSourceFromBuffer(await readFile(path), path)
}
