import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import {
  access,
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile
} from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { Readable } from 'node:stream'
import { finished } from 'node:stream/promises'
import { extract, list } from 'tar'
import type {
  PythonRuntimeInstallProgress,
  PythonRuntimeManagerResult,
  PythonRuntimeManifest
} from '../../shared/python-runtime'

export const WINDOWS_X64_PYTHON_RUNTIME: PythonRuntimeManifest = {
  id: 'cpython-3.12.13-windows-x64-20260510',
  pythonVersion: '3.12.13',
  build: '20260510',
  platform: 'win32',
  architecture: 'x64',
  url: 'https://github.com/astral-sh/python-build-standalone/releases/download/20260510/cpython-3.12.13%2B20260510-x86_64-pc-windows-msvc-install_only_stripped.tar.gz',
  size: 21_921_642,
  sha256: '24168aff2e7d93784c6a436124c4ebb79b076a4e289bde4902c08333507b71d0',
  source: {
    name: 'astral-sh/python-build-standalone',
    homepage: 'https://github.com/astral-sh/python-build-standalone'
  },
  license: {
    name: 'Python Software Foundation License Version 2',
    url: 'https://docs.python.org/3/license.html'
  },
  uninstall: { removesManagedRootOnly: true }
}

type AcquireArchive = (input: {
  manifest: PythonRuntimeManifest
  archivePath: string
  signal?: AbortSignal
  onProgress: (transferred: number, total: number) => void
}) => Promise<void>

export type InstallManagedPythonRuntimeOptions = {
  userDataPath: string
  platform?: NodeJS.Platform
  architecture?: string
  signal?: AbortSignal
  onProgress?: (progress: PythonRuntimeInstallProgress) => void
  acquireArchive?: AcquireArchive
  verifyArchive?: (archivePath: string, expectedSha256: string) => Promise<boolean>
  extractArchive?: (archivePath: string, destination: string) => Promise<void>
}

function emit(
  callback: InstallManagedPythonRuntimeOptions['onProgress'],
  progress: PythonRuntimeInstallProgress
): void {
  callback?.(progress)
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

export async function verifyFileSha256(path: string, expected: string): Promise<boolean> {
  const hash = createHash('sha256')
  const input = createReadStream(path)
  input.on('data', (chunk) => hash.update(chunk))
  await finished(input)
  return hash.digest('hex') === expected
}

async function downloadWithResume({
  manifest,
  archivePath,
  signal,
  onProgress
}: Parameters<AcquireArchive>[0]): Promise<void> {
  await mkdir(dirname(archivePath), { recursive: true })
  const existing = await stat(archivePath).then((value) => value.size).catch(() => 0)
  const response = await fetch(manifest.url, {
    headers: existing > 0 ? { Range: `bytes=${existing}-` } : {},
    redirect: 'follow',
    signal
  })
  if (!response.ok || !response.body) throw new Error(`Download failed with HTTP ${response.status}.`)
  const resumed = response.status === 206 && existing > 0
  const startingSize = resumed ? existing : 0
  const output = createWriteStream(archivePath, { flags: resumed ? 'a' : 'w' })
  let transferred = startingSize
  const input = Readable.fromWeb(response.body as never)
  input.on('data', (chunk: Buffer) => {
    transferred += chunk.length
    onProgress(transferred, manifest.size)
  })
  input.pipe(output)
  await finished(output)
}

async function safeExtractTarGz(archivePath: string, destination: string): Promise<void> {
  let unsafe = false
  await list({
    file: archivePath,
    onReadEntry: (entry) => {
      const normalized = entry.path.replaceAll('\\', '/')
      if (normalized.startsWith('/') || normalized.split('/').includes('..') || /^[A-Za-z]:/u.test(normalized)) {
        unsafe = true
      }
      entry.resume()
    }
  })
  if (unsafe) throw new Error('Runtime archive contains an unsafe path.')
  await mkdir(destination, { recursive: true })
  await extract({ file: archivePath, cwd: destination, preservePaths: false, strict: true })
}

export async function installManagedPythonRuntime(
  options: InstallManagedPythonRuntimeOptions
): Promise<PythonRuntimeManagerResult> {
  if ((options.platform ?? process.platform) !== 'win32' || (options.architecture ?? process.arch) !== 'x64') {
    return { ok: false, code: 'unsupported-platform', message: '当前设备暂不支持自动安装科研分析引擎。' }
  }
  const manifest = WINDOWS_X64_PYTHON_RUNTIME
  const runtimesRoot = join(options.userDataPath, 'runtimes')
  const managedRoot = join(runtimesRoot, 'python')
  const workRoot = join(runtimesRoot, '.python-install')
  const archivePath = join(workRoot, `${manifest.id}.tar.gz.part`)
  const stagingRoot = join(workRoot, 'staging')
  const extractedRoot = join(stagingRoot, 'python')
  const backupRoot = join(runtimesRoot, '.python-backup')
  const acquireArchive = options.acquireArchive ?? downloadWithResume
  const verifyArchive = options.verifyArchive ?? verifyFileSha256
  const extractArchive = options.extractArchive ?? safeExtractTarGz
  let backedUp = false

  try {
    emit(options.onProgress, { phase: 'preparing' })
    await mkdir(workRoot, { recursive: true })
    await rm(stagingRoot, { recursive: true, force: true })
    options.signal?.throwIfAborted()
    emit(options.onProgress, { phase: 'downloading', transferred: 0, total: manifest.size })
    await acquireArchive({
      manifest,
      archivePath,
      signal: options.signal,
      onProgress: (transferred, total) => emit(options.onProgress, {
        phase: 'downloading', transferred, total
      })
    })
    options.signal?.throwIfAborted()
    emit(options.onProgress, { phase: 'verifying' })
    if (!await verifyArchive(archivePath, manifest.sha256)) {
      await rm(archivePath, { force: true })
      return { ok: false, code: 'checksum-mismatch', message: '下载文件校验失败，请重新下载。' }
    }
    emit(options.onProgress, { phase: 'installing' })
    await extractArchive(archivePath, stagingRoot)
    if (!await pathExists(join(extractedRoot, 'python.exe'))) {
      throw new Error('The runtime archive does not contain python.exe.')
    }
    await writeFile(join(extractedRoot, 'zhiyan-runtime.json'), JSON.stringify(manifest, null, 2), 'utf8')
    await rm(backupRoot, { recursive: true, force: true })
    if (await pathExists(managedRoot)) {
      await rename(managedRoot, backupRoot)
      backedUp = true
    }
    await rename(extractedRoot, managedRoot)
    await rm(backupRoot, { recursive: true, force: true })
    await rm(stagingRoot, { recursive: true, force: true })
    emit(options.onProgress, { phase: 'complete' })
    return { ok: true }
  } catch (error) {
    if (backedUp && !await pathExists(managedRoot) && await pathExists(backupRoot)) {
      await rename(backupRoot, managedRoot).catch(() => undefined)
    }
    await rm(stagingRoot, { recursive: true, force: true }).catch(() => undefined)
    const cancelled = options.signal?.aborted || (error instanceof Error && error.name === 'AbortError')
    return {
      ok: false,
      code: cancelled ? 'cancelled' : 'install-failed',
      message: cancelled ? '已取消安装。' : '科研分析引擎安装失败，原有环境已保留。'
    }
  }
}

export async function uninstallManagedPythonRuntime(
  options: { userDataPath: string }
): Promise<{ ok: true }> {
  const managedRoot = join(options.userDataPath, 'runtimes', 'python')
  const removingRoot = join(options.userDataPath, 'runtimes', '.python-removing')
  await rm(removingRoot, { recursive: true, force: true })
  if (await pathExists(managedRoot)) await rename(managedRoot, removingRoot)
  await rm(removingRoot, { recursive: true, force: true })
  return { ok: true }
}
