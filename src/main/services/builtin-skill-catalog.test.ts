import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SkillManifest, SkillRuntime } from '../../../kun/src/skills/skill-runtime.js'

const EXPECTED_SKILLS = [
  'academic-writer',
  'assessment-designer',
  'courseware-builder',
  'document-processor',
  'lesson-planner',
  'literature-reviewer',
  'research-data-analyst',
  'scientific-visualizer'
]

describe('built-in skill catalog', () => {
  it('contains eight valid, triggerable first-party skills', async () => {
    const root = join(process.cwd(), 'resources', 'builtin-skills')
    const entries = (await readdir(root, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()

    expect(entries).toEqual(EXPECTED_SKILLS)
    for (const id of entries) {
      const skillRoot = join(root, id)
      const manifest = SkillManifest.parse(JSON.parse(
        await readFile(join(skillRoot, 'skill.json'), 'utf8')
      ))
      const instructions = await readFile(join(skillRoot, manifest.entry), 'utf8')
      expect(manifest.id).toBe(id)
      expect(manifest.version).toMatch(/^\d+\.\d+\.\d+$/)
      expect([
        ...manifest.triggers.commands,
        ...manifest.triggers.promptPatterns,
        ...manifest.triggers.fileTypes
      ].length).toBeGreaterThan(0)
      expect(instructions.length).toBeGreaterThan(300)
      expect(instructions).toContain('不得')
    }
  })

  it('activates biomedical assessment design for all three supported question types', async () => {
    const root = join(process.cwd(), 'resources', 'builtin-skills')
    const runtime = await SkillRuntime.create({
      enabled: true,
      roots: [root],
      legacySkillMd: false
    }, { activeLimit: EXPECTED_SKILLS.length })

    for (const prompt of [
      '请根据上传的免疫学课件生成5道单项选择题',
      '请阅读这份生理学讲义并生成3道简答题',
      '根据附件中的肿瘤生物学内容设计2道论述题',
      'Create MCQs, short-answer questions, and essay questions from this pathology handout'
    ]) {
      const resolution = runtime.resolveTurn({
        prompt,
        workspace: process.cwd()
      })
      expect(resolution.activeSkillIds).toContain('assessment-designer')
    }
  })

  it('does not activate assessment design for an unrelated document request', async () => {
    const root = join(process.cwd(), 'resources', 'builtin-skills')
    const runtime = await SkillRuntime.create({
      enabled: true,
      roots: [root],
      legacySkillMd: false
    }, { activeLimit: EXPECTED_SKILLS.length })

    const resolution = runtime.resolveTurn({
      prompt: '请总结这份免疫学课件的主要内容',
      workspace: process.cwd(),
      filePaths: ['teaching-material.pptx']
    })

    expect(resolution.activeSkillIds).not.toContain('assessment-designer')
  })

  it('encodes the required biomedical scoring and review rules', async () => {
    const skillRoot = join(
      process.cwd(),
      'resources',
      'builtin-skills',
      'assessment-designer'
    )
    const manifest = SkillManifest.parse(JSON.parse(
      await readFile(join(skillRoot, 'skill.json'), 'utf8')
    ))
    const instructions = await readFile(join(skillRoot, manifest.entry), 'utf8')

    expect(manifest.version).toBe('1.1.0')
    expect(manifest.name).toBe('生物医学题库与评价设计')
    expect(instructions).toContain('五个选项')
    expect(instructions).toContain('只有一个正确答案')
    expect(instructions).toContain('3 到 5 个知识点')
    expect(instructions).toContain('总分必须为 5 分')
    expect(instructions).toContain('5 到 8 个知识点')
    expect(instructions).toContain('总分必须为 10 分')
    expect(instructions).toContain('二次核验')
    expect(instructions).toContain('不得使用“以上都是”')
  })
})
