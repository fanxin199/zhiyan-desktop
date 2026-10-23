import { describe, expect, it } from 'vitest'
import { lookupPubMedIdentifier, parsePubMedXml } from './pubmed-service'

describe('parsePubMedXml', () => {
  it('normalizes PMID, DOI and abstract evidence from PubMed XML', () => {
    const xml = `<?xml version="1.0"?>
      <PubmedArticleSet>
        <PubmedArticle>
          <MedlineCitation>
            <PMID>40123456</PMID>
            <Article>
              <ArticleTitle>B cells in tumor immunity</ArticleTitle>
              <Abstract>
                <AbstractText Label="BACKGROUND">Background text.</AbstractText>
                <AbstractText Label="RESULTS">Result text.</AbstractText>
              </Abstract>
              <Journal>
                <JournalIssue><PubDate><Year>2025</Year></PubDate></JournalIssue>
                <Title>Immunity</Title>
              </Journal>
              <AuthorList>
                <Author><LastName>Wang</LastName><ForeName>Li</ForeName></Author>
              </AuthorList>
            </Article>
          </MedlineCitation>
          <PubmedData>
            <ArticleIdList>
              <ArticleId IdType="pubmed">40123456</ArticleId>
              <ArticleId IdType="doi">10.1016/j.immuni.2025.01.001</ArticleId>
            </ArticleIdList>
          </PubmedData>
        </PubmedArticle>
      </PubmedArticleSet>`

    expect(parsePubMedXml(xml)).toEqual([{
      id: 'pmid-40123456',
      title: 'B cells in tumor immunity',
      sourceType: 'abstract',
      pmid: '40123456',
      doi: '10.1016/j.immuni.2025.01.001',
      year: 2025,
      journal: 'Immunity',
      authors: ['Wang Li'],
      abstract: 'BACKGROUND: Background text.\nRESULTS: Result text.'
    }])
  })
})

describe('lookupPubMedIdentifier', () => {
  const articleXml = `<PubmedArticleSet><PubmedArticle><MedlineCitation><PMID>40123456</PMID><Article>
    <ArticleTitle>B cells</ArticleTitle><Journal><Title>Immunity</Title></Journal></Article></MedlineCitation>
    <PubmedData><ArticleIdList><ArticleId IdType="doi">10.1016/j.immuni.2025.01.001</ArticleId></ArticleIdList></PubmedData>
    </PubmedArticle></PubmedArticleSet>`
  const fetcher = (ids: string[]) => (async (url: URL | RequestInfo) => {
    const text = String(url)
    if (text.includes('esearch')) return new Response(JSON.stringify({ esearchresult: { idlist: ids } }))
    return new Response(articleXml)
  }) as typeof fetch

  it('finds the record a PMID or DOI names', async () => {
    expect(await lookupPubMedIdentifier({ pmid: '40123456' }, fetcher(['40123456']))).toMatchObject({ ok: true, record: { pmid: '40123456' } })
    expect(await lookupPubMedIdentifier({ doi: '10.1016/J.IMMUNI.2025.01.001' }, fetcher(['40123456']))).toMatchObject({ ok: true, record: { pmid: '40123456' } })
  })

  it('returns no record when PubMed knows none or a different one', async () => {
    expect(await lookupPubMedIdentifier({ pmid: '99999999' }, fetcher([]))).toEqual({ ok: true, record: null })
    expect(await lookupPubMedIdentifier({ pmid: '11111111' }, fetcher(['40123456']))).toEqual({ ok: true, record: null })
  })
})
