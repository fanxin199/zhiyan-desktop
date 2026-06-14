import { describe, expect, it } from 'vitest'
import { parsePubMedXml } from './pubmed-service'

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
