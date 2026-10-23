import type { ReactElement } from 'react'
import JSZip from 'jszip'
import { extractPdfText } from '@renderer/lib/pdf-text-extractor'
import type { ToolPrefill } from '@renderer/lib/tool-request'
import { CoursewarePage } from './CoursewarePage'
import { TextbookWorkbenchPage } from './TextbookWorkbenchPage'
import {
  FileManagerWorkspacePage,
  type FileManagerModuleFile,
  type FileManagerModuleTarget
} from './FileManagerWorkspacePage'

export type InlineModuleId =
  | 'literature'
  | 'syllabus'
  | 'paper-polish'
  | 'review-writing'
  | 'grant-writing'
  | 'bioinformatics'
  | 'file-manager'

type ModulePageProps = {
  onStartChat: (prompt: string, options?: {
    workspaceRoot?: string
    displayText?: string
    inlineModule?: InlineModuleId
    researchTaskId?: string
  }) => void
  onUseFileInModule?: (target: FileManagerModuleTarget, file: FileManagerModuleFile) => void
  inlineConversation?: ReactElement
  showInlineConversation?: boolean
  /** A request from the AI assistant to put into the page's input box. */
  prefill?: ToolPrefill
  className?: string
}

const RESEARCH_FILE_EXTRACTION_MAX_CHARS = 240_000

type ResearchFileTextKind = 'pdf' | 'text' | 'doc' | 'docx' | 'xlsx' | 'unsupported'

export type ResearchFileTextExtraction = {
  kind: ResearchFileTextKind
  text: string
  truncated: boolean
  pageCount?: number
  extractedPages?: number
}

function extensionFromFileName(name: string): string {
  const match = /\.([^.]+)$/u.exec(name.trim().toLowerCase())
  return match?.[1] ?? ''
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

function decodeXmlEntities(value: string): string {
  return value
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&amp;', '&')
}

function xmlText(value: string): string {
  return decodeXmlEntities(
    value
      .replace(/<w:tab\b[^>]*\/>/giu, '\t')
      .replace(/<w:(?:br|cr)\b[^>]*\/>/giu, '\n')
      .replace(/<\/w:p>/giu, '\n')
      .replace(/<[^>]+>/gu, '')
  ).replace(/\n{3,}/gu, '\n\n').trim()
}

function truncateResearchFileText(text: string): Pick<ResearchFileTextExtraction, 'text' | 'truncated'> {
  if (text.length <= RESEARCH_FILE_EXTRACTION_MAX_CHARS) return { text, truncated: false }
  return {
    text: text.slice(0, RESEARCH_FILE_EXTRACTION_MAX_CHARS),
    truncated: true
  }
}

async function extractDocxText(bytes: Uint8Array): Promise<string> {
  const archive = await JSZip.loadAsync(bytes)
  const documentXml = await archive.file('word/document.xml')?.async('string')
  if (!documentXml) throw new Error('DOCX 文件缺少正文内容。')
  return xmlText(documentXml)
}

async function extractXlsxText(bytes: Uint8Array): Promise<string> {
  const archive = await JSZip.loadAsync(bytes)
  const sharedStringsXml = await archive.file('xl/sharedStrings.xml')?.async('string')
  const sharedStrings = sharedStringsXml
    ? [...sharedStringsXml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/giu)].map((match) => xmlText(match[1] ?? ''))
    : []
  const worksheetPaths = Object.keys(archive.files)
    .filter((path) => /^xl\/worksheets\/sheet\d+\.xml$/u.test(path))
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }))
  const sheets: string[] = []
  for (const path of worksheetPaths) {
    const worksheetXml = await archive.file(path)?.async('string')
    if (!worksheetXml) continue
    const rows = [...worksheetXml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/giu)].map((row) => {
      const cells = [...(row[1] ?? '').matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/giu)]
      return cells.map((cell) => {
        const attributes = cell[1] ?? ''
        const content = cell[2] ?? ''
        const sharedMatch = /\bt="s"/u.test(attributes)
          ? /<v>(\d+)<\/v>/iu.exec(content)
          : null
        if (sharedMatch) return sharedStrings[Number(sharedMatch[1])] ?? ''
        const inlineText = /\bt="inlineStr"/u.test(attributes) ? xmlText(content) : ''
        if (inlineText) return inlineText
        return xmlText((/<v>([\s\S]*?)<\/v>/iu.exec(content)?.[1] ?? ''))
      }).join('\t')
    }).filter(Boolean)
    if (rows.length > 0) sheets.push(rows.join('\n'))
  }
  if (sheets.length === 0) throw new Error('XLSX 文件中未找到可读取的工作表数据。')
  return sheets.join('\n\n')
}

export async function extractResearchTaskFileText(input: {
  name: string
  dataBase64: string
}): Promise<ResearchFileTextExtraction> {
  const extension = extensionFromFileName(input.name)
  if (!['pdf', 'txt', 'md', 'csv', 'tsv', 'docx', 'xlsx'].includes(extension)) {
    return { kind: 'unsupported', text: '', truncated: false }
  }
  const bytes = base64ToBytes(input.dataBase64)
  if (extension === 'pdf') {
    const buffer = new ArrayBuffer(bytes.byteLength)
    new Uint8Array(buffer).set(bytes)
    const extracted = await extractPdfText(new File([buffer], input.name, { type: 'application/pdf' }))
    return {
      kind: 'pdf',
      text: extracted.text,
      truncated: extracted.truncated,
      pageCount: extracted.pageCount,
      extractedPages: extracted.extractedPages
    }
  }
  const sourceText = extension === 'docx'
    ? await extractDocxText(bytes)
    : extension === 'xlsx'
      ? await extractXlsxText(bytes)
      : new TextDecoder('utf-8').decode(bytes)
  const clipped = truncateResearchFileText(sourceText.trim())
  return {
    kind: extension === 'docx' ? 'docx' : extension === 'xlsx' ? 'xlsx' : 'text',
    ...clipped
  }
}

// ── Exported Module Pages ──────────────────────────────────────────

export function PptGenPage(props: ModulePageProps): ReactElement {
  return <CoursewarePage className={props.className} prefill={props.prefill} />
}

export function TextbookPage(props: ModulePageProps): ReactElement {
  return <TextbookWorkbenchPage className={props.className} prefill={props.prefill} />
}

export function FileManagerPage(props: ModulePageProps): ReactElement {
  return (
    <FileManagerWorkspacePage
      onStartChat={props.onStartChat}
      onUseFileInModule={props.onUseFileInModule}
      inlineConversation={props.inlineConversation}
      showInlineConversation={props.showInlineConversation}
      className={props.className}
    />
  )
}
