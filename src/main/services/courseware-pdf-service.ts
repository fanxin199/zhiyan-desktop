import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join, sep } from 'node:path'
import type {
  CoursewareSourceAnalysisResult,
  PdfInspectResult,
  PdfRangeExtractResult,
  SourceVisualAsset
} from '../../shared/courseware'

type PdfTextItem = {
  str?: string
  transform?: number[]
  width?: number
  height?: number
}

type PdfDocumentLike = {
  numPages: number
  getPage(pageNumber: number): Promise<{
    getTextContent(): Promise<{ items: PdfTextItem[] }>
    getViewport?(options: { scale: number }): { width: number; height: number }
    getOperatorList?(): Promise<{ fnArray: number[]; argsArray: unknown[][] }>
  }>
  destroy(): Promise<void> | void
}

type PdfDependencies = {
  readPdf(path: string): Promise<Uint8Array>
  openPdf(data: Uint8Array): Promise<PdfDocumentLike>
}

type PdfJsDocumentOptions = {
  data: Uint8Array
  useSystemFonts: boolean
  isEvalSupported: boolean
  cMapUrl: string
  cMapPacked: boolean
  standardFontDataUrl: string
}

const require = createRequire(import.meta.url)
const MAX_EXTRACTED_TEXT_CHARS = 450_000
const PDF_PAGE_EXTRACTION_CONCURRENCY = 4

function directoryWithSeparator(path: string): string {
  return path.endsWith(sep) ? path : `${path}${sep}`
}

export function resolvePdfJsDocumentOptions(data: Uint8Array): PdfJsDocumentOptions {
  const pdfJsRoot = dirname(require.resolve('pdfjs-dist/package.json'))
  return {
    data,
    useSystemFonts: true,
    isEvalSupported: false,
    cMapUrl: directoryWithSeparator(join(pdfJsRoot, 'cmaps')),
    cMapPacked: true,
    standardFontDataUrl: directoryWithSeparator(join(pdfJsRoot, 'standard_fonts'))
  }
}

const defaultDependencies: PdfDependencies = {
  readPdf: async (path) => new Uint8Array(await readFile(path)),
  openPdf: async (data) => {
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
    return getDocument(resolvePdfJsDocumentOptions(data)).promise as unknown as PdfDocumentLike
  }
}

function pageText(items: PdfTextItem[]): string {
  const rows = new Map<number, PdfTextItem[]>()
  for (const item of items) {
    const text = item.str?.trim()
    if (!text) continue
    const y = Math.round(item.transform?.[5] ?? 0)
    const row = rows.get(y) ?? []
    row.push(item)
    rows.set(y, row)
  }

  return [...rows.entries()]
    .sort(([left], [right]) => right - left)
    .map(([, row]) =>
      row
        .sort((left, right) => (left.transform?.[4] ?? 0) - (right.transform?.[4] ?? 0))
        .map((item) => item.str?.trim() ?? '')
        .filter(Boolean)
        .join(' ')
    )
    .filter(Boolean)
    .join('\n')
}

function boundedExtractedText(text: string): string {
  if (text.length <= MAX_EXTRACTED_TEXT_CHARS) return text
  const headLength = Math.floor(MAX_EXTRACTED_TEXT_CHARS * 0.7)
  const tailLength = MAX_EXTRACTED_TEXT_CHARS - headLength
  return [
    text.slice(0, headLength),
    '\n\n--- 中间教材内容因长度限制省略，已保留文档开头与结尾 ---\n\n',
    text.slice(-tailLength)
  ].join('')
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let cursor = 0
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor
      cursor += 1
      results[index] = await worker(items[index], index)
    }
  })
  await Promise.all(workers)
  return results
}

async function extractPdfPage(
  pdf: PdfDocumentLike,
  pageNumber: number
): Promise<{ markerText: string; text: string; searchable: boolean; assets: SourceVisualAsset[] }> {
  const page = await pdf.getPage(pageNumber)
  const textContent = await page.getTextContent()
  const text = pageText(textContent.items)
  const assets = page.getViewport && page.getOperatorList
    ? pageVisualAssets(
        pageNumber,
        page.getViewport({ scale: 1 }),
        await page.getOperatorList(),
        textContent.items
      )
    : []
  return {
    markerText: `--- 第 ${pageNumber} 页 / 共 ${pdf.numPages} 页 ---\n\n${text}`,
    text,
    searchable: Boolean(text),
    assets
  }
}

type Matrix = [number, number, number, number, number, number]

function multiplyMatrix(left: Matrix, right: Matrix): Matrix {
  return [
    left[0] * right[0] + left[2] * right[1],
    left[1] * right[0] + left[3] * right[1],
    left[0] * right[2] + left[2] * right[3],
    left[1] * right[2] + left[3] * right[3],
    left[0] * right[4] + left[2] * right[5] + left[4],
    left[1] * right[4] + left[3] * right[5] + left[5]
  ]
}

function transformedPoint(matrix: Matrix, x: number, y: number): [number, number] {
  return [
    matrix[0] * x + matrix[2] * y + matrix[4],
    matrix[1] * x + matrix[3] * y + matrix[5]
  ]
}

function normalizedCoordinate(value: number): number {
  return Number(Math.max(0, Math.min(1, value)).toFixed(6))
}

type NormalizedBounds = {
  left: number
  top: number
  right: number
  bottom: number
}

function axisGap(firstStart: number, firstEnd: number, secondStart: number, secondEnd: number): number {
  if (firstEnd < secondStart) return secondStart - firstEnd
  if (secondEnd < firstStart) return firstStart - secondEnd
  return 0
}

function textBounds(
  item: PdfTextItem,
  viewport: { width: number; height: number }
): NormalizedBounds | null {
  const text = item.str?.trim()
  const transform = item.transform
  if (!text || !transform || transform.length < 6) return null
  const fontHeight = Math.max(
    1,
    item.height ?? Math.hypot(transform[2] ?? 0, transform[3] ?? 0)
  )
  const width = Math.max(
    fontHeight,
    item.width ?? fontHeight * Math.max(1, text.length) * 0.55
  )
  const x = transform[4] ?? 0
  const baseline = transform[5] ?? 0
  return {
    left: x / viewport.width,
    top: 1 - (baseline + fontHeight) / viewport.height,
    right: (x + width) / viewport.width,
    bottom: 1 - baseline / viewport.height
  }
}

function cropWithNearbyText(
  image: NormalizedBounds,
  items: PdfTextItem[],
  viewport: { width: number; height: number }
): SourceVisualAsset['crop'] {
  const proximity = 0.08
  const bounds = { ...image }
  for (const item of items) {
    const text = textBounds(item, viewport)
    if (!text) continue
    const horizontalGap = axisGap(image.left, image.right, text.left, text.right)
    const verticalGap = axisGap(image.top, image.bottom, text.top, text.bottom)
    if (horizontalGap > proximity || verticalGap > proximity) continue
    bounds.left = Math.min(bounds.left, text.left)
    bounds.top = Math.min(bounds.top, text.top)
    bounds.right = Math.max(bounds.right, text.right)
    bounds.bottom = Math.max(bounds.bottom, text.bottom)
  }

  const padding = 0.015
  const left = Math.max(0, bounds.left - padding)
  const top = Math.max(0, bounds.top - padding)
  const right = Math.min(1, bounds.right + padding)
  const bottom = Math.min(1, bounds.bottom + padding)
  return {
    x: normalizedCoordinate(left),
    y: normalizedCoordinate(top),
    width: Math.max(0.0001, normalizedCoordinate(right - left)),
    height: Math.max(0.0001, normalizedCoordinate(bottom - top))
  }
}

function pageVisualAssets(
  pageNumber: number,
  viewport: { width: number; height: number },
  operators: { fnArray: number[]; argsArray: unknown[][] },
  items: PdfTextItem[]
): SourceVisualAsset[] {
  const assets: SourceVisualAsset[] = []
  const stack: Matrix[] = []
  let matrix: Matrix = [1, 0, 0, 1, 0, 0]
  let imageIndex = 0
  for (let index = 0; index < operators.fnArray.length; index += 1) {
    const operation = operators.fnArray[index]
    const args = operators.argsArray[index] ?? []
    if (operation === 10) {
      stack.push([...matrix] as Matrix)
      continue
    }
    if (operation === 11) {
      matrix = stack.pop() ?? [1, 0, 0, 1, 0, 0]
      continue
    }
    if (operation === 12 && args.length >= 6) {
      const next = args.slice(0, 6).map(Number) as Matrix
      if (next.every(Number.isFinite)) matrix = multiplyMatrix(matrix, next)
      continue
    }
    if (operation !== 85 && operation !== 86) continue

    const points = [
      transformedPoint(matrix, 0, 0),
      transformedPoint(matrix, 1, 0),
      transformedPoint(matrix, 0, 1),
      transformedPoint(matrix, 1, 1)
    ]
    const xs = points.map(([x]) => x)
    const ys = points.map(([, y]) => y)
    const left = Math.min(...xs)
    const right = Math.max(...xs)
    const bottom = Math.min(...ys)
    const top = Math.max(...ys)
    const width = Math.max(0, (right - left) / viewport.width)
    const height = Math.max(0, (top - bottom) / viewport.height)
    const area = width * height
    if (width < 0.1 || height < 0.1 || area < 0.04) continue

    imageIndex += 1
    const crop = cropWithNearbyText({
      left: left / viewport.width,
      top: 1 - top / viewport.height,
      right: right / viewport.width,
      bottom: 1 - bottom / viewport.height
    }, items, viewport)
    assets.push({
      id: `pdf-page-${pageNumber}-figure-${imageIndex}`,
      sourceKind: 'pdf',
      sourceIndex: pageNumber,
      sourceName: `page-${pageNumber}-figure-${imageIndex}.png`,
      mediaType: 'image/png',
      role: 'figure',
      status: 'approved',
      confidence: 0.82,
      occurrences: [pageNumber],
      nearbyText: pageText(items),
      crop
    })
  }
  return assets
}

export async function analyzePdfCoursewareSource(
  path: string,
  dependencies: PdfDependencies = defaultDependencies
): Promise<CoursewareSourceAnalysisResult> {
  let pdf: PdfDocumentLike | null = null
  try {
    pdf = await dependencies.openPdf(await dependencies.readPdf(path))
    const pages: string[] = []
    const assets: SourceVisualAsset[] = []
    let searchable = false
    const pageNumbers = Array.from({ length: pdf.numPages }, (_, index) => index + 1)
    const extractedPages = await mapWithConcurrency(
      pageNumbers,
      PDF_PAGE_EXTRACTION_CONCURRENCY,
      (pageNumber) => extractPdfPage(pdf as PdfDocumentLike, pageNumber)
    )
    pages.push(...extractedPages.map((page) => page.markerText))
    assets.push(...extractedPages.flatMap((page) => page.assets))
    searchable = extractedPages.some((page) => page.searchable)
    const numberedAssets = assets.slice(0, 100).map((asset, index) => ({
      ...asset,
      caption: `图 ${index + 1}`
    }))
    return {
      ok: true,
      document: {
        kind: 'pdf',
        path,
        pageCount: pdf.numPages,
        searchable
      },
      text: boundedExtractedText(pages.join('\n\n').trim()),
      assets: numberedAssets
    }
  } catch (error) {
    return {
      ok: false,
      code: 'READ_FAILED',
      message: error instanceof Error ? error.message : String(error)
    }
  } finally {
    await pdf?.destroy()
  }
}

export async function inspectPdf(
  path: string,
  dependencies: PdfDependencies = defaultDependencies
): Promise<PdfInspectResult> {
  let pdf: PdfDocumentLike | null = null
  try {
    pdf = await dependencies.openPdf(await dependencies.readPdf(path))
    const samplePages = [...new Set([
      1,
      Math.max(1, Math.ceil(pdf.numPages / 2)),
      pdf.numPages
    ])]
    let searchable = false
    for (const pageNumber of samplePages) {
      const page = await pdf.getPage(pageNumber)
      if (pageText((await page.getTextContent()).items)) {
        searchable = true
        break
      }
    }
    return {
      ok: true,
      path,
      pageCount: pdf.numPages,
      searchable
    }
  } catch (error) {
    return {
      ok: false,
      code: 'READ_FAILED',
      message: error instanceof Error ? error.message : String(error)
    }
  } finally {
    await pdf?.destroy()
  }
}

export async function extractPdfRange(
  path: string,
  pageStart: number,
  pageEnd: number,
  dependencies: PdfDependencies = defaultDependencies
): Promise<PdfRangeExtractResult> {
  if (!path.trim() || pageStart < 1 || pageEnd < pageStart) {
    return {
      ok: false,
      code: 'INVALID_RANGE',
      message: '请选择有效的 PDF 文件和页码范围。'
    }
  }

  let pdf: PdfDocumentLike | null = null
  try {
    pdf = await dependencies.openPdf(await dependencies.readPdf(path))
    if (pageStart > pdf.numPages || pageEnd > pdf.numPages) {
      return {
        ok: false,
        code: 'INVALID_RANGE',
        message: `页码范围超出 PDF 总页数（${pdf.numPages} 页）。`
      }
    }

    const pages: string[] = []
    let textPages = 0
    const pageNumbers = Array.from(
      { length: pageEnd - pageStart + 1 },
      (_, index) => pageStart + index
    )
    const extractedPages = await mapWithConcurrency(
      pageNumbers,
      PDF_PAGE_EXTRACTION_CONCURRENCY,
      (pageNumber) => extractPdfPage(pdf as PdfDocumentLike, pageNumber)
    )
    pages.push(...extractedPages.map((page) => page.markerText))
    textPages = extractedPages.filter((page) => page.searchable).length

    if (textPages === 0) {
      return {
        ok: false,
        code: 'OCR_REQUIRED',
        message: '所选页面没有可提取文字，可能是扫描版 PDF。第一版暂不支持 OCR，请更换可搜索文字的 PDF。'
      }
    }

    return {
      ok: true,
      path,
      text: boundedExtractedText(pages.join('\n\n').trim()),
      pageCount: pdf.numPages,
      pageStart,
      pageEnd,
      extractedPages: pageEnd - pageStart + 1
    }
  } catch (error) {
    return {
      ok: false,
      code: 'READ_FAILED',
      message: error instanceof Error ? error.message : String(error)
    }
  } finally {
    await pdf?.destroy()
  }
}
