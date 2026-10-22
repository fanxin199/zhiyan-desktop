import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
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
import { ArtifactRegistry } from './artifact-service'
import { ArtifactVersionStore } from './artifact-version-service'
import { ArtifactRevisionService, confineSectionRevision, resolveRevisionScope } from './artifact-revision-service'

const LESSON = [
  '# 第八章 呼吸',
  '',
  '## 一、导入',
  '讲述哮喘病例。',
  '',
  '## 二、新课讲授',
  '肺通气的动力与阻力。',
  '',
  '### 小结',
  '回顾要点。',
  '',
  '## 三、作业',
  '完成课后习题。',
  ''
].join('\n')

const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

function settings(): AppSettingsV1 {
  const provider = defaultModelProviderSettings()
  provider.apiKey = 'sk-test'
  provider.providers[0].apiKey = 'sk-test'
  return {
    version: 1, locale: 'zh', theme: 'system', uiFontScale: 'small', aiMode: 'deep', provider,
    agents: { kun: { ...defaultKunRuntimeSettings(), model: 'deepseek-chat' } },
    workspaceRoot: 'C:\\workspace', log: { enabled: false, retentionDays: 7 }, notifications: { turnComplete: true },
    showTechnicalMetrics: false,
    teacherProfile: { name: '', school: '', department: '', courses: [], researchTopics: [] },
    teacherProjects: [], moduleContext: { projects: {}, recent: {} },
    appBehavior: { openAtLogin: false, startMinimized: false, closeToTray: false },
    write: defaultWriteSettings(), claw: defaultClawSettings(), schedule: defaultScheduleSettings(),
    guiUpdate: { channel: 'stable' }
  }
}

function modelReply(value: unknown): Response {
  return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(value) } }] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  })
}

async function setup(reply: unknown, content = LESSON) {
  const root = await mkdtemp(join(tmpdir(), 'zhiyan-revision-'))
  tempDirs.push(root)
  const workspace = join(root, 'workspace')
  await mkdir(workspace, { recursive: true })
  const path = join(workspace, '第八章教案.md')
  await writeFile(path, content, 'utf8')
  let minutes = 0
  const now = () => new Date(Date.UTC(2026, 9, 23, 8, minutes += 20))
  const registry = new ArtifactRegistry({ dataDirectory: join(root, 'data'), now })
  const versions = new ArtifactVersionStore({ registry, now })
  const artifact = await registry.register({
    kind: 'lesson-plan', title: '第八章教案', toolId: 'syllabus', workspaceRoot: workspace, storage: { type: 'file', path }
  })
  await versions.createVersion({ id: artifact.id, source: 'ai-generate', summary: '生成初稿' })
  const fetcher = vi.fn(async () => modelReply(reply))
  const service = new ArtifactRevisionService({
    registry,
    versions,
    loadSettings: async () => settings(),
    generation: { fetcher: fetcher as unknown as typeof fetch }
  })
  return { path, artifact, versions, service, fetcher }
}

describe('ArtifactRevisionService', () => {
  it('rewrites only the chosen section, saves it as a version and can be undone', async () => {
    const { path, artifact, versions, service, fetcher } = await setup({
      summary: '导入改为慢阻肺病例',
      revised: '## 一、导入\n讲述慢阻肺病例，提出问题。\n'
    })

    const outcome = await service.revise({
      artifactId: artifact.id,
      baseVersion: 1,
      scope: { type: 'section', sectionId: 'section-2', title: '一、导入' },
      instruction: '换成慢阻肺的病例'
    })

    expect(outcome).toMatchObject({
      ok: true,
      value: { newVersion: 2, undoVersion: 1, summary: '导入改为慢阻肺病例', rebased: false, discardedOutsideScope: false }
    })
    expect(await readFile(path, 'utf8')).toBe(LESSON.replace('讲述哮喘病例。', '讲述慢阻肺病例，提出问题。'))
    const [, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit]
    const body = JSON.parse(String(init.body))
    expect(body.messages[1].content).toContain('老师的要求：换成慢阻肺的病例')

    await versions.restoreVersion({ id: artifact.id, version: 1 })
    expect(await readFile(path, 'utf8')).toBe(LESSON)
  })

  it('discards changes the AI makes outside the chosen section (guard 1)', async () => {
    const { path, artifact, service } = await setup({
      summary: '扩充导入',
      revised: '## 一、导入\n讲述慢阻肺病例。\n\n## 二、新课讲授\n被 AI 顺手改掉的内容。\n'
    })

    const outcome = await service.revise({
      artifactId: artifact.id, baseVersion: 1, scope: { type: 'section', sectionId: 'section-2' }, instruction: '扩充导入'
    })

    expect(outcome).toMatchObject({ ok: true, value: { discardedOutsideScope: true } })
    const saved = await readFile(path, 'utf8')
    expect(saved).toContain('肺通气的动力与阻力。')
    expect(saved).not.toContain('被 AI 顺手改掉的内容')
  })

  it('leaves the teacher’s own edits outside the chosen part untouched (guard 2)', async () => {
    const { path, artifact, versions, service } = await setup({ summary: '作业改为讨论题', revised: '## 三、作业\n讨论：慢阻肺患者为何呼气困难？\n' })
    const teacherEdited = LESSON.replace('回顾要点。', '回顾要点，并请学生画出压力曲线。')
    await writeFile(path, teacherEdited, 'utf8')

    await service.revise({
      artifactId: artifact.id, baseVersion: 1, scope: { type: 'section', sectionId: 'section-5', title: '三、作业' }, instruction: '改成讨论题'
    })

    const saved = await readFile(path, 'utf8')
    expect(saved).toContain('回顾要点，并请学生画出压力曲线。')
    expect(saved.slice(0, saved.indexOf('## 三、作业'))).toBe(teacherEdited.slice(0, teacherEdited.indexOf('## 三、作业')))
    // The teacher's edit became its own version, so undo returns to it rather than to the AI draft.
    expect((await versions.listVersions(artifact.id)).map((version) => version.source)).toEqual(['ai-revise', 'teacher-edit', 'ai-generate'])
  })

  it('works on the latest content when the teacher edited after asking (guard 3)', async () => {
    const { path, artifact, service } = await setup({ summary: '改写选中句', revised: '肺通气的动力是呼吸肌运动。' })
    const asked = { from: LESSON.indexOf('肺通气的动力与阻力。'), text: '肺通气的动力与阻力。' }
    // A line inserted above the selection after the teacher asked moves its offsets.
    await writeFile(path, LESSON.replace('## 二、新课讲授\n', '## 二、新课讲授\n先复习上节课。\n'), 'utf8')

    const outcome = await service.revise({
      artifactId: artifact.id,
      baseVersion: 1,
      scope: { type: 'selection', from: asked.from, to: asked.from + asked.text.length, text: asked.text },
      instruction: '说清楚动力来源'
    })

    expect(outcome).toMatchObject({ ok: true, value: { rebased: true, undoVersion: 2, newVersion: 3 } })
    const saved = await readFile(path, 'utf8')
    expect(saved).toContain('先复习上节课。\n肺通气的动力是呼吸肌运动。')
  })

  it('refuses stale or unsupported scopes without calling the model', async () => {
    const { path, artifact, service, fetcher } = await setup({ summary: 'x', revised: 'x' })
    await writeFile(path, LESSON.replace('肺通气的动力与阻力。', '已经被老师改写。'), 'utf8')

    await expect(service.revise({
      artifactId: artifact.id, baseVersion: 1, scope: { type: 'selection', from: 0, to: 4, text: '肺通气的动力与阻力。' }, instruction: '改'
    })).resolves.toMatchObject({ ok: false, code: 'INVALID_SCOPE' })
    await expect(service.revise({
      artifactId: artifact.id, baseVersion: 1, scope: { type: 'slide', slideId: 'slide-1' }, instruction: '改'
    })).resolves.toMatchObject({ ok: false, code: 'UNSUPPORTED_SCOPE' })
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('reports a missing API key without changing the file', async () => {
    const { path, artifact } = await setup({ summary: 'x', revised: 'x' })
    const registry = { get: async () => ({ ...artifact, available: true }) }
    const versions = { createVersion: vi.fn(async () => ({ version: 1, createdAt: '', source: 'teacher-edit' as const, summary: '' })) }
    const service = new ArtifactRevisionService({
      registry, versions, loadSettings: async () => ({ ...settings(), provider: defaultModelProviderSettings() })
    })

    await expect(service.revise({ artifactId: artifact.id, baseVersion: 1, scope: { type: 'whole' }, instruction: '润色' }))
      .resolves.toMatchObject({ ok: false, code: 'MISSING_API_KEY' })
    expect(await readFile(path, 'utf8')).toBe(LESSON)
  })
})

describe('revision scopes', () => {
  it('splits Markdown into nested heading sections and ignores headings in code', () => {
    const sections = splitMarkdownSections(`${LESSON}\`\`\`\n# 不是标题\n\`\`\`\n`)

    expect(sections.map((section) => [section.id, section.title, section.level])).toEqual([
      ['section-1', '第八章 呼吸', 1],
      ['section-2', '一、导入', 2],
      ['section-3', '二、新课讲授', 2],
      ['section-4', '小结', 3],
      ['section-5', '三、作业', 2]
    ])
    const lecture = sections[2]
    expect(LESSON.slice(lecture.start, lecture.end)).toBe('## 二、新课讲授\n肺通气的动力与阻力。\n\n### 小结\n回顾要点。\n\n')
  })

  it('finds a section by its title when headings moved', () => {
    const edited = LESSON.replace('## 一、导入\n', '## 零、复习\n回顾上节。\n\n## 一、导入\n')

    expect(resolveRevisionScope(edited, { type: 'section', sectionId: 'section-2', title: '一、导入' }))
      .toMatchObject({ ref: '一、导入', start: edited.indexOf('## 一、导入') })
  })

  it('keeps the heading when the AI drops it', () => {
    const [, intro] = splitMarkdownSections(LESSON)

    expect(confineSectionRevision('讲述慢阻肺病例。\n', intro, '## 一、导入')).toEqual({
      text: '## 一、导入\n讲述慢阻肺病例。\n',
      discarded: false
    })
  })
})
