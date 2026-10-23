import { useEffect, useMemo, useState } from 'react'
import type { ArtifactKind } from '@shared/artifact'
import {
  citedIdentifiers,
  localSelfCheck,
  unverifiedCitationSuggestion,
  type CitedIdentifier,
  type SelfCheckSuggestion
} from '@shared/self-check'

/** At most this many citations are looked up per document, to keep PubMed traffic small. */
export const MAX_CITATION_LOOKUPS = 12

type LookupResult = 'found' | 'missing' | 'unreachable'

// Results last for the session, so reopening or editing a document does not ask PubMed again.
const lookups = new Map<string, Promise<LookupResult>>()

function lookupKey(identifier: CitedIdentifier): string {
  return identifier.pmid ? `pmid:${identifier.pmid}` : `doi:${identifier.doi?.toLowerCase()}`
}

function lookUp(identifier: CitedIdentifier): Promise<LookupResult> {
  const key = lookupKey(identifier)
  const known = lookups.get(key)
  if (known) return known
  const pending = (async (): Promise<LookupResult> => {
    if (typeof window.dsGui?.lookupPubMedIdentifier !== 'function') return 'unreachable'
    try {
      const result = await window.dsGui.lookupPubMedIdentifier(identifier.pmid ? { pmid: identifier.pmid } : { doi: identifier.doi })
      if (!result.ok) return 'unreachable'
      return result.record ? 'found' : 'missing'
    } catch {
      return 'unreachable'
    }
  })()
  lookups.set(key, pending)
  // A network failure is retried next time.
  void pending.then((result) => { if (result === 'unreachable') lookups.delete(key) })
  return pending
}

export function resetSelfCheckLookupsForTests(): void {
  lookups.clear()
}

export type SelfCheckState = {
  suggestions: SelfCheckSuggestion[]
  /** Citations are still being looked up. */
  checking: boolean
  /** Citations that could not be looked up, such as when offline. */
  unchecked: number
}

/**
 * 交付前自查 (Task 4.1) of a Markdown result: the rules that need no network at once, and each cited
 * PMID or DOI looked up in PubMed.
 */
export function useSelfCheck(kind: ArtifactKind | undefined, markdown: string, title = ''): SelfCheckState {
  const local = useMemo(() => localSelfCheck(kind, markdown, title), [kind, markdown, title])
  const identifiers = useMemo(() => citedIdentifiers(markdown).slice(0, MAX_CITATION_LOOKUPS), [markdown])
  const identifierKey = identifiers.map(lookupKey).join('|')
  const [citations, setCitations] = useState<{ key: string; results: LookupResult[] }>({ key: '', results: [] })

  useEffect(() => {
    if (identifiers.length === 0) return
    let current = true
    void Promise.all(identifiers.map(lookUp)).then((results) => {
      if (current) setCitations({ key: identifierKey, results })
    })
    return () => { current = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the identifiers are keyed by identifierKey.
  }, [identifierKey])

  const settled = identifiers.length === 0 || citations.key === identifierKey
  const results = settled && identifiers.length > 0 ? citations.results : []
  const citationSuggestions = identifiers.flatMap((identifier, index) => {
    if (results[index] !== 'missing') return []
    const suggestion = unverifiedCitationSuggestion(identifier, markdown)
    return suggestion ? [suggestion] : []
  })
  return {
    suggestions: [...citationSuggestions, ...local],
    checking: !settled,
    unchecked: results.filter((result) => result === 'unreachable').length
  }
}
