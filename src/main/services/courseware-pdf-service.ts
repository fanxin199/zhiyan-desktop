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

function captionFromItems(items: PdfTextItem[]): string | undefined {
  return items
    .map((item) => item.str?.trim() ?? '')
    .find((text) => /^(figure|fig\.?|图)\s*\d+/i.test(text))
}

function normalizedCoordinate(value: number): number {
  return Number(Math.max(0, Math.min(1, value)).toFixed(6))
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
    const crop = {
      x: normalizedCoordinate(left / viewport.width),
      y: normalizedCoordinate(1 - top / viewport.height),
      width: Math.max(0.0001, normalizedCoordinate(width)),
      height: Math.max(0.0001, normalizedCoordinate(height))
    }
    const caption = captionFromItems(items)
    assets.push({
      id: `pdf-page-${pageNumber}-figure-${imageIndex}`,
      sourceKind: 'pdf',
      sourceIndex: pageNumber,
      sourceName: `page-${pageNumber}-figure-${imageIndex}.png`,
      mediaType: 'image/png',
      role: 'figure',
      status: 'approved',
      confidence: caption ? 0.86 : 0.72,
      occurrences: [pageNumber],
      ...(caption ? { caption } : {}),
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
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber)
      const textContent = await page.getTextContent()
      const text = pageText(textContent.items)
      if (text) searchable = true
      pages.push(`--- 第 ${pageNumber} 页 / 共 ${pdf.numPages} 页 ---\n\n${text}`)
      if (page.getViewport && page.getOperatorList) {
        assets.push(...pageVisualAssets(
          pageNumber,
          page.getViewport({ scale: 1 }),
          await page.getOperatorList(),
          textContent.items
        ))
      }
    }
    return {
      ok: true,
      document: {
        kind: 'pdf',
        path,
        pageCount: pdf.numPages,
        searchable
      },
      text: boundedExtractedText(pages.join('\n\n').trim()),
      assets: assets.slice(0, 100)
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
    for (let pageNumber = pageStart; pageNumber <= pageEnd; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber)
      const text = pageText((await page.getTextContent()).items)
      if (text) textPages += 1
      pages.push(`--- 第 ${pageNumber} 页 / 共 ${pdf.numPages} 页 ---\n\n${text}`)
    }

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
