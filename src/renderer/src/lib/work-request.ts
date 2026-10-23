import type { ToolModuleId } from './tool-request'

export type QueuedWork = {
  moduleId: ToolModuleId
  /** Teacher-readable deliverable, such as “教案”. */
  label: string
  /** The teacher's sentence, narrowed to this deliverable. */
  text: string
  template?: 'paper' | 'review' | 'grant'
}

type Deliverable = { pattern: RegExp; moduleId: ToolModuleId; label: string; template?: QueuedWork['template'] }

const DELIVERABLES: Deliverable[] = [
  { pattern: /教案|教学设计/u, moduleId: 'syllabus', label: '教案' },
  { pattern: /课件|PPT|ppt|幻灯片/u, moduleId: 'ppt-gen', label: '课件' },
  { pattern: /随堂题|选择题|简答题|论述题|练习题|测验题|\d+\s*道题?/u, moduleId: 'quiz', label: '随堂题' },
  { pattern: /教材/u, moduleId: 'textbook', label: '教材章节' },
  { pattern: /综述/u, moduleId: 'write', label: '综述', template: 'review' },
  { pattern: /国自然|基金申请|申请书/u, moduleId: 'write', label: '基金申请书', template: 'grant' }
]

const MAKE = /(做|写|出|准备|生成|编写|起草|弄|整|配)/u

/**
 * “第八章做教案、课件和 10 道选择题”: a request for several deliverables at once, split into one
 * piece of work per deliverable that all share the teacher's sentence (Task 3.5.1). Fewer than two
 * deliverables is not such a request.
 */
export function splitWorkRequest(sentence: string): QueuedWork[] {
  const text = sentence.trim()
  if (!MAKE.test(text)) return []
  const found = DELIVERABLES.filter((deliverable) => deliverable.pattern.test(text))
  if (found.length < 2) return []
  return found.map((deliverable) => ({
    moduleId: deliverable.moduleId,
    label: deliverable.label,
    text: `${text}\n（这一项只做：${deliverable.label}）`,
    ...(deliverable.template ? { template: deliverable.template } : {})
  }))
}
