import { useEffect, useRef, useState, type ReactElement } from 'react'
import { AlertTriangle } from 'lucide-react'
import type { ArtifactListItem } from '@shared/artifact'
import type { EvidenceRef } from '@shared/courseware'
import { updateIntentField, type IntentBrief } from '@shared/intent-brief'
import { identifiersInText, type LiteraturePaper } from '@shared/literature-report'
import { startWorkflowRun, type WorkflowMode, type WorkflowRunState } from '@shared/workflow'
import { rendererRuntimeClient } from '../../agent/runtime-client'
import { formatWorkspacePickerError } from '../../lib/format-workspace-picker-error'
import { requestIntentBrief } from '../../lib/intent-context'
import { usePendingArtifactStore } from '../../lib/resume-artifact'
import type { ToolPrefill, ToolRequest } from '../../lib/tool-request'
import { createWorkflowRunner, type WorkflowRunner } from '../../lib/workflow-runner'
import { useWriteWorkspaceStore } from '../../write/write-workspace-store'
import { AiWorkExamples, AiWorkPage, AiWorkRecentArtifacts } from '../ai-work/AiWorkPage'
import { IntentBriefChips } from '../ai-work/IntentBriefChips'
import { IntentComposer } from '../ai-work/IntentComposer'
import { SectionedDocumentWorkspace, type OpenSectionedDocument } from '../ai-work/SectionedDocumentWorkspace'
import { WorkflowProgress } from '../ai-work/WorkflowProgress'
import { readDocumentMaterials } from '../documents/DocumentStartView'
import { WriteWorkspaceEmptyState } from '../write/WriteWorkspaceEmptyState'
import { extractResearchTaskFileText } from '../zhiyan/ZhiYanModulePages'

type LoadedMaterial = { id: string; name: string; text: string }

export const LITERATURE_EXAMPLES = [
  '精读这篇论文，重点看每张图怎么支持结论',
  'PMID 31942071，这篇文章的局限在哪里？',
  '把这几篇关于 TLS 与免疫治疗的文献整理成证据表'
]

/** How far into a PDF to look for its own DOI or PMID. */
const IDENTIFIER_SEARCH_CHARS = 5_000

/** A paper found on PubMed: its abstract stands in for the full text. */
export function paperFromPubMed(record: EvidenceRef): LiteraturePaper | null {
  if (!record.abstract?.trim()) return null
  return {
    name: record.title,
    text: [record.title, record.journal, record.year, record.abstract].filter(Boolean).join('\n'),
    source: 'abstract',
    ...(record.pmid ? { pmid: record.pmid } : {}),
    ...(record.doi ? { doi: record.doi } : {})
  }
}

/** A dropped PDF, with the DOI or PMID printed on its first pages when there is one. */
export function paperFromMaterial(material: { name: string; text: string }): LiteraturePaper {
  return { name: material.name, text: material.text, source: 'fulltext', ...identifiersInText(material.text.slice(0, IDENTIFIER_SEARCH_CHARS)) }
}

async function lookUpPaper(reference: string): Promise<LiteraturePaper | null> {
  const ids = identifiersInText(reference)
  const query = ids.pmid ? `${ids.pmid}[pmid]` : ids.doi ? `${ids.doi}[doi]` : reference
  const result = await window.dsGui.searchPubMed({ query, maxResults: 1 })
  if (!result.ok) throw new Error(`PubMed 暂时不可用：${result.message}`)
  return result.records[0] ? paperFromPubMed(result.records[0]) : null
}

/**
 * 文献 as an AI work page (Task 2.5): drop papers or give a PMID, DOI or title with one question; one
 * paper becomes a 文献报告, several an 证据表, both saved as documents that open part by part.
 */
export function LiteratureReportPage({
  prefill,
  handoffFile,
  onHandoffFileConsumed,
  onOpenTool,
  className = ''
}: {
  prefill?: ToolPrefill
  /** A file sent from 文件库, added as a paper. */
  handoffFile?: { name: string; path: string }
  onHandoffFileConsumed?: () => void
  /** Next steps: 课件 for a journal club deck, 文稿 for a review or grant. */
  onOpenTool?: (request: ToolRequest, text: string) => void
  className?: string
}): ReactElement {
  const workspaceRoot = useWriteWorkspaceStore((state) => state.workspaceRoot)
  const loadWriteSettings = useWriteWorkspaceStore((state) => state.loadWriteSettings)
  const [input, setInput] = useState(prefill?.text ?? '')
  const [materials, setMaterials] = useState<LoadedMaterial[]>([])
  const [brief, setBrief] = useState<IntentBrief | null>(null)
  const [run, setRun] = useState<WorkflowRunState | null>(null)
  const [mode, setMode] = useState<WorkflowMode>('auto')
  const [report, setReport] = useState<OpenSectionedDocument | null>(null)
  const [unverified, setUnverified] = useState<string[]>([])
  const [error, setError] = useState('')
  const runner = useRef<WorkflowRunner | null>(null)
  const briefRef = useRef<IntentBrief | null>(null)
  const request = useRef({ text: '', materials: [] as LoadedMaterial[] })

  useEffect(() => {
    void loadWriteSettings()
    void rendererRuntimeClient.getSettings()
      .then((settings) => setMode(settings.workflowMode === 'step' ? 'step' : 'auto'))
      .catch(() => undefined)
  }, [loadWriteSettings])

  // A request from the AI assistant fills the input box once per request.
  useEffect(() => {
    if (prefill) setInput(prefill.text)
  }, [prefill])

  useEffect(() => {
    if (!handoffFile) return
    void (async () => {
      try {
        const read = await window.dsGui.readFileBinary(handoffFile.path)
        if (!read.ok) throw new Error(read.message)
        const extracted = await extractResearchTaskFileText({ name: handoffFile.name, dataBase64: read.data })
        if (extracted.kind === 'unsupported' || !extracted.text.trim()) throw new Error('unreadable')
        setMaterials((existing) => existing.some((item) => item.id === handoffFile.path)
          ? existing
          : [...existing, { id: handoffFile.path, name: handoffFile.name, text: extracted.text }].slice(0, 10))
      } catch {
        setError(`无法读取：${handoffFile.name}。可以添加 PDF、Word 或文本文件。`)
      } finally {
        onHandoffFileConsumed?.()
      }
    })()
    // Keyed by the incoming file.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handoffFile?.path])

  const openReport = async (artifact: Pick<ArtifactListItem, 'id' | 'title' | 'workspaceRoot' | 'storage'>): Promise<void> => {
    const read = await window.dsGui.readWorkspaceFile({ path: artifact.storage.path, workspaceRoot: artifact.workspaceRoot })
    if (!read.ok) {
      setError('没能打开这份报告，文件可能已被移走或删除。')
      return
    }
    setUnverified([])
    setReport({ artifactId: artifact.id, path: artifact.storage.path, workspaceRoot: artifact.workspaceRoot, title: artifact.title, markdown: read.content })
  }

  // A report chosen in 继续上次的工作 on the home page.
  useEffect(() => {
    const artifact = usePendingArtifactStore.getState().take('literature')
    if (artifact) void openReport(artifact)
  }, [])

  const showBrief = (next: IntentBrief): void => {
    briefRef.current = next
    setBrief(next)
  }

  const startRun = async (): Promise<void> => {
    if (!workspaceRoot) return
    const text = input.trim()
    if (!text && materials.length === 0) return
    request.current = { text, materials }
    setError('')
    setUnverified([])
    const root = workspaceRoot
    let papers: LiteraturePaper[] = []
    let question = ''
    const flow = createWorkflowRunner({
      initial: startWorkflowRun(`literature-${Date.now()}`, 'literature', mode, new Date().toISOString()),
      onChange: setRun,
      handlers: {
        read: async () => {
          const outcome = await requestIntentBrief('literature', text, materials.map(({ name, text: body }) => ({ name, text: body })))
          if (!outcome.ok) throw new Error(outcome.message)
          showBrief(outcome.brief)
          const values = Object.fromEntries(outcome.brief.fields.map((field) => [field.key, field.source === 'default' ? '' : field.value]))
          question = values.question ?? ''
          if (materials.length > 0) {
            papers = materials.map(paperFromMaterial)
            return
          }
          const reference = values.paper || text
          const found = await lookUpPaper(reference)
          if (!found) throw new Error('在 PubMed 没有找到这篇文献。请拖入论文 PDF，或给出 PMID / DOI。')
          papers = [found]
        },
        report: async () => {
          const created = await window.dsGui.createLiteratureReport({ workspaceRoot: root, question, papers })
          if (!created.ok) throw new Error(created.message)
          setReport({ artifactId: created.artifact.id, path: created.path, workspaceRoot: root, title: created.artifact.title, markdown: created.markdown })
        },
        citations: async () => {
          // Identifiers printed in the papers are checked against PubMed; ones not found are listed.
          const missing: string[] = []
          for (const paper of papers.filter((item) => item.source === 'fulltext' && (item.pmid || item.doi))) {
            const result = await window.dsGui.searchPubMed({ query: paper.pmid ? `${paper.pmid}[pmid]` : `${paper.doi}[doi]`, maxResults: 1 })
            if (result.ok && result.records.length === 0) missing.push(`${paper.name}（${paper.pmid ? `PMID ${paper.pmid}` : `DOI ${paper.doi}`}）`)
          }
          setUnverified(missing)
        }
      }
    })
    runner.current = flow
    await flow.run()
  }

  const backToStart = (): void => {
    setReport(null)
    setRun(null)
    setBrief(null)
    briefRef.current = null
    runner.current = null
    setUnverified([])
  }

  const addFiles = async (files: File[]): Promise<void> => {
    const { materials: loaded, rejected } = await readDocumentMaterials(files)
    setMaterials((existing) => [...existing, ...loaded.filter((item) => !existing.some((known) => known.id === item.id))].slice(0, 10))
    setError(rejected.length > 0 ? `无法读取：${rejected.join('、')}。可以添加 PDF、Word 或文本文件。` : '')
  }

  const pickWorkspace = async (): Promise<void> => {
    try {
      const picked = await window.dsGui.pickWorkspaceDirectory()
      if (!picked.canceled && picked.path) await useWriteWorkspaceStore.getState().addWriteWorkspace(picked.path)
    } catch (pickError) {
      setError(formatWorkspacePickerError(pickError))
    }
  }

  if (!workspaceRoot && !report) return <WriteWorkspaceEmptyState error={error} onPickWorkspace={() => void pickWorkspace()} />

  if (report && (!run || run.status === 'done')) {
    const isTable = report.title.endsWith('证据表')
    const excerpt = report.markdown.slice(0, 4_000)
    return (
      <SectionedDocumentWorkspace
        module="literature"
        toolTitle="文献"
        document={report}
        onDocumentChange={setReport}
        stage={isTable ? '证据表' : '文献报告'}
        banner={unverified.length > 0 ? (
          <div role="alert" className="flex items-start gap-2 rounded-xl border border-ds-warning bg-ds-warning-soft px-4 py-3 text-small text-ds-warning">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.8} />
            <span>以下文献标识在 PubMed 中没有核验到，请对照原文确认：{unverified.join('；')}</span>
          </div>
        ) : null}
        newLabel="读新文献"
        onNew={backToStart}
        wholeLabel={isTable ? '整份证据表' : '整份报告'}
        partLabel="改这一部分"
        subpartLabel="改这张图的解读"
        emptyHint="点任一部分的“改这一部分”，或在下方选择范围，说一句想怎么改，例如“局限再写具体一些”。每次修改都会保存版本，可以随时撤销。"
        nextSteps={onOpenTool ? [
          {
            id: 'journal-club',
            label: '做成组会汇报 PPT',
            description: '在课件中选择这篇论文的 PDF 作为依据',
            onSelect: () => onOpenTool({ moduleId: 'ppt-gen', label: '课件' }, `根据《${report.title}》做一套组会汇报 PPT，讲清研究问题、方法、关键图和局限`)
          },
          {
            id: 'review',
            label: '写进综述',
            onSelect: () => onOpenTool(
              { moduleId: 'write', template: 'review', label: '文稿 · 综述' },
              `根据下面的${isTable ? '证据表' : '文献报告'}写综述的相关段落，保留文献标识：\n\n${excerpt}`
            )
          },
          {
            id: 'grant',
            label: '写进基金立项依据',
            onSelect: () => onOpenTool(
              { moduleId: 'write', template: 'grant', label: '文稿 · 国自然' },
              `根据下面的${isTable ? '证据表' : '文献报告'}写国自然立项依据的相关段落，保留文献标识：\n\n${excerpt}`
            )
          }
        ] : undefined}
        className={className}
      />
    )
  }

  return (
    <AiWorkPage
      module="literature"
      title="文献"
      description="拖入论文 PDF，或给出 PMID、DOI、题名，再说一个问题；一篇写成文献报告，多篇整理成证据表。"
      state="start"
      className={className}
      start={(
        <>
          {run ? null : (
            <>
              <IntentComposer
                value={input}
                onChange={setInput}
                onSubmit={() => void startRun()}
                placeholder="例如：精读这篇论文，重点看每张图怎么支持结论"
                attachments={materials.map(({ id, name }) => ({ id, name }))}
                onAddFiles={(files) => void addFiles(files)}
                onRemoveAttachment={(id) => setMaterials((existing) => existing.filter((item) => item.id !== id))}
                autoFocus
              />
              <AiWorkExamples examples={LITERATURE_EXAMPLES} onSelect={setInput} />
            </>
          )}
          {error ? <p role="alert" className="mt-3 text-small text-ds-danger">{error}</p> : null}
          {run ? (
            <div className="space-y-4">
              <div className="rounded-xl bg-ds-subtle px-4 py-3 text-small text-ds-text">
                <p className="whitespace-pre-wrap">{request.current.text || '（只提供了文献）'}</p>
                {request.current.materials.length > 0 ? (
                  <p className="mt-1 text-caption text-ds-muted">文献：{request.current.materials.map((item) => item.name).join('、')}</p>
                ) : null}
              </div>
              {brief ? (
                <IntentBriefChips brief={brief} onChange={(key, value) => showBrief(updateIntentField(briefRef.current ?? brief, key, value))} />
              ) : null}
              <WorkflowProgress state={run} onStop={() => runner.current?.stop()} onContinue={() => void runner.current?.run()} />
              {run.status === 'stopped' || run.status === 'failed' ? (
                <button type="button" onClick={backToStart} className="text-small text-ds-muted underline-offset-2 hover:text-ds-ink hover:underline">
                  重新开始
                </button>
              ) : null}
            </div>
          ) : (
            <AiWorkRecentArtifacts toolId="literature" onOpen={(artifact) => void openReport(artifact)} />
          )}
        </>
      )}
    />
  )
}
