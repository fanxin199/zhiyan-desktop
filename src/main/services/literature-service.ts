import { stat, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import type { AppSettingsV1 } from '../../shared/app-settings'
import type { ArtifactRecord } from '../../shared/artifact'
import {
  buildEvidenceTableMarkdown,
  buildLiteratureReportMarkdown,
  EVIDENCE_LEVEL_NOTE,
  evidenceTableContentSchema,
  literatureReportContentSchema,
  literatureReportInputSchema,
  paperIdentifier,
  type LiteratureReportInput
} from '../../shared/literature-report'
import { UNTRUSTED_MATERIAL_INSTRUCTION_ZH, wrapUntrustedPromptMaterial } from '../../shared/prompt-boundary'
import type { ArtifactRegistry } from './artifact-service'
import type { ArtifactVersionStore } from './artifact-version-service'
import { documentFileStem } from './document-service'
import { requestStructuredJson, type StructuredGenerationOptions } from './structured-generation'
import { canonicalPath, expandHomePath, resolveTargetPathWithinWorkspace } from './workspace-paths'

/** One paper is read in depth; with several, each gets a shorter excerpt. */
const SINGLE_PAPER_CHARS = 60_000
const PAPER_CHARS_IN_TABLE = 12_000

export type LiteratureReportOutcome =
  | { ok: true; path: string; artifact: ArtifactRecord; markdown: string }
  | { ok: false; code: 'MISSING_API_KEY' | 'PROVIDER_ERROR' | 'INVALID_MODEL_OUTPUT'; message: string }

type LiteratureServiceOptions = {
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
 * Writes a 文献报告 for one paper or an 证据表 for several (Tasks 2.5.1–2.5.2) on the structured
 * generation channel, and saves it in the writing workspace as a registered artifact.
 */
export class LiteratureService {
  constructor(private readonly options: LiteratureServiceOptions) {}

  async createReport(input: LiteratureReportInput): Promise<LiteratureReportOutcome> {
    const request = literatureReportInputSchema.parse(input)
    const settings = await this.options.loadSettings()
    const workspaceRoot = await canonicalPath(resolve(expandHomePath(request.workspaceRoot)))
    const single = request.papers.length === 1
    const materials = request.papers.map((paper) => wrapUntrustedPromptMaterial(
      paper.text.slice(0, single ? SINGLE_PAPER_CHARS : PAPER_CHARS_IN_TABLE),
      `${paper.name}${paperIdentifier(paper) ? `（${paperIdentifier(paper)}）` : ''}${paper.source === 'abstract' ? '，仅摘要' : ''}`
    ))
    const question = `老师的问题：${request.question || '（没有具体问题，按常规精读）'}`
    const options = { maxTokens: 8_000, timeoutMessage: '读文献超过 3 分钟，请稍后重试，或减少文献数量。', ...this.options.generation }

    let title: string
    let markdown: string
    if (single) {
      const paper = request.papers[0]
      const generated = await requestStructuredJson(settings, literatureReportContentSchema, [
        {
          role: 'system',
          content: [
            '你是生物医学科研助手，为高校教师精读一篇论文，写成文献报告。',
            '只依据提供的论文内容，不编造数据、图号或参考文献；原文没有的内容写“原文未说明”。',
            paper.source === 'fulltext'
              ? '逐图解读：按论文的图（Figure 1、2…，含关键分图）依次写出结果和它支持的结论。'
              : '只有摘要：figures 返回空数组，不要编造图。',
            '如果老师提了问题，在 answer 中直接回答，并指出依据；没有问题则 answer 留空。',
            '局限写 2-5 条，包括研究设计、样本、因果推断和外推方面的限制。',
            UNTRUSTED_MATERIAL_INSTRUCTION_ZH,
            '只返回 JSON：{"title": "论文题目", "citation": "作者, 期刊, 年份", "answer": "...", "researchQuestion": "...",',
            '"methods": "...", "figures": [{"label": "图 1", "finding": "...", "interpretation": "..."}], "conclusions": "...", "limitations": ["..."]}'
          ].join('\n')
        },
        { role: 'user', content: [question, ...materials].join('\n\n') }
      ], options)
      if (!generated.ok) return generated
      title = generated.value.title
      markdown = buildLiteratureReportMarkdown(generated.value, paper, request.question)
    } else {
      const generated = await requestStructuredJson(settings, evidenceTableContentSchema, [
        {
          role: 'system',
          content: [
            '你是生物医学科研助手，把多篇文献整理成证据表，供高校教师写综述或基金时使用。',
            '每篇文献一行，paper 字段必须原样使用材料标签中的文献名（括号前的部分）。',
            '只依据提供的内容，不编造样本量、效应量或结论；没有的写空字符串。',
            `证据等级只能是 高、中、低、很低 之一。${EVIDENCE_LEVEL_NOTE}`,
            'summary 按主题综合各研究的一致与分歧，不逐篇罗列；gaps 写尚缺的证据。',
            UNTRUSTED_MATERIAL_INSTRUCTION_ZH,
            '只返回 JSON：{"title": "...", "summary": "...", "rows": [{"paper": "...", "design": "...", "sample": "...", "finding": "...", "level": "中", "limitation": "..."}], "gaps": "..."}'
          ].join('\n')
        },
        { role: 'user', content: [question, ...materials].join('\n\n') }
      ], options)
      if (!generated.ok) return generated
      title = generated.value.title
      markdown = buildEvidenceTableMarkdown(generated.value, request.papers, request.question)
    }

    const kindLabel = single ? '文献报告' : '证据表'
    const stem = documentFileStem(`${title.slice(0, 40)} ${kindLabel}`)
    let path = join(workspaceRoot, `${stem}.md`)
    for (let copy = 2; await exists(path); copy += 1) path = join(workspaceRoot, `${stem} (${copy}).md`)
    path = await resolveTargetPathWithinWorkspace(path, workspaceRoot)
    await writeFile(path, markdown, { encoding: 'utf8', flag: 'wx' })

    const artifact = await this.options.registry.register({
      kind: single ? 'literature-report' : 'evidence-table',
      title: `${title} ${kindLabel}`.slice(0, 200),
      toolId: 'literature',
      workspaceRoot,
      storage: { type: 'file', path },
      stage: request.papers.some((paper) => paper.source === 'abstract') ? '部分仅依据摘要' : '已读全文'
    })
    await this.options.versions.createVersion({
      id: artifact.id,
      source: 'ai-generate',
      summary: `生成${kindLabel}`,
      instruction: request.question || undefined
    })
    return { ok: true, path, artifact, markdown }
  }
}
