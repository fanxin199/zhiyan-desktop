import { describe, expect, it } from 'vitest'
import { stat } from 'node:fs/promises'
import {
  analyzePdfCoursewareSource,
  extractPdfRange,
  inspectPdf,
  resolvePdfJsDocumentOptions
} from './courseware-pdf-service'

describe('extractPdfRange', () => {
  it('expands an embedded image crop to include nearby PDF text annotations', async () => {
    const result = await analyzePdfCoursewareSource(
      'C:\\books\\immunology.pdf',
      {
        readPdf: async () => new Uint8Array([1, 2, 3]),
        openPdf: async () => ({
          numPages: 1,
          getPage: async () => ({
            getViewport: () => ({ width: 1000, height: 800 }),
            getOperatorList: async () => ({
              fnArray: [12, 85],
              argsArray: [
                [700, 0, 0, 400, 100, 260],
                ['img-1']
              ]
            }),
            getTextContent: async () => ({
              items: [
                {
                  str: 'Figure 2. B cell activation pathway',
                  transform: [18, 0, 0, 18, 120, 210],
                  width: 320,
                  height: 18
                }
              ]
            })
          }),
          destroy: async () => undefined
        })
      }
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.document).toMatchObject({
      kind: 'pdf',
      pageCount: 1,
      searchable: true
    })
    expect(result.assets).toHaveLength(1)
    expect(result.assets[0]).toMatchObject({
      sourceKind: 'pdf',
      sourceIndex: 1,
      role: 'figure',
      status: 'approved',
      caption: '图 1'
    })
    const crop = result.assets[0].crop
    expect(crop).toBeDefined()
    expect((crop?.y ?? 0) + (crop?.height ?? 0)).toBeGreaterThan(0.73)
  })

  it('numbers extracted PDF figures sequentially across pages instead of reusing page captions', async () => {
    const result = await analyzePdfCoursewareSource(
      'C:\\books\\immunology.pdf',
      {
        readPdf: async () => new Uint8Array([1, 2, 3]),
        openPdf: async () => ({
          numPages: 2,
          getPage: async (pageNumber: number) => ({
            getViewport: () => ({ width: 1000, height: 800 }),
            getOperatorList: async () => pageNumber === 1
              ? {
                  fnArray: [12, 85, 11, 12, 85],
                  argsArray: [
                    [300, 0, 0, 300, 80, 350],
                    ['img-1'],
                    [],
                    [300, 0, 0, 300, 580, 350],
                    ['img-2']
                  ]
                }
              : {
                  fnArray: [12, 85],
                  argsArray: [
                    [600, 0, 0, 350, 200, 250],
                    ['img-3']
                  ]
                },
            getTextContent: async () => ({
              items: [{
                str: '图 1 免疫系统示意图',
                transform: [18, 0, 0, 18, 100, 200],
                width: 240,
                height: 18
              }]
            })
          }),
          destroy: async () => undefined
        })
      }
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.assets.map((asset) => asset.caption)).toEqual(['图 1', '图 2', '图 3'])
  })

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
