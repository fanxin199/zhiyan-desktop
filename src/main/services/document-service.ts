import { stat, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { z } from 'zod'
import type { AppSettingsV1 } from '../../shared/app-settings'
import type { ArtifactRecord } from '../../shared/artifact'
import {
  DOCUMENT_TEMPLATES,
  documentCreateInputSchema,
  type DocumentCreateInput
} from '../../shared/document-templates'
import { UNTRUSTED_MATERIAL_INSTRUCTION_ZH, wrapUntrustedPromptMaterial } from '../../shared/prompt-boundary'
import type { ArtifactRegistry } from './artifact-service'
import type { ArtifactVersionStore } from './artifact-version-service'
import { projectPlacement } from './project-placement'
import { requestStructuredJson, type StructuredGenerationOptions } from './structured-generation'
import { canonicalPath, expandHomePath, resolveTargetPathWithinWorkspace } from './workspace-paths'

export const UNTITLED_DOCUMENT_TITLE = '未命名文稿'

const draftSchema = z.object({
  title: z.string().trim().min(1).max(80),
  markdown: z.string().trim().min(1)
})

export type DocumentCreateOutcome =
  | { ok: true; path: string; artifact: ArtifactRecord }
  | { ok: false; code: 'MISSING_API_KEY' | 'PROVIDER_ERROR' | 'INVALID_MODEL_OUTPUT'; message: string }

type DocumentServiceOptions = {
  registry: Pick<ArtifactRegistry, 'register'>
  versions: Pick<ArtifactVersionStore, 'createVersion'>
  loadSettings: () => Promise<AppSettingsV1>
  generation?: StructuredGenerationOptions
}

/** A file name from a document title: no characters Windows forbids, at most 60 characters. */
export function documentFileStem(title: string): string {
  const stem = [...title]
    .map((character) => (character.charCodeAt(0) < 32 ? ' ' : character))
    .join('')
    .replace(/[<>:"/\\|?*]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
    .replace(/[. ]+$/u, '')
    .slice(0, 60)
    .trim()
  return stem || UNTITLED_DOCUMENT_TITLE
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

function withTitleHeading(title: string, markdown: string): string {
  const body = markdown.trim()
  return /^#[ \t]/u.test(body) ? `${body}\n` : `# ${title}\n\n${body}\n`
}

/**
 * Creates a 文稿 from one sentence: the AI writes the template's first draft (a blueprint for papers,
 * reviews and grants), which is saved as a new Markdown file in the writing workspace, registered
 * as an artifact and kept as its first version. Without a sentence or materials the document starts
 * empty and the model is not called.
 */
export class DocumentService {
  constructor(private readonly options: DocumentServiceOptions) {}

  async create(input: DocumentCreateInput): Promise<DocumentCreateOutcome> {
    const request = documentCreateInputSchema.parse(input)
    const template = DOCUMENT_TEMPLATES[request.template]
    const workspaceRoot = await canonicalPath(resolve(expandHomePath(request.workspaceRoot)))
    const settings = await this.options.loadSettings()
    const placement = await projectPlacement(settings, request.projectId, workspaceRoot)

    let title = UNTITLED_DOCUMENT_TITLE
    let markdown = `# ${UNTITLED_DOCUMENT_TITLE}\n\n`
    const wantsDraft = request.instruction.length > 0 || request.materials.length > 0
    if (wantsDraft) {
      const generated = await requestStructuredJson(settings, draftSchema, [
        {
          role: 'system',
          content: [
            `你是高校教师的写作助手，正在写一份“${template.label}”类文稿。`,
            template.draftInstruction,
            ...template.constraints,
            UNTRUSTED_MATERIAL_INSTRUCTION_ZH,
            '只返回 JSON：{"title": "文稿题目，不超过 30 字", "markdown": "完整的 Markdown 正文"}。'
          ].join('\n')
        },
        {
          role: 'user',
          content: [
            ...(placement.block ? [placement.block, ''] : []),
            `老师的要求：${request.instruction || '根据下面的材料写作'}`,
            ...request.materials.map((material) => `\n${wrapUntrustedPromptMaterial(material.text, material.name)}`)
          ].join('\n')
        }
      ], { maxTokens: 12_000, timeoutMessage: '写初稿超过 3 分钟，请把要求写得更具体一些，或减少材料后重试。', ...this.options.generation })
      if (!generated.ok) return generated
      title = generated.value.title
      markdown = withTitleHeading(title, generated.value.markdown)
    }

    const stem = documentFileStem(title)
    let path = join(placement.directory, `${stem}.md`)
    for (let copy = 2; await exists(path); copy += 1) path = join(placement.directory, `${stem} (${copy}).md`)
    path = await resolveTargetPathWithinWorkspace(path, workspaceRoot)
    await writeFile(path, markdown, { encoding: 'utf8', flag: 'wx' })

    const artifact = await this.options.registry.register({
      kind: 'document',
      title,
      toolId: 'write',
      workspaceRoot,
      storage: { type: 'file', path },
      stage: wantsDraft ? template.draftStage : '空白文稿',
      projectId: placement.project?.id ?? null
    })
    await this.options.versions.createVersion(wantsDraft
      ? { id: artifact.id, source: 'ai-generate', summary: `生成${template.draftStage}`, instruction: request.instruction || undefined }
      : { id: artifact.id, source: 'teacher-edit', summary: '新建文稿' })
    return { ok: true, path, artifact }
  }
}
