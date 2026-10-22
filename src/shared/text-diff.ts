export type TextDiffSegment = {
  type: 'equal' | 'insert' | 'delete'
  text: string
}

// Chinese, Japanese and Korean characters compare one by one; other text compares by word, with
// runs of spaces and each punctuation mark as their own tokens.
const MAX_TRACE_CELLS = 8_000_000

const TOKEN = /[㐀-鿿豈-﫿぀-ヿ가-힯]|[A-Za-z0-9_À-ɏ]+|\s+|[^\s]/gu

export function tokenizeForDiff(text: string): string[] {
  return text.match(TOKEN) ?? []
}

/**
 * The shortest edit between two token lists (Myers' algorithm), so long sections with small edits
 * stay cheap to compare.
 */
function diffTokens(before: string[], after: string[]): TextDiffSegment[] | null {
  const n = before.length
  const m = after.length
  const max = n + m
  const offset = max + 1
  let frontier: Int32Array = new Int32Array(2 * max + 3)
  const trace: Int32Array[] = []
  outer: for (let d = 0; d <= max; d += 1) {
    // The trace grows with edits × length; give up on texts that were mostly rewritten.
    if ((d + 1) * frontier.length > MAX_TRACE_CELLS) return null
    trace.push(frontier.slice())
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && frontier[offset + k - 1] < frontier[offset + k + 1])
        ? frontier[offset + k + 1]
        : frontier[offset + k - 1] + 1
      let y = x - k
      while (x < n && y < m && before[x] === after[y]) {
        x += 1
        y += 1
      }
      frontier[offset + k] = x
      if (x >= n && y >= m) break outer
    }
  }

  const segments: TextDiffSegment[] = []
  const push = (type: TextDiffSegment['type'], text: string): void => {
    const last = segments[0]
    if (last?.type === type) last.text = text + last.text
    else segments.unshift({ type, text })
  }
  let x = n
  let y = m
  for (let d = trace.length - 1; d > 0; d -= 1) {
    frontier = trace[d]
    const k = x - y
    const previousK = k === -d || (k !== d && frontier[offset + k - 1] < frontier[offset + k + 1]) ? k + 1 : k - 1
    const previousX = frontier[offset + previousK]
    const previousY = previousX - previousK
    while (x > previousX && y > previousY) {
      push('equal', before[x - 1])
      x -= 1
      y -= 1
    }
    if (x === previousX) push('insert', after[previousY])
    else push('delete', before[previousX])
    x = previousX
    y = previousY
  }
  while (x > 0 && y > 0) {
    push('equal', before[x - 1])
    x -= 1
    y -= 1
  }
  return segments
}

/** Character-level for Chinese and word-level for other text (§6.2). */
export function diffText(before: string, after: string): TextDiffSegment[] {
  if (before === after) return before ? [{ type: 'equal', text: before }] : []
  const segments = diffTokens(tokenizeForDiff(before), tokenizeForDiff(after))
  if (segments) return segments
  return [
    ...(before ? [{ type: 'delete' as const, text: before }] : []),
    ...(after ? [{ type: 'insert' as const, text: after }] : [])
  ]
}

/** Number of separate places that changed; a deletion next to an insertion counts once. */
export function countChangedPlaces(segments: TextDiffSegment[]): number {
  let count = 0
  let inChange = false
  for (const segment of segments) {
    const changed = segment.type !== 'equal'
    if (changed && !inChange) count += 1
    inChange = changed
  }
  return count
}
