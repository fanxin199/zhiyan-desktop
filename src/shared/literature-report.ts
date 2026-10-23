import { z } from 'zod'

/**
 * 文献 results (Task 2.5): one paper becomes a 文献报告 (research question, methods, figure by figure,
 * conclusions, limitations), several papers an 证据表 that keeps evidence levels and identifiers.
 * Both are sectioned Markdown documents, so they open, change and export like a lesson plan.
 */
export const literaturePaperSchema = z.object({
  /** File name, or the title found on PubMed. */
  name: z.string().trim().min(1).max(500),
  text: z.string().max(400_000),
  /** An abstract alone cannot support figure-by-figure reading. */
  source: z.enum(['fulltext', 'abstract']),
  pmid: z.string().trim().max(32).optional(),
  doi: z.string().trim().max(256).optional()
}).strict()

export const literatureReportInputSchema = z.object({
  workspaceRoot: z.string().trim().min(1).max(4_096),
  /** The teacher's question about the paper(s); may be empty. */
  question: z.string().trim().max(2_000).default(''),
  papers: z.array(literaturePaperSchema).min(1).max(10)
}).strict()

export type LiteraturePaper = z.infer<typeof literaturePaperSchema>
export type LiteratureReportInput = z.input<typeof literatureReportInputSchema>

export const literatureReportContentSchema = z.object({
  title: z.string().trim().min(1).max(300),
  /** Authors, journal and year as printed in the paper. */
  citation: z.string().trim().max(500).default(''),
  answer: z.string().trim().default(''),
  researchQuestion: z.string().trim().min(1),
  methods: z.string().trim().min(1),
  figures: z.array(z.object({
    label: z.string().trim().min(1).max(40),
    finding: z.string().trim().min(1),
    interpretation: z.string().trim().min(1)
  })).max(16).default([]),
  conclusions: z.string().trim().min(1),
  limitations: z.array(z.string().trim().min(1)).min(1).max(8)
})

export const EVIDENCE_LEVELS = ['高', '中', '低', '很低'] as const

export const evidenceTableContentSchema = z.object({
  title: z.string().trim().min(1).max(200),
  summary: z.string().trim().min(1),
  rows: z.array(z.object({
    /** Matches a paper's name as given. */
    paper: z.string().trim().min(1),
    design: z.string().trim().min(1),
    sample: z.string().trim().default(''),
    finding: z.string().trim().min(1),
    level: z.enum(EVIDENCE_LEVELS),
    limitation: z.string().trim().default('')
  })).min(1).max(10),
  gaps: z.string().trim().default('')
})

export type LiteratureReportContent = z.infer<typeof literatureReportContentSchema>
export type EvidenceTableContent = z.infer<typeof evidenceTableContentSchema>

export const EVIDENCE_LEVEL_NOTE =
  '证据等级按研究设计粗分：系统综述与 Meta 分析、设计良好的随机对照试验为“高”；队列、病例对照研究为“中”；横断面研究、病例系列为“低”；机制、动物和细胞实验为“很低”（对人群结论而言）。等级由 AI 判断，请核对原文。'

export function paperIdentifier(paper: Pick<LiteraturePaper, 'pmid' | 'doi'>): string {
  return [paper.pmid ? `PMID ${paper.pmid}` : '', paper.doi ? `DOI ${paper.doi}` : ''].filter(Boolean).join(' · ')
}

function cell(value: string): string {
  return value.replace(/\|/gu, '｜').replace(/\s*\n\s*/gu, ' ').trim() || '—'
}

export function buildLiteratureReportMarkdown(
  content: LiteratureReportContent,
  paper: LiteraturePaper,
  question: string
): string {
  const identifier = paperIdentifier(paper)
  const lines = [
    `# ${content.title}`,
    '',
    ...[content.citation, identifier].filter(Boolean).map((line) => `> ${line}`),
    `> 依据：${paper.source === 'fulltext' ? `全文（${paper.name}）` : '仅摘要，未读全文'}`,
    ''
  ]
  if (question.trim()) lines.push('## 你的问题', '', `**${question.trim()}**`, '', content.answer || '（原文没有直接回答这个问题。）', '')
  lines.push('## 研究问题', '', content.researchQuestion, '', '## 研究设计与方法', '', content.methods, '', '## 逐图解读', '')
  if (content.figures.length === 0) {
    lines.push(paper.source === 'fulltext' ? '全文中没有找到可解读的图。' : '只有摘要，无法逐图解读；添加论文 PDF 后可重新生成。', '')
  }
  for (const figure of content.figures) {
    lines.push(`### ${figure.label}`, '', `**结果**：${figure.finding}`, '', `**解读**：${figure.interpretation}`, '')
  }
  lines.push('## 主要结论', '', content.conclusions, '', '## 局限', '', ...content.limitations.map((item) => `- ${item}`), '')
  return lines.join('\n')
}

export function buildEvidenceTableMarkdown(
  content: EvidenceTableContent,
  papers: LiteraturePaper[],
  question: string
): string {
  const byName = new Map(papers.map((paper) => [paper.name, paper]))
  const lines = [
    `# ${content.title}`,
    '',
    ...(question.trim() ? [`> 问题：${question.trim()}`, ''] : []),
    content.summary,
    '',
    '## 证据表',
    '',
    '| 文献 | 标识 | 研究设计 | 样本 | 主要发现 | 证据等级 | 局限 |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...content.rows.map((row) => {
      const paper = byName.get(row.paper)
      const source = paper?.source === 'abstract' ? '（仅摘要）' : ''
      return `| ${cell(row.paper)}${source} | ${cell(paper ? paperIdentifier(paper) : '')} | ${cell(row.design)} | ${cell(row.sample)} | ${cell(row.finding)} | ${row.level} | ${cell(row.limitation)} |`
    }),
    ''
  ]
  if (content.gaps) lines.push('## 证据缺口', '', content.gaps, '')
  lines.push('## 证据等级说明', '', EVIDENCE_LEVEL_NOTE, '')
  return lines.join('\n')
}

const PMID = /\bPMID[:：\s]*(\d{6,9})\b/iu
const DOI = /\b(10\.\d{4,9}\/[^\s，。；;"'<>]+)/u

/** PMID or DOI written in the teacher's sentence, for looking the paper up on PubMed. */
export function identifiersInText(text: string): { pmid?: string; doi?: string } {
  const pmid = PMID.exec(text)?.[1] ?? /^\s*(\d{7,9})\s*$/u.exec(text)?.[1]
  const doi = DOI.exec(text)?.[1]?.replace(/[.,)]+$/u, '')
  return { ...(pmid ? { pmid } : {}), ...(doi ? { doi } : {}) }
}
