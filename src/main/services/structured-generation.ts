import type { z } from 'zod'
import { resolveKunRuntimeSettings, type AppSettingsV1 } from '../../shared/app-settings'
import { upstreamOpenAiChatCompletionsUrl } from '../../shared/openai-compat-url'
import { isRetryableHttpStatus, RetryableHttpResponseError, withProviderRetry } from './provider-retry'

/**
 * The structured generation channel (§6.5): the main process calls the configured model directly,
 * asks for JSON and validates it with zod, with one repair attempt when validation fails.
 */
export type StructuredMessage = { role: 'system' | 'user'; content: string }

export type StructuredGenerationResult<T> =
  | { ok: true; value: T; repaired: boolean }
  | { ok: false; code: 'MISSING_API_KEY' | 'PROVIDER_ERROR' | 'INVALID_MODEL_OUTPUT'; message: string }

export type StructuredGenerationOptions = {
  fetcher?: typeof fetch
  timeoutMs?: number
  maxTokens?: number
  /** Shown to the teacher when the model does not answer in time. */
  timeoutMessage?: string
}

const DEFAULT_TIMEOUT_MS = 180_000

type ChatResponse = {
  choices?: Array<{ message?: { content?: string | Array<{ type?: string; text?: string }> } }>
}

function contentFromResponse(raw: string): string {
  const content = (JSON.parse(raw) as ChatResponse).choices?.[0]?.message?.content
  if (typeof content === 'string') return content
  return Array.isArray(content) ? content.map((part) => part.text ?? '').join('') : ''
}

export function parseJsonFromModel(content: string): unknown {
  const trimmed = content.trim()
  const candidate = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/iu)?.[1]?.trim() ?? trimmed
  try {
    return JSON.parse(candidate)
  } catch {
    const start = candidate.indexOf('{')
    const end = candidate.lastIndexOf('}')
    if (start < 0) throw new Error('模型没有返回 JSON。')
    if (end <= start) throw new Error('模型返回的 JSON 不完整。')
    return JSON.parse(candidate.slice(start, end + 1))
  }
}

async function callModel(
  settings: AppSettingsV1,
  messages: StructuredMessage[],
  options: StructuredGenerationOptions
): Promise<{ ok: true; content: string } | { ok: false; code: 'MISSING_API_KEY' | 'PROVIDER_ERROR'; message: string }> {
  const runtime = resolveKunRuntimeSettings(settings)
  if (!runtime.apiKey.trim()) {
    return { ok: false, code: 'MISSING_API_KEY', message: '请先在设置中配置模型 API Key。' }
  }
  const fetcher = options.fetcher ?? fetch
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  try {
    const { response, text } = await withProviderRetry(async () => {
      const response = await fetcher(upstreamOpenAiChatCompletionsUrl(runtime.baseUrl), {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${runtime.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: runtime.model,
          messages,
          temperature: 0.2,
          max_tokens: options.maxTokens ?? 8_000,
          response_format: { type: 'json_object' }
        }),
        signal: AbortSignal.timeout(timeoutMs)
      })
      const text = await response.text()
      if (!response.ok && isRetryableHttpStatus(response.status)) {
        throw new RetryableHttpResponseError(response.status, text)
      }
      return { response, text }
    })
    if (!response.ok) {
      return { ok: false, code: 'PROVIDER_ERROR', message: `模型请求失败（${response.status}）：${text.slice(0, 300)}` }
    }
    return { ok: true, content: contentFromResponse(text) }
  } catch (error) {
    const timedOut = (error instanceof DOMException && error.name === 'TimeoutError')
      || (error instanceof Error && /timed?\s*out|timeout/iu.test(error.message))
    return {
      ok: false,
      code: 'PROVIDER_ERROR',
      message: timedOut
        ? options.timeoutMessage ?? '模型长时间没有回应，请稍后重试。'
        : error instanceof RetryableHttpResponseError
          ? `模型请求失败（${error.status}）：${error.bodyText.slice(0, 300)}`
          : error instanceof Error ? error.message : String(error)
    }
  }
}

function describeIssues(error: unknown, schema: z.ZodType, value?: unknown): string {
  if (value !== undefined) {
    const parsed = schema.safeParse(value)
    if (!parsed.success) return parsed.error.issues.map((issue) => `${issue.path.join('.') || 'root'}: ${issue.message}`).join('\n')
  }
  return error instanceof Error ? error.message : String(error)
}

export async function requestStructuredJson<T>(
  settings: AppSettingsV1,
  schema: z.ZodType<T>,
  messages: StructuredMessage[],
  options: StructuredGenerationOptions = {}
): Promise<StructuredGenerationResult<T>> {
  const first = await callModel(settings, messages, options)
  if (!first.ok) return first

  let issues: string
  try {
    const value = parseJsonFromModel(first.content)
    const parsed = schema.safeParse(value)
    if (parsed.success) return { ok: true, value: parsed.data, repaired: false }
    issues = describeIssues(null, schema, value)
  } catch (error) {
    issues = describeIssues(error, schema)
  }

  const repair = await callModel(settings, [
    { role: 'system', content: '你是 JSON 修复器。只返回修复后的完整 JSON，不解释，不使用 Markdown 代码块。' },
    {
      role: 'user',
      content: ['以下 JSON 未通过数据校验。', '校验问题：', issues, '', '原始输出：', first.content, '', '请保留原意并补齐缺失字段，严格返回一个合法 JSON。'].join('\n')
    }
  ], options)
  if (!repair.ok) return repair
  try {
    const parsed = schema.safeParse(parseJsonFromModel(repair.content))
    if (parsed.success) return { ok: true, value: parsed.data, repaired: true }
    return { ok: false, code: 'INVALID_MODEL_OUTPUT', message: `模型返回的内容格式不对：${parsed.error.issues[0]?.message ?? '未知格式错误'}` }
  } catch (error) {
    return { ok: false, code: 'INVALID_MODEL_OUTPUT', message: `模型返回的内容格式不对：${error instanceof Error ? error.message : String(error)}` }
  }
}
