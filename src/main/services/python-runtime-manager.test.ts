import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  WINDOWS_X64_PYTHON_RUNTIME,
  installManagedPythonRuntime,
  verifyFileSha256,
  uninstallManagedPythonRuntime
} from './python-runtime-manager'
import {
  BASE_SCIENCE_PACKAGES,
  inspectPythonRuntime,
  type PythonCandidateRunResult
} from './python-runtime-service'

const roots: string[] = []

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'zhiyan-python-manager-'))
  roots.push(root)
  return root
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('managed Python runtime manifest', () => {
  it('pins an auditable Windows x64 distribution', () => {
    expect(WINDOWS_X64_PYTHON_RUNTIME).toMatchObject({
      pythonVersion: '3.12.13',
      platform: 'win32',
      architecture: 'x64',
      size: 21_921_642,
      sha256: '24168aff2e7d93784c6a436124c4ebb79b076a4e289bde4902c08333507b71d0',
      license: { name: 'Python Software Foundation License Version 2' },
      uninstall: { removesManagedRootOnly: true }
    })
    expect(WINDOWS_X64_PYTHON_RUNTIME.url).toMatch(/^https:\/\/github\.com\/astral-sh\/python-build-standalone\/releases\/download\//u)
  })

  it('verifies a file against its SHA-256 digest', async () => {
    const root = await temporaryRoot()
    const path = join(root, 'archive.bin')
    await writeFile(path, 'abc')
    await expect(verifyFileSha256(
      path,
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    )).resolves.toBe(true)
  })
})

describe('installManagedPythonRuntime', () => {
  it('installs through staging and records the installed manifest', async () => {
    const userDataPath = await temporaryRoot()
    const progress: string[] = []
    const result = await installManagedPythonRuntime({
      userDataPath,
      platform: 'win32',
      architecture: 'x64',
      acquireArchive: async ({ archivePath, onProgress }) => {
        await writeFile(archivePath, 'verified archive')
        onProgress(21_921_642, 21_921_642)
      },
      verifyArchive: async () => true,
      extractArchive: async (_archivePath, destination) => {
        await mkdir(join(destination, 'python'), { recursive: true })
        await writeFile(join(destination, 'python', 'python.exe'), 'python')
      },
      onProgress: (event) => progress.push(event.phase)
    })

    expect(result.ok).toBe(true)
    expect(await readFile(join(userDataPath, 'runtimes', 'python', 'python.exe'), 'utf8')).toBe('python')
    expect(JSON.parse(await readFile(
      join(userDataPath, 'runtimes', 'python', 'zhiyan-runtime.json'), 'utf8'
    ))).toMatchObject({ pythonVersion: '3.12.13' })
    expect(progress).toEqual(expect.arrayContaining(['downloading', 'verifying', 'installing', 'complete']))
  })

  it('rolls back to the previous runtime when atomic replacement fails', async () => {
    const userDataPath = await temporaryRoot()
    const managedRoot = join(userDataPath, 'runtimes', 'python')
    await mkdir(managedRoot, { recursive: true })
    await writeFile(join(managedRoot, 'python.exe'), 'old runtime')

    const result = await installManagedPythonRuntime({
      userDataPath,
      platform: 'win32',
      architecture: 'x64',
      acquireArchive: async ({ archivePath }) => writeFile(archivePath, 'archive'),
      verifyArchive: async () => true,
      extractArchive: async () => {
        throw new Error('cannot extract')
      }
    })

    expect(result).toMatchObject({ ok: false, code: 'install-failed' })
    expect(await readFile(join(managedRoot, 'python.exe'), 'utf8')).toBe('old runtime')
  })

  it('refuses installation when checksum verification fails', async () => {
    const userDataPath = await temporaryRoot()
    const extractArchive = vi.fn()
    const result = await installManagedPythonRuntime({
      userDataPath,
      platform: 'win32',
      architecture: 'x64',
      acquireArchive: async ({ archivePath }) => writeFile(archivePath, 'tampered'),
      verifyArchive: async () => false,
      extractArchive
    })

    expect(result).toMatchObject({ ok: false, code: 'checksum-mismatch' })
    expect(extractArchive).not.toHaveBeenCalled()
  })

  it('preserves the existing runtime when the teacher cancels a repair', async () => {
    const userDataPath = await temporaryRoot()
    const managedRoot = join(userDataPath, 'runtimes', 'python')
    await mkdir(managedRoot, { recursive: true })
    await writeFile(join(managedRoot, 'python.exe'), 'existing runtime')
    const controller = new AbortController()

    const result = await installManagedPythonRuntime({
      userDataPath,
      platform: 'win32',
      architecture: 'x64',
      signal: controller.signal,
      acquireArchive: async ({ archivePath }) => {
        await writeFile(archivePath, 'partial download')
        controller.abort()
      },
      verifyArchive: async () => true,
      extractArchive: async () => undefined
    })

    expect(result).toMatchObject({ ok: false, code: 'cancelled', message: '已取消安装。' })
    expect(await readFile(join(managedRoot, 'python.exe'), 'utf8')).toBe('existing runtime')
  })

  it('repairs a damaged private runtime and returns it to a ready state', async () => {
    const userDataPath = await temporaryRoot()
    const managedRoot = join(userDataPath, 'runtimes', 'python')
    const executable = join(managedRoot, 'python.exe')
    await mkdir(managedRoot, { recursive: true })
    await writeFile(executable, 'damaged runtime')

    const runCandidate = async (): Promise<PythonCandidateRunResult> => {
      const content = await readFile(executable, 'utf8')
      if (content === 'damaged runtime') {
        return { kind: 'failed', code: 'probe-failed', message: 'runtime damaged' }
      }
      return {
        kind: 'success',
        data: {
          executable,
          version: '3.12.13',
          architecture: 'x64',
          packages: BASE_SCIENCE_PACKAGES.map(({ id }) => ({
            id,
            available: true,
            version: 'teacher-validation'
          }))
        }
      }
    }
    const inspect = () => inspectPythonRuntime({
      userDataPath,
      platform: 'win32',
      runCandidate,
      readBaseSciencePackVersion: async () => '2026.07.1'
    })

    await expect(inspect()).resolves.toMatchObject({ state: 'broken', source: 'managed' })
    await expect(installManagedPythonRuntime({
      userDataPath,
      platform: 'win32',
      architecture: 'x64',
      acquireArchive: async ({ archivePath }) => writeFile(archivePath, 'verified archive'),
      verifyArchive: async () => true,
      extractArchive: async (_archivePath, destination) => {
        await mkdir(join(destination, 'python'), { recursive: true })
        await writeFile(join(destination, 'python', 'python.exe'), 'repaired runtime')
      }
    })).resolves.toEqual({ ok: true })
    const repairedStatus = await inspect()
    expect(repairedStatus).toMatchObject({
      state: 'ready',
      source: 'managed',
      interpreter: { version: '3.12.13', architecture: 'x64' }
    })
    expect(repairedStatus.capabilityPacks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'base-science', state: 'ready' })
    ]))
  })
})

describe('uninstallManagedPythonRuntime', () => {
  it('removes only the application-managed runtime', async () => {
    const userDataPath = await temporaryRoot()
    const managedRoot = join(userDataPath, 'runtimes', 'python')
    const teacherFile = join(userDataPath, 'teacher-document.docx')
    await mkdir(managedRoot, { recursive: true })
    await writeFile(join(managedRoot, 'python.exe'), 'python')
    await writeFile(teacherFile, 'keep')

    await expect(uninstallManagedPythonRuntime({ userDataPath })).resolves.toEqual({ ok: true })
    await expect(readFile(join(managedRoot, 'python.exe'))).rejects.toThrow()
    await expect(readFile(teacherFile, 'utf8')).resolves.toBe('keep')
  })
})
