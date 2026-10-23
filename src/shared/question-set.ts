import { z } from 'zod'

/**
 * 随堂题 (Task 3.4.2): single-choice, short-answer and essay questions with answers and
 * explanations, written by the rules of the built-in assessment-designer skill and saved as a
 * Markdown document with one section per question, so each can be changed on its own.
 */
export const questionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('single'),
    stem: z.string().trim().min(1),
    options: z.array(z.string().trim().min(1)).length(5),
    answer: z.enum(['A', 'B', 'C', 'D', 'E']),
    explanation: z.string().trim().min(1),
    objective: z.string().trim().default(''),
    difficulty: z.enum(['基础', '中等', '较难']).default('中等')
  }),
  z.object({
    type: z.enum(['short', 'essay']),
    stem: z.string().trim().min(1),
    points: z.array(z.object({ point: z.string().trim().min(1), score: z.number().int().min(1).max(2) })).min(3).max(8),
    objective: z.string().trim().default(''),
    difficulty: z.enum(['基础', '中等', '较难']).default('中等')
  })
])

export const questionSetContentSchema = z.object({
  title: z.string().trim().min(1).max(120),
  questions: z.array(questionSchema).min(1).max(40)
})

export type Question = z.infer<typeof questionSchema>
export type QuestionSetContent = z.infer<typeof questionSetContentSchema>

export const questionSetCreateInputSchema = z.object({
  workspaceRoot: z.string().trim().min(1).max(4_096),
  /** The key points (Task 2.1), by key. */
  fields: z.record(z.string().trim().min(1).max(40), z.string().max(2_000)).default({}),
  instruction: z.string().trim().max(4_000).default(''),
  materials: z.array(z.object({
    name: z.string().trim().min(1).max(500),
    text: z.string().max(200_000)
  }).strict()).max(10).default([]),
  projectId: z.string().trim().min(1).max(160).optional()
}).strict()

export type QuestionSetCreateInput = z.input<typeof questionSetCreateInputSchema>

/** Short answers total 5 points and essays 10, as the skill requires. */
export const QUESTION_TOTALS = { short: 5, essay: 10 } as const

/** Questions whose points do not add up to the required total; they are left out. */
export function invalidQuestionIndexes(content: QuestionSetContent): number[] {
  return content.questions.flatMap((question, index) => {
    if (question.type === 'single') return []
    const total = question.points.reduce((sum, point) => sum + point.score, 0)
    return total === QUESTION_TOTALS[question.type] ? [] : [index]
  })
}

const SECTION_TITLES: Record<Question['type'], string> = { single: '单项选择题', short: '简答题', essay: '论述题' }
const ORDINALS = ['一', '二', '三']

export function buildQuestionSetMarkdown(content: QuestionSetContent): string {
  const lines = [`# ${content.title}`, '']
  let part = 0
  for (const type of ['single', 'short', 'essay'] as const) {
    const questions = content.questions.filter((question) => question.type === type)
    if (questions.length === 0) continue
    lines.push(`## ${ORDINALS[part++]}、${SECTION_TITLES[type]}`, '')
    questions.forEach((question, index) => {
      if (question.type === 'single') {
        lines.push(
          `### ${index + 1}. ${question.stem}`, '',
          ...question.options.map((option, optionIndex) => `${'ABCDE'[optionIndex]}. ${option}`), '',
          `**正确答案**：${question.answer}`, '',
          `**解析**：${question.explanation}`, ''
        )
      } else {
        lines.push(`### ${index + 1}. ${question.stem}（${QUESTION_TOTALS[question.type]} 分）`, '', '**答案与评分标准**：', '')
        question.points.forEach((point, pointIndex) => lines.push(`${pointIndex + 1}. ${point.point}（${point.score} 分）`))
        lines.push('')
      }
      const meta = [question.objective ? `考查目标：${question.objective}` : '', `难度：${question.difficulty}`].filter(Boolean)
      lines.push(meta.join('；'), '')
    })
  }
  return lines.join('\n')
}
