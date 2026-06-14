/**
 * PDF 文本提取工具
 *
 * 在 Electron 渲染进程中使用 pdfjs-dist (v4) 直接提取 PDF 文件的文本内容。
 * 用于智能教案模块——将用户上传的 PDF 章节内容提取出来直接嵌入到 prompt 中，
 * 绕过 Kun 运行时的文件访问限制。
 */

import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist'
import type { TextItem } from 'pdfjs-dist/types/src/display/api'

// 配置 PDF.js worker — 使用 Vite 的 URL import 模式，确保 worker 被正确打包
GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).toString()

/** PDF 文本提取的最大字符数限制（40 万字符） */
const MAX_EXTRACT_CHARS = 400_000

export interface PdfExtractResult {
  /** 提取的文本内容 */
  text: string
  /** PDF 总页数 */
  pageCount: number
  /** 是否因字符限制被截断 */
  truncated: boolean
  /** 实际提取的页数（如果被截断则小于 pageCount） */
  extractedPages: number
}

/**
 * 从浏览器 File 对象中提取 PDF 文本内容。
 *
 * @param file 用户通过 <input type="file"> 选择的 PDF 文件
 * @returns 提取的文本内容及元数据
 */
export async function extractPdfText(file: File): Promise<PdfExtractResult> {
  const arrayBuffer = await file.arrayBuffer()

  const pdf = await getDocument({
    data: new Uint8Array(arrayBuffer),
    useSystemFonts: true
  }).promise

  const pageCount = pdf.numPages
  let fullText = ''
  let truncated = false
  let extractedPages = 0

  for (let i = 1; i <= pageCount; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()

    // 将文本项按位置组织为行，保留基本的排版结构
    const items = content.items.filter(
      (item): item is TextItem => 'str' in item && item.str.trim().length > 0
    )

    if (items.length === 0) {
      extractedPages++
      continue
    }

    // 按 Y 坐标分组（同一行的文字 Y 坐标接近）
    const lines: Map<number, TextItem[]> = new Map()
    for (const item of items) {
      const y = Math.round(item.transform[5])
      const existing = lines.get(y)
      if (existing) {
        existing.push(item)
      } else {
        lines.set(y, [item])
      }
    }

    // 按 Y 坐标降序排列（PDF 坐标系 Y 轴从下到上）
    const sortedLines = [...lines.entries()]
      .sort(([a], [b]) => b - a)
      .map(([, lineItems]) =>
        lineItems
          .sort((a, b) => a.transform[4] - b.transform[4])
          .map((item) => item.str)
          .join(' ')
      )

    const pageText = sortedLines.join('\n')
    fullText += `\n\n--- 第 ${i} 页 / 共 ${pageCount} 页 ---\n\n${pageText}`
    extractedPages++

    if (fullText.length > MAX_EXTRACT_CHARS) {
      fullText = fullText.substring(0, MAX_EXTRACT_CHARS)
      truncated = true
      break
    }
  }

  pdf.destroy()

  return {
    text: fullText.trim(),
    pageCount,
    truncated,
    extractedPages
  }
}
