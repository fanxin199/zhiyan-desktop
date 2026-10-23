import type { DocumentTemplateId } from '@shared/document-templates'

/**
 * Requests for a deliverable are better served by the tool that makes it than by a long answer in
 * the AI assistant (Task 1.5.2): the assistant opens the tool with the teacher's words filled in.
 */
export type ToolModuleId = 'syllabus' | 'ppt-gen' | 'textbook' | 'write' | 'literature' | 'bioinformatics'

export type ToolRequest = {
  moduleId: ToolModuleId
  /** For 文稿: the template to preselect. */
  template?: DocumentTemplateId
  /** Teacher-readable tool name, e.g. “教案”. */
  label: string
}

/** Text a tool page puts into its input box; a new id fills it again. */
export type ToolPrefill = { id: number; text: string }

// Asking to produce something, as opposed to asking what something is.
const MAKE = /(写|做|生成|设计|准备|撰写|起草|搭|制作|编写|出一份|拟|整理成|帮我弄)/u
const READ = /(精读|解读|读一下|读读|读这篇|阅读|总结这篇|拆解)/u
const ANALYSE = /(分析|画|作图|统计|富集)/u

type Rule = { test: (text: string) => boolean; request: ToolRequest }

const RULES: Rule[] = [
  { test: (text) => /(教案|教学设计)/u.test(text) && MAKE.test(text), request: { moduleId: 'syllabus', label: '教案' } },
  { test: (text) => /(课件|PPT|ppt|幻灯片)/u.test(text) && MAKE.test(text), request: { moduleId: 'ppt-gen', label: '课件' } },
  { test: (text) => /(教材|讲义)/u.test(text) && MAKE.test(text), request: { moduleId: 'textbook', label: '教材' } },
  { test: (text) => /(国自然|自然基金|基金申请|申请书|标书)/u.test(text) && MAKE.test(text), request: { moduleId: 'write', template: 'grant', label: '文稿 · 国自然' } },
  { test: (text) => /综述/u.test(text) && MAKE.test(text), request: { moduleId: 'write', template: 'review', label: '文稿 · 综述' } },
  { test: (text) => /(文献|论文|这篇|PDF|pdf)/u.test(text) && READ.test(text), request: { moduleId: 'literature', label: '文献' } },
  { test: (text) => /(论文|Discussion|Introduction|Results|摘要)/u.test(text) && MAKE.test(text), request: { moduleId: 'write', template: 'paper', label: '文稿 · 论文' } },
  {
    test: (text) => /(火山图|热图|单细胞|转录组|差异基因|差异表达|表达矩阵|UMAP|GO|KEGG|富集)/u.test(text) && (ANALYSE.test(text) || MAKE.test(text)),
    request: { moduleId: 'bioinformatics', label: '数据分析' }
  },
  {
    test: (text) => /(总结|通知|纪要|须知|计划书|工作报告|述职|讲话稿|发言稿|邮件|文稿)/u.test(text) && MAKE.test(text),
    request: { moduleId: 'write', template: 'blank', label: '文稿' }
  }
]

export function detectToolRequest(text: string): ToolRequest | null {
  const trimmed = text.trim()
  // Questions about a tool or a topic stay in the conversation.
  if (!trimmed || /^(什么是|为什么|怎么|如何|是否|能不能|可以吗)/u.test(trimmed) || /[吗？?]$/u.test(trimmed)) return null
  return RULES.find((rule) => rule.test(trimmed))?.request ?? null
}
