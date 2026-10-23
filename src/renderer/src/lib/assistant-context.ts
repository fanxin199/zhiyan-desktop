/** What the AI assistant knows about where the teacher is when they ask (Task 1.5.1). */
export type AssistantPageContext = {
  /** Sidebar name of the current page, e.g. “文稿”. */
  page: string
  /** The open artifact, e.g. the document being edited. */
  artifact?: { kind: string; title: string }
}

export function describeAssistantContext(context: AssistantPageContext): string {
  return context.artifact ? `${context.page} · ${context.artifact.title}` : context.page
}

/**
 * The prompt sent for an assistant message: the page and open artifact first, then the teacher's
 * words. The conversation shows only the teacher's words.
 */
export function buildAssistantPrompt(text: string, context: AssistantPageContext): string {
  const lines = [`[老师当前所在页面] ${context.page}`]
  if (context.artifact) lines.push(`[正在处理的${context.artifact.kind}] ${context.artifact.title}`)
  lines.push('如果老师的问题与当前页面或正在处理的内容有关，请结合它回答。', '', text.trim())
  return lines.join('\n')
}
