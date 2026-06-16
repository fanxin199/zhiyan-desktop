const PROVIDER_RETRY_DELAYS_MS = [750, 1_500, 3_000] as const

export class RetryableHttpResponseError extends Error {
  readonly status: number
  readonly bodyText: string

  constructor(status: number, bodyText: string) {
    super(`Retryable provider response (${status})`)
    this.name = 'RetryableHttpResponseError'
    this.status = status
    this.bodyText = bodyText
  }
}

export function isRetryableHttpStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status <= 599)
}

function isTimeoutError(error: unknown): boolean {
  return (
    (error instanceof DOMException && (error.name === 'TimeoutError' || error.name === 'AbortError')) ||
    (error instanceof Error && /timed?\s*out|timeout|aborted/i.test(error.message))
  )
}

function isRetryableNetworkError(error: unknown): boolean {
  if (error instanceof RetryableHttpResponseError) return true
  if (isTimeoutError(error)) return false
  if (!(error instanceof Error)) return false
  return /fetch failed|network|ECONNRESET|ECONNREFUSED|EAI_AGAIN|ENOTFOUND|socket|temporar/i.test(error.message)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function withProviderRetry<T>(
  operation: () => Promise<T>,
  delays: readonly number[] = PROVIDER_RETRY_DELAYS_MS
): Promise<T> {
  let attempt = 0
  let lastError: unknown

  while (attempt <= delays.length) {
    try {
      return await operation()
    } catch (error) {
      lastError = error
      if (attempt >= delays.length || !isRetryableNetworkError(error)) throw error
      await sleep(delays[attempt])
      attempt += 1
    }
  }

  throw lastError
}
