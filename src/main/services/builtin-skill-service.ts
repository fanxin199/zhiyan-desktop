import { app } from 'electron'
import { existsSync } from 'node:fs'
import { cp, mkdir, readFile, readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'

export type BuiltinSkillSyncResult = {
  root: string
  sourceRoot: string
  installed: number
  updated: number
  unchanged: number
  available: boolean
}

export function builtinSkillRootForDataDir(dataDir: string): string {
  return join(dataDir, 'skills', 'builtin')
}

export function resolveBundledSkillSourceRoot(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'builtin-skills')
    : join(app.getAppPath(), 'resources', 'builtin-skills')
}

export async function syncBuiltinSkills(options: {
  dataDir: string
  sourceRoot?: string
}): Promise<BuiltinSkillSyncResult> {
  const sourceRoot = options.sourceRoot ?? resolveBundledSkillSourceRoot()
  const root = builtinSkillRootForDataDir(options.dataDir)
  if (!existsSync(sourceRoot)) {
    return {
      root,
      sourceRoot,
      installed: 0,
      updated: 0,
      unchanged: 0,
      available: false
    }
  }

  await mkdir(root, { recursive: true })
  let installed = 0
  let updated = 0
  let unchanged = 0
  const entries = await readdir(sourceRoot, { withFileTypes: true })
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const sourceSkillRoot = join(sourceRoot, entry.name)
    const sourceManifest = await readManifest(sourceSkillRoot)
    if (!sourceManifest) continue
    const targetSkillRoot = join(root, entry.name)
    const targetManifest = await readManifest(targetSkillRoot)
    if (targetManifest?.version === sourceManifest.version) {
      unchanged += 1
      continue
    }
    if (targetManifest) {
      await rm(targetSkillRoot, { recursive: true, force: true })
      updated += 1
    } else {
      installed += 1
    }
    await cp(sourceSkillRoot, targetSkillRoot, {
      recursive: true,
      force: true,
      errorOnExist: false
    })
  }

  return {
    root,
    sourceRoot,
    installed,
    updated,
    unchanged,
    available: true
  }
}

async function readManifest(root: string): Promise<{ version: string } | null> {
  try {
    const parsed = JSON.parse(await readFile(join(root, 'skill.json'), 'utf8')) as {
      version?: unknown
    }
    return typeof parsed.version === 'string' && parsed.version.trim()
      ? { version: parsed.version.trim() }
      : null
  } catch {
    return null
  }
}
