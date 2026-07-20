import { useMemo, useState, type ReactElement } from 'react'
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  BookOpen,
  Check,
  Download,
  FileText,
  FolderOpen,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Search,
  Sparkles,
  Trash2
} from 'lucide-react'
import type { EvidenceRef } from '@shared/courseware'
import {
  inferTextbookFormatRulesFromGuidelines,
  createSectionsFromOutline,
  sectionPath,
  TEXTBOOK_FONT_OPTIONS,
  type TextbookAudience,
  type TextbookCheckItem,
  type TextbookCitationStyle,
  type TextbookFormatRules,
  type TextbookMetadata,
  type TextbookOutline,
  type TextbookOutlineChapter,
  type TextbookOutlineSection,
  type TextbookProject,
  type TextbookReference,
  type TextbookSection
} from '@shared/textbook'
import { ResizableTextArea } from './ResizableTextArea'

type TextbookWorkbenchPageProps = {
  className?: string
}

type Step = 'setup' | 'outline' | 'writing' | 'check'
type BusyAction =
  | 'format'
  | 'outline'
  | 'section'
  | 'revise'
  | 'pubmed'
  | 'check'
  | 'export'
  | 'load'
  | null

const fieldClass =
  'w-full rounded-lg border border-ds-border bg-ds-card px-3 py-2 text-[13px] text-ds-text outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/10'
const labelClass = 'mb-1.5 block text-[12px] font-semibold text-ds-muted'

const audienceOptions: Array<{ id: TextbookAudience; label: string }> = [
  { id: 'undergraduate', label: '本科教材' },
  { id: 'graduate', label: '研究生教材' },
  { id: 'international', label: '国际学生教材' }
]

const citationOptions: Array<{ id: TextbookCitationStyle; label: string }> = [
  { id: 'gbt7714', label: 'GB/T 7714' },
  { id: 'vancouver', label: 'Vancouver' },
  { id: 'apa', label: 'APA' },
  { id: 'custom', label: '出版社自定义' }
]

const fontOptions = TEXTBOOK_FONT_OPTIONS.map((font) => ({
  id: font,
  label: ({
    'Microsoft YaHei': '微软雅黑 Microsoft YaHei',
    SimSun: '宋体 SimSun',
    NSimSun: '新宋体 NSimSun',
    SimHei: '黑体 SimHei',
    KaiTi: '楷体 KaiTi',
    FangSong: '仿宋 FangSong',
    DengXian: '等线 DengXian',
    'Source Han Serif SC': '思源宋体 Source Han Serif SC',
    'Source Han Sans SC': '思源黑体 Source Han Sans SC',
    'Noto Serif CJK SC': 'Noto Serif CJK SC',
    'Noto Sans CJK SC': 'Noto Sans CJK SC'
  } as Record<string, string>)[font] ?? font
}))

const fontSizeOptions = [
  { value: 9, label: '小五 9 pt' },
  { value: 10.5, label: '五号 10.5 pt' },
  { value: 11, label: '11 pt' },
  { value: 12, label: '小四 12 pt' },
  { value: 14, label: '四号 14 pt' },
  { value: 15, label: '小三 15 pt' },
  { value: 16, label: '三号 16 pt' },
  { value: 18, label: '小二 18 pt' },
  { value: 22, label: '二号 22 pt' }
]

const lineSpacingOptions = [
  { value: 1, label: '单倍 1.0' },
  { value: 1.15, label: '1.15 倍' },
  { value: 1.5, label: '1.5 倍' },
  { value: 2, label: '2 倍' }
]

function nowIso(): string {
  return new Date().toISOString()
}

function slugId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

function initialMetadata(): TextbookMetadata {
  return {
    title: '生物医学课程教材',
    subject: '生物医学',
    audience: 'undergraduate',
    author: '',
    writingGoal: '面向医学生建立清晰、系统、能够衔接临床实践与科研问题的知识框架。',
    citationStyle: 'gbt7714',
    outputFormats: ['markdown', 'docx', 'project']
  }
}

function initialFormatRules(): TextbookFormatRules {
  return {
    fontFamily: 'Microsoft YaHei',
    fontSizePt: 11,
    lineSpacing: 1.5,
    headingPattern: '章标题使用一级标题，节标题使用二级标题，小节内主题使用三级标题',
    symbolRules: '',
    unresolvedRules: []
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function referenceFromEvidence(evidence: EvidenceRef): TextbookReference {
  const key = evidence.pmid ? `pmid-${evidence.pmid}` : evidence.doi ? `doi-${evidence.doi}` : evidence.id
  return {
    key,
    title: evidence.title,
    sourceType: evidence.sourceType === 'fulltext' ? 'fulltext' : 'abstract',
    ...(evidence.pmid ? { pmid: evidence.pmid } : {}),
    ...(evidence.doi ? { doi: evidence.doi } : {}),
    ...(evidence.year ? { year: evidence.year } : {}),
    ...(evidence.journal ? { journal: evidence.journal } : {}),
    authors: evidence.authors ?? [],
    ...(evidence.abstract ? { abstract: evidence.abstract } : {})
  }
}

function updateProjectSection(
  project: TextbookProject,
  section: TextbookSection
): TextbookProject {
  return {
    ...project,
    sections: project.sections.map((item) => item.id === section.id ? section : item),
    updatedAt: nowIso()
  }
}

function createProject(
  metadata: TextbookMetadata,
  publisherGuidelines: string,
  formatRules: TextbookFormatRules,
  outline: TextbookOutline
): TextbookProject {
  const now = nowIso()
  return {
    version: 1,
    metadata,
    publisherGuidelines,
    formatRules,
    outline,
    sections: createSectionsFromOutline(outline),
    references: [],
    checks: [],
    createdAt: now,
    updatedAt: now
  }
}

function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (to < 0 || to >= items.length || from === to) return items
  const next = [...items]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

function syncSectionsFromOutline(project: TextbookProject, outline: TextbookOutline): TextbookProject {
  const existing = new Map(project.sections.map((section) => [section.id, section]))
  const sections = outline.chapters.flatMap((chapter, chapterIndex) =>
    chapter.sections.map((outlineSection, sectionIndex) => {
      const current = existing.get(outlineSection.id)
      return current
        ? {
            ...current,
            chapterId: chapter.id,
            title: outlineSection.title,
            path: current.path || sectionPath(chapterIndex, sectionIndex)
          }
        : {
            id: outlineSection.id,
            chapterId: chapter.id,
            title: outlineSection.title,
            path: sectionPath(chapterIndex, sectionIndex),
            content: '',
            status: 'draft' as const,
            referenceKeys: [],
            teacherNotes: ''
          }
    })
  )
  return {
    ...project,
    outline,
    sections,
    updatedAt: nowIso()
  }
}

function statusLabel(status: TextbookSection['status']): string {
  if (status === 'reviewed') return '已审阅'
  if (status === 'writing') return '撰写中'
  return '草稿'
}

export function TextbookWorkbenchPage({ className = '' }: TextbookWorkbenchPageProps): ReactElement {
  const [step, setStep] = useState<Step>('setup')
  const [busy, setBusy] = useState<BusyAction>(null)
  const [message, setMessage] = useState('')
  const [metadata, setMetadata] = useState<TextbookMetadata>(initialMetadata)
  const [publisherGuidelines, setPublisherGuidelines] = useState('')
  const [formatRules, setFormatRules] = useState<TextbookFormatRules>(initialFormatRules)
  const [teacherBrief, setTeacherBrief] = useState('')
  const [project, setProject] = useState<TextbookProject | null>(null)
  const [activeSectionId, setActiveSectionId] = useState('')
  const [sectionInstruction, setSectionInstruction] = useState('')
  const [pubmedQuery, setPubmedQuery] = useState('')
  const [pubmedRecords, setPubmedRecords] = useState<TextbookReference[]>([])
  const [outputDirectory, setOutputDirectory] = useState('')
  const [exportPaths, setExportPaths] = useState<string[]>([])

  const outline = project?.outline ?? null
  const activeSection = project?.sections.find((section) => section.id === activeSectionId)
    ?? project?.sections[0]
    ?? null
  const sectionCount = project?.sections.length ?? 0
  const completedCount = project?.sections.filter((section) => section.content.trim()).length ?? 0

  const canGenerateOutline = metadata.title.trim().length > 0
  const stepIndex = step === 'setup' ? 0 : step === 'outline' ? 1 : step === 'writing' ? 2 : 3
  const progressLabel = ['项目设置', '大纲设计', '逐节写作', '检查导出'][stepIndex]

  const selectedReferenceKeys = useMemo(
    () => new Set(project?.references.map((reference) => reference.key) ?? []),
    [project?.references]
  )

  function applyFormatRules(nextRules: TextbookFormatRules): void {
    setFormatRules(nextRules)
    if (project) {
      setProject({
        ...project,
        formatRules: nextRules,
        updatedAt: nowIso()
      })
    }
  }

  function handlePublisherGuidelinesChange(nextGuidelines: string): void {
    setPublisherGuidelines(nextGuidelines)
    const inferred = inferTextbookFormatRulesFromGuidelines(nextGuidelines, formatRules)
    setFormatRules(inferred)
    if (project) {
      setProject({
        ...project,
        publisherGuidelines: nextGuidelines,
        formatRules: inferred,
        updatedAt: nowIso()
      })
    }
  }

  async function parseFormatRulesWithAi(): Promise<void> {
    if (!publisherGuidelines.trim()) {
      setMessage('请先粘贴或读取出版社要求。')
      return
    }
    setBusy('format')
    setMessage('')
    try {
      const baseline = inferTextbookFormatRulesFromGuidelines(publisherGuidelines, formatRules)
      setFormatRules(baseline)
      const result = await window.dsGui.parseTextbookFormatRules({
        publisherGuidelines,
        currentRules: baseline
      })
      if (!result.ok) {
        setMessage(`已完成本地初步解析；AI 解析未完成：${result.message}`)
        return
      }
      applyFormatRules(result.value)
      setMessage(result.repaired ? 'AI 已解析出版社要求，并自动修复了格式化输出。' : 'AI 已解析出版社要求。')
    } catch (error) {
      setMessage(errorMessage(error))
    } finally {
      setBusy(null)
    }
  }

  async function pickPublisherFile(): Promise<void> {
    const picked = await window.dsGui.pickFile({
      filters: [{ name: '出版社要求', extensions: ['md', 'txt'] }]
    })
    if (picked.canceled || !picked.path) return
    const loaded = await window.dsGui.readWorkspaceFile({ path: picked.path })
    if (loaded.ok) {
      handlePublisherGuidelinesChange(loaded.content)
    } else {
      setMessage(loaded.message)
    }
  }

  async function openProject(): Promise<void> {
    setBusy('load')
    setMessage('')
    try {
      const picked = await window.dsGui.pickFile({
        filters: [{ name: '智研教材项目', extensions: ['zhiyan-textbook'] }]
      })
      if (picked.canceled || !picked.path) return
      const loaded = await window.dsGui.loadTextbookProject(picked.path)
      setProject(loaded)
      setMetadata(loaded.metadata)
      setPublisherGuidelines(loaded.publisherGuidelines)
      setFormatRules(loaded.formatRules)
      setActiveSectionId(loaded.sections[0]?.id ?? '')
      setStep(loaded.outline ? 'writing' : 'setup')
    } catch (error) {
      setMessage(errorMessage(error))
    } finally {
      setBusy(null)
    }
  }

  async function generateOutline(): Promise<void> {
    if (!canGenerateOutline) {
      setMessage('请先填写教材题名。')
      return
    }
    setBusy('outline')
    setMessage('')
    try {
      const result = await window.dsGui.generateTextbookOutline({
        metadata,
        publisherGuidelines,
        formatRules,
        teacherBrief
      })
      if (!result.ok) {
        setMessage(result.message)
        return
      }
      const nextProject = createProject(metadata, publisherGuidelines, formatRules, result.value)
      setProject(nextProject)
      setActiveSectionId(nextProject.sections[0]?.id ?? '')
      setStep('outline')
      if (result.repaired) setMessage('模型输出已自动修复并通过结构校验，请复核大纲。')
    } catch (error) {
      setMessage(errorMessage(error))
    } finally {
      setBusy(null)
    }
  }

  function updateOutline(mutator: (outline: TextbookOutline) => TextbookOutline): void {
    if (!project?.outline) return
    setProject(syncSectionsFromOutline(project, mutator(project.outline)))
  }

  function updateChapter(chapterIndex: number, patch: Partial<TextbookOutlineChapter>): void {
    updateOutline((current) => ({
      ...current,
      chapters: current.chapters.map((chapter, index) =>
        index === chapterIndex ? { ...chapter, ...patch } : chapter
      )
    }))
  }

  function updateSection(
    chapterIndex: number,
    sectionIndex: number,
    patch: Partial<TextbookOutlineSection>
  ): void {
    updateOutline((current) => ({
      ...current,
      chapters: current.chapters.map((chapter, index) =>
        index === chapterIndex
          ? {
              ...chapter,
              sections: chapter.sections.map((section, itemIndex) =>
                itemIndex === sectionIndex ? { ...section, ...patch } : section
              )
            }
          : chapter
      )
    }))
  }

  function addChapter(): void {
    updateOutline((current) => {
      const chapterId = slugId('chapter')
      const sectionId = slugId('section')
      return {
        ...current,
        chapters: [
          ...current.chapters,
          {
            id: chapterId,
            title: '新增章节',
            writingGoal: '',
            sections: [{
              id: sectionId,
              chapterId,
              title: '新增小节',
              writingGoal: '',
              estimatedWords: 2500,
              keyConcepts: [],
              confirmed: false
            }]
          }
        ]
      }
    })
  }

  function addSection(chapterIndex: number): void {
    updateOutline((current) => ({
      ...current,
      chapters: current.chapters.map((chapter, index) =>
        index === chapterIndex
          ? {
              ...chapter,
              sections: [
                ...chapter.sections,
                {
                  id: slugId('section'),
                  chapterId: chapter.id,
                  title: '新增小节',
                  writingGoal: '',
                  estimatedWords: 2500,
                  keyConcepts: [],
                  confirmed: false
                }
              ]
            }
          : chapter
      )
    }))
  }

  function deleteChapter(chapterIndex: number): void {
    updateOutline((current) => ({
      ...current,
      chapters: current.chapters.length <= 1
        ? current.chapters
        : current.chapters.filter((_, index) => index !== chapterIndex)
    }))
  }

  function deleteSection(chapterIndex: number, sectionIndex: number): void {
    updateOutline((current) => ({
      ...current,
      chapters: current.chapters.map((chapter, index) =>
        index === chapterIndex && chapter.sections.length > 1
          ? {
              ...chapter,
              sections: chapter.sections.filter((_, itemIndex) => itemIndex !== sectionIndex)
            }
          : chapter
      )
    }))
  }

  async function generateActiveSection(instruction = ''): Promise<void> {
    if (!project || !activeSection) return
    setBusy('section')
    setMessage('')
    try {
      const result = await window.dsGui.generateTextbookSection({
        project,
        sectionId: activeSection.id,
        instruction
      })
      if (!result.ok) {
        setMessage(result.message)
        return
      }
      setProject(updateProjectSection(project, result.value.section))
      if (result.repaired) setMessage('章节输出已自动修复并通过结构校验。')
    } catch (error) {
      setMessage(errorMessage(error))
    } finally {
      setBusy(null)
    }
  }

  async function reviseActiveSection(instruction: string): Promise<void> {
    if (!project || !activeSection || !instruction.trim()) return
    setBusy('revise')
    setMessage('')
    try {
      const result = await window.dsGui.reviseTextbookSection({
        project,
        sectionId: activeSection.id,
        instruction
      })
      if (!result.ok) {
        setMessage(result.message)
        return
      }
      setProject(updateProjectSection(project, result.value.section))
      setSectionInstruction('')
    } catch (error) {
      setMessage(errorMessage(error))
    } finally {
      setBusy(null)
    }
  }

  function updateActiveSection(patch: Partial<TextbookSection>): void {
    if (!project || !activeSection) return
    setProject(updateProjectSection(project, { ...activeSection, ...patch }))
  }

  async function searchPubMed(): Promise<void> {
    const query = pubmedQuery.trim() || activeSection?.title || metadata.title
    if (!query.trim()) return
    setBusy('pubmed')
    setMessage('')
    try {
      const result = await window.dsGui.searchPubMed({
        query,
        maxResults: 8,
        minYear: new Date().getFullYear() - 5
      })
      if (!result.ok) {
        setMessage(result.message)
        setPubmedRecords([])
        return
      }
      setPubmedRecords(result.records.map(referenceFromEvidence))
      if (result.records.length === 0) setMessage('PubMed 未检索到匹配记录。')
    } catch (error) {
      setMessage(errorMessage(error))
    } finally {
      setBusy(null)
    }
  }

  function addReference(reference: TextbookReference): void {
    if (!project) return
    if (project.references.some((item) => item.key === reference.key)) return
    setProject({
      ...project,
      references: [...project.references, reference],
      updatedAt: nowIso()
    })
  }

  function insertReference(reference: TextbookReference): void {
    if (!project || !activeSection) return
    addReference(reference)
    const marker = `[@${reference.key}]`
    if (activeSection.content.includes(marker)) return
    updateActiveSection({
      content: `${activeSection.content.trimEnd()} ${marker}\n`,
      referenceKeys: [...new Set([...activeSection.referenceKeys, reference.key])]
    })
  }

  async function runProjectCheck(): Promise<void> {
    if (!project) return
    setBusy('check')
    setMessage('')
    try {
      const result = await window.dsGui.checkTextbookProject({ project })
      if (!result.ok) {
        setMessage(result.message)
        return
      }
      setProject({
        ...project,
        checks: result.value.items,
        updatedAt: nowIso()
      })
      setMessage(result.value.summary)
    } catch (error) {
      setMessage(errorMessage(error))
    } finally {
      setBusy(null)
    }
  }

  async function chooseOutputDirectory(): Promise<void> {
    const picked = await window.dsGui.pickWorkspaceDirectory(outputDirectory || undefined)
    if (!picked.canceled && picked.path) setOutputDirectory(picked.path)
  }

  async function exportProject(): Promise<void> {
    if (!project) return
    if (!outputDirectory.trim()) {
      await chooseOutputDirectory()
      return
    }
    setBusy('export')
    setMessage('')
    setExportPaths([])
    try {
      const result = await window.dsGui.exportTextbookProject({
        project,
        outputDirectory
      })
      if (!result.ok) {
        setMessage(result.message)
        return
      }
      setExportPaths([result.markdownPath, result.docxPath, result.projectPath])
    } catch (error) {
      setMessage(errorMessage(error))
    } finally {
      setBusy(null)
    }
  }

  function renderStepButton(id: Step, label: string): ReactElement {
    const order: Step[] = ['setup', 'outline', 'writing', 'check']
    const index = order.indexOf(id)
    const active = step === id
    const enabled = id === 'setup' || Boolean(project && index <= Math.max(stepIndex + 1, 1))
    return (
      <button
        type="button"
        disabled={!enabled}
        onClick={() => setStep(id)}
        className={`flex min-w-0 items-center gap-2 rounded-lg px-3 py-2 text-[12.5px] font-semibold transition ${
          active
            ? 'bg-accent text-white'
            : enabled
              ? 'bg-ds-card text-ds-text hover:bg-ds-hover'
              : 'bg-ds-card text-ds-faint opacity-60'
        }`}
      >
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-current text-[11px]">
          {index + 1}
        </span>
        <span className="truncate">{label}</span>
      </button>
    )
  }

  return (
    <div className={`flex h-full flex-col overflow-hidden bg-ds-main ${className}`}>
      <div className="flex shrink-0 items-center justify-between border-b border-ds-border-muted px-6 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal-600 text-white">
            <BookOpen className="h-5 w-5" strokeWidth={1.9} />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-[20px] font-bold text-ds-text">教材编写工作台</h1>
            <p className="truncate text-[12.5px] text-ds-muted">
              当前阶段：{progressLabel} · {completedCount}/{sectionCount} 节已有正文
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void openProject()}
            className="inline-flex items-center gap-2 rounded-lg border border-ds-border px-3 py-2 text-[12.5px] font-semibold text-ds-text hover:bg-ds-hover"
          >
            {busy === 'load' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderOpen className="h-4 w-4" />}
            打开项目
          </button>
        </div>
      </div>

      <div className="flex shrink-0 gap-2 border-b border-ds-border-muted px-6 py-3">
        {renderStepButton('setup', '项目设置')}
        {renderStepButton('outline', '大纲设计')}
        {renderStepButton('writing', '逐节写作')}
        {renderStepButton('check', '检查导出')}
      </div>

      {message ? (
        <div className="mx-6 mt-3 flex shrink-0 items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12.5px] text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{message}</span>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        {step === 'setup' && (
          <div className="mx-auto grid max-w-6xl gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
            <section className="space-y-5">
              <div className="rounded-xl border border-ds-border-muted bg-ds-card p-5">
                <h2 className="mb-4 flex items-center gap-2 text-[15px] font-bold text-ds-text">
                  <FileText className="h-4 w-4 text-accent" />
                  基本信息
                </h2>
                <div className="grid gap-4 md:grid-cols-2">
                  <label>
                    <span className={labelClass}>教材题名</span>
                    <input
                      value={metadata.title}
                      onChange={(event) => setMetadata({ ...metadata, title: event.target.value })}
                      className={fieldClass}
                    />
                  </label>
                  <label>
                    <span className={labelClass}>学科方向</span>
                    <input
                      value={metadata.subject}
                      onChange={(event) => setMetadata({ ...metadata, subject: event.target.value })}
                      className={fieldClass}
                    />
                  </label>
                  <label>
                    <span className={labelClass}>作者 / 主编</span>
                    <input
                      value={metadata.author}
                      onChange={(event) => setMetadata({ ...metadata, author: event.target.value })}
                      className={fieldClass}
                    />
                  </label>
                  <label>
                    <span className={labelClass}>引用格式</span>
                    <select
                      value={metadata.citationStyle}
                      onChange={(event) => setMetadata({
                        ...metadata,
                        citationStyle: event.target.value as TextbookCitationStyle
                      })}
                      className={fieldClass}
                    >
                      {citationOptions.map((option) => (
                        <option key={option.id} value={option.id}>{option.label}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="mt-4">
                  <span className={labelClass}>目标读者</span>
                  <div className="flex flex-wrap gap-2">
                    {audienceOptions.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => setMetadata({ ...metadata, audience: option.id })}
                        className={`rounded-lg border px-3 py-2 text-[12.5px] font-semibold ${
                          metadata.audience === option.id
                            ? 'border-accent bg-accent text-white'
                            : 'border-ds-border bg-ds-card text-ds-text hover:bg-ds-hover'
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
                <label className="mt-4 block">
                  <span className={labelClass}>教材写作目标</span>
                  <ResizableTextArea
                    value={metadata.writingGoal}
                    onChange={(event) => setMetadata({ ...metadata, writingGoal: event.target.value })}
                    rows={3}
                    className={fieldClass}
                  />
                </label>
              </div>

              <div className="rounded-xl border border-ds-border-muted bg-ds-card p-5">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h2 className="flex items-center gap-2 text-[15px] font-bold text-ds-text">
                    <Save className="h-4 w-4 text-accent" />
                    出版社要求
                  </h2>
                  <button
                    type="button"
                    onClick={() => void pickPublisherFile()}
                    className="inline-flex items-center gap-2 rounded-lg border border-ds-border px-3 py-1.5 text-[12px] font-semibold text-ds-text hover:bg-ds-hover"
                  >
                    <FolderOpen className="h-3.5 w-3.5" />
                    读取 txt/md
                  </button>
                </div>
                <ResizableTextArea
                  value={publisherGuidelines}
                  onChange={(event) => handlePublisherGuidelinesChange(event.target.value)}
                  rows={8}
                  className={`${fieldClass} min-h-[220px]`}
                  placeholder="粘贴出版社给出的写作与排版要求，例如字体、字号、行距、标题编号、标点符号、参考文献格式、图表规范等。"
                />
              </div>
            </section>

            <aside className="space-y-5">
              <div className="rounded-xl border border-ds-border-muted bg-ds-card p-5">
                <h2 className="mb-4 text-[15px] font-bold text-ds-text">可解析格式规则</h2>
                <div className="mb-4 rounded-lg border border-accent/20 bg-accent/5 p-3">
                  <button
                    type="button"
                    data-testid="textbook-ai-parse-format-rules"
                    disabled={!publisherGuidelines.trim() || busy !== null}
                    onClick={() => void parseFormatRulesWithAi()}
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-3 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
                  >
                    {busy === 'format' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    AI 解析出版社要求
                  </button>
                  <p className="mt-2 text-[12px] leading-5 text-ds-muted">
                    粘贴或读取要求后会先自动抽取常见格式；复杂规则可由 AI 补全，老师只需校正。
                  </p>
                </div>
                <div className="space-y-3" data-format-rules-panel="auto-parse">
                  <label>
                    <span className={labelClass}>正文字体</span>
                    <select
                      value={TEXTBOOK_FONT_OPTIONS.includes(formatRules.fontFamily as typeof TEXTBOOK_FONT_OPTIONS[number])
                        ? formatRules.fontFamily
                        : '__custom__'}
                      onChange={(event) => {
                        if (event.target.value === '__custom__') return
                        applyFormatRules({ ...formatRules, fontFamily: event.target.value })
                      }}
                      className={fieldClass}
                    >
                      {fontOptions.map((option) => (
                        <option key={option.id} value={option.id}>{option.label}</option>
                      ))}
                      <option value="__custom__">其他字体</option>
                    </select>
                    {!TEXTBOOK_FONT_OPTIONS.includes(formatRules.fontFamily as typeof TEXTBOOK_FONT_OPTIONS[number]) && (
                      <input
                        value={formatRules.fontFamily}
                        onChange={(event) => applyFormatRules({ ...formatRules, fontFamily: event.target.value })}
                        className={`${fieldClass} mt-2`}
                      />
                    )}
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <label>
                      <span className={labelClass}>字号 pt</span>
                      <select
                        value={fontSizeOptions.some((option) => option.value === formatRules.fontSizePt)
                          ? String(formatRules.fontSizePt)
                          : '__custom__'}
                        onChange={(event) => {
                          if (event.target.value === '__custom__') return
                          applyFormatRules({
                            ...formatRules,
                            fontSizePt: Number(event.target.value)
                          })
                        }}
                        className={fieldClass}
                      >
                        {fontSizeOptions.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                        <option value="__custom__">自定义</option>
                      </select>
                      {!fontSizeOptions.some((option) => option.value === formatRules.fontSizePt) && (
                        <input
                          type="number"
                          min={7}
                          max={42}
                          step={0.5}
                          value={formatRules.fontSizePt}
                          onChange={(event) => applyFormatRules({
                            ...formatRules,
                            fontSizePt: Number(event.target.value)
                          })}
                          className={`${fieldClass} mt-2`}
                        />
                      )}
                    </label>
                    <label>
                      <span className={labelClass}>行距</span>
                      <select
                        value={lineSpacingOptions.some((option) => option.value === formatRules.lineSpacing)
                          ? String(formatRules.lineSpacing)
                          : '__custom__'}
                        onChange={(event) => {
                          if (event.target.value === '__custom__') return
                          applyFormatRules({
                            ...formatRules,
                            lineSpacing: Number(event.target.value)
                          })
                        }}
                        className={fieldClass}
                      >
                        {lineSpacingOptions.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                        <option value="__custom__">自定义</option>
                      </select>
                      {!lineSpacingOptions.some((option) => option.value === formatRules.lineSpacing) && (
                        <input
                          type="number"
                          min={1}
                          max={3}
                          step={0.05}
                          value={formatRules.lineSpacing}
                          onChange={(event) => applyFormatRules({
                            ...formatRules,
                            lineSpacing: Number(event.target.value)
                          })}
                          className={`${fieldClass} mt-2`}
                        />
                      )}
                    </label>
                  </div>
                  <label>
                    <span className={labelClass}>标题层级</span>
                    <ResizableTextArea
                      value={formatRules.headingPattern}
                      onChange={(event) => applyFormatRules({
                        ...formatRules,
                        headingPattern: event.target.value
                      })}
                      rows={3}
                      className={fieldClass}
                    />
                  </label>
                  <label>
                    <span className={labelClass}>符号 / 标点规则</span>
                    <ResizableTextArea
                      value={formatRules.symbolRules}
                      onChange={(event) => applyFormatRules({
                        ...formatRules,
                        symbolRules: event.target.value
                      })}
                      rows={3}
                      className={fieldClass}
                    />
                  </label>
                  <label>
                    <span className={labelClass}>需人工复核的出版社规则</span>
                    <ResizableTextArea
                      value={formatRules.unresolvedRules.join('\n')}
                      onChange={(event) => applyFormatRules({
                        ...formatRules,
                        unresolvedRules: event.target.value.split('\n').map((item) => item.trim()).filter(Boolean)
                      })}
                      rows={3}
                      className={fieldClass}
                    />
                  </label>
                </div>
              </div>

              <div className="rounded-xl border border-ds-border-muted bg-ds-card p-5">
                <h2 className="mb-3 text-[15px] font-bold text-ds-text">大纲生成说明</h2>
                <ResizableTextArea
                  value={teacherBrief}
                  onChange={(event) => setTeacherBrief(event.target.value)}
                  rows={6}
                  className={fieldClass}
                  placeholder="例如：重点覆盖细胞稳态、器官功能、疾病机制和药物干预；每章设置临床案例和思考题。"
                />
                <button
                  type="button"
                  disabled={!canGenerateOutline || busy !== null}
                  onClick={() => void generateOutline()}
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-3 text-[14px] font-semibold text-white disabled:opacity-50"
                >
                  {busy === 'outline' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  生成全书大纲
                </button>
              </div>
            </aside>
          </div>
        )}

        {step === 'outline' && outline && (
          <div className="mx-auto max-w-6xl space-y-4">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <div>
                <h2 className="text-[18px] font-bold text-ds-text">{outline.title}</h2>
                <p className="mt-1 text-[13px] leading-6 text-ds-muted">{outline.rationale}</p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={addChapter}
                  className="inline-flex items-center gap-2 rounded-lg border border-ds-border px-3 py-2 text-[12.5px] font-semibold text-ds-text hover:bg-ds-hover"
                >
                  <Plus className="h-4 w-4" />
                  增加章
                </button>
                <button
                  type="button"
                  onClick={() => setStep('writing')}
                  className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-[12.5px] font-semibold text-white"
                >
                  <Check className="h-4 w-4" />
                  确认大纲并写作
                </button>
              </div>
            </div>

            {outline.chapters.map((chapter, chapterIndex) => (
              <section key={chapter.id} className="rounded-xl border border-ds-border-muted bg-ds-card p-4">
                <div className="mb-3 flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <input
                      value={chapter.title}
                      onChange={(event) => updateChapter(chapterIndex, { title: event.target.value })}
                      className={`${fieldClass} text-[15px] font-bold`}
                    />
                    <input
                      value={chapter.writingGoal}
                      onChange={(event) => updateChapter(chapterIndex, { writingGoal: event.target.value })}
                      className={`${fieldClass} mt-2`}
                      placeholder="本章写作目标"
                    />
                  </div>
                  <button
                    type="button"
                    title="上移"
                    onClick={() => updateOutline((current) => ({
                      ...current,
                      chapters: moveItem(current.chapters, chapterIndex, chapterIndex - 1)
                    }))}
                    className="rounded-lg p-2 text-ds-muted hover:bg-ds-hover"
                  >
                    <ArrowUp className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    title="下移"
                    onClick={() => updateOutline((current) => ({
                      ...current,
                      chapters: moveItem(current.chapters, chapterIndex, chapterIndex + 1)
                    }))}
                    className="rounded-lg p-2 text-ds-muted hover:bg-ds-hover"
                  >
                    <ArrowDown className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    title="删除章"
                    onClick={() => deleteChapter(chapterIndex)}
                    className="rounded-lg p-2 text-ds-muted hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                <div className="space-y-2">
                  {chapter.sections.map((section, sectionIndex) => (
                    <div
                      key={section.id}
                      className="grid gap-2 rounded-lg border border-ds-border-muted bg-ds-main/45 p-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1.2fr)_130px_130px]"
                    >
                      <input
                        value={section.title}
                        onChange={(event) => updateSection(chapterIndex, sectionIndex, { title: event.target.value })}
                        className={fieldClass}
                      />
                      <input
                        value={section.writingGoal}
                        onChange={(event) => updateSection(chapterIndex, sectionIndex, { writingGoal: event.target.value })}
                        className={fieldClass}
                        placeholder="本节写作目标"
                      />
                      <input
                        type="number"
                        value={section.estimatedWords}
                        onChange={(event) => updateSection(chapterIndex, sectionIndex, {
                          estimatedWords: Number(event.target.value)
                        })}
                        className={fieldClass}
                      />
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => updateSection(chapterIndex, sectionIndex, {
                            confirmed: !section.confirmed
                          })}
                          className={`rounded-lg px-2 py-1.5 text-[11.5px] font-semibold ${
                            section.confirmed ? 'bg-emerald-600 text-white' : 'border border-ds-border text-ds-muted'
                          }`}
                        >
                          {section.confirmed ? '已确认' : '待确认'}
                        </button>
                        <button
                          type="button"
                          title="删除节"
                          onClick={() => deleteSection(chapterIndex, sectionIndex)}
                          className="rounded-lg p-2 text-ds-muted hover:bg-red-50 hover:text-red-600"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                      <input
                        value={section.keyConcepts.join('；')}
                        onChange={(event) => updateSection(chapterIndex, sectionIndex, {
                          keyConcepts: event.target.value.split(/[;；]/).map((item) => item.trim()).filter(Boolean)
                        })}
                        className={`${fieldClass} lg:col-span-4`}
                        placeholder="关键概念，用分号分隔"
                      />
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => addSection(chapterIndex)}
                  className="mt-3 inline-flex items-center gap-2 rounded-lg border border-dashed border-ds-border px-3 py-2 text-[12.5px] font-semibold text-ds-muted hover:border-accent hover:text-accent"
                >
                  <Plus className="h-4 w-4" />
                  增加小节
                </button>
              </section>
            ))}
          </div>
        )}

        {step === 'writing' && project && activeSection && (
          <div className="grid min-h-[calc(100vh-220px)] gap-4 xl:grid-cols-[270px_minmax(0,1fr)_360px]">
            <aside className="min-h-0 rounded-xl border border-ds-border-muted bg-ds-card p-3">
              <h2 className="mb-3 px-1 text-[13px] font-bold text-ds-text">章节树</h2>
              <div className="max-h-[calc(100vh-270px)] space-y-3 overflow-y-auto pr-1">
                {project.outline?.chapters.map((chapter, chapterIndex) => (
                  <div key={chapter.id}>
                    <p className="mb-1 px-2 text-[12px] font-semibold text-ds-muted">
                      第 {chapterIndex + 1} 章 {chapter.title}
                    </p>
                    <div className="space-y-1">
                      {chapter.sections.map((outlineSection, sectionIndex) => {
                        const section = project.sections.find((item) => item.id === outlineSection.id)
                        const active = activeSection.id === outlineSection.id
                        return (
                          <button
                            key={outlineSection.id}
                            type="button"
                            onClick={() => setActiveSectionId(outlineSection.id)}
                            className={`w-full rounded-lg px-2 py-2 text-left transition ${
                              active ? 'bg-accent text-white' : 'text-ds-text hover:bg-ds-hover'
                            }`}
                          >
                            <span className="block truncate text-[12.5px] font-semibold">
                              {chapterIndex + 1}.{sectionIndex + 1} {outlineSection.title}
                            </span>
                            <span className={`mt-1 block text-[11px] ${active ? 'text-white/70' : 'text-ds-faint'}`}>
                              {statusLabel(section?.status ?? 'draft')}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </aside>

            <main className="min-h-0 rounded-xl border border-ds-border-muted bg-ds-card p-4">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate text-[16px] font-bold text-ds-text">{activeSection.title}</h2>
                  <p className="mt-1 text-[12px] text-ds-muted">{activeSection.path} · {statusLabel(activeSection.status)}</p>
                </div>
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void generateActiveSection(sectionInstruction)}
                  className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-accent px-3 py-2 text-[12.5px] font-semibold text-white disabled:opacity-50"
                >
                  {busy === 'section' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  生成本节
                </button>
              </div>
              <ResizableTextArea
                value={activeSection.content}
                onChange={(event) => updateActiveSection({ content: event.target.value })}
                rows={22}
                className={`${fieldClass} min-h-[520px] font-mono leading-7`}
                placeholder="本节教材正文将在这里生成，也可以直接手动编辑 Markdown。"
              />
            </main>

            <aside className="space-y-4">
              <section className="rounded-xl border border-ds-border-muted bg-ds-card p-4">
                <h2 className="mb-3 text-[13px] font-bold text-ds-text">AI 写作助手</h2>
                <ResizableTextArea
                  value={sectionInstruction}
                  onChange={(event) => setSectionInstruction(event.target.value)}
                  rows={4}
                  className={fieldClass}
                  placeholder="输入对当前节的要求，例如：增加机制图与临床案例；压缩到 2500 字；改成本科教材语气。"
                />
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {[
                    '扩展机制深度',
                    '压缩文字密度',
                    '改写为本科教材风格',
                    '检查出版社规范'
                  ].map((instruction) => (
                    <button
                      key={instruction}
                      type="button"
                      disabled={busy !== null}
                      onClick={() => void reviseActiveSection(instruction)}
                      className="rounded-lg border border-ds-border px-2 py-2 text-[12px] font-semibold text-ds-text hover:bg-ds-hover disabled:opacity-50"
                    >
                      {instruction}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  disabled={!sectionInstruction.trim() || busy !== null}
                  onClick={() => void reviseActiveSection(sectionInstruction)}
                  className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-accent px-3 py-2 text-[12.5px] font-semibold text-accent hover:bg-accent/5 disabled:opacity-50"
                >
                  {busy === 'revise' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  按指令修订当前节
                </button>
              </section>

              <section className="rounded-xl border border-ds-border-muted bg-ds-card p-4">
                <h2 className="mb-3 flex items-center gap-2 text-[13px] font-bold text-ds-text">
                  <Search className="h-4 w-4 text-accent" />
                  PubMed 文献
                </h2>
                <div className="flex gap-2">
                  <input
                    value={pubmedQuery}
                    onChange={(event) => setPubmedQuery(event.target.value)}
                    className={fieldClass}
                    placeholder={activeSection.title}
                  />
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => void searchPubMed()}
                    className="shrink-0 rounded-lg bg-accent px-3 text-[12px] font-semibold text-white disabled:opacity-50"
                  >
                    {busy === 'pubmed' ? <Loader2 className="h-4 w-4 animate-spin" /> : '检索'}
                  </button>
                </div>
                <div className="mt-3 max-h-72 space-y-2 overflow-y-auto">
                  {pubmedRecords.map((reference) => (
                    <div key={reference.key} className="rounded-lg border border-ds-border-muted p-3">
                      <p className="line-clamp-2 text-[12.5px] font-semibold text-ds-text">{reference.title}</p>
                      <p className="mt-1 text-[11px] text-ds-muted">
                        {reference.journal || 'PubMed'} {reference.year ? `· ${reference.year}` : ''} {reference.pmid ? `· PMID ${reference.pmid}` : ''}
                      </p>
                      <div className="mt-2 flex gap-2">
                        <button
                          type="button"
                          onClick={() => addReference(reference)}
                          className="rounded-md border border-ds-border px-2 py-1 text-[11.5px] font-semibold text-ds-text"
                        >
                          {selectedReferenceKeys.has(reference.key) ? '已入库' : '加入库'}
                        </button>
                        <button
                          type="button"
                          onClick={() => insertReference(reference)}
                          className="rounded-md bg-accent px-2 py-1 text-[11.5px] font-semibold text-white"
                        >
                          插入引用
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-xl border border-ds-border-muted bg-ds-card p-4">
                <h2 className="mb-2 text-[13px] font-bold text-ds-text">项目参考文献库</h2>
                <div className="max-h-44 space-y-2 overflow-y-auto">
                  {project.references.length === 0 ? (
                    <p className="text-[12px] text-ds-muted">尚未加入文献。</p>
                  ) : project.references.map((reference) => (
                    <p key={reference.key} className="rounded-lg bg-ds-subtle px-2 py-1.5 text-[11.5px] text-ds-muted">
                      [@{reference.key}] {reference.title}
                    </p>
                  ))}
                </div>
              </section>
            </aside>
          </div>
        )}

        {step === 'check' && project && (
          <div className="mx-auto grid max-w-6xl gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
            <section className="rounded-xl border border-ds-border-muted bg-ds-card p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-[16px] font-bold text-ds-text">一致性与规范检查</h2>
                  <p className="mt-1 text-[12.5px] text-ds-muted">检查出版社格式、术语一致性、章节衔接、引用缺失和证据边界。</p>
                </div>
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void runProjectCheck()}
                  className="inline-flex items-center gap-2 rounded-lg bg-accent px-3 py-2 text-[12.5px] font-semibold text-white disabled:opacity-50"
                >
                  {busy === 'check' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  开始检查
                </button>
              </div>
              <div className="space-y-3">
                {project.checks.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-ds-border px-4 py-10 text-center text-[13px] text-ds-muted">
                    尚未运行检查。
                  </div>
                ) : project.checks.map((item: TextbookCheckItem) => (
                  <div key={item.id} className="rounded-lg border border-ds-border-muted p-4">
                    <div className="mb-1 flex items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                        item.severity === 'error'
                          ? 'bg-red-100 text-red-700'
                          : item.severity === 'warning'
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-sky-100 text-sky-700'
                      }`}>
                        {item.severity}
                      </span>
                      <span className="text-[12px] font-semibold text-ds-muted">{item.scope}</span>
                    </div>
                    <p className="text-[13px] font-semibold text-ds-text">{item.message}</p>
                    {item.suggestion ? <p className="mt-1 text-[12.5px] text-ds-muted">{item.suggestion}</p> : null}
                  </div>
                ))}
              </div>
            </section>

            <aside className="space-y-4">
              <section className="rounded-xl border border-ds-border-muted bg-ds-card p-5">
                <h2 className="mb-3 flex items-center gap-2 text-[15px] font-bold text-ds-text">
                  <Download className="h-4 w-4 text-accent" />
                  导出教材项目
                </h2>
                <p className="mb-3 text-[12.5px] leading-6 text-ds-muted">
                  导出普通项目文件夹，包含出版社要求、大纲、参考文献、逐节 Markdown、合并 Markdown、DOCX 和项目文件。
                </p>
                <button
                  type="button"
                  onClick={() => void chooseOutputDirectory()}
                  className="mb-2 flex w-full items-center justify-center gap-2 rounded-lg border border-ds-border px-3 py-2 text-[12.5px] font-semibold text-ds-text"
                >
                  <FolderOpen className="h-4 w-4" />
                  {outputDirectory ? '更改导出文件夹' : '选择导出文件夹'}
                </button>
                {outputDirectory ? (
                  <p className="mb-3 break-all rounded-lg bg-ds-subtle px-2 py-1.5 text-[11px] text-ds-muted">{outputDirectory}</p>
                ) : null}
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void exportProject()}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-3 py-3 text-[13px] font-semibold text-white disabled:opacity-50"
                >
                  {busy === 'export' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  导出 Markdown / DOCX / 项目包
                </button>
                {exportPaths.length > 0 ? (
                  <div className="mt-3 space-y-1 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-[11px] text-emerald-800">
                    {exportPaths.map((path) => (
                      <p key={path} className="break-all">{path}</p>
                    ))}
                  </div>
                ) : null}
              </section>

              <section className="rounded-xl border border-ds-border-muted bg-ds-card p-5">
                <h2 className="mb-3 text-[15px] font-bold text-ds-text">项目摘要</h2>
                <div className="space-y-2 text-[12.5px] text-ds-muted">
                  <p>教材：{project.metadata.title}</p>
                  <p>章节：{project.outline?.chapters.length ?? 0} 章 / {project.sections.length} 节</p>
                  <p>已写：{completedCount} 节</p>
                  <p>参考文献：{project.references.length} 条</p>
                  <p>格式：{project.formatRules.fontFamily}，{project.formatRules.fontSizePt}pt，{project.formatRules.lineSpacing} 倍行距</p>
                </div>
              </section>
            </aside>
          </div>
        )}
      </div>
    </div>
  )
}
