import { readFile, rename, writeFile } from 'node:fs/promises'
import { z } from 'zod'
import type { AppSettingsV1 } from '../../shared/app-settings'
import {
  revisionRequestSchema,
  splitMarkdownSections,
  type MarkdownSection,
  type RevisionOutcome,
  type RevisionRequest,
  type RevisionScope
} from '../../shared/artifact-revision'
import { UNTRUSTED_MATERIAL_INSTRUCTION_ZH, wrapUntrustedPromptMaterial } from '../../shared/prompt-boundary'
import type { ArtifactRegistry } from './artifact-service'
import type { ArtifactVersionStore } from './artifact-version-service'
import { requestStructuredJson, type StructuredGenerationOptions } from './structured-generation'
import { resolveTargetPathWithinWorkspace } from './workspace-paths'

const MAX_CONTEXT_CHARS = 60_000

const revisionOutputSchema = z.object({
  summary: z.string().trim().min(1).max(200),
  revised: z.string()
})

type ResolvedScope = { start: number; end: number; ref: string; section?: MarkdownSection }

type ArtifactRevisionServiceOptions = {
  registry: Pick<ArtifactRegistry, 'get'>
  versions: Pick<ArtifactVersionStore, 'createVersion'>
  loadSettings: () => Promise<AppSettingsV1>
  generation?: StructuredGenerationOptions
}

function invalidScope(message: string): RevisionOutcome {
  return { ok: false, code: 'INVALID_SCOPE', message }
}

/** Finds the part of the text the teacher chose, checking it is still there after later edits. */
export function resolveRevisionScope(text: string, scope: RevisionScope): ResolvedScope | { error: string } {
  if (scope.type === 'whole') return { start: 0, end: text.length, ref: '全文' }
  if (scope.type === 'section') {
    const sections = splitMarkdownSections(text)
    let section = sections.find((candidate) => candidate.id === scope.sectionId)
    if (section && scope.title && section.title !== scope.title) {
      // The teacher added or removed a heading after asking; find the section by its title instead.
      const sameTitle = sections.filter((candidate) => candidate.title === scope.title)
      section = sameTitle.length === 1 ? sameTitle[0] : undefined
    }
    if (!section) return { error: '找不到要修改的那一节，可能已被改动，请重新选择。' }
    return { start: section.start, end: section.end, ref: section.title, section }
  }
  if (scope.type === 'selection') {
    if (scope.from >= scope.to || scope.to > text.length) return { error: '选中的范围无效，请重新选择。' }
    if (scope.text !== undefined && text.slice(scope.from, scope.to) !== scope.text) {
      const first = text.indexOf(scope.text)
      if (!scope.text || first < 0 || text.indexOf(scope.text, first + 1) >= 0) {
        return { error: '选中的文字已被改动，请重新选择。' }
      }
      return { start: first, end: first + scope.text.length, ref: '选中的文字' }
    }
    return { start: scope.from, end: scope.to, ref: '选中的文字' }
  }
  return { error: '这类成果的修改请在对应页面中进行。' }
}

/**
 * Keeps a section revision inside its section: the original heading stays when the AI drops it, and
 * anything from the next heading of the same or a higher level on is discarded.
 */
export function confineSectionRevision(
  revised: string,
  section: MarkdownSection,
  originalHeadingLine: string
): { text: string; discarded: boolean } {
  let text = revised.replace(/^\s*\n/u, '')
  if (!new RegExp(`^#{${section.level}}[ \\t]`, 'u').test(text)) text = `${originalHeadingLine}\n${text}`
  const nested = splitMarkdownSections(text)
  const outside = nested.slice(1).find((candidate) => candidate.level <= section.level)
  if (!outside) return { text, discarded: false }
  return { text: text.slice(0, outside.start), discarded: true }
}

/** Keeps the blank lines that separated the chosen part from what follows it. */
function keepTrailingWhitespace(original: string, revised: string): string {
  return `${revised.replace(/\s+$/u, '')}${/\s*$/u.exec(original)?.[0] ?? ''}`
}

function clipContext(text: string, start: number, end: number): string {
  if (text.length <= MAX_CONTEXT_CHARS) return text
  const half = Math.floor((MAX_CONTEXT_CHARS - (end - start)) / 2)
  const from = Math.max(0, start - Math.max(half, 0))
  return `${from > 0 ? '……（前文省略）\n' : ''}${text.slice(from, from + MAX_CONTEXT_CHARS)}\n……（后文省略）`
}

/**
 * “说一句就改” for text artifacts. The content as it is now is saved as a version first, so 撤销 can
 * go back to it; the AI only rewrites the chosen part, which is spliced back so text outside it,
 * including the teacher's own edits, is never touched; the result is saved as an ai-revise version.
 */
export class ArtifactRevisionService {
  constructor(private readonly options: ArtifactRevisionServiceOptions) {}

  async revise(input: RevisionRequest): Promise<RevisionOutcome> {
    const request = revisionRequestSchema.parse(input)
    const artifact = await this.options.registry.get(request.artifactId)
    if (!artifact) throw new Error('找不到这个成果，可能已被移除。')
    if (artifact.storage.type !== 'file' || request.scope.type === 'slide' || request.scope.type === 'figure') {
      return { ok: false, code: 'UNSUPPORTED_SCOPE', message: '课件和图表的修改请在课件或分析页面中进行。' }
    }
    const path = await resolveTargetPathWithinWorkspace(artifact.storage.path, artifact.workspaceRoot)
    let text: string
    try {
      text = await readFile(path, 'utf8')
    } catch {
      throw new Error('成果文件已被移走或删除，无法修改。')
    }

    const scope = resolveRevisionScope(text, request.scope)
    if ('error' in scope) return invalidScope(scope.error)

    // The undo point: whatever the artifact holds now, including edits made after the teacher asked.
    const before = await this.options.versions.createVersion({
      id: artifact.id,
      source: 'teacher-edit',
      summary: '修改前的内容'
    })

    const original = text.slice(scope.start, scope.end)
    const generated = await requestStructuredJson(await this.options.loadSettings(), revisionOutputSchema, [
      {
        role: 'system',
        content: [
          '你是高校教师的文稿修改助手。按老师的要求只改写“要修改的部分”，其余内容不在你的修改范围内。',
          '保持原有的 Markdown 结构和标题层级；不编造实验结果、数据或文献；不确定的事实保留原文。',
          UNTRUSTED_MATERIAL_INSTRUCTION_ZH,
          '只返回 JSON：{"summary": "一句话说明改了什么，不超过 30 字", "revised": "改写后的“要修改的部分”全文"}。'
        ].join('\n')
      },
      {
        role: 'user',
        content: [
          `老师的要求：${request.instruction}`,
          '',
          '全文（供理解上下文，不要改写范围外的内容）：',
          wrapUntrustedPromptMaterial(clipContext(text, scope.start, scope.end), artifact.title),
          '',
          `要修改的部分（${scope.ref}）：`,
          wrapUntrustedPromptMaterial(original, scope.ref)
        ].join('\n')
      }
    ], this.options.generation)
    if (!generated.ok) return generated

    let revised = generated.value.revised
    let discardedOutsideScope = false
    if (scope.section) {
      const headingLine = original.split('\n')[0]
      const confined = confineSectionRevision(revised, scope.section, headingLine)
      revised = confined.text
      discardedOutsideScope = confined.discarded
    }
    revised = keepTrailingWhitespace(original, revised)

    const rebased = before.version !== request.baseVersion
    if (revised === original) {
      return {
        ok: true,
        value: {
          newVersion: before.version,
          undoVersion: before.version,
          summary: '没有需要修改的地方',
          changes: [],
          rebased,
          discardedOutsideScope
        }
      }
    }

    const next = `${text.slice(0, scope.start)}${revised}${text.slice(scope.end)}`
    const temporaryPath = `${path}.${process.pid}.tmp`
    await writeFile(temporaryPath, next, 'utf8')
    await rename(temporaryPath, path)
    const saved = await this.options.versions.createVersion({
      id: artifact.id,
      source: 'ai-revise',
      summary: generated.value.summary,
      instruction: request.instruction
    })
    return {
      ok: true,
      value: {
        newVersion: saved.version,
        undoVersion: before.version,
        summary: generated.value.summary,
        changes: [{ ref: scope.ref, before: original, after: revised }],
        rebased,
        discardedOutsideScope
      }
    }
  }
}
