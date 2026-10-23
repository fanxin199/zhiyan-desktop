import { stat, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import type { AppSettingsV1 } from '../../shared/app-settings'
import type { ArtifactRecord } from '../../shared/artifact'
import {
  buildLessonPlanMarkdown,
  lessonPlanCreateInputSchema,
  lessonPlanContentSchema,
  lessonPlanTitle,
  plannedLessonMinutes,
  type LessonPlanCreateInput,
  type LessonPlanHeader
} from '../../shared/lesson-plan'
import { UNTRUSTED_MATERIAL_INSTRUCTION_ZH, wrapUntrustedPromptMaterial } from '../../shared/prompt-boundary'
import type { ArtifactRegistry } from './artifact-service'
import type { ArtifactVersionStore } from './artifact-version-service'
import { documentFileStem } from './document-service'
import { requestStructuredJson, type StructuredGenerationOptions } from './structured-generation'
import { canonicalPath, expandHomePath, resolveTargetPathWithinWorkspace } from './workspace-paths'


export type LessonPlanCreateOutcome =
  | { ok: true; path: string; artifact: ArtifactRecord; markdown: string }
  | { ok: false; code: 'MISSING_API_KEY' | 'PROVIDER_ERROR' | 'INVALID_MODEL_OUTPUT'; message: string }

type LessonPlanServiceOptions = {
  registry: Pick<ArtifactRegistry, 'register'>
  versions: Pick<ArtifactVersionStore, 'createVersion'>
  loadSettings: () => Promise<AppSettingsV1>
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
 * Writes a lesson plan on the structured generation channel (Task 2.2.1) and saves it as a lesson
 * plan artifact in the writing workspace. Teacher, school and department come from the profile.
 */
export class LessonPlanService {
  constructor(private readonly options: LessonPlanServiceOptions) {}

  async create(input: LessonPlanCreateInput): Promise<LessonPlanCreateOutcome> {
    const request = lessonPlanCreateInputSchema.parse(input)
    const settings = await this.options.loadSettings()
    const { fields } = request
    const workspaceRoot = await canonicalPath(resolve(expandHomePath(request.workspaceRoot)))
    const planned = plannedLessonMinutes(fields.hours)

    const generated = await requestStructuredJson(settings, lessonPlanContentSchema, [
      {
        role: 'system',
        content: [
          '你是高校教学辅助 AI，为大学教师编写规范教案。',
          '教学内容只能来自老师的要求和材料；从中提炼核心知识点，用教学语言重新组织，不要照搬原文。',
          '教学目的：知识层面 3-5 条，每条一句话；拓展层面 0-2 条。重点 2-3 条，难点 1-2 条，各用短句。',
          '教学过程按环节写（如导入、新课讲授的各知识模块、课堂讨论、小结与作业），每个环节写清教学内容和师生活动，不写详细讲稿。',
          planned ? `各环节分钟数之和必须等于 ${planned} 分钟。` : '各环节分钟数按内容量合理分配。',
          '整份教案 1500-2500 字。不要编造参考文献。',
          UNTRUSTED_MATERIAL_INSTRUCTION_ZH,
          '只返回 JSON：{"objectives": {"knowledge": ["..."], "extension": ["..."]}, "keyPoints": ["..."], "difficulties": ["..."],',
          '"learnerAnalysis": "...", "methods": "...", "teachingAids": "...", "means": "...",',
          '"process": [{"title": "导入", "minutes": 5, "content": "Markdown"}], "advances": "...", "improvement": "..."}'
        ].join('\n')
      },
      {
        role: 'user',
        content: [
          `课程：${fields.courseName || '（从材料推断）'}`,
          `章节：${fields.topic || '（从材料推断）'}`,
          `授课对象：${fields.audience || '本科生'}；专业：${fields.major || '（未说明）'}`,
          `计划学时：${fields.hours || '（按内容量设定）'}`,
          `教学方法偏好：${fields.methods || '讲授法'}`,
          `拓展侧重点：${fields.focus || '无'}`,
          `老师的要求：${request.instruction || '（无）'}`,
          ...request.materials.map((material) => `\n${wrapUntrustedPromptMaterial(material.text, material.name)}`)
        ].join('\n')
      }
    ], { maxTokens: 8_000, timeoutMessage: '写教案超过 3 分钟，请稍后重试，或减少材料。', ...this.options.generation })
    if (!generated.ok) return generated

    const { teacherProfile } = settings
    const header: LessonPlanHeader = {
      courseName: fields.courseName,
      topic: fields.topic,
      hours: fields.hours,
      audience: fields.audience,
      major: fields.major,
      teacher: teacherProfile.name.trim(),
      school: teacherProfile.school.trim(),
      department: teacherProfile.department.trim()
    }
    const markdown = buildLessonPlanMarkdown(header, generated.value)
    const title = `${lessonPlanTitle(header)} 教案`

    const stem = documentFileStem(title)
    let path = join(workspaceRoot, `${stem}.md`)
    for (let copy = 2; await exists(path); copy += 1) path = join(workspaceRoot, `${stem} (${copy}).md`)
    path = await resolveTargetPathWithinWorkspace(path, workspaceRoot)
    await writeFile(path, markdown, { encoding: 'utf8', flag: 'wx' })

    const artifact = await this.options.registry.register({
      kind: 'lesson-plan',
      title,
      toolId: 'syllabus',
      workspaceRoot,
      storage: { type: 'file', path },
      stage: '初稿'
    })
    await this.options.versions.createVersion({
      id: artifact.id,
      source: 'ai-generate',
      summary: '生成教案',
      instruction: request.instruction || undefined
    })
    return { ok: true, path, artifact, markdown }
  }
}
