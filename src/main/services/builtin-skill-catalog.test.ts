import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SkillManifest } from '../../../kun/src/skills/skill-runtime.js'

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
})
