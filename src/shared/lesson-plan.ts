import { z } from 'zod'
import { splitMarkdownSections } from './artifact-revision'

/**
 * Lesson plans (Task 2.2). The model writes the teaching content as JSON; the app turns it into a
 * Markdown document with one section per part and one subsection per teaching segment, so a
 * segment can be changed on its own (§6.2), versions work as for any document, and Word export
 * uses the writing workspace's exporter.
 */
export const LESSON_PROCESS_TITLE = '教学过程设计'

export const lessonPlanContentSchema = z.object({
  objectives: z.object({
    knowledge: z.array(z.string().trim().min(1)).min(1).max(6),
    extension: z.array(z.string().trim().min(1)).max(4).default([])
  }),
  keyPoints: z.array(z.string().trim().min(1)).min(1).max(5),
  difficulties: z.array(z.string().trim().min(1)).min(1).max(4),
  learnerAnalysis: z.string().trim().min(1),
  methods: z.string().trim().min(1),
  teachingAids: z.string().trim().default('计算机多媒体设备'),
  means: z.string().trim().default(''),
  process: z.array(z.object({
    title: z.string().trim().min(1).max(60),
    minutes: z.number().int().min(1).max(600),
    content: z.string().trim().min(1)
  })).min(2).max(12),
  advances: z.string().trim().default(''),
  improvement: z.string().trim().default('')
})

export type LessonPlanContent = z.infer<typeof lessonPlanContentSchema>

const field = z.string().trim().max(2_000).default('')

export const lessonPlanCreateInputSchema = z.object({
  workspaceRoot: z.string().trim().min(1).max(4_096),
  /** The key points (Task 2.1), by key. */
  fields: z.object({
    courseName: field,
    topic: field,
    audience: field,
    hours: field,
    methods: field,
    focus: field,
    major: field
  }).strict(),
  instruction: z.string().trim().max(4_000).default(''),
  materials: z.array(z.object({
    name: z.string().trim().min(1).max(255),
    text: z.string().max(200_000)
  }).strict()).max(10).default([])
}).strict()

export type LessonPlanCreateInput = z.input<typeof lessonPlanCreateInputSchema>

/** Course details that come from the key points and the teacher's profile, not from the model. */
export type LessonPlanHeader = {
  courseName: string
  topic: string
  hours: string
  audience: string
  major: string
  teacher: string
  school: string
  department: string
}

const CHINESE_ORDINALS = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二']

function cell(value: string): string {
  return value.replace(/\|/gu, '｜').replace(/\s*\n\s*/gu, ' ').trim() || '　'
}

function list(items: string[], numbered = false): string {
  return items.map((item, index) => `${numbered ? `${index + 1}.` : '-'} ${item}`).join('\n')
}

/** “一、导入（5 分钟）”: the minutes in a segment heading are what the timing check reads. */
export function lessonSegmentHeading(index: number, title: string, minutes: number): string {
  const plain = title.replace(/^[一二三四五六七八九十]+[、.．]\s*/u, '').replace(/（\s*\d+\s*分钟\s*）$/u, '').trim()
  return `### ${CHINESE_ORDINALS[index] ?? String(index + 1)}、${plain}（${minutes} 分钟）`
}

export function lessonPlanTitle(header: Pick<LessonPlanHeader, 'courseName' | 'topic'>): string {
  return [header.courseName.trim(), header.topic.trim()].filter(Boolean).join(' · ') || '教案'
}

export function buildLessonPlanMarkdown(header: LessonPlanHeader, content: LessonPlanContent): string {
  const lines = [
    `# ${lessonPlanTitle(header)} 教案`,
    '',
    `| 学科系 | ${cell(header.department)} | 授课教师 | ${cell(header.teacher)} |`,
    '| --- | --- | --- | --- |',
    `| 课程名称 | ${cell(header.courseName)} | 计划学时 | ${cell(header.hours)} |`,
    `| 授课题目 | ${cell(header.topic)} | 授课对象 | ${cell(header.audience)} |`,
    `| 专业 | ${cell(header.major)} | 学校 | ${cell(header.school)} |`,
    '',
    '## 教学目的与要求',
    '',
    '**知识层面**',
    '',
    list(content.objectives.knowledge, true),
    ...(content.objectives.extension.length > 0 ? ['', '**拓展层面**', '', list(content.objectives.extension)] : []),
    '',
    '## 教学重点与难点',
    '',
    '**重点**',
    '',
    list(content.keyPoints),
    '',
    '**难点**',
    '',
    list(content.difficulties),
    '',
    '## 教学对象分析',
    '',
    content.learnerAnalysis,
    '',
    '## 教学方法与组织',
    '',
    `- 教学方法：${content.methods}`,
    `- 教学用具：${content.teachingAids || '计算机多媒体设备'}`,
    ...(content.means ? [`- 教学手段：${content.means}`] : []),
    '',
    `## ${LESSON_PROCESS_TITLE}`,
    '',
    ...content.process.flatMap((segment, index) => [lessonSegmentHeading(index, segment.title, segment.minutes), '', segment.content, '']),
    ...(content.advances ? ['## 新进展内容', '', content.advances, ''] : []),
    ...(content.improvement ? ['## 教学改进', '', content.improvement, ''] : []),
    '## 教材和参考资料',
    '',
    '- 教材：',
    '- 参考资料：',
    ''
  ]
  return lines.join('\n')
}

/**
 * Minutes the plan should fill, from the 学时 the teacher gave: “90 分钟” → 90, “2 学时” → 90
 * (45 minutes each), “2 学时（每学时 50 分钟）” → 100. Null when it cannot be read.
 */
export function plannedLessonMinutes(hours: string): number | null {
  const text = hours.replace(/\s+/gu, '')
  const periods = /(\d+(?:\.\d+)?)学时/u.exec(text)
  const minutes = /(\d+)分钟/u.exec(text)
  if (minutes) {
    const value = Number(minutes[1])
    const perPeriod = /每学时|\/学时|每节/u.test(text)
    return periods && perPeriod ? Math.round(Number(periods[1]) * value) : value
  }
  if (periods) return Math.round(Number(periods[1]) * 45)
  return null
}

export type LessonSegmentTiming = { title: string; minutes: number; start: number; end: number }

const SEGMENT_MINUTES = /（\s*(\d+)\s*分钟\s*）\s*$/u

/** The teaching segments of 教学过程设计 with their minutes, as written in their headings. */
export function lessonSegmentTimings(markdown: string): LessonSegmentTiming[] {
  const sections = splitMarkdownSections(markdown)
  const process = sections.find((section) => section.title.trim() === LESSON_PROCESS_TITLE)
  if (!process) return []
  return sections
    .filter((section) => section.level === process.level + 1 && section.start > process.start && section.start < process.end)
    .flatMap((section) => {
      const match = SEGMENT_MINUTES.exec(section.title)
      return match ? [{ title: section.title, minutes: Number(match[1]), start: section.start, end: section.end }] : []
    })
}

export type LessonTimingCheck =
  | { status: 'ok' | 'unknown'; total: number; planned: number | null }
  | { status: 'mismatch'; total: number; planned: number }

/** Task 2.2.3: the segments' minutes should add up to the planned 学时. */
export function checkLessonTiming(markdown: string, hours: string): LessonTimingCheck {
  const total = lessonSegmentTimings(markdown).reduce((sum, segment) => sum + segment.minutes, 0)
  const planned = plannedLessonMinutes(hours)
  if (planned === null || total === 0) return { status: 'unknown', total, planned }
  return total === planned ? { status: 'ok', total, planned } : { status: 'mismatch', total, planned }
}

/**
 * Scales every segment so the total matches `planned`, keeping their proportions; rounding is
 * settled on the longest segment. Only the minutes in the headings change.
 */
export function adjustLessonTiming(markdown: string, planned: number): string {
  const segments = lessonSegmentTimings(markdown)
  const total = segments.reduce((sum, segment) => sum + segment.minutes, 0)
  if (segments.length === 0 || total === 0 || planned < segments.length) return markdown
  const scaled = segments.map((segment) => Math.max(1, Math.round(segment.minutes * planned / total)))
  const longest = scaled.indexOf(Math.max(...scaled))
  scaled[longest] += planned - scaled.reduce((sum, minutes) => sum + minutes, 0)
  let result = markdown
  // From the end, so earlier offsets stay valid.
  for (let index = segments.length - 1; index >= 0; index -= 1) {
    const segment = segments[index]
    const lineEnd = result.indexOf('\n', segment.start)
    const headingEnd = lineEnd < 0 ? result.length : lineEnd
    const heading = result.slice(segment.start, headingEnd)
    result = result.slice(0, segment.start) + heading.replace(SEGMENT_MINUTES, `（${scaled[index]} 分钟）`) + result.slice(headingEnd)
  }
  return result
}

/** The 计划学时 written in a lesson plan's header table. */
export function lessonPlanHours(markdown: string): string {
  return /\|\s*计划学时\s*\|\s*([^|\n]*?)\s*\|/u.exec(markdown)?.[1]?.replace(/^\u3000$/u, '') ?? ''
}

export type LessonPlanBlock = {
  /** The section's id from `splitMarkdownSections`, used as the revision scope. */
  sectionId: string
  title: string
  level: number
  /** Text between this heading and the next heading of any level. */
  body: string
}

/**
 * The canvas of a lesson plan (Task 2.2.2): one block per part and per teaching segment. The text
 * before the first part (title and header table) is returned as `intro`.
 */
export function lessonPlanBlocks(markdown: string): { intro: string; blocks: LessonPlanBlock[] } {
  const sections = splitMarkdownSections(markdown).filter((section) => section.level >= 2 && section.level <= 3)
  const headings = splitMarkdownSections(markdown)
  const bodyEnd = (start: number): number => headings.find((section) => section.start > start)?.start ?? markdown.length
  const firstPart = sections[0]?.start ?? markdown.length
  return {
    intro: markdown.slice(0, firstPart).replace(/^#[ \t].*\n?/u, '').trim(),
    blocks: sections.map((section) => {
      const headingEnd = markdown.indexOf('\n', section.start)
      const bodyStart = headingEnd < 0 ? markdown.length : headingEnd + 1
      return { sectionId: section.id, title: section.title, level: section.level, body: markdown.slice(bodyStart, bodyEnd(section.start)).trim() }
    })
  }
}
