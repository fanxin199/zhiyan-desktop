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

    const docxZip = await JSZip.loadAsync(await readFile(result.docxPath))
    const documentXml = await docxZip.file('word/document.xml')?.async('string')
    expect(documentXml).toContain('缺少共刺激信号时')
    expect(documentXml).toContain('无反应或耐受状态')

    const savedProject = await loadCoursewareProject(result.projectPath)
    expect(savedProject.slides).toHaveLength(2)
    expect(savedProject.blueprint.title).toBe('T 细胞活化')
  })
})
