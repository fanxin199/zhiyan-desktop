import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { CoursewareProject } from '../../shared/courseware'
import {
  loadCoursewareProject,
  writeCoursewareProjectArchive
} from './courseware-project-service'

const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

function project(): CoursewareProject {
  return {
    version: 2,
    request: {
      sourcePath: 'C:\\course\\lecture.pptx',
      pageStart: 1,
      pageEnd: 2,
      topic: 'B细胞抗原呈递',
      durationMinutes: 45,
      audience: 'undergraduate',
      focus: '',
      includeRecentLiterature: false,
      maxLiteratureResults: 6
    },
    sourceDocument: {
      kind: 'pptx',
      path: 'C:\\course\\lecture.pptx',
      pageCount: 2,
      searchable: true
    },
    blueprint: {
      title: 'B细胞抗原呈递',
      audience: 'undergraduate',
      durationMinutes: 45,
      teachingGoal: '解释B细胞抗原呈递。',
      sections: [{
        id: 'section-1',
        title: '机制',
        objective: '建立机制主线。',
        summary: '从抗原摄取到T细胞协同。',
        slideCount: 1,
        emphasis: []
      }]
    },
    slides: [{
      id: 'slide-1',
      sectionId: 'section-1',
      kind: 'content',
      title: 'B细胞抗原呈递',
      bullets: ['BCR摄取抗原'],
      speakerNotes: '说明抗原处理过程。',
      visual: { type: 'source-figure', figureId: 'asset-1' },
      evidenceRefs: []
    }],
    sourceVisuals: [{
      id: 'asset-1',
      sourceKind: 'pptx',
      sourceIndex: 2,
      mediaType: 'image/png',
      role: 'figure',
      status: 'approved',
      confidence: 0.9,
      occurrences: [2],
      caption: '抗原呈递机制图',
      imageDataUrl: 'data:image/png;base64,iVBORw0KGgo='
    }],
    evidence: [],
    generatedAt: '2026-06-14T00:00:00.000Z'
  }
}

describe('courseware project archive', () => {
  it('stores visual assets separately and restores a reloadable v2 project', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'zhiyan-project-'))
    tempDirs.push(directory)
    const path = join(directory, 'lesson.zhiyan-courseware')

    await writeCoursewareProjectArchive(project(), path)
    const loaded = await loadCoursewareProject(path)

    expect(loaded.version).toBe(2)
    expect(loaded.sourceVisuals[0].assetPath).toMatch(/^assets\//)
    expect(loaded.sourceVisuals[0].imageDataUrl).toBe('data:image/png;base64,iVBORw0KGgo=')
  })
})
