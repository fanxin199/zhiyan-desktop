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
import { ArtifactRegistry } from './artifact-service'
import { ArtifactVersionStore } from './artifact-version-service'
import { QuestionSetService } from './question-set-service'

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
    preferences: [{ id: 'p', text: '题干不超过 60 字', scope: 'tool', toolId: 'quiz', source: 'explicit', createdAt: '' }],
    appBehavior: { openAtLogin: false, startMinimized: false, closeToTray: false },
    write: defaultWriteSettings(), claw: defaultClawSettings(), schedule: defaultScheduleSettings(),
    guiUpdate: { channel: 'stable' }
  }
}

const single = {
  type: 'single', stem: '肺通气的直接动力是', options: ['呼吸肌收缩', '肺内压与大气压之差', '胸膜腔负压', '肺弹性回缩', '气道阻力'],
  answer: 'B', explanation: '肺内压与大气压之差直接推动气体进出。', objective: '肺通气动力', difficulty: '基础'
}
const short = {
  type: 'short', stem: '简述胸膜腔负压的生理意义',
  points: [{ point: '维持肺扩张', score: 2 }, { point: '促进静脉回流', score: 2 }, { point: '利于淋巴回流', score: 1 }]
}
const badShort = { type: 'short', stem: '分值不对的题', points: [{ point: 'a', score: 2 }, { point: 'b', score: 2 }, { point: 'c', score: 2 }] }

async function setup(reply: unknown) {
  const root = await mkdtemp(join(tmpdir(), 'zhiyan-quiz-'))
  tempDirs.push(root)
  const workspace = join(root, 'write')
  await mkdir(workspace, { recursive: true })
  const registry = new ArtifactRegistry({ dataDirectory: join(root, 'data') })
  const versions = new ArtifactVersionStore({ registry })
  const fetcher = vi.fn(async (_url: string, _init: RequestInit) => new Response(
    JSON.stringify({ choices: [{ message: { content: JSON.stringify(reply) } }] }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  ))
  const service = new QuestionSetService({
    registry, versions, loadSettings: async () => settings(),
    loadSkillGuide: async () => '# 生物医学题库与评价设计\n每题必须提供五个选项',
    generation: { fetcher: fetcher as unknown as typeof fetch }
  })
  return { workspace, registry, service, fetcher }
}

describe('QuestionSetService', () => {
  it('writes questions by the skill’s rules, one section per question, and drops ones with wrong point totals', async () => {
    const { workspace, registry, service, fetcher } = await setup({ title: '呼吸系统', questions: [single, short, badShort] })

    const outcome = await service.create({
      workspaceRoot: workspace,
      fields: { topic: '第八章 呼吸系统', count: '3 道' },
      materials: [{ name: '第八章 教案', text: '肺通气……' }]
    })

    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.dropped).toBe(1)
    const markdown = await readFile(outcome.path, 'utf8')
    expect(outcome.path.endsWith('呼吸系统 随堂题.md')).toBe(true)
    expect(splitMarkdownSections(markdown).map((section) => [section.level, section.title])).toEqual([
      [1, '呼吸系统'],
      [2, '一、单项选择题'],
      [3, '1. 肺通气的直接动力是'],
      [2, '二、简答题'],
      [3, '1. 简述胸膜腔负压的生理意义（5 分）']
    ])
    expect(markdown).toContain('E. 气道阻力')
    expect(markdown).toContain('**正确答案**：B')
    expect(markdown).toContain('2. 促进静脉回流（2 分）')
    expect(markdown).not.toContain('分值不对的题')
    expect(outcome.artifact).toMatchObject({ kind: 'question-set', toolId: 'quiz', stage: '2 道题' })
    await expect(registry.list()).resolves.toHaveLength(1)
    const body = JSON.parse(String(fetcher.mock.calls[0][1].body)) as { messages: Array<{ content: string }> }
    expect(body.messages[0].content).toContain('每题必须提供五个选项')
    expect(body.messages[1].content).toContain('- 题干不超过 60 字')
  })

  it('refuses a set where no question meets the scoring rules', async () => {
    const { workspace, registry, service } = await setup({ title: '呼吸系统', questions: [badShort] })

    await expect(service.create({ workspaceRoot: workspace, fields: { topic: '呼吸' } })).resolves.toMatchObject({ ok: false, code: 'INVALID_MODEL_OUTPUT' })
    await expect(registry.list()).resolves.toEqual([])
  })
})
