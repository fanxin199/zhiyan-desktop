import { describe, expect, it } from 'vitest'
import {
  coursewareBlueprintSchema,
  parseCoursewareProject,
  coursewareProjectSchema,
  coursewareRequestSchema,
  coursewareSlideSpecSchema
} from './courseware'

describe('courseware contracts', () => {
  it('migrates a version 1 project to the version 2 visual asset model', () => {
    const migrated = parseCoursewareProject({
      version: 1,
      request: {
        sourcePath: 'C:\\books\\immunology.pdf',
        pageStart: 1,
        pageEnd: 10,
        topic: 'B cell activation',
        durationMinutes: 90,
        audience: 'undergraduate',
        focus: '',
        includeRecentLiterature: false,
        maxLiteratureResults: 6
      },
      blueprint: {
        title: 'B cell activation',
        audience: 'undergraduate',
        durationMinutes: 90,
        teachingGoal: 'Explain the activation pathway.',
        sections: [{
          id: 'section-1',
          title: 'Signals',
          objective: 'Explain activation signals.',
          summary: 'BCR, co-receptor, and T-cell help.',
          slideCount: 1,
          emphasis: ['BCR']
        }]
      },
      slides: [{
        id: 'slide-1',
        sectionId: 'section-1',
        kind: 'content',
        title: 'Activation',
        bullets: ['Signal one'],
        speakerNotes: 'Explain signal one.',
        evidenceRefs: []
      }],
      sourceFigures: [{
        id: 'figure-1',
        pageNumber: 2,
        caption: 'Figure 1',
        imageDataUrl: 'data:image/png;base64,AA=='
      }],
      evidence: [],
      generatedAt: '2026-06-14T00:00:00.000Z'
    })

    expect(migrated.version).toBe(2)
    expect(migrated.sourceDocument).toMatchObject({
      kind: 'pdf',
      pageCount: 10
    })
    expect(migrated.sourceVisuals[0]).toMatchObject({
      id: 'figure-1',
      sourceKind: 'pdf',
      sourceIndex: 2,
      role: 'figure',
      status: 'approved'
    })
  })

  it('rejects an inverted PDF page range', () => {
    const result = coursewareRequestSchema.safeParse({
      sourcePath: 'C:\\books\\immunology.pdf',
      pageStart: 30,
      pageEnd: 12,
      topic: 'T 细胞活化',
      durationMinutes: 90,
      audience: 'undergraduate',
      focus: '三信号模型',
      includeRecentLiterature: false
    })

    expect(result.success).toBe(false)
  })

  it('accepts a teacher-editable blueprint with bounded slide counts', () => {
    const result = coursewareBlueprintSchema.safeParse({
      title: 'T 细胞活化',
      audience: 'undergraduate',
      durationMinutes: 90,
      teachingGoal: '解释初始 T 细胞活化所需的三类信号。',
      sections: [{
        id: 'section-1',
        title: '为什么需要三信号',
        objective: '建立免疫系统避免误激活的设计逻辑。',
        summary: '从抗原特异性、危险确认和环境定向三个层次展开。',
        slideCount: 6,
        emphasis: ['概念边界', '临床联系'],
        interactionPrompt: '缺少共刺激时会发生什么？',
        visualSuggestion: '三信号并列流程图'
      }]
    })

    expect(result.success).toBe(true)
  })

  it('trims overlong model-generated emphasis lists instead of rejecting the blueprint', () => {
    const result = coursewareBlueprintSchema.safeParse({
      title: '医学免疫学概论',
      audience: 'undergraduate',
      durationMinutes: 90,
      teachingGoal: '建立免疫学核心主线。',
      sections: [{
        id: 'section-1',
        title: '免疫系统总论',
        objective: '理解免疫系统的组成和功能。',
        summary: '从固有免疫与适应性免疫的协同展开。',
        slideCount: 6,
        emphasis: Array.from({ length: 15 }, (_, index) => `重点 ${index + 1}`)
      }]
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.sections[0].emphasis).toHaveLength(12)
      expect(result.data.sections[0].emphasis.at(-1)).toBe('重点 12')
    }
  })

  it('normalizes every blueprint to at most 35 slides while preserving all sections', () => {
    const result = coursewareBlueprintSchema.safeParse({
      title: '医学免疫学',
      audience: 'undergraduate',
      durationMinutes: 180,
      teachingGoal: '建立完整的免疫学知识框架。',
      sections: Array.from({ length: 8 }, (_, index) => ({
        id: `section-${index + 1}`,
        title: `教学环节 ${index + 1}`,
        objective: '理解本节核心机制。',
        summary: '沿着识别、活化和效应主线展开。',
        slideCount: index === 7 ? 3 : 8,
        emphasis: ['机制主线']
      }))
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.sections).toHaveLength(8)
      expect(result.data.sections.every((section) => section.slideCount >= 1)).toBe(true)
      expect(result.data.sections.reduce((sum, section) => sum + section.slideCount, 0)).toBe(35)
    }
  })

  it('requires notes and evidence scope on generated slides', () => {
    const result = coursewareSlideSpecSchema.safeParse({
      id: 'slide-1',
      sectionId: 'section-1',
      kind: 'mechanism',
      title: 'T 细胞活化的三信号',
      bullets: ['信号 1：TCR 识别肽-MHC'],
      speakerNotes: '',
      evidenceRefs: [{
        id: 'pmid-1',
        title: 'Example',
        sourceType: 'abstract',
        pmid: '12345678',
        year: 2025
      }]
    })

    expect(result.success).toBe(false)
  })

  it('never keeps more than 35 slides in an exportable project', () => {
    const blueprint = {
      title: '医学免疫学',
      audience: 'undergraduate' as const,
      durationMinutes: 90,
      teachingGoal: '建立免疫学主线。',
      sections: [
        {
          id: 'section-1',
          title: '免疫识别',
          objective: '理解免疫识别。',
          summary: '从模式识别展开。',
          slideCount: 20,
          emphasis: ['识别']
        },
        {
          id: 'section-2',
          title: '免疫效应',
          objective: '理解免疫效应。',
          summary: '从活化到效应。',
          slideCount: 15,
          emphasis: ['效应']
        }
      ]
    }
    const result = coursewareProjectSchema.safeParse({
      version: 1,
      request: {
        sourcePath: 'C:\\books\\immunology.pdf',
        pageStart: 1,
        pageEnd: 100,
        topic: '医学免疫学',
        durationMinutes: 90,
        audience: 'undergraduate',
        focus: '',
        includeRecentLiterature: false,
        maxLiteratureResults: 6
      },
      blueprint,
      slides: Array.from({ length: 40 }, (_, index) => ({
        id: `slide-${index + 1}`,
        sectionId: 'section-1',
        kind: 'content',
        title: `页面 ${index + 1}`,
        bullets: [`内容 ${index + 1}`],
        speakerNotes: `讲稿 ${index + 1}`,
        evidenceRefs: []
      })),
      sourceFigures: [],
      evidence: [],
      generatedAt: new Date().toISOString()
    })

    expect(result.success).toBe(true)
    if (result.success) expect(result.data.slides).toHaveLength(35)
  })
})
