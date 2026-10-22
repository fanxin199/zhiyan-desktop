import { mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises'
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
import { ArtifactRegistry } from './artifact-service'
import { ArtifactVersionStore } from './artifact-version-service'
import { DocumentService, documentFileStem } from './document-service'

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

async function setup(reply: unknown) {
  const root = await mkdtemp(join(tmpdir(), 'zhiyan-documents-'))
  tempDirs.push(root)
  const workspace = join(root, 'write')
  await mkdir(workspace, { recursive: true })
  const registry = new ArtifactRegistry({ dataDirectory: join(root, 'data') })
  const versions = new ArtifactVersionStore({ registry })
  const fetcher = vi.fn(async () => new Response(
    JSON.stringify({ choices: [{ message: { content: JSON.stringify(reply) } }] }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  ))
  const service = new DocumentService({
    registry, versions, loadSettings: async () => settings(), generation: { fetcher: fetcher as unknown as typeof fetch }
  })
  return { workspace, registry, versions, service, fetcher }
}

describe('DocumentService', () => {
  it('writes the template’s blueprint from one sentence and keeps it as the first version', async () => {
    const { workspace, registry, versions, service, fetcher } = await setup({
      title: '机械应力调控骨重建',
      markdown: '## 写作主线\n核心问题……\n\n## 立项依据\n本节要写：……'
    })

    const outcome = await service.create({
      workspaceRoot: workspace,
      template: 'grant',
      instruction: '帮我搭一份国自然面上项目申请书',
      materials: [{ name: '前期结果.docx', text: '小鼠尾悬吊模型显示骨量下降。' }]
    })

    expect(outcome).toMatchObject({ ok: true, artifact: { kind: 'document', toolId: 'write', title: '机械应力调控骨重建', stage: '项目蓝图' } })
    if (!outcome.ok) return
    expect(outcome.path).toBe(join(await realpath(workspace), '机械应力调控骨重建.md'))
    expect(await readFile(outcome.path, 'utf8')).toBe('# 机械应力调控骨重建\n\n## 写作主线\n核心问题……\n\n## 立项依据\n本节要写：……\n')
    expect(await versions.listVersions(outcome.artifact.id)).toMatchObject([
      { version: 1, source: 'ai-generate', summary: '生成项目蓝图', instruction: '帮我搭一份国自然面上项目申请书' }
    ])
    expect((await registry.list()).map((item) => item.title)).toEqual(['机械应力调控骨重建'])

    const [, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit]
    const prompt = JSON.parse(String(init.body)).messages as Array<{ content: string }>
    expect(prompt[0].content).toContain('技术路线')
    expect(prompt[0].content).toContain('不得编造')
    expect(prompt[1].content).toContain('小鼠尾悬吊模型显示骨量下降。')
    expect(prompt[1].content).toContain('ZHIYAN_UNTRUSTED_MATERIAL_START')
  })

  it('starts an empty document without calling the model', async () => {
    const { workspace, service, versions, fetcher } = await setup({})

    const outcome = await service.create({ workspaceRoot: workspace, template: 'blank', instruction: '', materials: [] })

    expect(fetcher).not.toHaveBeenCalled()
    expect(outcome).toMatchObject({ ok: true, artifact: { title: '未命名文稿', stage: '空白文稿' } })
    if (!outcome.ok) return
    expect(await readFile(outcome.path, 'utf8')).toBe('# 未命名文稿\n\n')
    expect(await versions.listVersions(outcome.artifact.id)).toMatchObject([{ source: 'teacher-edit', summary: '新建文稿' }])
  })

  it('never overwrites an existing document with the same title', async () => {
    const { workspace, service } = await setup({ title: '教学工作总结', markdown: '# 教学工作总结\n\n正文' })
    await writeFile(join(workspace, '教学工作总结.md'), '老师自己的文稿', 'utf8')

    await service.create({ workspaceRoot: workspace, template: 'blank', instruction: '写一份教学工作总结', materials: [] })
    await service.create({ workspaceRoot: workspace, template: 'blank', instruction: '再写一份', materials: [] })

    expect((await readdir(workspace)).filter((name) => name.endsWith('.md')).sort()).toEqual([
      '教学工作总结 (2).md',
      '教学工作总结 (3).md',
      '教学工作总结.md'
    ])
    expect(await readFile(join(workspace, '教学工作总结.md'), 'utf8')).toBe('老师自己的文稿')
  })

  it('reports model problems without creating a file', async () => {
    const { workspace, service } = await setup({ title: '' })

    const outcome = await service.create({ workspaceRoot: workspace, template: 'paper', instruction: '写论文', materials: [] })

    expect(outcome).toMatchObject({ ok: false, code: 'INVALID_MODEL_OUTPUT' })
    expect(await readdir(workspace)).toEqual([])
  })
})

describe('documentFileStem', () => {
  it('turns a title into a safe file name', () => {
    expect(documentFileStem('细胞衰老: 组织纤维化中的作用?')).toBe('细胞衰老 组织纤维化中的作用')
    // Full-width punctuation is allowed in Windows file names and stays.
    expect(documentFileStem('细胞衰老：组织纤维化')).toBe('细胞衰老：组织纤维化')
    expect(documentFileStem('  ...  ')).toBe('未命名文稿')
    expect(documentFileStem('a'.repeat(100))).toHaveLength(60)
  })
})
