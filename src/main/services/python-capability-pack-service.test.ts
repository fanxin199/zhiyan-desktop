import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  BASE_SCIENCE_LOCK,
  BASE_SCIENCE_PACK_VERSION,
  installBaseScienceCapabilityPack,
  type PythonPackCommand
} from './python-capability-pack-service'

const roots: string[] = []

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'zhiyan-python-pack-'))
  roots.push(root)
  return root
}

async function addManagedPython(userDataPath: string): Promise<void> {
  const path = join(userDataPath, 'runtimes', 'python', 'python.exe')
  await mkdir(join(path, '..'), { recursive: true })
  await writeFile(path, 'python')
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('base science capability lock', () => {
  it('pins the complete resolved package set without duplicate names', () => {
    expect(BASE_SCIENCE_PACK_VERSION).toBe('2026.07.1')
    expect(BASE_SCIENCE_LOCK).toEqual(expect.arrayContaining([
      { name: 'numpy', version: '2.4.6' },
      { name: 'pandas', version: '3.0.3' },
      { name: 'scipy', version: '1.18.0' },
      { name: 'matplotlib', version: '3.11.0' },
      { name: 'scikit-learn', version: '1.9.0' },
      { name: 'anndata', version: '0.13.1' },
      { name: 'umap-learn', version: '0.5.12' }
    ]))
    expect(new Set(BASE_SCIENCE_LOCK.map(({ name }) => name.toLowerCase())).size).toBe(BASE_SCIENCE_LOCK.length)
    expect(BASE_SCIENCE_LOCK.every(({ version }) => /^\d+(?:\.\d+)+(?:\.[a-z]+\d+)?$/u.test(version))).toBe(true)
  })
})

describe('installBaseScienceCapabilityPack', () => {
  it('installs only the fixed whitelist and activates it after smoke tests pass', async () => {
    const userDataPath = await temporaryRoot()
    await addManagedPython(userDataPath)
    const commands: PythonPackCommand[] = []
    const runPython = vi.fn(async (command: PythonPackCommand) => {
      commands.push(command)
      if (command.kind === 'smoke-test') {
        return {
          ok: true,
          stdout: `ZHIYAN_PACK_SNAPSHOT=${JSON.stringify(Object.fromEntries(
            BASE_SCIENCE_LOCK.map(({ name, version }) => [name, version])
          ))}`,
          stderr: ''
        }
      }
      return { ok: true, stdout: '', stderr: '' }
    })

    const result = await installBaseScienceCapabilityPack({ userDataPath, runPython })

    expect(result).toMatchObject({ ok: true, packVersion: BASE_SCIENCE_PACK_VERSION })
    const install = commands.find((command) => command.kind === 'install')
    expect(install?.args).toEqual(expect.arrayContaining([
      '--only-binary=:all:',
      `numpy==2.4.6`,
      `anndata==0.13.1`
    ]))
    expect(install?.args.some((arg) => !arg.includes('==') && arg.startsWith('git+'))).toBe(false)
    const activePath = join(userDataPath, 'runtimes', 'python-packages', 'base-science', BASE_SCIENCE_PACK_VERSION)
    expect(await readFile(join(
      userDataPath, 'runtimes', 'python', 'Lib', 'site-packages', 'zhiyan-base-science.pth'
    ), 'utf8')).toBe(activePath)
    expect(JSON.parse(await readFile(join(activePath, 'environment.json'), 'utf8'))).toMatchObject({
      packVersion: BASE_SCIENCE_PACK_VERSION,
      packages: { numpy: '2.4.6', pandas: '3.0.3' }
    })
    expect(JSON.parse(await readFile(join(
      userDataPath, 'runtimes', 'python-packages', 'base-science', 'active-environment.json'
    ), 'utf8'))).toMatchObject({ packVersion: BASE_SCIENCE_PACK_VERSION })
  })

  it('does not activate a pack whose smoke tests fail', async () => {
    const userDataPath = await temporaryRoot()
    await addManagedPython(userDataPath)
    const result = await installBaseScienceCapabilityPack({
      userDataPath,
      runPython: async (command) => command.kind === 'smoke-test'
        ? { ok: false, stdout: '', stderr: 'import failed' }
        : { ok: true, stdout: '', stderr: '' }
    })

    expect(result).toMatchObject({ ok: false, code: 'smoke-test-failed' })
    await expect(readFile(join(
      userDataPath, 'runtimes', 'python', 'Lib', 'site-packages', 'zhiyan-base-science.pth'
    ))).rejects.toThrow()
  })

  it('reports a missing managed interpreter without running package commands', async () => {
    const userDataPath = await temporaryRoot()
    const runPython = vi.fn()
    await expect(installBaseScienceCapabilityPack({ userDataPath, runPython })).resolves.toMatchObject({
      ok: false,
      code: 'runtime-not-installed'
    })
    expect(runPython).not.toHaveBeenCalled()
  })

  it('restores the previous pack when activation fails', async () => {
    const userDataPath = await temporaryRoot()
    await addManagedPython(userDataPath)
    const activePath = join(
      userDataPath, 'runtimes', 'python-packages', 'base-science', BASE_SCIENCE_PACK_VERSION
    )
    await mkdir(activePath, { recursive: true })
    await writeFile(join(activePath, 'marker.txt'), 'previous pack')
    await mkdir(join(
      userDataPath, 'runtimes', 'python', 'Lib', 'site-packages', 'zhiyan-base-science.pth'
    ), { recursive: true })

    const result = await installBaseScienceCapabilityPack({
      userDataPath,
      runPython: async (command) => command.kind === 'smoke-test'
        ? {
            ok: true,
            stdout: `ZHIYAN_PACK_SNAPSHOT=${JSON.stringify(Object.fromEntries(
              BASE_SCIENCE_LOCK.map(({ name, version }) => [name, version])
            ))}`,
            stderr: ''
          }
        : { ok: true, stdout: '', stderr: '' }
    })

    expect(result).toMatchObject({ ok: false, code: 'install-failed' })
    await expect(readFile(join(activePath, 'marker.txt'), 'utf8')).resolves.toBe('previous pack')
  })
})
