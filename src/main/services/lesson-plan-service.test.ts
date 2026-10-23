import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  defaultClawSettings,
  defaultKunRuntimeSettings,
  defaultModelProviderSettings,
  defaultScheduleSettings,
  defaultWriteSettings,
  type AppSettingsV1
} from '../../shared/app-settings'
import { splitMarkdownSections } from '../../shared/artifact-revision'
import {
  adjustLessonTiming,
  checkLessonTiming,
  lessonSegmentTimings,
  plannedLessonMinutes,
  type LessonPlanContent
} from '../../shared/lesson-plan'
import { ArtifactRegistry } from './artifact-service'
import { ArtifactVersionStore } from './artifact-version-service'
import { LessonPlanService } from './lesson-plan-service'

const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

function settings(teacherProjects: AppSettingsV1['teacherProjects'] = []): AppSettingsV1 {
  const provider = defaultModelProviderSettings()
  provider.apiKey = 'sk-test'
  provider.providers[0].apiKey = 'sk-test'
  return {
    version: 1, locale: 'zh', theme: 'system', uiFontScale: 'small', aiMode: 'deep', provider,
    agents: { kun: { ...defaultKunRuntimeSettings(), model: 'deepseek-chat' } },
    workspaceRoot: 'C:\\workspace', log: { enabled: false, retentionDays: 7 }, notifications: { turnComplete: true },
    showTechnicalMetrics: false,
    teacherProfile: { name: '王老师', school: '某医科大学', department: '生理学系', courses: [], researchTopics: [] },
    teacherProjects, moduleContext: { projects: {}, recent: {} },
    appBehavior: { openAtLogin: false, startMinimized: false, closeToTray: false },
    write: defaultWriteSettings(), claw: defaultClawSettings(), schedule: defaultScheduleSettings(),
    guiUpdate: { channel: 'stable' }
  }
}

const content: LessonPlanContent = {
  objectives: { knowledge: ['掌握肺通气的动力', '熟悉肺换气过程'], extension: ['了解呼吸支持新技术'] },
  keyPoints: ['肺通气的动力与阻力'],
  difficulties: ['胸膜腔负压的形成'],
  learnerAnalysis: '学生已学过解剖学。',
  methods: '讲授法、案例教学法',
  teachingAids: '计算机多媒体设备',
  means: '动画演示',
  process: [
    { title: '导入', minutes: 5, content: '以哮喘病例导入。' },
    { title: '肺通气', minutes: 40, content: '讲解动力与阻力。' },
    { title: '肺换气', minutes: 35, content: '讲解气体交换。' },
    { title: '小结与作业', minutes: 10, content: '回顾重点，布置作业。' }
  ],
  advances: '高流量鼻导管氧疗。',
  improvement: ''
}

async function setup(reply: unknown, teacherProjects: (workspace: string) => AppSettingsV1['teacherProjects'] = () => []) {
  const root = await mkdtemp(join(tmpdir(), 'zhiyan-lesson-plans-'))
  tempDirs.push(root)
  const workspace = join(root, 'write')
  await mkdir(workspace, { recursive: true })
  const registry = new ArtifactRegistry({ dataDirectory: join(root, 'data') })
  const versions = new ArtifactVersionStore({ registry })
  const fetcher = vi.fn(async (_url: string, _init: RequestInit) => new Response(
    JSON.stringify({ choices: [{ message: { content: JSON.stringify(reply) } }] }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  ))
  const service = new LessonPlanService({
    registry, versions, loadSettings: async () => settings(teacherProjects(workspace)), generation: { fetcher: fetcher as unknown as typeof fetch }
  })
  return { workspace, registry, versions, service, fetcher }
}

describe('LessonPlanService', () => {
  it('writes inside a course project: its key points guide the plan, which is saved in its folder and filed into it', async () => {
    const { workspace, registry, service, fetcher } = await setup(content, (root) => [{
      id: 'course-1', name: '生理学 · 第八章', type: 'teaching', lastUsedAt: '', origin: 'teacher',
      brief: { courseName: '生理学', glossary: '肺通气 pulmonary ventilation' },
      directory: join(root, '课程', '生理学 · 第八章')
    }])

    const outcome = await service.create({ workspaceRoot: workspace, fields: { courseName: '生理学', topic: '呼吸' }, projectId: 'course-1' })

    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.path).toBe(join(workspace, '课程', '生理学 · 第八章', '生理学 · 呼吸 教案.md'))
    expect(outcome.artifact.projectId).toBe('course-1')
    await expect(registry.list({ projectId: 'course-1' })).resolves.toHaveLength(1)
    const body = JSON.parse(String(fetcher.mock.calls[0][1].body)) as { messages: Array<{ content: string }> }
    expect(body.messages[1].content).toContain('## 课程项目要点（生理学 · 第八章')
    expect(body.messages[1].content).toContain('- 术语表：肺通气 pulmonary ventilation')
  })

  it('ignores an unknown or archived project and writes in the workspace as before', async () => {
    const { workspace, service } = await setup(content, () => [{
      id: 'old', name: '旧课程', type: 'teaching', lastUsedAt: '', origin: 'teacher', archived: true, directory: 'C:\\elsewhere'
    }])

    const outcome = await service.create({ workspaceRoot: workspace, fields: { topic: '呼吸' }, projectId: 'old' })

    expect(outcome.ok && outcome.path).toBe(join(workspace, '呼吸 教案.md'))
    expect(outcome.ok && outcome.artifact.projectId).toBeNull()
  })

  it('writes a lesson plan with one section per part and one per segment, and keeps it as a version', async () => {
    const { workspace, registry, versions, service, fetcher } = await setup(content)

    const outcome = await service.create({
      workspaceRoot: workspace,
      fields: { courseName: '生理学', topic: '第八章 呼吸系统', hours: '2 学时', audience: '本科生', methods: '讲授法', focus: '临床新进展', major: '临床医学' },
      instruction: '帮我写第八章呼吸系统的教案',
      materials: [{ name: '第八章.pdf', text: '呼吸系统正文' }]
    })

    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    const markdown = await readFile(outcome.path, 'utf8')
    expect(outcome.path.endsWith('生理学 · 第八章 呼吸系统 教案.md')).toBe(true)
    expect(markdown).toBe(outcome.markdown)
    expect(markdown).toContain('| 学科系 | 生理学系 | 授课教师 | 王老师 |')
    expect(markdown).toContain('### 一、导入（5 分钟）')
    expect(markdown).toContain('### 四、小结与作业（10 分钟）')
    expect(splitMarkdownSections(markdown).filter((section) => section.level === 2).map((section) => section.title)).toEqual([
      '教学目的与要求', '教学重点与难点', '教学对象分析', '教学方法与组织', '教学过程设计', '新进展内容', '教材和参考资料'
    ])
    expect(outcome.artifact).toMatchObject({ kind: 'lesson-plan', toolId: 'syllabus', stage: '初稿' })
    await expect(registry.list()).resolves.toHaveLength(1)
    await expect(versions.listVersions(outcome.artifact.id)).resolves.toMatchObject([{ source: 'ai-generate', summary: '生成教案' }])
    // The planned minutes are given to the model; materials stay inside the untrusted boundary.
    const body = JSON.parse(String(fetcher.mock.calls[0][1].body)) as { messages: Array<{ content: string }> }
    expect(body.messages[0].content).toContain('等于 90 分钟')
    expect(body.messages[1].content).toContain('ZHIYAN_UNTRUSTED_MATERIAL_START')
  })

  it('never overwrites an existing lesson plan', async () => {
    const { workspace, service } = await setup(content)
    const input = { workspaceRoot: workspace, fields: { courseName: '生理学', topic: '呼吸' } }

    const first = await service.create(input)
    const second = await service.create(input)

    expect(first.ok && second.ok && second.path.endsWith('生理学 · 呼吸 教案 (2).md')).toBe(true)
  })

  it('reports model output that is not a lesson plan', async () => {
    const { workspace, registry, service } = await setup({ objectives: {} })

    await expect(service.create({ workspaceRoot: workspace, fields: { topic: '呼吸' } })).resolves.toMatchObject({
      ok: false,
      code: 'INVALID_MODEL_OUTPUT'
    })
    await expect(registry.list()).resolves.toEqual([])
  })
})

describe('lesson timing (Task 2.2.3)', () => {
  const markdown = [
    '# 教案', '', '## 教学过程设计', '',
    '### 一、导入（5 分钟）', '', '导入。', '',
    '### 二、新课讲授（60 分钟）', '', '讲授。', '',
    '### 三、小结（10 分钟）', '', '小结。', '',
    '## 教学改进', '', '### 不是环节（30 分钟）', ''
  ].join('\n')

  it('reads planned minutes from the 学时 the teacher gave', () => {
    expect(plannedLessonMinutes('2 学时')).toBe(90)
    expect(plannedLessonMinutes('90 分钟')).toBe(90)
    expect(plannedLessonMinutes('1学时（50分钟）')).toBe(50)
    expect(plannedLessonMinutes('2 学时（每学时 50 分钟）')).toBe(100)
    expect(plannedLessonMinutes('一次课')).toBeNull()
  })

  it('adds up only the segments of 教学过程设计 and compares them with the plan', () => {
    expect(lessonSegmentTimings(markdown).map((segment) => segment.minutes)).toEqual([5, 60, 10])
    expect(checkLessonTiming(markdown, '2 学时')).toEqual({ status: 'mismatch', total: 75, planned: 90 })
    expect(checkLessonTiming(markdown, '75 分钟').status).toBe('ok')
    expect(checkLessonTiming(markdown, '').status).toBe('unknown')
  })

  it('adjusts every segment in proportion so the total matches, changing only the minutes', () => {
    const adjusted = adjustLessonTiming(markdown, 90)

    expect(lessonSegmentTimings(adjusted).map((segment) => segment.minutes)).toEqual([6, 72, 12])
    expect(checkLessonTiming(adjusted, '2 学时').status).toBe('ok')
    expect(adjusted).toContain('### 二、新课讲授（72 分钟）')
    expect(adjusted).toContain('### 不是环节（30 分钟）')
    expect(adjusted.replace(/\d+ 分钟/gu, '')).toBe(markdown.replace(/\d+ 分钟/gu, ''))
  })
})
