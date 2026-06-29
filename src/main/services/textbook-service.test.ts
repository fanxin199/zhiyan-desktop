import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it, vi } from 'vitest'
import {
  defaultClawSettings,
  defaultKunRuntimeSettings,
  defaultModelProviderSettings,
  defaultScheduleSettings,
  defaultWriteSettings,
  type AppSettingsV1
} from '../../shared/app-settings'
import type { TextbookProject } from '../../shared/textbook'
import {
  checkTextbookProject,
  exportTextbookProject,
  generateTextbookOutline,
  generateTextbookSection,
  parseTextbookFormatRules,
  reviseTextbookSection
} from './textbook-service'

function settings(): AppSettingsV1 {
  const provider = defaultModelProviderSettings()
  provider.apiKey = 'sk-test'
  provider.providers[0].apiKey = 'sk-test'
  return {
    version: 1,
    locale: 'zh',
    theme: 'system',
    uiFontScale: 'small',
    provider,
    agents: {
      kun: {
        ...defaultKunRuntimeSettings(),
        model: 'deepseek-chat'
      }
    },
    workspaceRoot: 'C:\\workspace',
    log: { enabled: false, retentionDays: 7 },
    notifications: { turnComplete: true },
    showTechnicalMetrics: false,
    teacherProfile: {
      name: '',
      school: '',
      department: '',
      courses: [],
      researchTopics: []
    },
    teacherProjects: [],
    appBehavior: { openAtLogin: false, startMinimized: false, closeToTray: false },
    write: defaultWriteSettings(),
    claw: defaultClawSettings(),
    schedule: defaultScheduleSettings(),
    guiUpdate: { channel: 'stable' }
  }
}

function response(content: string, status = 200): Response {
  return new Response(JSON.stringify({
    choices: [{ message: { content } }]
  }), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}

function project(): TextbookProject {
  const now = new Date().toISOString()
  return {
    version: 1,
    metadata: {
      title: '医学免疫学',
      subject: '医学免疫学',
      audience: 'undergraduate',
      author: 'Teacher',
      writingGoal: '面向本科生。',
      citationStyle: 'gbt7714',
      outputFormats: ['markdown', 'docx', 'project']
    },
    publisherGuidelines: '正文小四号，1.5 倍行距。',
    formatRules: {
      fontFamily: 'Microsoft YaHei',
      fontSizePt: 11,
      lineSpacing: 1.5,
      headingPattern: '章标题一级，节标题二级',
      symbolRules: '中文标点',
      unresolvedRules: ['图表宽度人工复核']
    },
    outline: {
      title: '医学免疫学',
      rationale: '按机制主线组织。',
      chapters: [{
        id: 'chapter-1',
        title: '免疫系统概论',
        writingGoal: '建立基本框架。',
        sections: [{
          id: 'section-1',
          chapterId: 'chapter-1',
          title: '免疫系统的基本功能',
          writingGoal: '解释免疫防御、稳态和监视。',
          estimatedWords: 2000,
          keyConcepts: ['免疫监视'],
          confirmed: true
        }]
      }]
    },
    sections: [{
      id: 'section-1',
      chapterId: 'chapter-1',
      title: '免疫系统的基本功能',
      path: 'chapters/ch01-sec01.md',
      content: '## 免疫系统的基本功能\n\n旧正文。',
      status: 'draft',
      referenceKeys: [],
      teacherNotes: '强调肿瘤免疫。'
    }],
    references: [{
      key: 'pmid-40123456',
      title: 'B cells in tumor immunity',
      sourceType: 'abstract',
      pmid: '40123456',
      year: 2025,
      journal: 'Immunity',
      authors: ['Wang Li'],
      abstract: 'B cell subsets shape tumor immunity.'
    }],
    checks: [],
    createdAt: now,
    updatedAt: now
  }
}

describe('textbook service', () => {
  it('parses publisher guidelines into editable format rules', async () => {
    const fetcher = vi.fn().mockResolvedValue(response(JSON.stringify({
      fontFamily: 'SimSun',
      fontSizePt: 12,
      lineSpacing: 1.5,
      headingPattern: '章标题用一级标题，节标题用二级标题',
      symbolRules: '中文标点使用全角',
      unresolvedRules: ['图表宽度按出版社模板复核']
    })))

    const result = await parseTextbookFormatRules(settings(), {
      publisherGuidelines: '正文宋体小四，1.5 倍行距。中文标点使用全角。图表宽度按出版社模板复核。',
      currentRules: project().formatRules
    }, fetcher)

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.fontFamily).toBe('SimSun')
      expect(result.value.fontSizePt).toBe(12)
      expect(result.value.unresolvedRules).toContain('图表宽度按出版社模板复核')
    }
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('generates a validated textbook outline', async () => {
    const fetcher = vi.fn().mockResolvedValue(response(JSON.stringify({
      title: '医学免疫学',
      rationale: '从免疫系统设计逻辑展开。',
      chapters: [{
        id: 'chapter-1',
        title: '免疫系统概论',
        writingGoal: '建立全书主线。',
        sections: [{
          id: 'section-1',
          chapterId: 'chapter-1',
          title: '免疫系统的基本功能',
          writingGoal: '解释免疫防御、稳态和监视。',
          estimatedWords: 2400,
          keyConcepts: ['免疫监视'],
          confirmed: false
        }]
      }]
    })))

    const result = await generateTextbookOutline(settings(), {
      metadata: project().metadata,
      publisherGuidelines: '正文小四号。',
      formatRules: project().formatRules,
      teacherBrief: '突出机制链条。'
    }, fetcher)

    expect(result).toMatchObject({
      ok: true,
      value: {
        chapters: [{
          sections: [{ id: 'section-1' }]
        }]
      }
    })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('rewrites only the requested section and preserves its identity', async () => {
    const fetcher = vi.fn().mockResolvedValue(response(JSON.stringify({
      content: '## 免疫系统的基本功能\n\n免疫系统通过防御、稳态和监视维持机体完整性。[@pmid-40123456]',
      referenceKeys: ['pmid-40123456']
    })))

    const result = await generateTextbookSection(settings(), {
      project: project(),
      sectionId: 'section-1',
      instruction: '增加肿瘤免疫例子'
    }, fetcher)

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.section.id).toBe('section-1')
      expect(result.value.section.status).toBe('writing')
      expect(result.value.section.referenceKeys).toEqual(['pmid-40123456'])
      expect(result.value.section.content).toContain('免疫系统通过防御')
    }
  })

  it('checks project consistency and returns actionable items', async () => {
    const fetcher = vi.fn().mockResolvedValue(response(JSON.stringify({
      summary: '发现 1 个需要人工复核的问题。',
      items: [{
        id: 'check-1',
        severity: 'warning',
        scope: '出版社规范',
        message: '图表宽度规则无法自动确认。',
        suggestion: '导出前由教师按出版社模板复核。'
      }]
    })))

    const result = await checkTextbookProject(settings(), { project: project() }, fetcher)

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.items[0].severity).toBe('warning')
      expect(result.value.items[0].scope).toBe('出版社规范')
    }
  })

  it('revises a section through the same stable section contract', async () => {
    const fetcher = vi.fn().mockResolvedValue(response(JSON.stringify({
      content: '## 免疫系统的基本功能\n\n压缩后的教材正文。',
      referenceKeys: []
    })))

    const result = await reviseTextbookSection(settings(), {
      project: project(),
      sectionId: 'section-1',
      instruction: '压缩到 800 字'
    }, fetcher)

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.section.content).toContain('压缩后的教材正文')
  })

  it('exports the project folder, markdown, docx and project file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'zhiyan-textbook-'))
    try {
      const result = await exportTextbookProject({
        project: project(),
        outputDirectory: dir
      })

      expect(result.ok).toBe(true)
      if (result.ok) {
        await expect(stat(join(dir, 'publisher-guidelines.md'))).resolves.toBeTruthy()
        await expect(stat(join(dir, 'outline.json'))).resolves.toBeTruthy()
        await expect(stat(join(dir, 'references.json'))).resolves.toBeTruthy()
        await expect(stat(join(dir, 'chapters', 'ch01-sec01.md'))).resolves.toBeTruthy()
        await expect(stat(result.docxPath)).resolves.toBeTruthy()
        const projectJson = JSON.parse(await readFile(result.projectPath, 'utf8')) as TextbookProject
        expect(projectJson.metadata.title).toBe('医学免疫学')
        expect(await readFile(result.markdownPath, 'utf8')).toContain('# 参考文献')
      }
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
