import type { ReactElement } from 'react'
import { AlertTriangle, BookOpenCheck, ExternalLink } from 'lucide-react'
import type { ChatBlock } from '../../agent/types'

export const RESEARCH_EVIDENCE_KINDS = [
  'user_material',
  'full_text',
  'abstract_metadata',
  'database_result',
  'correlation_inference',
  'mechanism_hypothesis'
] as const

export type ResearchEvidenceKind = typeof RESEARCH_EVIDENCE_KINDS[number]
export type ResearchEvidenceVerification = 'verifiable' | 'missing_identifier' | 'not_applicable'

export type ResearchEvidenceRecordV1 = {
  id: string
  kind: ResearchEvidenceKind
  claim: string
  title: string
  year?: string
  source?: string
  doi?: string
  pmid?: string
  url?: string
  locator?: string
  note?: string
  verification: ResearchEvidenceVerification
}

export type ResearchEvidenceTraceV1 = {
  version: 1
  records: ResearchEvidenceRecordV1[]
  updatedAt: string
}

const MAX_EVIDENCE_RECORDS = 100
const MAX_EVIDENCE_BLOCK_CHARS = 100_000
const CITATION_KINDS = new Set<ResearchEvidenceKind>([
  'full_text',
  'abstract_metadata',
  'database_result'
])

export const RESEARCH_EVIDENCE_VIEW: Record<ResearchEvidenceKind, {
  label: string
  className: string
}> = {
  user_material: {
    label: '用户材料',
    className: 'bg-slate-100 text-slate-700 dark:bg-slate-500/15 dark:text-slate-200'
  },
  full_text: {
    label: '全文证据',
    className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200'
  },
  abstract_metadata: {
    label: '摘要/元数据',
    className: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-200'
  },
  database_result: {
    label: '数据库结果',
    className: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-200'
  },
  correlation_inference: {
    label: '相关性推断',
    className: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-200'
  },
  mechanism_hypothesis: {
    label: '机制假设',
    className: 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-200'
  }
}

function cleanString(value: unknown, maxLength = 2_000): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
}

function normalizeKind(value: unknown): ResearchEvidenceKind | null {
  const kind = cleanString(value, 40)
  return RESEARCH_EVIDENCE_KINDS.includes(kind as ResearchEvidenceKind)
    ? kind as ResearchEvidenceKind
    : null
}

function normalizeDoi(value: unknown): string | undefined {
  const raw = cleanString(value, 300)
    .replace(/^doi\s*:\s*/iu, '')
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//iu, '')
  const match = raw.match(/10\.\d{4,9}\/[\w.()/:;-]+/iu)
  return match?.[0].replace(/[.,;]+$/u, '').toLowerCase()
}

function normalizePmid(value: unknown): string | undefined {
  const raw = cleanString(value, 100)
  const match = raw.match(/(?:pmid\s*:\s*)?(\d{5,10})/iu)
  return match?.[1]
}

function stableRecordId(record: Omit<ResearchEvidenceRecordV1, 'id'>): string {
  const seed = `${record.kind}|${record.doi ?? ''}|${record.pmid ?? ''}|${record.title}|${record.claim}`
  let hash = 0
  for (let index = 0; index < seed.length; index += 1) {
    hash = ((hash << 5) - hash + seed.charCodeAt(index)) | 0
  }
  return `evidence-${Math.abs(hash).toString(36)}`
}

function normalizeRecord(value: unknown): ResearchEvidenceRecordV1 | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const source = value as Record<string, unknown>
  const kind = normalizeKind(source.kind)
  if (!kind) return null
  const claim = cleanString(source.claim)
  const title = cleanString(source.title, 500)
  if (!claim && !title) return null
  const doi = normalizeDoi(source.doi)
  const pmid = normalizePmid(source.pmid)
  const verification: ResearchEvidenceVerification = CITATION_KINDS.has(kind)
    ? doi || pmid ? 'verifiable' : 'missing_identifier'
    : 'not_applicable'
  const normalized: Omit<ResearchEvidenceRecordV1, 'id'> = {
    kind,
    claim: claim || title,
    title: title || (kind === 'correlation_inference' ? '当前分析结果' : '当前机制解释'),
    ...(cleanString(source.year, 20) ? { year: cleanString(source.year, 20) } : {}),
    ...(cleanString(source.source, 500) ? { source: cleanString(source.source, 500) } : {}),
    ...(doi ? { doi } : {}),
    ...(pmid ? { pmid } : {}),
    ...(cleanString(source.url, 2_000) ? { url: cleanString(source.url, 2_000) } : {}),
    ...(cleanString(source.locator, 500) ? { locator: cleanString(source.locator, 500) } : {}),
    ...(cleanString(source.note, 1_000) ? { note: cleanString(source.note, 1_000) } : {}),
    verification
  }
  return {
    id: cleanString(source.id, 200) || stableRecordId(normalized),
    ...normalized
  }
}

export function normalizeResearchEvidenceTrace(
  raw: unknown,
  updatedAt = new Date().toISOString()
): ResearchEvidenceTraceV1 | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const source = raw as Record<string, unknown>
  if (!Array.isArray(source.records)) return null
  const records = source.records
    .map(normalizeRecord)
    .filter((record): record is ResearchEvidenceRecordV1 => record !== null)
    .slice(-MAX_EVIDENCE_RECORDS)
  if (records.length === 0) return null
  return {
    version: 1,
    records,
    updatedAt: cleanString(source.updatedAt, 100) || updatedAt
  }
}

function recordKey(record: ResearchEvidenceRecordV1): string {
  if (record.doi) return `doi:${record.doi}`
  if (record.pmid) return `pmid:${record.pmid}`
  return `${record.kind}:${record.title.toLowerCase()}:${record.claim.toLowerCase()}:${record.source ?? ''}`
}

function recordDetailScore(record: ResearchEvidenceRecordV1): number {
  return 2
    + (record.year ? 2 : 0)
    + (record.source ? 1 : 0)
    + (record.doi || record.pmid ? 2 : 0)
    + (record.url ? 1 : 0)
    + (record.locator ? 2 : 0)
    + (record.note ? 1 : 0)
}

export function mergeResearchEvidenceTraces(
  previous: ResearchEvidenceTraceV1 | null | undefined,
  incoming: ResearchEvidenceTraceV1 | null | undefined,
  updatedAt = new Date().toISOString()
): ResearchEvidenceTraceV1 | null {
  const merged = new Map<string, ResearchEvidenceRecordV1>()
  for (const record of previous?.records ?? []) merged.set(recordKey(record), record)
  for (const record of incoming?.records ?? []) {
    const key = recordKey(record)
    const current = merged.get(key)
    if (!current || recordDetailScore(record) >= recordDetailScore(current)) merged.set(key, record)
  }
  const records = [...merged.values()].slice(-MAX_EVIDENCE_RECORDS)
  if (previous && JSON.stringify(records) === JSON.stringify(previous.records)) return previous
  return records.length > 0 ? { version: 1, records, updatedAt } : null
}

export function createMaterialEvidenceTrace(
  materials: Array<{ name: string; path: string }>,
  updatedAt = new Date().toISOString()
): ResearchEvidenceTraceV1 | null {
  return normalizeResearchEvidenceTrace({
    version: 1,
    updatedAt,
    records: materials.map((material) => ({
      kind: 'user_material',
      claim: '用户为当前科研任务提供的本地材料',
      title: material.name,
      source: material.path,
      note: '材料内容需要结合正文范围和任务目标审查。'
    }))
  }, updatedAt)
}

export function parseResearchEvidenceTrace(text: string): ResearchEvidenceTraceV1 | null {
  const candidates: string[] = []
  const hiddenPattern = /<!--\s*ZHIYAN_EVIDENCE_V1\s*([\s\S]*?)\s*ZHIYAN_EVIDENCE_V1\s*-->/giu
  const fencedPattern = /```zhiyan-evidence\s*([\s\S]*?)```/giu
  for (const pattern of [hiddenPattern, fencedPattern]) {
    for (const match of text.matchAll(pattern)) {
      if (match[1] && match[1].length <= MAX_EVIDENCE_BLOCK_CHARS) candidates.push(match[1])
    }
  }
  let trace: ResearchEvidenceTraceV1 | null = null
  for (const candidate of candidates) {
    try {
      trace = mergeResearchEvidenceTraces(trace, normalizeResearchEvidenceTrace(JSON.parse(candidate)))
    } catch {
      /* A malformed model record must not hide the readable answer. */
    }
  }
  return trace
}

function identifierFromUrl(url: string): { doi?: string; pmid?: string } {
  const doi = normalizeDoi(url)
  const pubmedMatch = url.match(/pubmed(?:\.ncbi\.nlm\.nih\.gov)?\/(\d{5,10})/iu)
  return {
    ...(doi ? { doi } : {}),
    ...(pubmedMatch?.[1] ? { pmid: pubmedMatch[1] } : {})
  }
}

function sourceHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./u, '')
  } catch {
    return ''
  }
}

function traceFromToolBlock(block: Extract<ChatBlock, { kind: 'tool' }>): ResearchEvidenceTraceV1 | null {
  const sources = Array.isArray(block.meta?.sources) ? block.meta.sources : []
  return normalizeResearchEvidenceTrace({
    version: 1,
    records: sources.flatMap((value) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return []
      const item = value as Record<string, unknown>
      const url = cleanString(item.url, 2_000)
      const title = cleanString(item.title, 500)
      if (!url && !title) return []
      const host = sourceHost(url)
      const databaseResult = /(?:pubmed|ncbi\.nlm\.nih\.gov|openalex|crossref|doi\.org)/iu.test(host)
      return [{
        kind: databaseResult ? 'database_result' : 'abstract_metadata',
        claim: `检索来源：${title || host || '外部资料'}`,
        title: title || host || '外部资料',
        source: host || '联网检索',
        url,
        ...identifierFromUrl(url)
      }]
    })
  })
}

export function collectResearchEvidenceTrace(
  blocks: ChatBlock[],
  previous?: ResearchEvidenceTraceV1 | null
): ResearchEvidenceTraceV1 {
  let trace = previous ?? null
  for (const block of blocks) {
    if (block.kind === 'tool') {
      trace = mergeResearchEvidenceTraces(trace, traceFromToolBlock(block))
    } else if (block.kind === 'assistant') {
      trace = mergeResearchEvidenceTraces(trace, parseResearchEvidenceTrace(block.text))
    }
  }
  return trace ?? { version: 1, records: [], updatedAt: new Date().toISOString() }
}

export function buildResearchEvidencePrompt(): string {
  return [
    '## 科研证据追溯要求（必须执行）',
    '对每条关键结论明确标注证据层级，不得把推断写成已证实事实：',
    '- 【用户材料】：来自老师提供的文件、数据或文字；说明具体文件或数据位置。',
    '- 【全文证据】：已阅读论文全文、图表或补充材料；注明支持结论的章节、图表或页码。',
    '- 【摘要/元数据】：只获得摘要、题名或书目信息；不得据此声称已核查全文。',
    '- 【数据库结果】：来自 PubMed、OpenAlex、Crossref 或其他数据库的检索记录。',
    '- 【相关性推断】：数据或文献只支持关联，不写成因果关系。',
    '- 【机制假设】：基于生物医学机制逻辑的解释，需要进一步实验验证。',
    '',
    '文献引用必须保留题名、年份、来源以及 DOI/PMID 等可核验标识。无法获得 DOI/PMID 时留空并在正文标明“标识未核验”，严禁编造。',
    '回答末尾追加以下隐藏记录；每条关键结论一个 record，kind 只能使用 user_material、full_text、abstract_metadata、database_result、correlation_inference、mechanism_hypothesis：',
    '<!-- ZHIYAN_EVIDENCE_V1',
    '{"version":1,"records":[{"kind":"full_text","claim":"该证据支持的具体结论","title":"文献或材料题名","year":"年份","source":"期刊或数据库","doi":"DOI（没有则空）","pmid":"PMID（没有则空）","url":"可核验链接","locator":"页码、章节、图表或数据位置","note":"证据限制"}]}',
    'ZHIYAN_EVIDENCE_V1 -->'
  ].join('\n')
}

function evidenceIdentifier(record: ResearchEvidenceRecordV1): ReactElement | null {
  if (record.doi) {
    return <a className="inline-flex items-center gap-1 font-medium text-accent hover:underline" href={`https://doi.org/${record.doi}`} target="_blank" rel="noreferrer">DOI {record.doi}<ExternalLink className="h-3 w-3" /></a>
  }
  if (record.pmid) {
    return <a className="inline-flex items-center gap-1 font-medium text-accent hover:underline" href={`https://pubmed.ncbi.nlm.nih.gov/${record.pmid}/`} target="_blank" rel="noreferrer">PMID {record.pmid}<ExternalLink className="h-3 w-3" /></a>
  }
  if (record.url) {
    return <a className="inline-flex items-center gap-1 font-medium text-accent hover:underline" href={record.url} target="_blank" rel="noreferrer">查看来源<ExternalLink className="h-3 w-3" /></a>
  }
  return null
}

export function ResearchEvidenceTracePanel({
  trace
}: {
  trace: ResearchEvidenceTraceV1
}): ReactElement {
  const verifiableCount = trace.records.filter((record) => record.verification === 'verifiable').length
  const missingCount = trace.records.filter((record) => record.verification === 'missing_identifier').length
  return (
    <details className="mt-3 rounded-lg border border-ds-border-muted bg-ds-main/55" data-testid="research-evidence-trace">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 text-ui-body-sm font-semibold text-ds-text">
        <span className="inline-flex items-center gap-2"><BookOpenCheck className="h-4 w-4 text-accent" />科研证据追溯 · {trace.records.length} 条</span>
        <span className="text-ui-caption font-normal text-ds-muted">可核验 {verifiableCount}{missingCount > 0 ? ` · 待核验 ${missingCount}` : ''}</span>
      </summary>
      <div className="space-y-2 border-t border-ds-border-muted px-3 py-3">
        {trace.records.map((record) => {
          const view = RESEARCH_EVIDENCE_VIEW[record.kind]
          const metadata = [record.title, record.year, record.source].filter(Boolean).join(' · ')
          const identifier = evidenceIdentifier(record)
          return (
            <article key={record.id} className="rounded-lg bg-ds-card px-3 py-2.5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <span className={`rounded-full px-2 py-0.5 text-ui-caption font-semibold ${view.className}`}>{view.label}</span>
                {identifier}
              </div>
              <p className="mt-2 text-ui-body-sm font-medium text-ds-text">{record.claim}</p>
              <p className="mt-1 break-all text-ui-caption text-ds-muted">{metadata}</p>
              {record.locator ? <p className="mt-1 text-ui-caption text-ds-muted">证据位置：{record.locator}</p> : null}
              {record.verification === 'missing_identifier' ? (
                <p className="mt-1 inline-flex items-center gap-1 text-ui-caption text-amber-700 dark:text-amber-300"><AlertTriangle className="h-3.5 w-3.5" />缺少 DOI/PMID，请核验后引用</p>
              ) : null}
              {record.note ? <p className="mt-1 text-ui-caption text-ds-muted">限制：{record.note}</p> : null}
            </article>
          )
        })}
      </div>
    </details>
  )
}
