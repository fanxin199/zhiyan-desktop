import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { extractPptxCoursewareSourceFromBuffer } from './courseware-pptx-service'

function pngHeader(width: number, height: number): Buffer {
  const buffer = Buffer.alloc(24)
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buffer)
  buffer.write('IHDR', 12, 'ascii')
  buffer.writeUInt32BE(width, 16)
  buffer.writeUInt32BE(height, 20)
  return buffer
}

function slideXml(text: string, pictures: Array<{ relId: string; x: number; y: number; cx: number; cy: number }>): string {
  const pictureXml = pictures.map((picture, index) => `
    <p:pic>
      <p:nvPicPr><p:cNvPr id="${index + 2}" name="Picture ${index + 1}"/></p:nvPicPr>
      <p:blipFill><a:blip r:embed="${picture.relId}"/></p:blipFill>
      <p:spPr><a:xfrm><a:off x="${picture.x}" y="${picture.y}"/><a:ext cx="${picture.cx}" cy="${picture.cy}"/></a:xfrm></p:spPr>
    </p:pic>`).join('')
  return `<?xml version="1.0" encoding="UTF-8"?>
    <p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
      xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
      xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
      <p:cSld><p:spTree>
        <p:sp><p:txBody><a:p><a:r><a:t>${text}</a:t></a:r></a:p></p:txBody></p:sp>
        ${pictureXml}
      </p:spTree></p:cSld>
    </p:sld>`
}

function relationships(entries: Array<{ id: string; target: string }>): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
    <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
      ${entries.map((entry) => `<Relationship Id="${entry.id}" Type="image" Target="${entry.target}"/>`).join('')}
    </Relationships>`
}

describe('extractPptxCoursewareSourceFromBuffer', () => {
  it('extracts meaningful images and rejects a repeated logo', async () => {
    const zip = new JSZip()
    zip.file('ppt/presentation.xml', `
      <p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
        xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
        <p:sldSz cx="12192000" cy="6858000"/>
      </p:presentation>`)
    zip.file('ppt/slides/slide1.xml', slideXml(
      'Figure 1. B cell activation in the tumor microenvironment',
      [
        { relId: 'rId1', x: 800000, y: 900000, cx: 7000000, cy: 4500000 },
        { relId: 'rId2', x: 10000000, y: 200000, cx: 1000000, cy: 500000 }
      ]
    ))
    zip.file('ppt/slides/_rels/slide1.xml.rels', relationships([
      { id: 'rId1', target: '../media/figure.png' },
      { id: 'rId2', target: '../media/logo.png' }
    ]))
    zip.file('ppt/slides/slide2.xml', slideXml(
      'Summary',
      [{ relId: 'rId2', x: 10000000, y: 200000, cx: 1000000, cy: 500000 }]
    ))
    zip.file('ppt/slides/_rels/slide2.xml.rels', relationships([
      { id: 'rId2', target: '../media/logo.png' }
    ]))
    zip.file('ppt/media/figure.png', pngHeader(1600, 900))
    zip.file('ppt/media/logo.png', pngHeader(200, 100))

    const result = await extractPptxCoursewareSourceFromBuffer(
      await zip.generateAsync({ type: 'nodebuffer' }),
      'C:\\teaching\\immunology.pptx'
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.document.kind).toBe('pptx')
    expect(result.document.pageCount).toBe(2)
    expect(result.text).toContain('B cell activation')
    expect(result.assets).toHaveLength(2)

    const figure = result.assets.find((asset) => asset.sourceName === 'figure.png')
    expect(figure).toMatchObject({
      sourceIndex: 1,
      role: 'figure',
      status: 'approved',
      width: 1600,
      height: 900
    })
    expect(figure?.caption).toContain('Figure 1')
    expect(figure?.imageDataUrl).toMatch(/^data:image\/png;base64,/)

    const logo = result.assets.find((asset) => asset.sourceName === 'logo.png')
    expect(logo).toMatchObject({
      role: 'decorative',
      status: 'rejected',
      occurrences: [1, 2]
    })
  })

  it('deduplicates identical image bytes stored under different media names', async () => {
    const zip = new JSZip()
    zip.file('ppt/presentation.xml', `
      <p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
        <p:sldSz cx="12192000" cy="6858000"/>
      </p:presentation>`)
    zip.file('ppt/slides/slide1.xml', slideXml(
      'B cell figure',
      [{ relId: 'rId1', x: 800000, y: 900000, cx: 7000000, cy: 4500000 }]
    ))
    zip.file('ppt/slides/_rels/slide1.xml.rels', relationships([
      { id: 'rId1', target: '../media/copy-a.png' }
    ]))
    zip.file('ppt/slides/slide2.xml', slideXml(
      'B cell figure continued',
      [{ relId: 'rId1', x: 800000, y: 900000, cx: 7000000, cy: 4500000 }]
    ))
    zip.file('ppt/slides/_rels/slide2.xml.rels', relationships([
      { id: 'rId1', target: '../media/copy-b.png' }
    ]))
    const identical = pngHeader(1600, 900)
    zip.file('ppt/media/copy-a.png', identical)
    zip.file('ppt/media/copy-b.png', identical)

    const result = await extractPptxCoursewareSourceFromBuffer(
      await zip.generateAsync({ type: 'nodebuffer' }),
      'C:\\teaching\\duplicates.pptx'
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.assets).toHaveLength(1)
    expect(result.assets[0].occurrences).toEqual([1, 2])
  })
})
