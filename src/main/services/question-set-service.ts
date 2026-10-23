import { stat, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import type { AppSettingsV1 } from '../../shared/app-settings'
import type { ArtifactRecord } from '../../shared/artifact'
import { UNTRUSTED_MATERIAL_INSTRUCTION_ZH, wrapUntrustedPromptMaterial } from '../../shared/prompt-boundary'
import {
  buildQuestionSetMarkdown,
  invalidQuestionIndexes,
  questionSetContentSchema,
  questionSetCreateInputSchema,
  type QuestionSetCreateInput
} from '../../shared/question-set'
import type { ArtifactRegistry } from './artifact-service'
import type { ArtifactVersionStore } from './artifact-version-service'
import { documentFileStem } from './document-service'
import { projectPlacement } from './project-placement'
import { requestStructuredJson, type StructuredGenerationOptions } from './structured-generation'
import { canonicalPath, expandHomePath, resolveTargetPathWithinWorkspace } from './workspace-paths'

export type QuestionSetCreateOutcome =
  | { ok: true; path: string; artifact: ArtifactRecord; markdown: string; dropped: number }
  | { ok: false; code: 'MISSING_API_KEY' | 'PROVIDER_ERROR' | 'INVALID_MODEL_OUTPUT'; message: string }

type QuestionSetServiceOptions = {
  registry: Pick<ArtifactRegistry, 'register'>
  versions: Pick<ArtifactVersionStore, 'createVersion'>
  loadSettings: () => Promise<AppSettingsV1>
  /** The built-in assessment-designer skill's rules, whose question standards are followed. */
  loadSkillGuide: () => Promise<string>
  generation?: StructuredGenerationOptions
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

/**
 * Writes 随堂题 (Task 3.4.2) on the structured generation channel by the rules of the built-in
 * assessment-designer skill, and saves them as a question-set artifact. Short-answer and essay
 * questions whose points do not add up to 5 and 10 are left out rather than shown wrong.
 */
export class QuestionSetService {
  constructor(private readonly options: QuestionSetServiceOptions) {}

  async create(input: QuestionSetCreateInput): Promise<QuestionSetCreateOutcome> {
    const request = questionSetCreateInputSchema.parse(input)
    const settings = await this.options.loadSettings()
    const workspaceRoot = await canonicalPath(resolve(expandHomePath(request.workspaceRoot)))
    const placement = await projectPlacement(settings, request.projectId, workspaceRoot, 'quiz')
    const guide = await this.options.loadSkillGuide().catch(() => '')
    const { fields } = request

    const generated = await requestStructuredJson(settings, questionSetContentSchema, [
      {
        role: 'system',
        content: [
          '你是高校生物医学课程的命题助手。严格按下面的命题规范出题，题目与答案只能依据老师的要求和材料。',
          guide ? wrapUntrustedPromptMaterial(guide.slice(0, 8_000), '命题规范（assessment-designer）') : '',
          '单项选择题给 5 个选项（不带 A/B 等字母前缀），answer 为正确选项字母；简答题评分点合计 5 分、论述题合计 10 分，每个评分点 1 或 2 分。',
          UNTRUSTED_MATERIAL_INSTRUCTION_ZH,
          '只返回 JSON：{"title": "...", "questions": [{"type": "single", "stem": "...", "options": ["...", "...", "...", "...", "..."], "answer": "B",',
          '"explanation": "...", "objective": "...", "difficulty": "中等"}, {"type": "short", "stem": "...", "points": [{"point": "...", "score": 2}], "objective": "...", "difficulty": "基础"}]}'
        ].filter(Boolean).join('\n')
      },
      {
        role: 'user',
        content: [
          ...(placement.block ? [placement.block, ''] : []),
          `出题范围：${fields.topic || '（从材料判断）'}`,
          `题量：${fields.count || '10 道'}；题型：${fields.types || '单项选择题和简答题'}`,
          `对象：${fields.audience || '本科生'}；难度：${fields.difficulty || '中等'}`,
          `老师的要求：${request.instruction || '（无）'}`,
          ...request.materials.map((material) => `\n${wrapUntrustedPromptMaterial(material.text, material.name)}`)
        ].join('\n')
      }
    ], { maxTokens: 10_000, timeoutMessage: '出题超过 3 分钟，请减少题量或材料后重试。', ...this.options.generation })
    if (!generated.ok) return generated

    const invalid = new Set(invalidQuestionIndexes(generated.value))
    const content = { ...generated.value, questions: generated.value.questions.filter((_, index) => !invalid.has(index)) }
    if (content.questions.length === 0) {
      return { ok: false, code: 'INVALID_MODEL_OUTPUT', message: '生成的题目评分标准不符合要求，请重试。' }
    }
    const markdown = buildQuestionSetMarkdown(content)
    const title = content.title.endsWith('题') ? content.title : `${content.title} 随堂题`

    const stem = documentFileStem(title)
    let path = join(placement.directory, `${stem}.md`)
    for (let copy = 2; await exists(path); copy += 1) path = join(placement.directory, `${stem} (${copy}).md`)
    path = await resolveTargetPathWithinWorkspace(path, workspaceRoot)
    await writeFile(path, markdown, { encoding: 'utf8', flag: 'wx' })

    const artifact = await this.options.registry.register({
      kind: 'question-set',
      title,
      toolId: 'quiz',
      workspaceRoot,
      storage: { type: 'file', path },
      stage: `${content.questions.length} 道题`,
      projectId: placement.project?.id ?? null
    })
    await this.options.versions.createVersion({
      id: artifact.id,
      source: 'ai-generate',
      summary: '生成随堂题',
      instruction: request.instruction || undefined
    })
    return { ok: true, path, artifact, markdown, dropped: invalid.size }
  }
}
