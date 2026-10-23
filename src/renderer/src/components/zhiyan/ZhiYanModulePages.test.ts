import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import { extractResearchTaskFileText } from './ZhiYanModulePages'

describe('research task file extraction', () => {
  it('reads plain text files into research task context', async () => {
    await expect(extractResearchTaskFileText({
      name: 'notes.md',
      dataBase64: 'IyBCIGNlbGwgcmVzdWx0cw=='
    })).resolves.toMatchObject({ kind: 'text', text: '# B cell results' })
  })

  it('reads DOCX paragraph text into research task context', async () => {
    const archive = new JSZip()
    archive.file('word/document.xml', [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>',
      '<w:p><w:r><w:t>TLS recruit B cells</w:t></w:r></w:p>',
      '<w:p><w:r><w:t>into tumor tissue</w:t></w:r></w:p>',
      '</w:body></w:document>'
    ].join(''))
    await expect(extractResearchTaskFileText({
      name: 'manuscript.docx',
      dataBase64: await archive.generateAsync({ type: 'base64' })
    })).resolves.toMatchObject({
      kind: 'docx',
      text: expect.stringContaining('TLS recruit B cells\ninto tumor tissue')
    })
  })

  it('reads XLSX cells into research task context', async () => {
    const archive = new JSZip()
    archive.file('xl/sharedStrings.xml', [
      '<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
      '<si><t>gene</t></si><si><t>count</t></si><si><t>MS4A1</t></si>',
      '</sst>'
    ].join(''))
    archive.file('xl/worksheets/sheet1.xml', [
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>',
      '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>',
      '<row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2"><v>42</v></c></row>',
      '</sheetData></worksheet>'
    ].join(''))
    await expect(extractResearchTaskFileText({
      name: 'counts.xlsx',
      dataBase64: await archive.generateAsync({ type: 'base64' })
    })).resolves.toMatchObject({
      kind: 'xlsx',
      text: expect.stringContaining('gene\tcount\nMS4A1\t42')
    })
  })
})
