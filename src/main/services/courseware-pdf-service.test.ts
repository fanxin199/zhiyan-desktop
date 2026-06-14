import { describe, expect, it } from 'vitest'
import { stat } from 'node:fs/promises'
import {
  extractPdfRange,
  inspectPdf,
  resolvePdfJsDocumentOptions
} from './courseware-pdf-service'

describe('extractPdfRange', () => {
  it('reads the PDF page count without asking the user for a range', async () => {
    const result = await inspectPdf(
      'C:\\books\\immunology.pdf',
      {
        readPdf: async () => new Uint8Array([1, 2, 3]),
        openPdf: async () => ({
          numPages: 286,
          getPage: async () => ({
            getTextContent: async () => ({
              items: [{ str: '医学免疫学', transform: [1, 0, 0, 1, 10, 20] }]
            })
          }),
          destroy: async () => undefined
        })
      }
    )

    expect(result).toEqual({
      ok: true,
      path: 'C:\\books\\immunology.pdf',
      pageCount: 286,
      searchable: true
    })
  })

  it('provides bundled CMap and standard font resources to PDF.js', async () => {
    const options = resolvePdfJsDocumentOptions(new Uint8Array([1, 2, 3]))

    expect(options.cMapPacked).toBe(true)
    expect(options.cMapUrl.endsWith('\\') || options.cMapUrl.endsWith('/')).toBe(true)
    expect(options.standardFontDataUrl.endsWith('\\') || options.standardFontDataUrl.endsWith('/')).toBe(true)
    await expect(stat(options.cMapUrl)).resolves.toMatchObject({ isDirectory: expect.any(Function) })
    await expect(stat(options.standardFontDataUrl)).resolves.toMatchObject({ isDirectory: expect.any(Function) })
  })

  it('extracts only the requested pages and preserves page markers', async () => {
    const result = await extractPdfRange(
      'C:\\books\\immunology.pdf',
      2,
      3,
      {
        readPdf: async () => new Uint8Array([1, 2, 3]),
        openPdf: async () => ({
          numPages: 5,
          getPage: async (pageNumber: number) => ({
            getTextContent: async () => ({
              items: [
                { str: `第 ${pageNumber} 页内容`, transform: [1, 0, 0, 1, 10, 20] }
              ]
            })
          }),
          destroy: async () => undefined
        })
      }
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.pageCount).toBe(5)
    expect(result.extractedPages).toBe(2)
    expect(result.text).toContain('--- 第 2 页 / 共 5 页 ---')
    expect(result.text).toContain('--- 第 3 页 / 共 5 页 ---')
    expect(result.text).not.toContain('第 1 页内容')
  })

  it('reports likely scanned PDFs when the selected pages contain no text', async () => {
    const result = await extractPdfRange(
      'C:\\books\\scan.pdf',
      1,
      2,
      {
        readPdf: async () => new Uint8Array([1]),
        openPdf: async () => ({
          numPages: 2,
          getPage: async () => ({
            getTextContent: async () => ({ items: [] })
          }),
          destroy: async () => undefined
        })
      }
    )

    expect(result).toMatchObject({
      ok: false,
      code: 'OCR_REQUIRED'
    })
  })
})
