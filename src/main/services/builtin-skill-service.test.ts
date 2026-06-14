import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  builtinSkillRootForDataDir,
  syncBuiltinSkills
} from './builtin-skill-service'

describe('builtin-skill-service', () => {
  let tempRoot = ''
  let sourceRoot = ''
  let dataDir = ''

  beforeEach(async () => {
    tempRoot = await mkdtemp(join(tmpdir(), 'zhiyan-builtin-skills-'))
    sourceRoot = join(tempRoot, 'source')
    dataDir = join(tempRoot, 'data')
    await writeSkill(sourceRoot, 'lesson-planner', '1.0.0', 'first')
  })

  afterEach(async () => {
    await rm(tempRoot, { recursive: true, force: true })
  })

  it('installs bundled skills into the application private data directory', async () => {
    const result = await syncBuiltinSkills({ sourceRoot, dataDir })

    expect(result).toMatchObject({ installed: 1, updated: 0, unchanged: 0 })
    expect(result.root).toBe(builtinSkillRootForDataDir(dataDir))
    await expect(readFile(
      join(result.root, 'lesson-planner', 'SKILL.md'),
      'utf8'
    )).resolves.toBe('first')
  })

  it('replaces a managed skill when its bundled version changes', async () => {
    await syncBuiltinSkills({ sourceRoot, dataDir })
    await writeSkill(sourceRoot, 'lesson-planner', '1.1.0', 'second')

    const result = await syncBuiltinSkills({ sourceRoot, dataDir })

    expect(result).toMatchObject({ installed: 0, updated: 1, unchanged: 0 })
    await expect(readFile(
      join(result.root, 'lesson-planner', 'SKILL.md'),
      'utf8'
    )).resolves.toBe('second')
  })

  it('preserves unrelated user-created skill directories', async () => {
    const customRoot = join(builtinSkillRootForDataDir(dataDir), 'my-custom-skill')
    await mkdir(customRoot, { recursive: true })
    await writeFile(join(customRoot, 'SKILL.md'), 'custom', 'utf8')

    await syncBuiltinSkills({ sourceRoot, dataDir })

    await expect(readFile(join(customRoot, 'SKILL.md'), 'utf8')).resolves.toBe('custom')
  })
})

async function writeSkill(
  root: string,
  id: string,
  version: string,
  instructions: string
): Promise<void> {
  const skillRoot = join(root, id)
  await mkdir(skillRoot, { recursive: true })
  await writeFile(join(skillRoot, 'skill.json'), JSON.stringify({
    id,
    name: 'Lesson Planner',
    description: 'Create lesson plans.',
    version,
    entry: 'SKILL.md',
    triggers: { commands: [], promptPatterns: [], fileTypes: [] },
    allowedTools: ['read', 'write'],
    assets: [],
    priority: 10
  }), 'utf8')
  await writeFile(join(skillRoot, 'SKILL.md'), instructions, 'utf8')
}
