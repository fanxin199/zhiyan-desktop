import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join, sep } from 'node:path'
import type { PdfInspectResult, PdfRangeExtractResult } from '../../shared/courseware'

type PdfTextItem = {
  str?: string
  transform?: number[]
}

type PdfDocumentLike = {
  numPages: number
  getPage(pageNumber: number): Promise<{
    getTextContent(): Promise<{ items: PdfTextItem[] }>
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
