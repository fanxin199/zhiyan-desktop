import { XMLParser } from 'fast-xml-parser'
import type {
  EvidenceRef,
  PubMedSearchRequest,
  PubMedSearchResult
} from '../../shared/courseware'

const PUBMED_EUTILS_BASE = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils'
const REQUEST_TIMEOUT_MS = 20_000

function arrayOf<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return []
  return Array.isArray(value) ? value : [value]
}

function textOf(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number') return String(value).trim()
  if (!value || typeof value !== 'object') return ''
  const record = value as Record<string, unknown>
  if (typeof record['#text'] === 'string' || typeof record['#text'] === 'number') {
    return String(record['#text']).trim()
  }
  return Object.entries(record)
    .filter(([key]) => !key.startsWith('@_'))
    .map(([, nested]) => textOf(nested))
    .filter(Boolean)
    .join(' ')
    .trim()
}

function normalizeAbstract(value: unknown): string {
  return arrayOf(value as unknown | unknown[])
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return textOf(entry)
      const record = entry as Record<string, unknown>
      const label = textOf(record['@_Label'])
      const text = textOf(entry)
      return label ? `${label}: ${text}` : text
    })
    .filter(Boolean)
    .join('\n')
}

export function parsePubMedXml(xml: string): EvidenceRef[] {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    parseTagValue: false,
    trimValues: true
  })
  const parsed = parser.parse(xml) as Record<string, unknown>
  const set = parsed.PubmedArticleSet as Record<string, unknown> | undefined
  const articles = arrayOf(set?.PubmedArticle)

  return articles.flatMap((articleValue) => {
    const articleRecord = articleValue as Record<string, unknown>
    const citation = articleRecord.MedlineCitation as Record<string, unknown> | undefined
    const article = citation?.Article as Record<string, unknown> | undefined
    const pubmedData = articleRecord.PubmedData as Record<string, unknown> | undefined
    const idList = pubmedData?.ArticleIdList as Record<string, unknown> | undefined
    const articleIds = arrayOf(idList?.ArticleId)
    const pmid = textOf(citation?.PMID) || textOf(articleIds.find((item) =>
      typeof item === 'object' && item !== null &&
      (item as Record<string, unknown>)['@_IdType'] === 'pubmed'
    ))
    const title = textOf(article?.ArticleTitle)
    if (!pmid || !title) return []

    const doi = textOf(articleIds.find((item) =>
      typeof item === 'object' && item !== null &&
      (item as Record<string, unknown>)['@_IdType'] === 'doi'
    ))
    const journal = article?.Journal as Record<string, unknown> | undefined
    const issue = journal?.JournalIssue as Record<string, unknown> | undefined
    const pubDate = issue?.PubDate as Record<string, unknown> | undefined
    const yearText = textOf(pubDate?.Year) || textOf(pubDate?.MedlineDate).slice(0, 4)
    const authors = arrayOf(
      (article?.AuthorList as Record<string, unknown> | undefined)?.Author
    ).map((authorValue) => {
      const author = authorValue as Record<string, unknown>
      return [textOf(author.LastName), textOf(author.ForeName)].filter(Boolean).join(' ')
    }).filter(Boolean)
    const abstract = normalizeAbstract(
      (article?.Abstract as Record<string, unknown> | undefined)?.AbstractText
    )

    return [{
      id: `pmid-${pmid}`,
      title,
      sourceType: 'abstract' as const,
      pmid,
      ...(doi ? { doi } : {}),
      ...(Number(yearText) ? { year: Number(yearText) } : {}),
      ...(textOf(journal?.Title) ? { journal: textOf(journal?.Title) } : {}),
      ...(authors.length ? { authors } : {}),
      ...(abstract ? { abstract } : {})
    }]
  })
}

export async function searchPubMed(
  request: PubMedSearchRequest,
  fetcher: typeof fetch = fetch
): Promise<PubMedSearchResult> {
  const query = request.query.trim()
  if (!query) return { ok: false, message: '请输入 PubMed 检索词。' }
  const maxResults = Math.min(20, Math.max(1, request.maxResults ?? 6))
  const datedQuery = request.minYear
    ? `(${query}) AND ${request.minYear}:3000[dp]`
    : query

  try {
    const searchUrl = new URL(`${PUBMED_EUTILS_BASE}/esearch.fcgi`)
    searchUrl.searchParams.set('db', 'pubmed')
    searchUrl.searchParams.set('retmode', 'json')
    searchUrl.searchParams.set('retmax', String(maxResults))
    searchUrl.searchParams.set('sort', 'pub date')
    searchUrl.searchParams.set('term', datedQuery)
    const searchResponse = await fetcher(searchUrl, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    })
    if (!searchResponse.ok) {
      return { ok: false, message: `PubMed 检索失败（${searchResponse.status}）。` }
    }
    const searchJson = await searchResponse.json() as {
      esearchresult?: { idlist?: string[] }
    }
    const ids = searchJson.esearchresult?.idlist ?? []
    if (ids.length === 0) return { ok: true, records: [] }

    const fetchUrl = new URL(`${PUBMED_EUTILS_BASE}/efetch.fcgi`)
    fetchUrl.searchParams.set('db', 'pubmed')
    fetchUrl.searchParams.set('retmode', 'xml')
    fetchUrl.searchParams.set('rettype', 'abstract')
    fetchUrl.searchParams.set('id', ids.join(','))
    const fetchResponse = await fetcher(fetchUrl, {
      headers: { Accept: 'application/xml' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    })
    if (!fetchResponse.ok) {
      return { ok: false, message: `PubMed 摘要获取失败（${fetchResponse.status}）。` }
    }
    return { ok: true, records: parsePubMedXml(await fetchResponse.text()) }
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error)
    }
  }
}
