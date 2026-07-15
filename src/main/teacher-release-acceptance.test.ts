import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import JSZip from 'jszip'
import { afterEach, describe, expect, it } from 'vitest'
import type { CoursewareProject } from '../shared/courseware'
import {
  BIOINFORMATICS_PACKAGES,
  BASE_SCIENCE_PACKAGES,
  inspectPythonRuntime,
  type PythonProbeData,
  type PythonRuntimeCandidate
} from './services/python-runtime-service'
import { exportCoursewarePackage } from './services/courseware-export-service'

const fixtureRoot = resolve(process.cwd(), 'test/fixtures/teacher-validation')
const temporaryRoots: string[] = []

async function temporaryRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix))
  temporaryRoots.push(root)
  return root
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

function completeProbe(executable: string): PythonProbeData {
  return {
    executable,
    version: '3.12.13',
    architecture: 'x64',
    packages: [...BASE_SCIENCE_PACKAGES, ...BIOINFORMATICS_PACKAGES].map(({ id }) => ({
      id,
      available: true,
      version: 'teacher-validation'
    }))
  }
}

function teachingProject(sourcePath: string, sourceText: string): CoursewareProject {
  expect(sourceText).toContain('BCR')
  expect(sourceText).toContain('CD40L')
  expect(sourceText).toContain('生发中心')
  return {
    version: 2,
    request: {
      sourcePath,
      pageStart: 1,
      pageEnd: 6,
      topic: 'B 细胞活化与生发中心反应',
      durationMinutes: 90,
      audience: 'undergraduate',
      focus: '从抗原识别到记忆形成的机制主线',
      includeRecentLiterature: false,
      maxLiteratureResults: 6
    },
    sourceDocument: {
      kind: 'pdf',
      path: sourcePath,
      pageCount: 6,
      searchable: true
    },
    blueprint: {
      title: 'B 细胞活化与生发中心反应',
      audience: 'undergraduate',
      durationMinutes: 90,
      teachingGoal: '解释 BCR 识别、Tfh 帮助、生发中心选择与记忆形成之间的机制联系。',
      sections: [{
        id: 'section-b-cell',
        title: 'B 细胞应答主线',
        objective: '建立从抗原识别到效应与记忆的机制链。',
        summary: '连接 BCR、CD40、类别转换、亲和力成熟和浆细胞分化。',
        slideCount: 2,
        emphasis: ['BCR', 'Tfh', '生发中心'],
        interactionPrompt: '为什么类别转换不改变抗原特异性？',
        visualSuggestion: '左到右机制流程图'
      }]
    },
    slides: [{
      id: 'slide-mechanism',
      sectionId: 'section-b-cell',
      kind: 'content',
      title: 'B 细胞应答的四个关键阶段',
      bullets: ['BCR 识别天然抗原', 'Tfh 提供 CD40L 与细胞因子', '生发中心完成突变与选择', '形成浆细胞和记忆 B 细胞'],
      speakerNotes: '按识别、协作、选择、分化的顺序讲清免疫系统为何设置多重检查点。',
      visual: { type: 'none' },
      evidenceRefs: []
    }, {
      id: 'slide-case',
      sectionId: 'section-b-cell',
      kind: 'interaction',
      title: '高 IgM 表型的机制定位',
      bullets: ['沿信号链定位缺陷环节'],
      speakerNotes: '让学生区分抗体数量、类别和亲和力。',
      interaction: {
        prompt: 'CD40L 缺陷时，为什么 IgM 可升高而 IgG 和 IgA 降低？',
        answer: '早期 IgM 反应仍可发生，但依赖 T 细胞帮助的类别转换和生发中心反应受损。'
      },
      evidenceRefs: []
    }],
    sourceVisuals: [],
    evidence: [],
    generatedAt: '2026-07-15T08:00:00.000Z'
  }
}

describe('3.4 teacher release acceptance', () => {
  it('maps no Python, system Python, private Python and a damaged private environment to safe teacher actions', async () => {
    const checkedAt = () => new Date('2026-07-15T08:00:00.000Z')
    const noPython = await inspectPythonRuntime({
      userDataPath: 'C:\\ZhiYan-empty',
      platform: 'win32',
      fileExists: () => false,
      runCandidate: async () => ({ kind: 'not-found' }),
      now: checkedAt
    })
    const systemCalls: PythonRuntimeCandidate[] = []
    const systemPython = await inspectPythonRuntime({
      userDataPath: 'C:\\ZhiYan-system',
      platform: 'win32',
      fileExists: () => false,
      runCandidate: async (candidate) => {
        systemCalls.push(candidate)
        return candidate.command === 'py'
          ? { kind: 'success', data: completeProbe('C:\\Python312\\python.exe') }
          : { kind: 'not-found' }
      },
      now: checkedAt
    })
    const privatePython = await inspectPythonRuntime({
      userDataPath: 'C:\\ZhiYan-private',
      platform: 'win32',
      fileExists: () => true,
      runCandidate: async () => ({
        kind: 'success',
        data: completeProbe('C:\\ZhiYan-private\\runtimes\\python\\python.exe')
      }),
      readBaseSciencePackVersion: async () => '2026.07.1',
      readBioinformaticsPackVersion: async () => '2026.07.1',
      now: checkedAt
    })
    const damagedPrivatePython = await inspectPythonRuntime({
      userDataPath: 'C:\\ZhiYan-damaged',
      platform: 'win32',
      fileExists: () => true,
      runCandidate: async () => ({
        kind: 'failed',
        code: 'launch-failed',
        message: 'runtime damaged'
      }),
      now: checkedAt
    })

    expect(noPython).toMatchObject({ state: 'not-installed', source: 'none' })
    expect(systemPython).toMatchObject({ state: 'ready', source: 'system' })
    expect(systemCalls.map(({ command }) => command)).toEqual(['python', 'py'])
    expect(privatePython).toMatchObject({ state: 'ready', source: 'managed' })
    expect(damagedPrivatePython).toMatchObject({ state: 'broken', source: 'managed' })

  })

  it('exports an editable teaching package from representative medical-immunology material', async () => {
    const outputDirectory = await temporaryRoot('zhiyan-teacher-courseware-')
    const sourcePath = join(fixtureRoot, 'medical-immunology-b-cell-activation.md')
    const sourceText = await readFile(sourcePath, 'utf8')
    const result = await exportCoursewarePackage({
      project: teachingProject(sourcePath, sourceText),
      outputDirectory
    })

    expect(result.ok, result.ok ? undefined : result.message).toBe(true)
    if (!result.ok) return
    const pptx = await JSZip.loadAsync(await readFile(result.pptxPath))
    const docx = await JSZip.loadAsync(await readFile(result.docxPath))
    const slideText = await pptx.file('ppt/slides/slide1.xml')?.async('string') ?? ''
    const notesText = await docx.file('word/document.xml')?.async('string') ?? ''

    expect(slideText).toContain('B 细胞应答的四个关键阶段')
    expect(notesText).toContain('CD40L 缺陷')
    expect(result.qaReport.checkedSlideCount).toBe(1)
    await expect(readFile(result.projectPath)).resolves.toBeInstanceOf(Buffer)
  })

})
