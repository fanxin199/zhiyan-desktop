import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import {
  createPythonRuntimeStatus,
  type PythonArchitecture,
  type PythonCapabilityPackStatus,
  type PythonRuntimeSource,
  type PythonRuntimeStatusV1
} from '../../shared/python-runtime'

export const PYTHON_PROBE_TIMEOUT_MS = 20_000
export const MINIMUM_PYTHON_VERSION = '3.10'
const MAX_PROBE_OUTPUT_CHARS = 128 * 1024
const PROBE_PREFIX = 'ZHIYAN_PYTHON_PROBE='

export const BASE_SCIENCE_PACKAGES = [
  { id: 'numpy', module: 'numpy', distribution: 'numpy' },
  { id: 'pandas', module: 'pandas', distribution: 'pandas' },
  { id: 'scipy', module: 'scipy', distribution: 'scipy' },
  { id: 'matplotlib', module: 'matplotlib', distribution: 'matplotlib' },
  { id: 'seaborn', module: 'seaborn', distribution: 'seaborn' },
  { id: 'statsmodels', module: 'statsmodels', distribution: 'statsmodels' },
  { id: 'scikit-learn', module: 'sklearn', distribution: 'scikit-learn' },
  { id: 'openpyxl', module: 'openpyxl', distribution: 'openpyxl' },
  { id: 'anndata', module: 'anndata', distribution: 'anndata' },
  { id: 'umap-learn', module: 'umap', distribution: 'umap-learn' }
] as const

export const BIOINFORMATICS_PACKAGES = [
  { id: 'scanpy', module: 'scanpy', distribution: 'scanpy' },
  { id: 'python-igraph', module: 'igraph', distribution: 'python-igraph' },
  { id: 'leidenalg', module: 'leidenalg', distribution: 'leidenalg' }
] as const

const PROBE_PACKAGES = [...BASE_SCIENCE_PACKAGES, ...BIOINFORMATICS_PACKAGES]

export type PythonRuntimeCandidate = {
  command: string
  prefixArgs: string[]
  source: Exclude<PythonRuntimeSource, 'none'>
  managedRoot?: string
}

const PythonProbePackageSchema = z.object({
  id: z.string(),
  available: z.boolean(),
  version: z.string().optional(),
  error: z.string().optional()
}).strict()

const PythonProbeDataSchema = z.object({
  executable: z.string().min(1),
  version: z.string().min(1),
  architecture: z.enum(['x64', 'arm64', 'x86', 'unknown']),
  packages: z.array(PythonProbePackageSchema)
}).strict()

export type PythonProbeData = z.infer<typeof PythonProbeDataSchema>

export type PythonCandidateRunResult =
  | { kind: 'success'; data: PythonProbeData }
  | { kind: 'not-found' }
  | { kind: 'failed'; code: string; message: string }

export type InspectPythonRuntimeOptions = {
  userDataPath: string
  platform?: NodeJS.Platform
  fileExists?: (path: string) => boolean
  runCandidate?: (candidate: PythonRuntimeCandidate) => Promise<PythonCandidateRunResult>
  readBaseSciencePackVersion?: () => Promise<string | undefined>
  readBioinformaticsPackVersion?: () => Promise<string | undefined>
  now?: () => Date
}

function pythonProbeScript(): string {
  const packages = JSON.stringify(PROBE_PACKAGES)
  return [
    'import importlib',
    'import importlib.metadata',
    'import json',
    'import platform',
    'import sys',
    `packages = ${packages}`,
    'results = []',
    'for package in packages:',
    '    try:',
    '        importlib.import_module(package["module"])',
    '        version = importlib.metadata.version(package["distribution"])',
    '        results.append({"id": package["id"], "available": True, "version": version})',
    '    except Exception as error:',
    '        results.append({"id": package["id"], "available": False, "error": type(error).__name__})',
    'machine = platform.machine().lower()',
    'architecture = "arm64" if machine in ("arm64", "aarch64") else ("x64" if machine in ("amd64", "x86_64") else ("x86" if machine in ("x86", "i386", "i686") else "unknown"))',
    'payload = {"executable": sys.executable, "version": platform.python_version(), "architecture": architecture, "packages": results}',
    `print("${PROBE_PREFIX}" + json.dumps(payload, ensure_ascii=False))`
  ].join('\n')
}

function appendLimited(current: string, chunk: Buffer | string): string {
  if (current.length >= MAX_PROBE_OUTPUT_CHARS) return current
  return (current + chunk.toString()).slice(0, MAX_PROBE_OUTPUT_CHARS)
}

export function runPythonCandidate(
  candidate: PythonRuntimeCandidate,
  timeoutMs = PYTHON_PROBE_TIMEOUT_MS
): Promise<PythonCandidateRunResult> {
  return new Promise((resolve) => {
    let settled = false
    let stdout = ''
    let stderr = ''
    const finish = (result: PythonCandidateRunResult): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(result)
    }
    const child = spawn(
      candidate.command,
      [...candidate.prefixArgs, '-c', pythonProbeScript()],
      {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          PYTHONUTF8: '1',
          PYTHONDONTWRITEBYTECODE: '1'
        }
      }
    )
    const timer = setTimeout(() => {
      child.kill()
      finish({
        kind: 'failed',
        code: 'probe-timeout',
        message: `Python probe exceeded ${timeoutMs} ms.`
      })
    }, timeoutMs)

    child.stdout.on('data', (chunk) => {
      stdout = appendLimited(stdout, chunk)
    })
    child.stderr.on('data', (chunk) => {
      stderr = appendLimited(stderr, chunk)
    })
    child.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') {
        finish({ kind: 'not-found' })
      } else {
        finish({ kind: 'failed', code: 'launch-failed', message: error.message })
      }
    })
    child.on('close', (exitCode) => {
      if (settled) return
      if (exitCode !== 0) {
        finish({
          kind: 'failed',
          code: 'probe-failed',
          message: stderr.trim() || `Python probe exited with code ${String(exitCode)}.`
        })
        return
      }
      const payloadLine = stdout
        .split(/\r?\n/u)
        .reverse()
        .find((line) => line.startsWith(PROBE_PREFIX))
      if (!payloadLine) {
        finish({ kind: 'failed', code: 'invalid-probe-output', message: 'Python probe returned no structured result.' })
        return
      }
      try {
        const data = PythonProbeDataSchema.parse(
          JSON.parse(payloadLine.slice(PROBE_PREFIX.length))
        )
        finish({ kind: 'success', data })
      } catch (error) {
        finish({
          kind: 'failed',
          code: 'invalid-probe-output',
          message: error instanceof Error ? error.message : String(error)
        })
      }
    })
  })
}

function managedPythonCandidate(
  userDataPath: string,
  platform: NodeJS.Platform
): PythonRuntimeCandidate {
  const managedRoot = join(userDataPath, 'runtimes', 'python')
  const command = platform === 'win32'
    ? join(managedRoot, 'python.exe')
    : join(managedRoot, 'bin', 'python3')
  return { command, prefixArgs: [], source: 'managed', managedRoot }
}

function systemPythonCandidates(platform: NodeJS.Platform): PythonRuntimeCandidate[] {
  return platform === 'win32'
    ? [
        { command: 'python', prefixArgs: [], source: 'system' },
        { command: 'py', prefixArgs: ['-3'], source: 'system' }
      ]
    : [
        { command: 'python3', prefixArgs: [], source: 'system' },
        { command: 'python', prefixArgs: [], source: 'system' }
      ]
}

function versionNeedsUpgrade(version: string): boolean {
  const [major = 0, minor = 0] = version.split('.').map((part) => Number(part))
  const [minimumMajor, minimumMinor] = MINIMUM_PYTHON_VERSION.split('.').map((part) => Number(part))
  return major < minimumMajor || (major === minimumMajor && minor < minimumMinor)
}

function baseSciencePackStatus(
  data: PythonProbeData,
  installedVersion?: string
): PythonCapabilityPackStatus {
  const missingPackages = BASE_SCIENCE_PACKAGES
    .filter((expected) => !data.packages.some((actual) =>
      actual.id === expected.id && actual.available
    ))
    .map((item) => item.id)
  return {
    id: 'base-science',
    state: versionNeedsUpgrade(data.version)
      ? 'upgrade-required'
      : missingPackages.length > 0
        ? 'partial'
        : 'ready',
    missingPackages,
    ...(installedVersion ? { installedVersion } : {})
  }
}

function bioinformaticsPackStatus(
  data: PythonProbeData,
  installedVersion?: string
): PythonCapabilityPackStatus {
  const missingPackages = BIOINFORMATICS_PACKAGES
    .filter((expected) => !data.packages.some((actual) =>
      actual.id === expected.id && actual.available
    ))
    .map((item) => item.id)
  return {
    id: 'bioinformatics',
    state: missingPackages.length === BIOINFORMATICS_PACKAGES.length
      ? 'not-installed'
      : missingPackages.length > 0
        ? 'partial'
        : 'ready',
    missingPackages,
    ...(installedVersion ? { installedVersion } : {})
  }
}

function statusFromSuccess(
  candidate: PythonRuntimeCandidate,
  data: PythonProbeData,
  checkedAt: string,
  installedVersion?: string,
  bioinformaticsVersion?: string
): PythonRuntimeStatusV1 {
  return createPythonRuntimeStatus({
    source: candidate.source,
    checkedAt,
    interpreter: {
      path: data.executable,
      version: data.version,
      architecture: data.architecture as PythonArchitecture
    },
    ...(candidate.managedRoot ? { managedRoot: candidate.managedRoot } : {}),
    capabilityPacks: [
      baseSciencePackStatus(data, installedVersion),
      bioinformaticsPackStatus(data, bioinformaticsVersion)
    ]
  })
}

function brokenStatus(
  candidate: PythonRuntimeCandidate,
  result: Extract<PythonCandidateRunResult, { kind: 'failed' }>,
  checkedAt: string
): PythonRuntimeStatusV1 {
  return createPythonRuntimeStatus({
    source: candidate.source,
    checkedAt,
    interpreter: null,
    ...(candidate.managedRoot ? { managedRoot: candidate.managedRoot } : {}),
    capabilityPacks: [],
    issue: { code: result.code, message: result.message }
  })
}

export async function inspectPythonRuntime(
  options: InspectPythonRuntimeOptions
): Promise<PythonRuntimeStatusV1> {
  const platform = options.platform ?? process.platform
  const fileExists = options.fileExists ?? existsSync
  const runCandidate = options.runCandidate ?? runPythonCandidate
  const checkedAt = (options.now ?? (() => new Date()))().toISOString()
  const managed = managedPythonCandidate(options.userDataPath, platform)
  const readPackVersion = async (packId: string): Promise<string | undefined> => {
    try {
      const content = await readFile(join(
        options.userDataPath,
        'runtimes',
        'python-packages',
        packId,
        'active-environment.json'
      ), 'utf8')
      const parsed = JSON.parse(content) as { packVersion?: unknown }
      return typeof parsed.packVersion === 'string' ? parsed.packVersion : undefined
    } catch {
      return undefined
    }
  }
  const readBaseSciencePackVersion = options.readBaseSciencePackVersion ?? (() => readPackVersion('base-science'))
  const readBioinformaticsPackVersion = options.readBioinformaticsPackVersion ?? (() => readPackVersion('bioinformatics'))

  if (fileExists(managed.command)) {
    const result = await runCandidate(managed)
    return result.kind === 'success'
      ? statusFromSuccess(
          managed,
          result.data,
          checkedAt,
          await readBaseSciencePackVersion(),
          await readBioinformaticsPackVersion()
        )
      : result.kind === 'failed'
        ? brokenStatus(managed, result, checkedAt)
        : brokenStatus(managed, {
            kind: 'failed',
            code: 'managed-runtime-missing',
            message: 'The managed Python executable disappeared during inspection.'
          }, checkedAt)
  }

  let firstFailure: {
    candidate: PythonRuntimeCandidate
    result: Extract<PythonCandidateRunResult, { kind: 'failed' }>
  } | null = null
  for (const candidate of systemPythonCandidates(platform)) {
    const result = await runCandidate(candidate)
    if (result.kind === 'success') return statusFromSuccess(candidate, result.data, checkedAt)
    if (result.kind === 'failed' && !firstFailure) firstFailure = { candidate, result }
  }

  if (firstFailure) {
    return brokenStatus(firstFailure.candidate, firstFailure.result, checkedAt)
  }
  return createPythonRuntimeStatus({
    source: 'none',
    checkedAt,
    interpreter: null,
    capabilityPacks: []
  })
}
