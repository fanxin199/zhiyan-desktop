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
