import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import PptxGenJS from 'pptxgenjs'
import {
  coursewareProjectSchema,
  type CoursewareExportRequest,
  type CoursewareExportResult,
  type CoursewareProject,
  type EvidenceRef,
  type SlideSpec
} from '../../shared/courseware'
import { writeCoursewareProjectArchive } from './courseware-project-service'

type HtmlToDocxConverter = (
  htmlString: string,
  headerHtmlString?: string | null,
  documentOptions?: {
    title?: string
    creator?: string
    description?: string
    font?: string
    fontSize?: number
  },
  footerHtmlString?: string | null
) => Promise<ArrayBuffer | Blob | Buffer>

const require = createRequire(import.meta.url)
const htmlToDocx = require('html-to-docx') as HtmlToDocxConverter

const COLORS = {
  navy: '153B50',
  teal: '2A7F88',
  paleTeal: 'E7F4F3',
  paleBlue: 'EDF4F8',
  ink: '172B35',
  muted: '5D7078',
  white: 'FFFFFF',
  line: 'B9CDD3',
  accent: 'D97706',
  paleAccent: 'FFF4DF'
} as const

function safeFileName(value: string): string {
  const withoutControlCharacters = Array.from(value, (character) =>
    character.charCodeAt(0) < 32 ? '-' : character
  ).join('')
  const cleaned = withoutControlCharacters
    .replace(/[<>:"/\\|?*]/g, '-')
    .replace(/\.+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return (cleaned || '医学免疫学课件').slice(0, 90)
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function evidenceLabel(evidence: EvidenceRef): string {
  const identifiers = [
    evidence.pmid ? `PMID: ${evidence.pmid}` : '',
    evidence.doi ? `DOI: ${evidence.doi}` : '',
    evidence.year ? String(evidence.year) : '',
    evidence.sourceType === 'abstract'
      ? '基于摘要'
      : evidence.sourceType === 'fulltext'
        ? '基于全文'
        : evidence.sourcePage
          ? `教材第 ${evidence.sourcePage} 页`
          : '教材'
  ].filter(Boolean)
  return `${evidence.title}${identifiers.length ? `（${identifiers.join('；')}）` : ''}`
}

function slideNotes(slide: SlideSpec): string {
  const parts = [slide.speakerNotes]
  if (slide.interaction) {
    parts.push(`互动题：${slide.interaction.prompt}`, `参考答案：${slide.interaction.answer}`)
  }
  if (slide.evidenceRefs.length) {
    parts.push('本页来源：', ...slide.evidenceRefs.map((item) => evidenceLabel(item)))
  }
  return parts.join('\n\n')
}

function addSlideHeader(
  pptx: PptxGenJS,
  slide: PptxGenJS.Slide,
  title: string,
  index: number,
  total: number
): void {
  slide.background = { color: COLORS.white }
  slide.addShape(pptx.ShapeType.rect, {
    x: 0,
    y: 0,
    w: 13.333,
    h: 0.14,
    line: { color: COLORS.teal, transparency: 100 },
    fill: { color: COLORS.teal }
  })
  slide.addText(title, {
    x: 0.65,
    y: 0.4,
    w: 11.8,
    h: 0.55,
    fontFace: 'Microsoft YaHei',
    fontSize: 24,
    bold: true,
    color: COLORS.navy,
    margin: 0,
    breakLine: false
  })
  slide.addShape(pptx.ShapeType.line, {
    x: 0.65,
    y: 1.08,
    w: 12,
    h: 0,
    line: { color: COLORS.line, width: 1 }
  })
  slide.addText(`${index} / ${total}`, {
    x: 11.75,
    y: 7.08,
    w: 0.9,
    h: 0.22,
    fontFace: 'Arial',
    fontSize: 8.5,
    color: COLORS.muted,
    align: 'right',
    margin: 0
  })
}

function addBulletContent(
  slide: PptxGenJS.Slide,
  bullets: string[],
  options: { x: number; y: number; w: number; h: number; fontSize?: number }
): void {
  const items = bullets.length ? bullets : ['本页内容待教师补充']
  slide.addText(
    items.map((text) => ({
      text,
      options: {
        bullet: { indent: 18 },
        breakLine: true,
        paraSpaceAfterPt: 12
      }
    })),
    {
      ...options,
      fontFace: 'Microsoft YaHei',
      fontSize: options.fontSize ?? 19,
      color: COLORS.ink,
      valign: 'middle',
      margin: 0.12,
      breakLine: false,
      fit: 'shrink'
    }
  )
}

function addMechanismVisual(pptx: PptxGenJS, slide: PptxGenJS.Slide, spec: SlideSpec): void {
  const nodes = spec.visual?.nodes?.slice(0, 5) ?? []
  if (!nodes.length) {
    addBulletContent(slide, spec.bullets, { x: 0.8, y: 1.45, w: 11.7, h: 4.9 })
    return
  }

  const nodeWidth = Math.min(2.15, 10.7 / nodes.length)
  const gap = nodes.length > 1 ? (11.5 - nodeWidth * nodes.length) / (nodes.length - 1) : 0
  const startX = nodes.length === 1 ? 5.55 : 0.9
  nodes.forEach((node, index) => {
    const x = startX + index * (nodeWidth + gap)
    slide.addShape(pptx.ShapeType.roundRect, {
      x,
      y: 2.1,
      w: nodeWidth,
      h: 1.45,
      rectRadius: 0.08,
      line: { color: COLORS.teal, width: 1.5 },
      fill: { color: index % 2 === 0 ? COLORS.paleTeal : COLORS.paleBlue }
    })
    slide.addText(node, {
      x: x + 0.12,
      y: 2.28,
      w: nodeWidth - 0.24,
      h: 1.05,
      fontFace: 'Microsoft YaHei',
      fontSize: 16,
      bold: true,
      color: COLORS.navy,
      align: 'center',
      valign: 'middle',
      margin: 0.04,
      fit: 'shrink'
    })
    if (index < nodes.length - 1) {
      slide.addShape(pptx.ShapeType.chevron, {
        x: x + nodeWidth + Math.max(0.08, gap * 0.26),
        y: 2.59,
        w: Math.max(0.28, gap * 0.48),
        h: 0.42,
        line: { color: COLORS.teal, transparency: 100 },
        fill: { color: COLORS.teal }
      })
    }
  })
  if (spec.bullets.length) {
    addBulletContent(slide, spec.bullets, { x: 1.15, y: 4.35, w: 11, h: 1.75, fontSize: 15 })
  }
}

function addInteractionSlide(pptx: PptxGenJS, slide: PptxGenJS.Slide, spec: SlideSpec): void {
  slide.addShape(pptx.ShapeType.roundRect, {
    x: 1.05,
    y: 1.55,
    w: 11.2,
    h: 3.45,
    rectRadius: 0.08,
    line: { color: COLORS.teal, width: 1.5 },
    fill: { color: COLORS.paleTeal }
  })
  slide.addText('课堂思考', {
    x: 1.45,
    y: 1.92,
    w: 2,
    h: 0.42,
    fontFace: 'Microsoft YaHei',
    fontSize: 17,
    bold: true,
    color: COLORS.teal,
    margin: 0
  })
  slide.addText(spec.interaction?.prompt ?? spec.bullets[0] ?? '请围绕本节主线进行讨论。', {
    x: 1.45,
    y: 2.55,
    w: 10.35,
    h: 1.75,
    fontFace: 'Microsoft YaHei',
    fontSize: 25,
    bold: true,
    color: COLORS.navy,
    align: 'center',
    valign: 'middle',
    margin: 0.08,
    fit: 'shrink'
  })
  slide.addText('建议：独立思考 1 分钟，再进行同伴讨论。答案仅写入讲者备注和 Word 讲稿。', {
    x: 1.45,
    y: 5.45,
    w: 10.35,
    h: 0.5,
    fontFace: 'Microsoft YaHei',
    fontSize: 14,
    color: COLORS.muted,
    align: 'center',
    margin: 0
  })
}

function addSourceFigure(
  slide: PptxGenJS.Slide,
  project: CoursewareProject,
  spec: SlideSpec
): { x: number; y: number; w: number; h: number } | null {
  const figure = project.sourceVisuals.find((item) =>
    item.id === spec.visual?.figureId && item.status === 'approved'
  )
  if (!figure?.imageDataUrl) return null
  const ratio = figure.width && figure.height
    ? figure.width / figure.height
    : figure.crop
      ? figure.crop.width / figure.crop.height
      : 4 / 3
  const wide = ratio >= 1.55
  const target = wide
    ? { x: 0.85, y: 1.35, w: 11.65, h: 3.75 }
    : { x: 7.05, y: 1.35, w: 5.4, h: 4.95 }
  const targetRatio = target.w / target.h
  const image = ratio > targetRatio
    ? {
        x: target.x,
        y: target.y + (target.h - target.w / ratio) / 2,
        w: target.w,
        h: target.w / ratio
      }
    : {
        x: target.x + (target.w - target.h * ratio) / 2,
        y: target.y,
        w: target.h * ratio,
        h: target.h
      }
  slide.addImage({ data: figure.imageDataUrl, ...image, transparency: 0 })
  const sourceLabel = figure.sourceKind === 'pptx'
    ? `原PPT第 ${figure.sourceIndex} 页`
    : `教材第 ${figure.sourceIndex} 页`
  slide.addText(
    `${figure.caption ?? '教材原图'}（来源：${sourceLabel}）`,
    {
      x: target.x,
      y: wide ? 5.16 : 6.4,
      w: target.w,
      h: 0.38,
      fontFace: 'Microsoft YaHei',
      fontSize: 10,
      color: COLORS.muted,
      align: 'center',
      margin: 0,
      fit: 'shrink'
    }
  )
  return wide
    ? { x: 0.95, y: 5.55, w: 11.4, h: 1.15 }
    : { x: 0.75, y: 1.45, w: 5.75, h: 4.95 }
}

function buildPresentation(project: CoursewareProject): PptxGenJS {
  const pptx = new PptxGenJS()
  pptx.layout = 'LAYOUT_WIDE'
  pptx.author = '智研助手'
  pptx.company = '智研助手'
  pptx.subject = `${project.blueprint.title}教学课件`
  pptx.title = project.blueprint.title
  pptx.theme = {
    headFontFace: 'Microsoft YaHei',
    bodyFontFace: 'Microsoft YaHei'
  }

  project.slides.forEach((spec, index) => {
    const slide = pptx.addSlide()
    const isTitle = spec.kind === 'title'
    if (isTitle) {
      slide.background = { color: COLORS.navy }
      slide.addShape(pptx.ShapeType.rect, {
        x: 0,
        y: 0,
        w: 0.25,
        h: 7.5,
        line: { color: COLORS.teal, transparency: 100 },
        fill: { color: COLORS.teal }
      })
      slide.addText(spec.title, {
        x: 1,
        y: 2.15,
        w: 11.2,
        h: 1.25,
        fontFace: 'Microsoft YaHei',
        fontSize: 34,
        bold: true,
        color: COLORS.white,
        valign: 'middle',
        margin: 0,
        fit: 'shrink'
      })
      if (spec.subtitle) {
        slide.addText(spec.subtitle, {
          x: 1,
          y: 3.6,
          w: 10.5,
          h: 0.7,
          fontFace: 'Microsoft YaHei',
          fontSize: 18,
          color: 'D7E7EB',
          margin: 0,
          fit: 'shrink'
        })
      }
      slide.addText(
        project.request.audience === 'undergraduate'
          ? '本科教学'
          : project.request.audience === 'graduate'
            ? '研究生教学'
            : 'International Student Course',
        {
          x: 1,
          y: 5.8,
          w: 3.2,
          h: 0.42,
          fontFace: 'Microsoft YaHei',
          fontSize: 13,
          color: 'B8D5DB',
          margin: 0
        }
      )
    } else {
      addSlideHeader(pptx, slide, spec.title, index + 1, project.slides.length)
      if (spec.kind === 'interaction') {
        addInteractionSlide(pptx, slide, spec)
      } else if (spec.kind === 'mechanism' || spec.visual?.type === 'flow') {
        addMechanismVisual(pptx, slide, spec)
      } else if (spec.kind === 'case') {
        slide.addShape(pptx.ShapeType.roundRect, {
          x: 0.8,
          y: 1.4,
          w: 3.05,
          h: 4.95,
          rectRadius: 0.06,
          line: { color: COLORS.accent, width: 1.2 },
          fill: { color: COLORS.paleAccent }
        })
        slide.addText('临床 / 实验情境', {
          x: 1.15,
          y: 1.78,
          w: 2.35,
          h: 0.55,
          fontFace: 'Microsoft YaHei',
          fontSize: 20,
          bold: true,
          color: COLORS.accent,
          align: 'center',
          margin: 0
        })
        addBulletContent(slide, spec.bullets, { x: 4.25, y: 1.45, w: 8.05, h: 4.9 })
      } else if (spec.visual?.type === 'source-figure') {
        const bulletBox = addSourceFigure(slide, project, spec)
        if (bulletBox) {
          addBulletContent(slide, spec.bullets, {
            ...bulletBox,
            fontSize: bulletBox.h < 2 ? 14 : 18
          })
        } else {
          addBulletContent(slide, spec.bullets, { x: 0.85, y: 1.4, w: 11.7, h: 5.2 })
        }
      } else {
        addBulletContent(slide, spec.bullets, { x: 0.85, y: 1.4, w: 11.7, h: 5.2 })
      }
    }
    slide.addNotes(slideNotes(spec))
  })

  return pptx
}

function buildDocxHtml(project: CoursewareProject): string {
  const slides = project.slides.map((slide, index) => {
    const bullets = slide.bullets.length
      ? `<ul>${slide.bullets.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`
      : ''
    const interaction = slide.interaction
      ? `<section class="interaction"><h3>互动题</h3><p>${escapeHtml(slide.interaction.prompt)}</p><h3>参考答案</h3><p>${escapeHtml(slide.interaction.answer)}</p></section>`
      : ''
    const refs = slide.evidenceRefs.length
      ? `<h3>本页参考来源</h3><ol>${slide.evidenceRefs.map((item) => `<li>${escapeHtml(evidenceLabel(item))}</li>`).join('')}</ol>`
      : ''
    return `<article>
      <h2>第 ${index + 1} 页：${escapeHtml(slide.title)}</h2>
      ${bullets}
      <h3>逐页讲稿</h3>
      <p class="notes">${escapeHtml(slide.speakerNotes)}</p>
      ${interaction}
      ${refs}
    </article>`
  }).join('')

  return `<!DOCTYPE html>
  <html lang="${project.request.audience === 'international' ? 'en' : 'zh-CN'}">
  <head>
    <meta charset="utf-8" />
    <style>
      body { font-family: "Microsoft YaHei", Arial, sans-serif; color: #172b35; line-height: 1.65; }
      h1 { color: #153b50; border-bottom: 3px solid #2a7f88; padding-bottom: 12px; }
      h2 { color: #153b50; margin-top: 28px; border-bottom: 1px solid #b9cdd3; padding-bottom: 6px; }
      h3 { color: #2a7f88; margin-bottom: 4px; }
      article { page-break-after: always; }
      .notes { white-space: pre-wrap; }
      .interaction { background: #e7f4f3; padding: 10px 16px; border-left: 4px solid #2a7f88; }
      .meta { color: #5d7078; }
    </style>
  </head>
  <body>
    <h1>${escapeHtml(project.blueprint.title)}</h1>
    <p class="meta">主题：${escapeHtml(project.request.topic)}；课时：${project.request.durationMinutes} 分钟；教材页码：${project.request.pageStart}-${project.request.pageEnd}</p>
    <h2>教学目标</h2>
    <p>${escapeHtml(project.blueprint.teachingGoal)}</p>
    ${slides}
  </body>
  </html>`
}

async function bufferFromDocxResult(result: ArrayBuffer | Blob | Buffer): Promise<Buffer> {
  if (Buffer.isBuffer(result)) return result
  if (typeof ArrayBuffer !== 'undefined' && result instanceof ArrayBuffer) {
    return Buffer.from(new Uint8Array(result))
  }
  if (typeof Blob !== 'undefined' && result instanceof Blob) {
    return Buffer.from(await result.arrayBuffer())
  }
  throw new TypeError('DOCX 导出结果格式不受支持。')
}

export async function exportCoursewarePackage(
  request: CoursewareExportRequest
): Promise<CoursewareExportResult> {
  try {
    const project = coursewareProjectSchema.parse(request.project)
    const outputDirectory = request.outputDirectory?.trim()
    if (!outputDirectory) {
      return { ok: false, canceled: false, message: '请选择课件包保存目录。' }
    }

    await mkdir(outputDirectory, { recursive: true })
    const baseName = safeFileName(project.blueprint.title || project.request.topic)
    const pptxPath = join(outputDirectory, `${baseName}-课件.pptx`)
    const docxPath = join(outputDirectory, `${baseName}-逐页讲稿.docx`)
    const projectPath = join(outputDirectory, `${baseName}.zhiyan-courseware`)

    const presentation = buildPresentation(project)
    await presentation.writeFile({ fileName: pptxPath, compression: true })

    const docx = await htmlToDocx(buildDocxHtml(project), null, {
      title: `${project.blueprint.title}逐页讲稿`,
      creator: '智研助手',
      description: '包含逐页讲稿、互动题、参考答案与证据来源。',
      font: 'Microsoft YaHei',
      fontSize: 22
    })
    await writeFile(docxPath, await bufferFromDocxResult(docx))
    await writeCoursewareProjectArchive(project, projectPath)

    return {
      ok: true,
      pptxPath,
      docxPath,
      projectPath,
      exportedAt: new Date().toISOString()
    }
  } catch (error) {
    return {
      ok: false,
      canceled: false,
      message: error instanceof Error ? error.message : String(error)
    }
  }
}
