import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactElement
} from 'react'
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  BookOpen,
  Check,
  ChevronRight,
  FileText,
  ImagePlus,
  Loader2,
  Plus,
  Presentation,
  RefreshCw,
  Save,
  Sparkles,
  Trash2,
  Upload
} from 'lucide-react'
import type {
  CoursewareAudience,
  CoursewareBlueprint,
  CoursewareProject,
  CoursewareRequest,
  CoursewareSourceDocument,
  EvidenceRef,
  SlideSpec,
  SourceVisualAsset
} from '../../../../shared/courseware'
import { MAX_COURSEWARE_SLIDES } from '../../../../shared/courseware'
import { assignApprovedVisualsToSlides } from '../../../../shared/courseware-visual-assignment'
import {
  cropImageDataUrl,
  materializePdfVisualAssets,
  renderPdfPageDataUrl,
  type NormalizedCrop
} from '../../lib/pdf-page-image'
import { loadCoursewareContextDefaults } from '../../lib/module-context'
import { usePendingArtifactStore } from '../../lib/resume-artifact'
import { requestIntentBrief } from '../../lib/intent-context'
import { createWorkflowRunner, type WorkflowRunner } from '../../lib/workflow-runner'
import { rendererRuntimeClient } from '../../agent/runtime-client'
import { updateIntentField, type IntentBrief } from '@shared/intent-brief'
import { startWorkflowRun, type WorkflowMode, type WorkflowRunState } from '@shared/workflow'
import { AiWorkExamples } from '../ai-work/AiWorkPage'
import { IntentBriefChips } from '../ai-work/IntentBriefChips'
import { IntentComposer } from '../ai-work/IntentComposer'
import { WorkflowProgress } from '../ai-work/WorkflowProgress'
import {
  LONG_DECK_SLIDES,
  coursewareRequestFromBrief,
  speakerNotesChanged,
  visualReviewMessage,
  visualReviewSummary,
  withRegeneratedNotes
} from './courseware-flow'
import type { ToolPrefill } from '../../lib/tool-request'
import { PAGE_HEADER_ACTION_CLASS, PageColumn, PageHeader } from './PageHeader'
import { ResizableTextArea } from './ResizableTextArea'

type CoursewarePageProps = {
  className?: string
  /** A request from the AI assistant, used as the lesson topic. */
  prefill?: ToolPrefill
}

type Step = 'start' | 'blueprint' | 'slides'
type BusyAction = 'source' | 'blueprint' | 'slides' | 'regenerate' | 'figure' | 'export' | null
type ReviseScope = 'slide' | 'deck'

/** The last AI change to the slides, kept until the teacher keeps or undoes it (Tasks 2.3.3–2.3.4). */
type DeckChange = {
  before: SlideSpec[]
  label: string
  changed: number
  notesUpdated: number
  failed: number[]
}

export const COURSEWARE_EXAMPLES = [
  '根据这本教材第八章做一套 90 分钟的呼吸系统课件，给临床医学本科生',
  '做一套 T 细胞活化的课件，研究生，多放机制图',
  '用这份 PPT 改成 45 分钟的复习课，突出考点'
]

const AUDIENCE_PRESETS: Array<{
  id: CoursewareAudience
  label: string
  description: string
}> = [
  {
    id: 'undergraduate',
    label: '本科生',
    description: '可直接授课的完整内容、机制链条与临床例子'
  },
  {
    id: 'graduate',
    label: '研究生',
    description: '前沿证据、争议、实验方法与替代解释'
  },
  {
    id: 'international',
    label: '国际学生',
    description: '英文为主，关键术语中英对照'
  }
]

const fieldClass =
  'w-full rounded-xl border border-ds-border bg-ds-card px-3.5 py-2.5 text-small text-ds-text outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/10'
const labelClass = 'mb-1.5 block text-caption font-semibold text-ds-muted'

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function sectionSlideTotal(blueprint: CoursewareBlueprint | null): number {
  return blueprint?.sections.reduce((sum, section) => sum + section.slideCount, 0) ?? 0
}

function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (to < 0 || to >= items.length || from === to) return items
  const next = [...items]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

function SlidePreview({ slide, selected }: { slide: SlideSpec; selected: boolean }): ReactElement {
  return (
    <div className={`aspect-video overflow-hidden rounded-lg border bg-slide-paper p-3 text-slide-ink shadow-sm ${
      selected ? 'border-accent ring-2 ring-accent/20' : 'border-ds-border-muted'
    }`}>
      <div className="mb-2 h-1 rounded-full bg-slide-accent" />
      <p className="line-clamp-2 text-thumb-title font-bold leading-tight text-slide-ink">{slide.title}</p>
      {slide.kind === 'interaction' ? (
        <div className="mt-3 rounded-md border border-slide-line bg-slide-accent-tint p-2 text-center text-thumb-callout font-semibold">
          {slide.interaction?.prompt ?? slide.bullets[0]}
        </div>
      ) : slide.visual?.type === 'flow' && slide.visual.nodes?.length ? (
        <div className="mt-3 flex items-center gap-1">
          {slide.visual.nodes.slice(0, 4).map((node, index) => (
            <div key={`${node}-${index}`} className="flex min-w-0 flex-1 items-center gap-1">
              <span className="line-clamp-2 flex-1 rounded bg-slide-tint px-1 py-2 text-center text-thumb-body">
                {node}
              </span>
              {index < Math.min(3, (slide.visual?.nodes?.length ?? 1) - 1) && (
                <ChevronRight className="h-2.5 w-2.5 shrink-0 text-slide-accent" />
              )}
            </div>
          ))}
        </div>
      ) : (
        <ul className="mt-2 space-y-1 text-thumb-body leading-tight">
          {slide.bullets.slice(0, 4).map((bullet, index) => (
            <li key={`${bullet}-${index}`} className="line-clamp-2">• {bullet}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function CoursewarePage({ className = '', prefill }: CoursewarePageProps): ReactElement {
  const [step, setStep] = useState<Step>('start')
  const [busy, setBusy] = useState<BusyAction>(null)
  const [message, setMessage] = useState('')
  const [warning, setWarning] = useState('')
  const [sourceText, setSourceText] = useState('')
  const [evidence, setEvidence] = useState<EvidenceRef[]>([])
  const [blueprint, setBlueprint] = useState<CoursewareBlueprint | null>(null)
  const [slides, setSlides] = useState<SlideSpec[]>([])
  const [sourceDocument, setSourceDocument] = useState<CoursewareSourceDocument | null>(null)
  const [sourceVisuals, setSourceVisuals] = useState<SourceVisualAsset[]>([])
  const [activeSlideIndex, setActiveSlideIndex] = useState(0)
  const [blueprintInstruction, setBlueprintInstruction] = useState('')
  const [slideInstruction, setSlideInstruction] = useState('')
  const [outputDirectory, setOutputDirectory] = useState('')
  const [exportPaths, setExportPaths] = useState<string[]>([])
  const [slideGenerationProgress, setSlideGenerationProgress] = useState<{
    completedBatches: number
    totalBatches: number
    degradedBatches: number
  } | null>(null)
  const [request, setRequest] = useState<CoursewareRequest>({
    sourcePath: '',
    pageStart: 1,
    pageEnd: 20,
    topic: '',
    durationMinutes: 90,
    audience: 'undergraduate',
    focus: '',
    includeRecentLiterature: false,
    literatureQuery: '',
    maxLiteratureResults: 6
  })
  const [input, setInput] = useState(prefill?.text ?? '')
  const [brief, setBrief] = useState<IntentBrief | null>(null)
  const [run, setRun] = useState<WorkflowRunState | null>(null)
  const [mode, setMode] = useState<WorkflowMode>('auto')
  const [reviewIds, setReviewIds] = useState<string[]>([])
  const [reviseScope, setReviseScope] = useState<ReviseScope>('slide')
  const [reviseProgress, setReviseProgress] = useState<{ done: number; total: number } | null>(null)
  const [deckChange, setDeckChange] = useState<DeckChange | null>(null)
  // Slides edited by hand since their notes were written.
  const [staleNotes, setStaleNotes] = useState<Set<string>>(new Set())
  const runner = useRef<WorkflowRunner | null>(null)
  const briefRef = useRef<IntentBrief | null>(null)
  const sentenceRef = useRef('')
  // A request from the AI assistant fills the input box once per request.
  useEffect(() => {
    if (prefill) setInput(prefill.text)
  }, [prefill])

  const [figurePage, setFigurePage] = useState(1)
  const [figureCaption, setFigureCaption] = useState('')
  const [pagePreview, setPagePreview] = useState('')
  const [pageCount, setPageCount] = useState(0)
  const [crop, setCrop] = useState<NormalizedCrop | null>(null)
  const dragStart = useRef<{ x: number; y: number } | null>(null)
  const previewRef = useRef<HTMLDivElement | null>(null)
  const slideGenerationId = useRef<string | null>(null)

  const activeSlide = slides[activeSlideIndex] ?? null
  const totalSlides = sectionSlideTotal(blueprint)
  // The flow's stages run before React re-renders, so they read the latest values from refs; these
  // follow every render and are also set directly when a stage produces a new value.
  const requestRef = useRef(request)
  const sourceTextRef = useRef(sourceText)
  const evidenceRef = useRef(evidence)
  const blueprintRef = useRef(blueprint)
  const visualsRef = useRef(sourceVisuals)
  requestRef.current = request
  sourceTextRef.current = sourceText
  evidenceRef.current = evidence
  blueprintRef.current = blueprint
  visualsRef.current = sourceVisuals

  useEffect(() => {
    void rendererRuntimeClient.getSettings()
      .then((settings) => setMode(settings.workflowMode === 'step' ? 'step' : 'auto'))
      .catch(() => undefined)
  }, [])

  const audienceLabel = useMemo(
    () => AUDIENCE_PRESETS.find((preset) => preset.id === request.audience)?.label ?? '',
    [request.audience]
  )

  useEffect(() => {
    if (!window.dsGui?.onCoursewareSlideGenerationProgress) return undefined
    return window.dsGui.onCoursewareSlideGenerationProgress((progress) => {
      if (!progress.generationId || progress.generationId !== slideGenerationId.current) return
      setSlides(progress.slides)
      setActiveSlideIndex((current) => Math.min(current, Math.max(0, progress.slides.length - 1)))
      setSlideGenerationProgress({
        completedBatches: progress.completedBatches,
        totalBatches: progress.totalBatches,
        degradedBatches: progress.degradedBatches
      })
      setStep('slides')
    })
  }, [])

  useEffect(() => {
    let cancelled = false
    void loadCoursewareContextDefaults().then((defaults) => {
      if (cancelled || !defaults) return
      setRequest((current) => ({
        ...current,
        topic: current.topic.trim() ? current.topic : defaults.topic,
        durationMinutes: current.durationMinutes === 90 ? defaults.durationMinutes : current.durationMinutes,
        audience: current.audience === 'undergraduate' ? defaults.audience : current.audience,
        focus: current.focus.trim() ? current.focus : defaults.focus
      }))
    })
    return () => {
      cancelled = true
    }
  }, [])

  // Shows a saved project, read by `load`; used by 打开项目 and by 继续上次的工作 on the home page.
  const showProject = useCallback(async (load: () => Promise<CoursewareProject>): Promise<void> => {
    setBusy('source')
    setMessage('')
    setWarning('')
    try {
      const project = await load()
      setRequest(project.request)
      setSourceDocument(project.sourceDocument)
      setSourceVisuals(project.sourceVisuals)
      setEvidence(project.evidence)
      setBlueprint(project.blueprint)
      setSlides(project.slides)
      setPageCount(project.sourceDocument.pageCount)
      setFigurePage(project.request.pageStart)
      setActiveSlideIndex(0)
      setStep('slides')
      const analyzed = await window.dsGui.analyzeCoursewareSource(project.sourceDocument.path)
      if (analyzed.ok) {
        setSourceText(analyzed.text)
      } else {
        setSourceText('')
        setWarning('项目已打开；原教材暂时不可读取，因此可继续编辑和导出，但不能重新调用 AI 生成。')
      }
    } catch (error) {
      setMessage(errorMessage(error))
    } finally {
      setBusy(null)
    }
  }, [])

  // Courseware chosen in 继续上次的工作 on the home page.
  useEffect(() => {
    const artifact = usePendingArtifactStore.getState().take('ppt-gen')
    if (artifact) void showProject(() => window.dsGui.loadCoursewareArtifact(artifact.id))
  }, [showProject])

  async function chooseSource(): Promise<void> {
    const result = await window.dsGui.pickFile({
      filters: [{ name: '教材文件', extensions: ['pdf', 'pptx'] }]
    })
    if (!result.canceled && result.path) {
      setBusy('source')
      setMessage('')
      setWarning('')
      try {
        const analyzed = await window.dsGui.analyzeCoursewareSource(result.path)
        if (!analyzed.ok) {
          setMessage(analyzed.message)
          return
        }
        let assets = analyzed.assets
        if (analyzed.document.kind === 'pdf' && assets.length > 0) {
          const binary = await window.dsGui.readFileBinary(result.path)
          if (binary.ok) {
            assets = await materializePdfVisualAssets(binary.data, assets)
          } else {
            setWarning(`已读取教材文字，但自动提取图片失败：${binary.message}`)
          }
        }
        const sourceName = result.path.split(/[\\/]/).pop() ?? ''
        setSourceDocument(analyzed.document)
        setSourceText(analyzed.text)
        setSourceVisuals(assets)
        setRequest((current) => ({
          ...current,
          sourcePath: result.path as string,
          pageStart: 1,
          pageEnd: analyzed.document.pageCount,
          topic: current.topic || sourceName.replace(/\.(pdf|pptx)$/i, '')
        }))
        setPageCount(analyzed.document.pageCount)
        setFigurePage(1)
        setPagePreview('')
        setCrop(null)
        if (!analyzed.document.searchable || !analyzed.text.trim()) {
          setWarning('文件中未检测到可搜索文字。扫描版 PDF 需要先完成 OCR，才能生成可靠的课件内容。')
        }
      } catch (error) {
        setMessage(errorMessage(error))
      } finally {
        setBusy(null)
      }
    }
  }

  /** Returns the failure message, or null when the outline was made. */
  async function createBlueprint(extraInstruction = ''): Promise<string | null> {
    const current = requestRef.current
    if (!(current.sourcePath && current.topic.trim() && current.pageEnd >= current.pageStart)) {
      const failure = '请选择 PDF 或 PPTX 教材，并说明授课主题。'
      setMessage(failure)
      return failure
    }
    setBusy('blueprint')
    setMessage('')
    setWarning('')
    try {
      if (!sourceTextRef.current.trim()) {
        const failure = '教材中没有可用于生成课件的文字，请更换可搜索文件或先完成 OCR。'
        setMessage(failure)
        return failure
      }
      setFigurePage(current.pageStart)

      let records: EvidenceRef[] = []
      if (current.includeRecentLiterature) {
        const literature = await window.dsGui.searchPubMed({
          query: current.literatureQuery?.trim() || current.topic,
          maxResults: current.maxLiteratureResults,
          minYear: new Date().getFullYear() - 5
        })
        if (literature.ok) {
          records = literature.records
          if (records.length === 0) setWarning('PubMed 未检索到匹配记录，已按教材内容继续生成。')
        } else {
          setWarning(`PubMed 暂时不可用，已按教材内容继续生成：${literature.message}`)
        }
      }
      evidenceRef.current = records
      setEvidence(records)

      const adjustedRequest = extraInstruction.trim()
        ? {
            ...current,
            focus: [current.focus, `教师本次调整要求：${extraInstruction}`].filter(Boolean).join('\n')
          }
        : current
      const result = await window.dsGui.generateCoursewareBlueprint({
        request: adjustedRequest,
        sourceText: sourceTextRef.current,
        evidence: records
      })
      if (!result.ok) {
        setMessage(result.message)
        return result.message
      }
      blueprintRef.current = result.blueprint
      setBlueprint(result.blueprint)
      setStep('blueprint')
      setBlueprintInstruction('')
      if (result.repaired) setWarning('模型输出已自动修复并通过结构校验，请复核课件框架。')
      return null
    } catch (error) {
      const failure = errorMessage(error)
      setMessage(failure)
      return failure
    } finally {
      setBusy(null)
    }
  }

  /** Returns the failure message, or null when the slides were written. */
  async function generateSlides(): Promise<string | null> {
    const currentBlueprint = blueprintRef.current
    if (!currentBlueprint || !sourceTextRef.current) return '还没有课件框架。'
    const generationId = crypto.randomUUID()
    slideGenerationId.current = generationId
    setSlideGenerationProgress(null)
    setBusy('slides')
    setMessage('')
    try {
      const result = await window.dsGui.generateCoursewareSlides({
        request: requestRef.current,
        blueprint: currentBlueprint,
        sourceText: sourceTextRef.current,
        evidence: evidenceRef.current,
        generationId
      })
      if (!result.ok) {
        setSlides([])
        setSlideGenerationProgress(null)
        setStep('blueprint')
        setMessage(result.message)
        return result.message
      }
      const assigned = assignApprovedVisualsToSlides(result.value, visualsRef.current)
      setSlides(assigned.slides)
      setActiveSlideIndex(0)
      setStaleNotes(new Set())
      setDeckChange(null)
      setStep('slides')
      if (assigned.unmatchedAssetIds.length > 0) {
        setWarning(`有 ${assigned.unmatchedAssetIds.length} 张已保留图片尚未匹配页面，可在逐页复核时手工指定。`)
      }
      if ((result.degradedBatches ?? 0) > 0) {
        setWarning(
          `${result.degradedBatches} 个模型批次未完成授课版内容；对应页面目前只是占位稿，请重新生成或逐页重做后再导出。`
        )
      } else if (result.repaired) {
        setWarning('部分逐页内容已自动修复格式，请重点复核讲稿和引用。')
      }
      return null
    } catch (error) {
      const failure = errorMessage(error)
      setMessage(failure)
      return failure
    } finally {
      slideGenerationId.current = null
      setBusy(null)
    }
  }

  const showBrief = (next: IntentBrief): void => {
    briefRef.current = next
    setBrief(next)
  }

  /** One sentence and a textbook: read the key points, check images, outline, write slides (Task 2.3.2). */
  async function startFlow(): Promise<void> {
    const sentence = input.trim()
    if (!requestRef.current.sourcePath || !sourceTextRef.current.trim()) {
      setMessage('请先选择教材 PDF 或 PPTX，课件内容以教材为依据。')
      return
    }
    sentenceRef.current = sentence
    setMessage('')
    setWarning('')
    const sourceName = requestRef.current.sourcePath.split(/[\\/]/).pop() ?? '教材'
    const flow = createWorkflowRunner({
      initial: startWorkflowRun(`ppt-gen-${Date.now()}`, 'ppt-gen', mode, new Date().toISOString()),
      onChange: setRun,
      handlers: {
        read: async () => {
          const outcome = await requestIntentBrief('ppt-gen', sentence, [{ name: sourceName, text: sourceTextRef.current }])
          if (!outcome.ok) throw new Error(outcome.message)
          showBrief(outcome.brief)
          const next = coursewareRequestFromBrief(requestRef.current, outcome.brief, sentence)
          requestRef.current = next
          setRequest(next)
          if (outcome.brief.missing.length > 0) {
            return { checkpoint: { kind: 'missing-required', message: outcome.brief.question ?? '还缺少必要的要点，请在上方补充。' } }
          }
        },
        images: async () => {
          const review = visualReviewSummary(visualsRef.current)
          setReviewIds(review.uncertainIds)
          if (review.uncertainIds.length > 0) {
            return { checkpoint: { kind: 'uncertain-image', message: visualReviewMessage(review) } }
          }
        },
        outline: async () => {
          const failure = await createBlueprint()
          if (failure) throw new Error(failure)
          return {
            checkpoint: { kind: 'outline', message: '课件框架已生成，可以调整各环节和页数后继续。' },
            longContent: sectionSlideTotal(blueprintRef.current) > LONG_DECK_SLIDES
          }
        },
        slides: async () => {
          const failure = await generateSlides()
          if (failure) throw new Error(failure)
        },
        ready: async () => {
          setStep('slides')
        }
      }
    })
    runner.current = flow
    await flow.run()
  }

  function continueFlow(): void {
    const flow = runner.current
    if (!flow) return
    if (briefRef.current && briefRef.current.missing.length > 0) {
      setMessage('请先在要点里补充标为“待补充”的内容。')
      return
    }
    setMessage('')
    void flow.run()
  }

  function restartFlow(): void {
    runner.current?.stop()
    runner.current = null
    setRun(null)
    setBrief(null)
    briefRef.current = null
    setReviewIds([])
    setStep('start')
  }

  /** Applies one sentence to the current slide or to every slide, as one change to keep or undo. */
  async function reviseSlides(instruction: string): Promise<void> {
    if (!blueprint || !instruction.trim() || slides.length === 0) return
    const targets = reviseScope === 'deck' ? slides.map((_, index) => index) : [activeSlideIndex]
    const before = slides
    let next = slides
    let notesUpdated = 0
    let changed = 0
    const failed: number[] = []
    setBusy('regenerate')
    setMessage('')
    try {
      for (const [done, index] of targets.entries()) {
        setReviseProgress({ done, total: targets.length })
        const result = await window.dsGui.regenerateCoursewareSlide({
          request,
          blueprint,
          sourceText,
          evidence,
          slide: next[index],
          instruction
        })
        if (!result.ok) {
          failed.push(index + 1)
          continue
        }
        if (speakerNotesChanged(next[index], result.value)) notesUpdated += 1
        changed += 1
        next = next.map((slide, slideIndex) => slideIndex === index ? result.value : slide)
        setSlides(next)
      }
      const updatedIds = new Set(targets.filter((index) => !failed.includes(index + 1)).map((index) => next[index].id))
      setStaleNotes((current) => new Set([...current].filter((id) => !updatedIds.has(id))))
      setDeckChange({
        before,
        label: reviseScope === 'deck' ? '整套课件' : `第 ${activeSlideIndex + 1} 页`,
        changed,
        notesUpdated,
        failed
      })
    } catch (error) {
      setMessage(errorMessage(error))
    } finally {
      setReviseProgress(null)
      setBusy(null)
    }
  }

  /** Rewrites the current slide's notes from its content after the teacher edited it by hand. */
  async function refreshActiveNotes(): Promise<void> {
    if (!activeSlide || !blueprint) return
    setBusy('regenerate')
    setMessage('')
    try {
      const result = await window.dsGui.regenerateCoursewareSlide({
        request,
        blueprint,
        sourceText,
        evidence,
        slide: activeSlide,
        instruction: '页面标题、正文和配图保持不变，只根据当前正文重写本页讲稿。'
      })
      if (!result.ok) {
        setMessage(result.message)
        return
      }
      const before = slides
      setSlides((current) => current.map((slide, index) =>
        index === activeSlideIndex ? withRegeneratedNotes(slide, result.value) : slide
      ))
      setStaleNotes((current) => new Set([...current].filter((id) => id !== activeSlide.id)))
      setDeckChange({ before, label: `第 ${activeSlideIndex + 1} 页的讲稿`, changed: 1, notesUpdated: 1, failed: [] })
    } catch (error) {
      setMessage(errorMessage(error))
    } finally {
      setBusy(null)
    }
  }

  async function chooseOutputDirectory(): Promise<void> {
    const result = await window.dsGui.pickWorkspaceDirectory(outputDirectory || undefined)
    if (!result.canceled && result.path) setOutputDirectory(result.path)
  }

  async function openProject(): Promise<void> {
    const selected = await window.dsGui.pickFile({
      filters: [
        { name: '智研课件项目', extensions: ['zhiyan-courseware'] },
        { name: '旧版课件项目', extensions: ['json'] }
      ]
    })
    if (selected.canceled || !selected.path) return
    const path = selected.path
    await showProject(() => window.dsGui.loadCoursewareProject(path))
  }

  async function exportPackage(): Promise<void> {
    if (!blueprint || !sourceDocument || slides.length === 0) return
    setBusy('export')
    setMessage('')
    setExportPaths([])
    const project: CoursewareProject = {
      version: 2,
      request,
      sourceDocument,
      blueprint,
      slides,
      sourceVisuals,
      evidence,
      generatedAt: new Date().toISOString()
    }
    try {
      const result = await window.dsGui.exportCoursewarePackage({
        project,
        outputDirectory: outputDirectory || undefined
      })
      if (!result.ok) {
        if (!result.canceled) setMessage(result.message ?? '课件包导出失败。')
        return
      }
      setExportPaths([result.pptxPath, result.docxPath, result.projectPath, result.qaReportPath])
      if (result.qaReport.issueCount > 0) {
        setWarning(
          `导出已完成；视觉质检发现 ${result.qaReport.issueCount} 个问题（${result.qaReport.errorCount} 个错误，${result.qaReport.warningCount} 个警告），请查看质检报告。`
        )
      }
    } catch (error) {
      setMessage(errorMessage(error))
    } finally {
      setBusy(null)
    }
  }

  function updateBlueprintSection(
    index: number,
    patch: Partial<CoursewareBlueprint['sections'][number]>
  ): void {
    setBlueprint((current) => {
      if (!current) return current
      const otherSlides = current.sections.reduce(
        (sum, section, sectionIndex) => sum + (sectionIndex === index ? 0 : section.slideCount),
        0
      )
      const nextPatch = patch.slideCount === undefined
        ? patch
        : {
            ...patch,
            slideCount: Math.max(
              1,
              Math.min(patch.slideCount, MAX_COURSEWARE_SLIDES - otherSlides)
            )
          }
      return {
        ...current,
        sections: current.sections.map((section, sectionIndex) =>
          sectionIndex === index ? { ...section, ...nextPatch } : section
        )
      }
    })
  }

  function addBlueprintSection(): void {
    setBlueprint((current) => {
      if (!current) return current
      const remaining = MAX_COURSEWARE_SLIDES - sectionSlideTotal(current)
      if (remaining <= 0) return current
      return {
          ...current,
          sections: [
            ...current.sections,
            {
              id: `section-${Date.now()}`,
              title: '新增教学环节',
              objective: '填写本节教学目标',
              summary: '填写本节内容主线',
              slideCount: Math.min(2, remaining),
              emphasis: [],
              interactionPrompt: '',
              visualSuggestion: ''
            }
          ]
        }
    })
  }

  function updateActiveSlide(patch: Partial<SlideSpec>): void {
    setSlides((current) => current.map((slide, index) =>
      index === activeSlideIndex ? { ...slide, ...patch } : slide
    ))
    // Hand edits to the content leave the notes behind until they are rewritten.
    if (activeSlide && (patch.title !== undefined || patch.bullets !== undefined)) {
      setStaleNotes((current) => new Set(current).add(activeSlide.id))
    }
  }

  async function loadFigurePage(): Promise<void> {
    if (!request.sourcePath) return
    setBusy('figure')
    setMessage('')
    try {
      const binary = await window.dsGui.readFileBinary(request.sourcePath)
      if (!binary.ok) {
        setMessage(binary.message)
        return
      }
      const rendered = await renderPdfPageDataUrl(binary.data, figurePage)
      setPagePreview(rendered.dataUrl)
      setPageCount(rendered.pageCount)
      setCrop(null)
    } catch (error) {
      setMessage(errorMessage(error))
    } finally {
      setBusy(null)
    }
  }

  function pointerPosition(event: ReactPointerEvent<HTMLDivElement>): { x: number; y: number } {
    const rect = event.currentTarget.getBoundingClientRect()
    return {
      x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height))
    }
  }

  function handleCropStart(event: ReactPointerEvent<HTMLDivElement>): void {
    event.currentTarget.setPointerCapture(event.pointerId)
    const point = pointerPosition(event)
    dragStart.current = point
    setCrop({ x: point.x, y: point.y, width: 0.01, height: 0.01 })
  }

  function handleCropMove(event: ReactPointerEvent<HTMLDivElement>): void {
    if (!dragStart.current) return
    const point = pointerPosition(event)
    setCrop({
      x: Math.min(dragStart.current.x, point.x),
      y: Math.min(dragStart.current.y, point.y),
      width: Math.max(0.01, Math.abs(point.x - dragStart.current.x)),
      height: Math.max(0.01, Math.abs(point.y - dragStart.current.y))
    })
  }

  function handleCropEnd(): void {
    dragStart.current = null
  }

  async function attachFigure(): Promise<void> {
    if (!activeSlide || !pagePreview) return
    setBusy('figure')
    setMessage('')
    try {
      const selectedCrop = crop && crop.width > 0.02 && crop.height > 0.02
        ? crop
        : { x: 0, y: 0, width: 1, height: 1 }
      const imageDataUrl = await cropImageDataUrl(pagePreview, selectedCrop)
      const figure: SourceVisualAsset = {
        id: `figure-${Date.now()}`,
        sourceKind: 'pdf',
        sourceIndex: figurePage,
        mediaType: 'image/png',
        role: 'figure',
        status: 'approved',
        confidence: 1,
        occurrences: [figurePage],
        crop: selectedCrop,
        caption: figureCaption.trim() || `教材第 ${figurePage} 页配图`,
        imageDataUrl
      }
      setSourceVisuals((current) => [...current, figure])
      updateActiveSlide({
        visual: {
          type: 'source-figure',
          title: figure.caption,
          figureId: figure.id
        }
      })
      setFigureCaption('')
      setPagePreview('')
      setCrop(null)
    } catch (error) {
      setMessage(errorMessage(error))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className={`h-full overflow-y-auto bg-ds-main ${className}`}>
      {/* The start state is a start page (§5.3); outline and slides need the work width. */}
      <PageColumn width={step === 'start' ? 'start' : 'work'} className="py-8">
        <PageHeader
          module="ppt-gen"
          title="课件"
          description="说一句要讲什么，选好教材；AI 读出要点后自动生成框架、逐页内容和讲稿，之后可以逐页或整套修改。"
          actions={
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void openProject()}
              className={PAGE_HEADER_ACTION_CLASS}
            >
              <FileText className="h-4 w-4" />
              打开已有课件项目
            </button>
          }
        />

        {run ? (
          <div className="mb-5 space-y-3">
            {brief ? (
              <IntentBriefChips
                brief={brief}
                onChange={(key, value) => {
                  const next = updateIntentField(briefRef.current ?? brief, key, value)
                  showBrief(next)
                  setRequest((current) => coursewareRequestFromBrief(current, next, sentenceRef.current))
                }}
              />
            ) : null}
            <WorkflowProgress state={run} onStop={() => runner.current?.stop()} onContinue={continueFlow} />
            {run.status === 'stopped' || run.status === 'failed' ? (
              <button type="button" onClick={restartFlow} className="text-small text-ds-muted underline-offset-2 hover:text-ds-ink hover:underline">
                重新开始
              </button>
            ) : null}
          </div>
        ) : null}

        {(message || warning) && (
          <div className={`mb-5 rounded-xl border px-4 py-3 text-small ${
            message
              ? 'border-ds-danger/30 bg-ds-danger-soft text-ds-danger'
              : 'border-ds-warning/30 bg-ds-warning-soft text-ds-warning'
          }`}>
            {message || warning}
          </div>
        )}

        {step === 'start' && !run && (
          <div className="space-y-4">
            <IntentComposer
              value={input}
              onChange={setInput}
              onSubmit={() => void startFlow()}
              placeholder="例如：根据这本教材第八章做一套 90 分钟的课件，给临床医学本科生"
              busy={busy === 'source'}
              allowEmpty
              autoFocus
            />
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void chooseSource()}
              className="flex w-full items-center gap-3 rounded-xl border border-dashed border-ds-border bg-ds-subtle px-4 py-3 text-left transition hover:border-accent"
            >
              <Upload className="h-5 w-5 shrink-0 text-accent" />
              <span className="min-w-0">
                <span className="block text-small font-semibold text-ds-text">
                  {busy === 'source'
                    ? '正在读取教材文字与图片…'
                    : request.sourcePath ? `教材：${request.sourcePath.split(/[\\/]/).pop()}` : '选择教材 PDF 或 PPTX'}
                </span>
                <span className="block truncate text-caption text-ds-muted">
                  {request.sourcePath
                    ? `共 ${pageCount || request.pageEnd} 页 · 点击可更换`
                    : '课件内容以教材为依据，并会识别可用的原图'}
                </span>
              </span>
            </button>
            <label className="flex cursor-pointer items-start gap-3 text-small text-ds-text">
              <input
                type="checkbox"
                checked={request.includeRecentLiterature}
                onChange={(event) => setRequest((current) => ({
                  ...current,
                  includeRecentLiterature: event.target.checked
                }))}
                className="mt-0.5 h-4 w-4 accent-[var(--ds-accent)]"
              />
              <span>
                补充最近 5 年进展
                <span className="block text-caption text-ds-muted">从 PubMed 获取真实题录，并在课件中标注 PMID/DOI。</span>
              </span>
            </label>
            <AiWorkExamples examples={COURSEWARE_EXAMPLES} onSelect={setInput} />
          </div>
        )}

        {step === 'start' && run?.checkpoint?.kind === 'uncertain-image' && (
          <section className="rounded-2xl border border-ds-border-muted bg-ds-card p-5 shadow-sm">
            <p className="mb-3 text-caption text-ds-muted">
              以下图片 AI 不确定是否适合放进课件（可能是装饰图、版权不明或与内容匹配度低）。保留或排除后点“继续”。
            </p>
            <div className="grid max-h-[420px] gap-3 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-3">
              {sourceVisuals.filter((asset) => reviewIds.includes(asset.id)).map((asset) => (
                <article
                  key={asset.id}
                  className={`overflow-hidden rounded-xl border ${
                    asset.status === 'approved'
                      ? 'border-accent/50 bg-accent/5'
                      : 'border-ds-border-muted bg-ds-subtle opacity-70'
                  }`}
                >
                  {asset.imageDataUrl && (
                    <img
                      src={asset.imageDataUrl}
                      alt={asset.caption || asset.sourceName || '教材图片'}
                      className="h-32 w-full bg-slide-paper object-contain"
                    />
                  )}
                  <div className="p-3">
                    <p className="line-clamp-2 text-caption font-semibold text-ds-text">
                      {asset.caption || asset.sourceName || '未命名教材图片'}
                    </p>
                    <p className="mt-1 text-caption text-ds-muted">
                      {asset.sourceKind === 'pptx' ? '原PPT' : 'PDF'} 第 {asset.sourceIndex} 页
                    </p>
                    <button
                      type="button"
                      onClick={() => setSourceVisuals((current) => current.map((item) =>
                        item.id === asset.id
                          ? {
                              ...item,
                              status: item.status === 'approved' ? 'rejected' : 'approved',
                              // A decision by the teacher is certain.
                              confidence: 1,
                              role: item.role === 'decorative' ? 'figure' : item.role
                            }
                          : item
                      ))}
                      className="mt-2 w-full rounded-lg border border-ds-border px-2 py-1.5 text-caption font-semibold text-ds-text"
                    >
                      {asset.status === 'approved' ? '排除这张图' : '保留这张图'}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        {step === 'blueprint' && blueprint && (
          <div className="space-y-5">
            <section className="rounded-2xl border border-ds-border-muted bg-ds-card p-5 shadow-sm">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-caption font-semibold text-accent">{audienceLabel} · {request.durationMinutes} 分钟</p>
                  <input
                    value={blueprint.title}
                    onChange={(event) => setBlueprint({ ...blueprint, title: event.target.value })}
                    className="mt-1 w-full border-0 bg-transparent p-0 text-display font-bold text-ds-text outline-none"
                  />
                  <ResizableTextArea
                    value={blueprint.teachingGoal}
                    onChange={(event) => setBlueprint({ ...blueprint, teachingGoal: event.target.value })}
                    rows={3}
                    aria-label="教学目标"
                    className="mt-2 min-h-[86px] border border-ds-border-muted bg-ds-subtle px-3.5 py-2.5 text-small leading-relaxed text-ds-muted outline-none focus:border-accent focus:ring-2 focus:ring-accent/10"
                  />
                </div>
                <div className="rounded-xl bg-ds-subtle px-4 py-2 text-center">
                  <strong className="block text-title text-ds-text">{totalSlides}</strong>
                  <span className="text-caption text-ds-muted">预计页数 · 最多 35 页</span>
                </div>
              </div>
            </section>

            <div className="space-y-3">
              {blueprint.sections.map((section, index) => (
                <section key={section.id} className="rounded-2xl border border-ds-border-muted bg-ds-card p-4 shadow-sm">
                  <div className="flex gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-caption font-bold text-accent">
                      {index + 1}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="grid gap-3 md:grid-cols-[1fr_110px]">
                        <input
                          value={section.title}
                          onChange={(event) => updateBlueprintSection(index, { title: event.target.value })}
                          className="border-0 bg-transparent p-0 text-heading font-bold text-ds-text outline-none"
                        />
                        <label className="flex items-center gap-2 text-caption text-ds-muted">
                          页数
                          <input
                            type="number"
                            min={1}
                            max={MAX_COURSEWARE_SLIDES}
                            value={section.slideCount}
                            onChange={(event) => updateBlueprintSection(index, {
                              slideCount: Number(event.target.value)
                            })}
                            className={`${fieldClass} py-1.5`}
                          />
                        </label>
                      </div>
                      <p className="mt-2 text-caption text-ds-faint">
                        长内容会自动展开；拖动文本框右下角标记可继续调整高度。
                      </p>
                      <div className="mt-3 grid items-start gap-3 md:grid-cols-2">
                        <label>
                          <span className={labelClass}>本节目标</span>
                          <ResizableTextArea
                            value={section.objective}
                            onChange={(event) => updateBlueprintSection(index, { objective: event.target.value })}
                            rows={4}
                            className={`${fieldClass} min-h-[112px] leading-relaxed`}
                          />
                        </label>
                        <label>
                          <span className={labelClass}>内容主线</span>
                          <ResizableTextArea
                            value={section.summary}
                            onChange={(event) => updateBlueprintSection(index, { summary: event.target.value })}
                            rows={4}
                            className={`${fieldClass} min-h-[112px] leading-relaxed`}
                          />
                        </label>
                        <label>
                          <span className={labelClass}>互动节点</span>
                          <ResizableTextArea
                            value={section.interactionPrompt ?? ''}
                            onChange={(event) => updateBlueprintSection(index, {
                              interactionPrompt: event.target.value
                            })}
                            rows={3}
                            className={`${fieldClass} min-h-[92px] leading-relaxed`}
                          />
                        </label>
                        <label>
                          <span className={labelClass}>图示建议</span>
                          <ResizableTextArea
                            value={section.visualSuggestion ?? ''}
                            onChange={(event) => updateBlueprintSection(index, {
                              visualSuggestion: event.target.value
                            })}
                            rows={3}
                            className={`${fieldClass} min-h-[92px] leading-relaxed`}
                          />
                        </label>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col gap-1">
                      <button
                        type="button"
                        title="上移"
                        onClick={() => setBlueprint({
                          ...blueprint,
                          sections: moveItem(blueprint.sections, index, index - 1)
                        })}
                        className="rounded-lg p-2 text-ds-muted hover:bg-ds-hover hover:text-ds-text"
                      >
                        <ArrowUp className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        title="下移"
                        onClick={() => setBlueprint({
                          ...blueprint,
                          sections: moveItem(blueprint.sections, index, index + 1)
                        })}
                        className="rounded-lg p-2 text-ds-muted hover:bg-ds-hover hover:text-ds-text"
                      >
                        <ArrowDown className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        title="删除"
                        onClick={() => setBlueprint({
                          ...blueprint,
                          sections: blueprint.sections.filter((_, itemIndex) => itemIndex !== index)
                        })}
                        className="rounded-lg p-2 text-ds-muted hover:bg-ds-danger-soft hover:text-ds-danger"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </section>
              ))}
            </div>

            <button
              type="button"
              disabled={totalSlides >= MAX_COURSEWARE_SLIDES}
              onClick={addBlueprintSection}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-ds-border py-3 text-small font-semibold text-ds-muted transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              增加教学环节
            </button>

            <section className="rounded-2xl border border-ds-border-muted bg-ds-card p-4 shadow-sm">
              <span className={labelClass}>用一句话调整整个框架</span>
              <div className="flex flex-col gap-2 md:flex-row">
                <input
                  value={blueprintInstruction}
                  onChange={(event) => setBlueprintInstruction(event.target.value)}
                  placeholder="例如：增加一个药物不良反应案例，压缩历史背景部分"
                  className={fieldClass}
                />
                <button
                  type="button"
                  disabled={!blueprintInstruction.trim() || busy !== null}
                  onClick={() => void createBlueprint(blueprintInstruction)}
                  className="flex shrink-0 items-center justify-center gap-2 rounded-xl border border-accent px-4 py-2 text-small font-semibold text-accent hover:bg-accent/5 disabled:opacity-50"
                >
                  {busy === 'blueprint' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  应用整体调整
                </button>
              </div>
            </section>

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
              <button
                type="button"
                onClick={restartFlow}
                className="flex items-center justify-center gap-2 rounded-xl border border-ds-border px-5 py-3 text-small font-semibold text-ds-text"
              >
                <ArrowLeft className="h-4 w-4" />
                重新开始
              </button>
              <button
                type="button"
                disabled={blueprint.sections.length === 0 || busy !== null}
                // At the outline checkpoint the flow goes on from here; otherwise the slides are written now.
                onClick={() => (run?.status === 'waiting' ? continueFlow() : void generateSlides())}
                className="flex items-center justify-center gap-2 rounded-xl bg-accent px-6 py-3 text-body font-semibold text-white disabled:opacity-50"
              >
                {busy === 'slides' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                确认蓝图并生成 {totalSlides} 页课件
              </button>
            </div>
          </div>
        )}

        {step === 'slides' && blueprint && activeSlide && (
          <div className="grid gap-5 xl:grid-cols-[230px_minmax(0,1fr)_320px]">
            {busy === 'slides' && slideGenerationProgress && (
              <div className="rounded-xl border border-accent/30 bg-accent/5 px-4 py-3 text-small text-ds-text xl:col-span-3">
                AI 正在逐批生成可直接授课的页面内容。当前显示的是进度占位稿，完成前请勿导出：
                {slideGenerationProgress.completedBatches}/{slideGenerationProgress.totalBatches} 批完成
                {slideGenerationProgress.degradedBatches > 0
                  ? `，${slideGenerationProgress.degradedBatches} 批未完成`
                  : ''}
              </div>
            )}
            <aside className="rounded-2xl border border-ds-border-muted bg-ds-card p-3 shadow-sm">
              <div className="mb-3 flex items-center justify-between px-1">
                <h2 className="text-small font-bold text-ds-text">页面列表</h2>
                <span className="text-caption text-ds-muted">{slides.length} 页</span>
              </div>
              <div className="max-h-[calc(100vh-235px)] space-y-3 overflow-y-auto pr-1">
                {slides.map((slide, index) => (
                  <button
                    key={slide.id}
                    type="button"
                    onClick={() => setActiveSlideIndex(index)}
                    className="block w-full text-left"
                  >
                    <span className="mb-1 block text-caption text-ds-faint">第 {index + 1} 页</span>
                    <SlidePreview slide={slide} selected={index === activeSlideIndex} />
                  </button>
                ))}
              </div>
            </aside>

            <main className="space-y-4">
              <section className="rounded-2xl border border-ds-border-muted bg-ds-card p-5 shadow-sm">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <p className="text-caption font-semibold uppercase tracking-wider text-accent">
                      第 {activeSlideIndex + 1} 页 · {activeSlide.kind}
                    </p>
                    <h2 className="text-heading font-bold text-ds-text">逐页内容与讲稿</h2>
                  </div>
                  <Presentation className="h-5 w-5 text-ds-faint" />
                </div>
                <label>
                  <span className={labelClass}>页面标题</span>
                  <input
                    value={activeSlide.title}
                    onChange={(event) => updateActiveSlide({ title: event.target.value })}
                    className={fieldClass}
                  />
                </label>
                <label className="mt-3 block">
                  <span className={labelClass}>课堂投屏正文（每行一个完整知识陈述）</span>
                  <ResizableTextArea
                    value={activeSlide.bullets.join('\n')}
                    onChange={(event) => updateActiveSlide({
                      bullets: event.target.value.split('\n').map((item) => item.trim()).filter(Boolean)
                    })}
                    rows={6}
                    className={`${fieldClass} min-h-[150px] leading-relaxed`}
                  />
                </label>
                <label className="mt-3 block">
                  <span className={`${labelClass} flex items-center gap-2`}>
                    逐页讲稿 / PowerPoint 备注
                    {staleNotes.has(activeSlide.id) ? (
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={(event) => {
                          event.preventDefault()
                          void refreshActiveNotes()
                        }}
                        className="rounded-md border border-accent px-1.5 py-0.5 font-medium text-accent hover:bg-accent-soft disabled:opacity-50"
                      >
                        正文改过了，按正文更新讲稿
                      </button>
                    ) : null}
                  </span>
                  <ResizableTextArea
                    value={activeSlide.speakerNotes}
                    onChange={(event) => updateActiveSlide({ speakerNotes: event.target.value })}
                    rows={9}
                    className={`${fieldClass} min-h-[220px] leading-relaxed`}
                  />
                </label>
                {activeSlide.interaction && (
                  <div className="mt-3 grid gap-3 rounded-xl bg-ds-subtle p-3 md:grid-cols-2">
                    <label>
                      <span className={labelClass}>互动题</span>
                      <ResizableTextArea
                        value={activeSlide.interaction.prompt}
                        onChange={(event) => updateActiveSlide({
                          interaction: {
                            ...activeSlide.interaction!,
                            prompt: event.target.value
                          }
                        })}
                        rows={3}
                        className={`${fieldClass} min-h-[100px] leading-relaxed`}
                      />
                    </label>
                    <label>
                      <span className={labelClass}>参考答案</span>
                      <ResizableTextArea
                        value={activeSlide.interaction.answer}
                        onChange={(event) => updateActiveSlide({
                          interaction: {
                            ...activeSlide.interaction!,
                            answer: event.target.value
                          }
                        })}
                        rows={3}
                        className={`${fieldClass} min-h-[100px] leading-relaxed`}
                      />
                    </label>
                  </div>
                )}
              </section>

              <section className="rounded-2xl border border-ds-border-muted bg-ds-card p-4 shadow-sm" aria-label="说一句就改">
                <div className="mb-2 flex items-center gap-2 text-caption text-ds-muted">
                  <span className="shrink-0">修改范围</span>
                  {(['slide', 'deck'] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={reviseScope === value}
                      onClick={() => setReviseScope(value)}
                      className={`rounded-md border px-2 py-0.5 ${reviseScope === value ? 'border-accent bg-accent-soft text-accent-strong' : 'border-ds-border text-ds-text'}`}
                    >
                      {value === 'slide' ? `第 ${activeSlideIndex + 1} 页` : `整套课件（${slides.length} 页）`}
                    </button>
                  ))}
                </div>
                <IntentComposer
                  variant="panel"
                  value={slideInstruction}
                  onChange={setSlideInstruction}
                  onSubmit={() => {
                    const instruction = slideInstruction.trim()
                    if (!instruction) return
                    setSlideInstruction('')
                    void reviseSlides(instruction)
                  }}
                  placeholder={reviseScope === 'deck' ? '例如：每页文字不超过 5 行' : '例如：改成三列机制图，减少文字'}
                  busy={busy === 'regenerate'}
                />
                {reviseProgress ? (
                  <p role="status" className="mt-2 flex items-center gap-2 text-small text-ds-muted">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    正在修改第 {reviseProgress.done + 1} / {reviseProgress.total} 页……
                  </p>
                ) : null}
                {deckChange && !reviseProgress ? (
                  <div className="mt-3 rounded-xl border border-ds-border-muted bg-ds-subtle px-3 py-2 text-small text-ds-text">
                    <p className="font-semibold">
                      已修改{deckChange.label}：{deckChange.changed} 页
                      {deckChange.notesUpdated > 0 ? `，讲稿同步更新 ${deckChange.notesUpdated} 页` : ''}
                    </p>
                    {deckChange.failed.length > 0 ? (
                      <p className="mt-0.5 text-caption text-ds-danger">第 {deckChange.failed.join('、')} 页没有改成，保持原样。</p>
                    ) : null}
                    <div className="mt-2 flex gap-2">
                      <button type="button" onClick={() => setDeckChange(null)} className="rounded-lg bg-accent px-3 py-1 text-caption font-semibold text-white">
                        保留
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSlides(deckChange.before)
                          setDeckChange(null)
                        }}
                        className="rounded-lg border border-ds-border px-3 py-1 text-caption font-semibold text-ds-text"
                      >
                        撤销
                      </button>
                    </div>
                  </div>
                ) : null}
              </section>
            </main>

            <aside className="space-y-4">
              {sourceVisuals.some((asset) => asset.status === 'approved' && asset.imageDataUrl) && (
                <section className="rounded-2xl border border-ds-border-muted bg-ds-card p-4 shadow-sm">
                  <h2 className="mb-3 flex items-center gap-2 text-small font-bold text-ds-text">
                    <ImagePlus className="h-4 w-4 text-accent" />
                    已保留的教材图片
                  </h2>
                  <div className="grid max-h-64 grid-cols-2 gap-2 overflow-y-auto">
                    {sourceVisuals
                      .filter((asset) => asset.status === 'approved' && asset.imageDataUrl)
                      .map((asset) => (
                        <button
                          key={asset.id}
                          type="button"
                          onClick={() => updateActiveSlide({
                            visual: {
                              type: 'source-figure',
                              title: asset.caption || asset.sourceName || '教材原图',
                              figureId: asset.id
                            }
                          })}
                          className={`overflow-hidden rounded-lg border text-left ${
                            activeSlide.visual?.figureId === asset.id
                              ? 'border-accent ring-2 ring-accent/20'
                              : 'border-ds-border-muted'
                          }`}
                        >
                          <img
                            src={asset.imageDataUrl}
                            alt={asset.caption || '教材图片'}
                            className="h-20 w-full bg-slide-paper object-contain"
                          />
                          <span className="line-clamp-2 block px-2 py-1.5 text-caption text-ds-text">
                            {asset.caption || `${asset.sourceIndex} 页图片`}
                          </span>
                        </button>
                      ))}
                  </div>
                </section>
              )}

              {sourceDocument?.kind === 'pdf' && (
              <section className="rounded-2xl border border-ds-border-muted bg-ds-card p-4 shadow-sm">
                <h2 className="mb-3 flex items-center gap-2 text-small font-bold text-ds-text">
                  <ImagePlus className="h-4 w-4 text-accent" />
                  教材配图
                </h2>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min={1}
                    max={pageCount || undefined}
                    value={figurePage}
                    onChange={(event) => setFigurePage(Number(event.target.value))}
                    className={fieldClass}
                  />
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => void loadFigurePage()}
                    className="shrink-0 rounded-xl border border-ds-border px-3 text-caption font-semibold text-ds-text"
                  >
                    {busy === 'figure' ? <Loader2 className="h-4 w-4 animate-spin" /> : '预览此页'}
                  </button>
                </div>
                {pagePreview ? (
                  <>
                    <p className="mt-2 text-caption text-ds-muted">在页面上拖动鼠标框选需要的教材图。</p>
                    <div
                      ref={previewRef}
                      onPointerDown={handleCropStart}
                      onPointerMove={handleCropMove}
                      onPointerUp={handleCropEnd}
                      onPointerCancel={handleCropEnd}
                      className="relative mt-2 max-h-[360px] cursor-crosshair overflow-hidden rounded-lg border border-ds-border bg-ds-subtle"
                    >
                      <img src={pagePreview} alt={`教材第 ${figurePage} 页`} className="block h-auto w-full select-none" draggable={false} />
                      {crop && (
                        <div
                          className="pointer-events-none absolute border-2 border-accent bg-accent/10"
                          style={{
                            left: `${crop.x * 100}%`,
                            top: `${crop.y * 100}%`,
                            width: `${crop.width * 100}%`,
                            height: `${crop.height * 100}%`
                          }}
                        />
                      )}
                    </div>
                    <input
                      value={figureCaption}
                      onChange={(event) => setFigureCaption(event.target.value)}
                      placeholder="图注，例如：TCR 信号复合体"
                      className={`${fieldClass} mt-2`}
                    />
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => void attachFigure()}
                      className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-3 py-2.5 text-caption font-semibold text-white disabled:opacity-50"
                    >
                      <ImagePlus className="h-4 w-4" />
                      裁剪并用于当前页
                    </button>
                  </>
                ) : (
                  <div className="mt-3 rounded-xl bg-ds-subtle px-3 py-5 text-center text-caption leading-relaxed text-ds-muted">
                    输入教材页码后预览。已使用的图片会记录页码和裁剪区域。
                  </div>
                )}
              </section>
              )}

              <section className="rounded-2xl border border-ds-border-muted bg-ds-card p-4 shadow-sm">
                <h2 className="mb-3 flex items-center gap-2 text-small font-bold text-ds-text">
                  <Save className="h-4 w-4 text-accent" />
                  导出教学课件包
                </h2>
                <p className="mb-3 text-caption leading-relaxed text-ds-muted">
                  包含可编辑 PPTX、逐页讲稿 DOCX 和可继续修改的 `.zhiyan-courseware` 项目包。默认保存到教材所在文件夹。
                </p>
                <button
                  type="button"
                  onClick={() => void chooseOutputDirectory()}
                  className="mb-2 flex w-full items-center justify-center gap-2 rounded-xl border border-ds-border px-3 py-2 text-caption font-semibold text-ds-text"
                >
                  <FileText className="h-4 w-4" />
                  {outputDirectory ? '更改保存位置' : '选择其他保存位置'}
                </button>
                {outputDirectory && (
                  <p className="mb-2 break-all rounded-lg bg-ds-subtle px-2 py-1.5 text-caption text-ds-muted">
                    {outputDirectory}
                  </p>
                )}
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void exportPackage()}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-3 py-3 text-small font-semibold text-white disabled:opacity-50"
                >
                  {busy === 'export' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  导出完整课件包
                </button>
                {exportPaths.length > 0 && (
                  <div className="mt-3 rounded-xl border border-ds-success/30 bg-ds-success-soft p-3">
                    <p className="mb-1 text-caption font-bold text-ds-success">导出完成</p>
                    {exportPaths.map((path) => (
                      <p key={path} className="break-all text-caption leading-relaxed text-ds-success">{path}</p>
                    ))}
                  </div>
                )}
              </section>

              <button
                type="button"
                onClick={() => setStep('blueprint')}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-ds-border px-4 py-2.5 text-caption font-semibold text-ds-muted"
              >
                <ArrowLeft className="h-4 w-4" />
                返回框架
              </button>
            </aside>
          </div>
        )}
      </PageColumn>
    </div>
  )
}
