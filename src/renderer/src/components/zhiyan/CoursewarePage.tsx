import {
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
import { ResizableTextArea } from './ResizableTextArea'

type CoursewarePageProps = {
  className?: string
}

type Step = 'request' | 'blueprint' | 'slides'
type BusyAction = 'source' | 'blueprint' | 'slides' | 'regenerate' | 'figure' | 'export' | null
type CoursewareWorkflowStepId = 'upload' | 'analysis' | 'visual-review' | 'generation'

type CoursewareWorkflowState = {
  step: Step
  busy: BusyAction
  hasSource: boolean
  hasBlueprint: boolean
  hasSlides: boolean
  hasVisuals: boolean
}

const COURSEWARE_WORKFLOW_STEPS: Array<{
  id: CoursewareWorkflowStepId
  marker: string
  label: string
  description: string
}> = [
  {
    id: 'upload',
    marker: '1',
    label: '上传教材',
    description: '选择 PDF 或 PPTX'
  },
  {
    id: 'analysis',
    marker: '2',
    label: 'AI 分析',
    description: '提取文字并生成蓝图'
  },
  {
    id: 'visual-review',
    marker: '3',
    label: '图片审核',
    description: '保留可用于课件的原图'
  },
  {
    id: 'generation',
    marker: '4',
    label: '生成课件',
    description: '逐页复核并导出'
  }
]

export function getCoursewareWorkflowStepIndex(state: CoursewareWorkflowState): number {
  if (state.busy === 'slides' || state.busy === 'export' || state.step === 'slides' || state.hasSlides) {
    return 3
  }
  if (state.hasSource && state.hasVisuals && !state.hasBlueprint && state.busy !== 'blueprint') {
    return 2
  }
  if (state.busy === 'source' || state.busy === 'blueprint' || state.step === 'blueprint' || state.hasBlueprint || state.hasSource) {
    return 1
  }
  return 0
}

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
  'w-full rounded-xl border border-ds-border bg-ds-card px-3.5 py-2.5 text-[13px] text-ds-text outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/10'
const labelClass = 'mb-1.5 block text-[12px] font-semibold text-ds-muted'

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
    <div className={`aspect-video overflow-hidden rounded-lg border bg-white p-3 text-slate-800 shadow-sm ${
      selected ? 'border-accent ring-2 ring-accent/20' : 'border-slate-200'
    }`}>
      <div className="mb-2 h-1 rounded-full bg-teal-600" />
      <p className="line-clamp-2 text-[10px] font-bold leading-tight text-slate-800">{slide.title}</p>
      {slide.kind === 'interaction' ? (
        <div className="mt-3 rounded-md border border-teal-200 bg-teal-50 p-2 text-center text-[8px] font-semibold">
          {slide.interaction?.prompt ?? slide.bullets[0]}
        </div>
      ) : slide.visual?.type === 'flow' && slide.visual.nodes?.length ? (
        <div className="mt-3 flex items-center gap-1">
          {slide.visual.nodes.slice(0, 4).map((node, index) => (
            <div key={`${node}-${index}`} className="flex min-w-0 flex-1 items-center gap-1">
              <span className="line-clamp-2 flex-1 rounded bg-teal-50 px-1 py-2 text-center text-[7px]">
                {node}
              </span>
              {index < Math.min(3, (slide.visual?.nodes?.length ?? 1) - 1) && (
                <ChevronRight className="h-2.5 w-2.5 shrink-0 text-teal-600" />
              )}
            </div>
          ))}
        </div>
      ) : (
        <ul className="mt-2 space-y-1 text-[7px] leading-tight">
          {slide.bullets.slice(0, 4).map((bullet, index) => (
            <li key={`${bullet}-${index}`} className="line-clamp-2">• {bullet}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function CoursewarePage({ className = '' }: CoursewarePageProps): ReactElement {
  const [step, setStep] = useState<Step>('request')
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
  const workflowStepIndex = getCoursewareWorkflowStepIndex({
    step,
    busy,
    hasSource: Boolean(sourceDocument || request.sourcePath),
    hasBlueprint: Boolean(blueprint),
    hasSlides: slides.length > 0,
    hasVisuals: sourceVisuals.length > 0
  })
  const canGenerateBlueprint = Boolean(
    request.sourcePath && request.topic.trim() && request.pageEnd >= request.pageStart
  )

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

  async function createBlueprint(extraInstruction = ''): Promise<void> {
    if (!canGenerateBlueprint) {
      setMessage('请选择 PDF 或 PPTX 教材，并填写授课主题。')
      return
    }
    setBusy('blueprint')
    setMessage('')
    setWarning('')
    try {
      if (!sourceText.trim()) {
        setMessage('教材中没有可用于生成课件的文字，请更换可搜索文件或先完成 OCR。')
        return
      }
      setFigurePage(request.pageStart)

      let records: EvidenceRef[] = evidence
      if (request.includeRecentLiterature) {
        const literature = await window.dsGui.searchPubMed({
          query: request.literatureQuery?.trim() || request.topic,
          maxResults: request.maxLiteratureResults,
          minYear: new Date().getFullYear() - 5
        })
        if (literature.ok) {
          records = literature.records
          setEvidence(records)
          if (records.length === 0) setWarning('PubMed 未检索到匹配记录，已按教材内容继续生成。')
        } else {
          records = []
          setEvidence([])
          setWarning(`PubMed 暂时不可用，已按教材内容继续生成：${literature.message}`)
        }
      } else {
        records = []
        setEvidence([])
      }

      const adjustedRequest = extraInstruction.trim()
        ? {
            ...request,
            focus: [request.focus, `教师本次调整要求：${extraInstruction}`].filter(Boolean).join('\n')
          }
        : request
      const result = await window.dsGui.generateCoursewareBlueprint({
        request: adjustedRequest,
        sourceText,
        evidence: records
      })
      if (!result.ok) {
        setMessage(result.message)
        return
      }
      setBlueprint(result.blueprint)
      setStep('blueprint')
      setBlueprintInstruction('')
      if (result.repaired) setWarning('模型输出已自动修复并通过结构校验，请复核蓝图。')
    } catch (error) {
      setMessage(errorMessage(error))
    } finally {
      setBusy(null)
    }
  }

  async function generateSlides(): Promise<void> {
    if (!blueprint || !sourceText) return
    const generationId = crypto.randomUUID()
    slideGenerationId.current = generationId
    setSlideGenerationProgress(null)
    setBusy('slides')
    setMessage('')
    try {
      const result = await window.dsGui.generateCoursewareSlides({
        request,
        blueprint,
        sourceText,
        evidence,
        generationId
      })
      if (!result.ok) {
        setSlides([])
        setSlideGenerationProgress(null)
        setStep('blueprint')
        setMessage(result.message)
        return
      }
      const assigned = assignApprovedVisualsToSlides(result.value, sourceVisuals)
      setSlides(assigned.slides)
      setActiveSlideIndex(0)
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
    } catch (error) {
      setMessage(errorMessage(error))
    } finally {
      slideGenerationId.current = null
      setBusy(null)
    }
  }

  async function regenerateActiveSlide(): Promise<void> {
    if (!activeSlide || !blueprint || !slideInstruction.trim()) return
    setBusy('regenerate')
    setMessage('')
    try {
      const result = await window.dsGui.regenerateCoursewareSlide({
        request,
        blueprint,
        sourceText,
        evidence,
        slide: activeSlide,
        instruction: slideInstruction
      })
      if (!result.ok) {
        setMessage(result.message)
        return
      }
      setSlides((current) => current.map((slide, index) =>
        index === activeSlideIndex ? result.value : slide
      ))
      setSlideInstruction('')
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
    setBusy('source')
    setMessage('')
    setWarning('')
    try {
      const project = await window.dsGui.loadCoursewareProject(selected.path)
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
      <div className="mx-auto w-full max-w-6xl px-5 py-7 sm:px-8">
        <header className="mb-5 flex flex-col gap-4 border-b border-ds-border-muted pb-5 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.16em] text-accent">
              <Presentation className="h-4 w-4" />
              教学课件包
            </div>
            <h1 className="text-[26px] font-bold tracking-tight text-ds-text">
              从教材章节到可直接授课的课件
            </h1>
            <p className="mt-1.5 text-[13px] text-ds-muted">
              先确认教学蓝图，再生成可编辑 PPT、逐页备注和 Word 讲稿。
            </p>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void openProject()}
              className="mt-3 inline-flex items-center gap-2 rounded-lg border border-ds-border px-3 py-1.5 text-[11px] font-semibold text-ds-text hover:border-accent"
            >
              <FileText className="h-3.5 w-3.5" />
              打开已有课件项目
            </button>
          </div>
        </header>

        <nav
          aria-label="课件生成流程"
          className="mb-6 rounded-2xl border border-ds-border-muted bg-ds-card px-3 py-3 shadow-sm sm:px-4"
        >
          <ol className="grid gap-2 md:grid-cols-4">
            {COURSEWARE_WORKFLOW_STEPS.map((item, index) => {
              const completed = index < workflowStepIndex
              const active = index === workflowStepIndex
              return (
                <li
                  key={item.id}
                  aria-current={active ? 'step' : undefined}
                  className={`rounded-xl border px-3 py-2.5 transition ${
                    active
                      ? 'border-accent/50 bg-accent/10 shadow-sm ring-1 ring-accent/20'
                      : completed
                        ? 'border-accent/20 bg-accent/5'
                        : 'border-transparent bg-ds-subtle/70'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ui-meta font-bold ${
                      completed || active ? 'bg-accent text-white' : 'bg-ds-card text-ds-faint'
                    }`}>
                      {completed ? <Check className="h-4 w-4" /> : item.marker}
                    </span>
                    <span className="min-w-0">
                      <span className={`block text-ui-body-sm font-semibold ${
                        completed || active ? 'text-ds-text' : 'text-ds-muted'
                      }`}>
                        {item.label}
                      </span>
                      <span className="mt-0.5 block truncate text-ui-caption text-ds-faint">
                        {item.description}
                      </span>
                    </span>
                  </div>
                </li>
              )
            })}
          </ol>
        </nav>

        {(message || warning) && (
          <div className={`mb-5 rounded-xl border px-4 py-3 text-[13px] ${
            message
              ? 'border-red-300/60 bg-red-50 text-red-800'
              : 'border-amber-300/60 bg-amber-50 text-amber-800'
          }`}>
            {message || warning}
          </div>
        )}

        {step === 'request' && (
          <div className="grid gap-5 lg:grid-cols-[1.25fr_0.75fr]">
            <section className="rounded-2xl border border-ds-border-muted bg-ds-card p-5 shadow-sm">
              <h2 className="mb-5 flex items-center gap-2 text-[16px] font-bold text-ds-text">
                <BookOpen className="h-5 w-5 text-accent" />
                教材与授课任务
              </h2>
              <div className="space-y-4">
                <div>
                  <span className={labelClass}>教材 PDF / PPTX</span>
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => void chooseSource()}
                    className="flex w-full items-center gap-3 rounded-xl border border-dashed border-ds-border bg-ds-subtle px-4 py-4 text-left transition hover:border-accent"
                  >
                    <Upload className="h-5 w-5 shrink-0 text-accent" />
                    <span className="min-w-0">
                      <span className="block text-[13px] font-semibold text-ds-text">
                        {busy === 'source'
                          ? '正在分析教材文字与图片…'
                          : request.sourcePath ? '已选择教材' : '选择 PDF 或 PPTX 教材'}
                      </span>
                      <span className="block truncate text-[11px] text-ds-muted">
                        {request.sourcePath
                          ? `${request.sourcePath} · 共 ${pageCount || request.pageEnd} 页`
                          : '将自动提取文字，并识别可用于新课件的原图'}
                      </span>
                    </span>
                  </button>
                </div>
                <div>
                  <label>
                    <span className={labelClass}>授课主题</span>
                    <input
                      value={request.topic}
                      onChange={(event) => setRequest((current) => ({
                        ...current,
                        topic: event.target.value
                      }))}
                      placeholder="例如：T 细胞活化与效应分化"
                      className={fieldClass}
                    />
                  </label>
                </div>
                <div className="grid gap-3 md:grid-cols-[160px_1fr]">
                  <label>
                    <span className={labelClass}>课时（分钟）</span>
                    <input
                      type="number"
                      min={20}
                      max={600}
                      value={request.durationMinutes}
                      onChange={(event) => setRequest((current) => ({
                        ...current,
                        durationMinutes: Number(event.target.value)
                      }))}
                      className={fieldClass}
                    />
                  </label>
                  <label>
                    <span className={labelClass}>本次教学重点</span>
                    <input
                      value={request.focus}
                      onChange={(event) => setRequest((current) => ({
                        ...current,
                        focus: event.target.value
                      }))}
                      placeholder="例如：突出血压调节的机制链，并加入高血压临床案例"
                      className={fieldClass}
                    />
                  </label>
                </div>
              </div>
            </section>

            <aside className="space-y-5">
              <section className="rounded-2xl border border-ds-border-muted bg-ds-card p-5 shadow-sm">
                <h2 className="mb-3 text-[14px] font-bold text-ds-text">授课对象</h2>
                <div className="space-y-2">
                  {AUDIENCE_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => setRequest((current) => ({ ...current, audience: preset.id }))}
                      className={`w-full rounded-xl border px-3.5 py-3 text-left transition ${
                        request.audience === preset.id
                          ? 'border-accent bg-accent/5'
                          : 'border-ds-border-muted hover:border-accent/40'
                      }`}
                    >
                      <span className="block text-[13px] font-semibold text-ds-text">{preset.label}</span>
                      <span className="mt-0.5 block text-[11px] leading-relaxed text-ds-muted">
                        {preset.description}
                      </span>
                    </button>
                  ))}
                </div>
              </section>
              <section className="rounded-2xl border border-ds-border-muted bg-ds-card p-5 shadow-sm">
                <label className="flex cursor-pointer items-start gap-3">
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
                    <span className="block text-[13px] font-semibold text-ds-text">补充最近 5 年进展</span>
                    <span className="mt-0.5 block text-[11px] leading-relaxed text-ds-muted">
                      从 PubMed 获取真实题录和摘要，并在课件中标注 PMID/DOI 与证据范围。
                    </span>
                  </span>
                </label>
                {request.includeRecentLiterature && (
                  <input
                    value={request.literatureQuery ?? ''}
                    onChange={(event) => setRequest((current) => ({
                      ...current,
                      literatureQuery: event.target.value
                    }))}
                    placeholder={`检索词，留空则使用“${request.topic || '授课主题'}”`}
                    className={`${fieldClass} mt-3`}
                  />
                )}
              </section>
            </aside>

            {sourceVisuals.length > 0 && (
              <section className="rounded-2xl border border-ds-border-muted bg-ds-card p-5 shadow-sm lg:col-span-2">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-[14px] font-bold text-ds-text">教材图片审核</h2>
                    <p className="mt-1 text-[11px] text-ds-muted">
                      已自动排除重复徽标和小装饰图。仅“保留”的图片会进入新课件。
                    </p>
                  </div>
                  <span className="rounded-full bg-ds-subtle px-3 py-1 text-[10px] text-ds-muted">
                    保留 {sourceVisuals.filter((asset) => asset.status === 'approved').length} /
                    共 {sourceVisuals.length} 张
                  </span>
                </div>
                <div className="grid max-h-[420px] gap-3 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-3">
                  {sourceVisuals.map((asset) => (
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
                          className="h-32 w-full bg-white object-contain"
                        />
                      )}
                      <div className="p-3">
                        <p className="line-clamp-2 text-[11px] font-semibold text-ds-text">
                          {asset.caption || asset.sourceName || '未命名教材图片'}
                        </p>
                        <p className="mt-1 text-[9px] text-ds-muted">
                          {asset.sourceKind === 'pptx' ? '原PPT' : 'PDF'} 第 {asset.sourceIndex} 页
                          {asset.occurrences.length > 1 ? ` · 出现 ${asset.occurrences.length} 次` : ''}
                        </p>
                        <button
                          type="button"
                          onClick={() => setSourceVisuals((current) => current.map((item) =>
                            item.id === asset.id
                              ? {
                                  ...item,
                                  status: item.status === 'approved' ? 'rejected' : 'approved',
                                  role: item.role === 'decorative' ? 'figure' : item.role
                                }
                              : item
                          ))}
                          className="mt-2 w-full rounded-lg border border-ds-border px-2 py-1.5 text-[10px] font-semibold text-ds-text"
                        >
                          {asset.status === 'approved' ? '排除这张图' : '保留这张图'}
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            )}

            <button
              type="button"
              disabled={!canGenerateBlueprint || busy !== null}
              onClick={() => void createBlueprint()}
              className="flex items-center justify-center gap-2 rounded-xl bg-accent px-5 py-3 text-[14px] font-semibold text-white shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 lg:col-span-2"
            >
              {busy === 'blueprint' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              生成课件蓝图
            </button>
          </div>
        )}

        {step === 'blueprint' && blueprint && (
          <div className="space-y-5">
            <section className="rounded-2xl border border-ds-border-muted bg-ds-card p-5 shadow-sm">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-[11px] font-semibold text-accent">{audienceLabel} · {request.durationMinutes} 分钟</p>
                  <input
                    value={blueprint.title}
                    onChange={(event) => setBlueprint({ ...blueprint, title: event.target.value })}
                    className="mt-1 w-full border-0 bg-transparent p-0 text-[22px] font-bold text-ds-text outline-none"
                  />
                  <ResizableTextArea
                    value={blueprint.teachingGoal}
                    onChange={(event) => setBlueprint({ ...blueprint, teachingGoal: event.target.value })}
                    rows={3}
                    aria-label="教学目标"
                    className="mt-2 min-h-[86px] border border-ds-border-muted bg-ds-subtle px-3.5 py-2.5 text-[13px] leading-relaxed text-ds-muted outline-none focus:border-accent focus:ring-2 focus:ring-accent/10"
                  />
                </div>
                <div className="rounded-xl bg-ds-subtle px-4 py-2 text-center">
                  <strong className="block text-[20px] text-ds-text">{totalSlides}</strong>
                  <span className="text-[10px] text-ds-muted">预计页数 · 最多 35 页</span>
                </div>
              </div>
            </section>

            <div className="space-y-3">
              {blueprint.sections.map((section, index) => (
                <section key={section.id} className="rounded-2xl border border-ds-border-muted bg-ds-card p-4 shadow-sm">
                  <div className="flex gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-[12px] font-bold text-accent">
                      {index + 1}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="grid gap-3 md:grid-cols-[1fr_110px]">
                        <input
                          value={section.title}
                          onChange={(event) => updateBlueprintSection(index, { title: event.target.value })}
                          className="border-0 bg-transparent p-0 text-[15px] font-bold text-ds-text outline-none"
                        />
                        <label className="flex items-center gap-2 text-[11px] text-ds-muted">
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
                      <p className="mt-2 text-[10px] text-ds-faint">
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
                        className="rounded-lg p-2 text-ds-muted hover:bg-red-50 hover:text-red-600"
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
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-ds-border py-3 text-[13px] font-semibold text-ds-muted transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              增加教学环节
            </button>

            <section className="rounded-2xl border border-ds-border-muted bg-ds-card p-4 shadow-sm">
              <span className={labelClass}>用一句话调整整个蓝图</span>
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
                  className="flex shrink-0 items-center justify-center gap-2 rounded-xl border border-accent px-4 py-2 text-[13px] font-semibold text-accent hover:bg-accent/5 disabled:opacity-50"
                >
                  {busy === 'blueprint' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  应用整体调整
                </button>
              </div>
            </section>

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
              <button
                type="button"
                onClick={() => setStep('request')}
                className="flex items-center justify-center gap-2 rounded-xl border border-ds-border px-5 py-3 text-[13px] font-semibold text-ds-text"
              >
                <ArrowLeft className="h-4 w-4" />
                返回修改教学任务
              </button>
              <button
                type="button"
                disabled={blueprint.sections.length === 0 || busy !== null}
                onClick={() => void generateSlides()}
                className="flex items-center justify-center gap-2 rounded-xl bg-accent px-6 py-3 text-[14px] font-semibold text-white disabled:opacity-50"
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
              <div className="rounded-xl border border-accent/30 bg-accent/5 px-4 py-3 text-[13px] text-ds-text xl:col-span-3">
                AI 正在逐批生成可直接授课的页面内容。当前显示的是进度占位稿，完成前请勿导出：
                {slideGenerationProgress.completedBatches}/{slideGenerationProgress.totalBatches} 批完成
                {slideGenerationProgress.degradedBatches > 0
                  ? `，${slideGenerationProgress.degradedBatches} 批未完成`
                  : ''}
              </div>
            )}
            <aside className="rounded-2xl border border-ds-border-muted bg-ds-card p-3 shadow-sm">
              <div className="mb-3 flex items-center justify-between px-1">
                <h2 className="text-[13px] font-bold text-ds-text">页面列表</h2>
                <span className="text-[11px] text-ds-muted">{slides.length} 页</span>
              </div>
              <div className="max-h-[calc(100vh-235px)] space-y-3 overflow-y-auto pr-1">
                {slides.map((slide, index) => (
                  <button
                    key={slide.id}
                    type="button"
                    onClick={() => setActiveSlideIndex(index)}
                    className="block w-full text-left"
                  >
                    <span className="mb-1 block text-[10px] text-ds-faint">第 {index + 1} 页</span>
                    <SlidePreview slide={slide} selected={index === activeSlideIndex} />
                  </button>
                ))}
              </div>
            </aside>

            <main className="space-y-4">
              <section className="rounded-2xl border border-ds-border-muted bg-ds-card p-5 shadow-sm">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-accent">
                      第 {activeSlideIndex + 1} 页 · {activeSlide.kind}
                    </p>
                    <h2 className="text-[15px] font-bold text-ds-text">逐页内容与讲稿</h2>
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
                  <span className={labelClass}>逐页讲稿 / PowerPoint 备注</span>
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

              <section className="rounded-2xl border border-ds-border-muted bg-ds-card p-4 shadow-sm">
                <span className={labelClass}>只重做当前页</span>
                <div className="flex flex-col gap-2 md:flex-row">
                  <input
                    value={slideInstruction}
                    onChange={(event) => setSlideInstruction(event.target.value)}
                    placeholder="例如：改成三列机制图，减少文字，并补充一个 CTLA-4 相关临床提示"
                    className={fieldClass}
                  />
                  <button
                    type="button"
                    disabled={!slideInstruction.trim() || busy !== null}
                    onClick={() => void regenerateActiveSlide()}
                    className="flex shrink-0 items-center justify-center gap-2 rounded-xl border border-accent px-4 py-2 text-[13px] font-semibold text-accent hover:bg-accent/5 disabled:opacity-50"
                  >
                    {busy === 'regenerate' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    重新生成本页
                  </button>
                </div>
              </section>
            </main>

            <aside className="space-y-4">
              {sourceVisuals.some((asset) => asset.status === 'approved' && asset.imageDataUrl) && (
                <section className="rounded-2xl border border-ds-border-muted bg-ds-card p-4 shadow-sm">
                  <h2 className="mb-3 flex items-center gap-2 text-[13px] font-bold text-ds-text">
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
                            className="h-20 w-full bg-white object-contain"
                          />
                          <span className="line-clamp-2 block px-2 py-1.5 text-[9px] text-ds-text">
                            {asset.caption || `${asset.sourceIndex} 页图片`}
                          </span>
                        </button>
                      ))}
                  </div>
                </section>
              )}

              {sourceDocument?.kind === 'pdf' && (
              <section className="rounded-2xl border border-ds-border-muted bg-ds-card p-4 shadow-sm">
                <h2 className="mb-3 flex items-center gap-2 text-[13px] font-bold text-ds-text">
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
                    className="shrink-0 rounded-xl border border-ds-border px-3 text-[12px] font-semibold text-ds-text"
                  >
                    {busy === 'figure' ? <Loader2 className="h-4 w-4 animate-spin" /> : '预览此页'}
                  </button>
                </div>
                {pagePreview ? (
                  <>
                    <p className="mt-2 text-[10px] text-ds-muted">在页面上拖动鼠标框选需要的教材图。</p>
                    <div
                      ref={previewRef}
                      onPointerDown={handleCropStart}
                      onPointerMove={handleCropMove}
                      onPointerUp={handleCropEnd}
                      onPointerCancel={handleCropEnd}
                      className="relative mt-2 max-h-[360px] cursor-crosshair overflow-hidden rounded-lg border border-ds-border bg-slate-100"
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
                      className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-3 py-2.5 text-[12px] font-semibold text-white disabled:opacity-50"
                    >
                      <ImagePlus className="h-4 w-4" />
                      裁剪并用于当前页
                    </button>
                  </>
                ) : (
                  <div className="mt-3 rounded-xl bg-ds-subtle px-3 py-5 text-center text-[11px] leading-relaxed text-ds-muted">
                    输入教材页码后预览。已使用的图片会记录页码和裁剪区域。
                  </div>
                )}
              </section>
              )}

              <section className="rounded-2xl border border-ds-border-muted bg-ds-card p-4 shadow-sm">
                <h2 className="mb-3 flex items-center gap-2 text-[13px] font-bold text-ds-text">
                  <Save className="h-4 w-4 text-accent" />
                  导出教学课件包
                </h2>
                <p className="mb-3 text-[11px] leading-relaxed text-ds-muted">
                  包含可编辑 PPTX、逐页讲稿 DOCX 和可继续修改的 `.zhiyan-courseware` 项目包。默认保存到教材所在文件夹。
                </p>
                <button
                  type="button"
                  onClick={() => void chooseOutputDirectory()}
                  className="mb-2 flex w-full items-center justify-center gap-2 rounded-xl border border-ds-border px-3 py-2 text-[12px] font-semibold text-ds-text"
                >
                  <FileText className="h-4 w-4" />
                  {outputDirectory ? '更改保存位置' : '选择其他保存位置'}
                </button>
                {outputDirectory && (
                  <p className="mb-2 break-all rounded-lg bg-ds-subtle px-2 py-1.5 text-[10px] text-ds-muted">
                    {outputDirectory}
                  </p>
                )}
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void exportPackage()}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-3 py-3 text-[13px] font-semibold text-white disabled:opacity-50"
                >
                  {busy === 'export' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  导出完整课件包
                </button>
                {exportPaths.length > 0 && (
                  <div className="mt-3 rounded-xl border border-green-200 bg-green-50 p-3">
                    <p className="mb-1 text-[11px] font-bold text-green-800">导出完成</p>
                    {exportPaths.map((path) => (
                      <p key={path} className="break-all text-[9px] leading-relaxed text-green-700">{path}</p>
                    ))}
                  </div>
                )}
              </section>

              <button
                type="button"
                onClick={() => setStep('blueprint')}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-ds-border px-4 py-2.5 text-[12px] font-semibold text-ds-muted"
              >
                <ArrowLeft className="h-4 w-4" />
                返回蓝图
              </button>
            </aside>
          </div>
        )}
      </div>
    </div>
  )
}
