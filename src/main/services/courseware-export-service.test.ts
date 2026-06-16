import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import JSZip from 'jszip'
import { afterEach, describe, expect, it } from 'vitest'
import type { CoursewareProject } from '../../shared/courseware'
import { exportCoursewarePackage } from './courseware-export-service'
import { loadCoursewareProject } from './courseware-project-service'

const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

function project(): CoursewareProject {
  return {
    version: 2,
    request: {
      sourcePath: 'C:\\books\\immunology.pdf',
      pageStart: 10,
      pageEnd: 20,
      topic: 'T 细胞活化',
      durationMinutes: 90,
      audience: 'undergraduate',
      focus: '三信号模型',
      includeRecentLiterature: false,
      maxLiteratureResults: 6
    },
    sourceDocument: {
      kind: 'pdf',
      path: 'C:\\books\\immunology.pdf',
      pageCount: 20,
      searchable: true
    },
    blueprint: {
      title: 'T 细胞活化',
      audience: 'undergraduate',
      durationMinutes: 90,
      teachingGoal: '解释 T 细胞活化所需信号。',
      sections: [{
        id: 'section-1',
        title: '三信号模型',
        objective: '建立机制主线。',
        summary: '从抗原识别、共刺激和细胞因子展开。',
        slideCount: 2,
        emphasis: ['机制链条'],
        interactionPrompt: '缺少信号 2 会发生什么？',
        visualSuggestion: '三列流程图'
      }]
    },
    slides: [{
      id: 'slide-1',
      sectionId: 'section-1',
      kind: 'mechanism',
      title: 'T 细胞活化的三信号',
      bullets: ['信号 1：TCR 识别肽-MHC', '信号 2：共刺激确认危险'],
      speakerNotes: '本页先解释三类信号分别解决什么问题。',
      visual: {
        type: 'flow',
        title: '三信号协同',
        nodes: ['抗原识别', '共刺激', '细胞因子定向']
      },
      evidenceRefs: []
    }, {
      id: 'slide-2',
      sectionId: 'section-1',
      kind: 'interaction',
      title: '课堂讨论',
      bullets: ['请先独立思考 1 分钟'],
      speakerNotes: '引导学生联系外周耐受。',
      interaction: {
        prompt: '缺少共刺激信号时，T 细胞可能进入什么状态？',
        answer: '无反应或耐受状态。'
      },
      evidenceRefs: []
    }],
    sourceVisuals: [],
    evidence: [],
    generatedAt: '2026-06-12T09:00:00.000Z'
  }
}

function pngHeader(width: number, height: number): string {
  const buffer = Buffer.alloc(24)
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buffer)
  buffer.write('IHDR', 12, 'ascii')
  buffer.writeUInt32BE(width, 16)
  buffer.writeUInt32BE(height, 20)
  return `data:image/png;base64,${buffer.toString('base64')}`
}

describe('exportCoursewarePackage', () => {
  it('writes editable PPTX, speaker notes, Word notes and a reloadable project file', async () => {
    const outputDirectory = await mkdtemp(join(tmpdir(), 'zhiyan-courseware-'))
    tempDirs.push(outputDirectory)

    const result = await exportCoursewarePackage({
      project: project(),
      outputDirectory
    })

    expect(result.ok, result.ok ? undefined : result.message).toBe(true)
    if (!result.ok) return

    const pptxZip = await JSZip.loadAsync(await readFile(result.pptxPath))
    expect(Object.keys(pptxZip.files).some((name) => name.startsWith('ppt/notesSlides/notesSlide'))).toBe(true)
    const notesXml = await pptxZip.file('ppt/notesSlides/notesSlide1.xml')?.async('string')
    expect(notesXml).toContain('本页先解释三类信号分别解决什么问题')
    const interactionXml = await pptxZip.file('ppt/slides/slide2.xml')?.async('string') ?? ''
    expect(interactionXml).not.toContain('建议：独立思考')
    expect(interactionXml).not.toContain('答案仅写入讲者备注')

    const docxZip = await JSZip.loadAsync(await readFile(result.docxPath))
    const documentXml = await docxZip.file('word/document.xml')?.async('string')
    expect(documentXml).toContain('缺少共刺激信号时')
    expect(documentXml).toContain('无反应或耐受状态')

    const savedProject = await loadCoursewareProject(result.projectPath)
    expect(savedProject.slides).toHaveLength(2)
    expect(savedProject.blueprint.title).toBe('T 细胞活化')
  })

  it('embeds a source figure on a mechanism slide and preserves its real aspect ratio', async () => {
    const outputDirectory = await mkdtemp(join(tmpdir(), 'zhiyan-courseware-'))
    tempDirs.push(outputDirectory)
    const source = project()
    source.slides[0] = {
      ...source.slides[0],
      visual: {
        type: 'source-figure',
        title: '完整机制图',
        figureId: 'wide-figure'
      }
    }
    source.sourceVisuals = [{
      id: 'wide-figure',
      sourceKind: 'pdf',
      sourceIndex: 12,
      mediaType: 'image/png',
      role: 'figure',
      status: 'approved',
      confidence: 1,
      occurrences: [12],
      crop: { x: 0.2, y: 0.2, width: 0.2, height: 0.8 },
      imageDataUrl: pngHeader(1600, 800)
    }]

    const result = await exportCoursewarePackage({
      project: source,
      outputDirectory
    })

    expect(result.ok, result.ok ? undefined : result.message).toBe(true)
    if (!result.ok) return
    const pptxZip = await JSZip.loadAsync(await readFile(result.pptxPath))
    const slideXml = await pptxZip.file('ppt/slides/slide1.xml')?.async('string') ?? ''
    const picture = slideXml.match(/<p:pic>[\s\S]*?<\/p:pic>/)?.[0] ?? ''
    expect(picture).toContain('<a:blip')
    const extent = picture.match(/<a:ext cx="(\d+)" cy="(\d+)"\/>/)
    expect(extent).not.toBeNull()
    const ratio = Number(extent?.[1]) / Number(extent?.[2])
    expect(ratio).toBeCloseTo(2, 1)
  })

  it('renders ordinary teaching content as readable visual cards instead of a plain bullet dump', async () => {
    const outputDirectory = await mkdtemp(join(tmpdir(), 'zhiyan-courseware-'))
    tempDirs.push(outputDirectory)
    const source = project()
    source.slides[0] = {
      ...source.slides[0],
      kind: 'content',
      visual: { type: 'none' },
      bullets: [
        'BCR 识别天然构象抗原，决定 B 细胞应答的抗原特异性。',
        '抗原内化后经 MHC II 呈递，使 B 细胞获得 T 细胞帮助。',
        'CD40 与细胞因子信号共同驱动增殖、类别转换和亲和力成熟。',
        '最终形成抗体分泌细胞与记忆 B 细胞，建立即时与长期保护。'
      ]
    }

    const result = await exportCoursewarePackage({
      project: source,
      outputDirectory
    })

    expect(result.ok, result.ok ? undefined : result.message).toBe(true)
    if (!result.ok) return
    const pptxZip = await JSZip.loadAsync(await readFile(result.pptxPath))
    const slideXml = await pptxZip.file('ppt/slides/slide1.xml')?.async('string') ?? ''
    expect(slideXml.match(/prst="roundRect"/g)?.length ?? 0).toBeGreaterThanOrEqual(4)
  })
})
