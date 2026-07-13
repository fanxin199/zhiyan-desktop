import { spawn } from 'node:child_process'
import { access, mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type {
  PythonCapabilityPackInstallPhase,
  PythonCapabilityPackInstallResult
} from '../../shared/python-runtime'

export const BASE_SCIENCE_PACK_VERSION = '2026.07.1'

export const BASE_SCIENCE_LOCK = [
  { name: 'anndata', version: '0.13.1' },
  { name: 'annotated-types', version: '0.7.0' },
  { name: 'array-api-compat', version: '1.15.0' },
  { name: 'colorama', version: '0.4.6' },
  { name: 'contourpy', version: '1.3.3' },
  { name: 'cycler', version: '0.12.1' },
  { name: 'donfig', version: '0.8.1.post1' },
  { name: 'et_xmlfile', version: '2.0.0' },
  { name: 'fonttools', version: '4.63.0' },
  { name: 'google-crc32c', version: '1.8.0' },
  { name: 'h5py', version: '3.16.0' },
  { name: 'joblib', version: '1.5.3' },
  { name: 'kiwisolver', version: '1.5.0' },
  { name: 'legacy-api-wrap', version: '1.5' },
  { name: 'llvmlite', version: '0.48.0' },
  { name: 'matplotlib', version: '3.11.0' },
  { name: 'narwhals', version: '2.24.0' },
  { name: 'natsort', version: '8.4.0' },
  { name: 'numba', version: '0.66.0' },
  { name: 'numcodecs', version: '0.16.5' },
  { name: 'numpy', version: '2.4.6' },
  { name: 'openpyxl', version: '3.1.5' },
  { name: 'packaging', version: '26.2' },
  { name: 'pandas', version: '3.0.3' },
  { name: 'patsy', version: '1.0.2' },
  { name: 'pillow', version: '12.3.0' },
  { name: 'pydantic', version: '2.13.4' },
  { name: 'pydantic-core', version: '2.46.4' },
  { name: 'pydantic-settings', version: '2.14.2' },
  { name: 'pynndescent', version: '0.6.0' },
  { name: 'pyparsing', version: '3.3.2' },
  { name: 'python-dateutil', version: '2.9.0.post0' },
  { name: 'python-dotenv', version: '1.2.2' },
  { name: 'PyYAML', version: '6.0.3' },
  { name: 'scikit-learn', version: '1.9.0' },
  { name: 'scipy', version: '1.18.0' },
  { name: 'scverse-misc', version: '0.1.1' },
  { name: 'seaborn', version: '0.13.2' },
  { name: 'session-info2', version: '0.4.1' },
  { name: 'six', version: '1.17.0' },
  { name: 'statsmodels', version: '0.14.6' },
  { name: 'threadpoolctl', version: '3.6.0' },
  { name: 'tqdm', version: '4.68.4' },
  { name: 'typing-extensions', version: '4.16.0' },
  { name: 'typing-inspection', version: '0.4.2' },
  { name: 'tzdata', version: '2026.3' },
  { name: 'umap-learn', version: '0.5.12' },
  { name: 'zarr', version: '3.2.1' }
] as const

const SNAPSHOT_PREFIX = 'ZHIYAN_PACK_SNAPSHOT='
const COMMAND_TIMEOUT_MS = 15 * 60_000
const MAX_OUTPUT_CHARS = 128 * 1024

export type PythonPackCommand = {
  kind: 'bootstrap' | 'install' | 'smoke-test'
  executable: string
  args: string[]
  env?: NodeJS.ProcessEnv
}

type PythonPackCommandResult = { ok: boolean; stdout: string; stderr: string }

export type InstallBaseScienceCapabilityPackOptions = {
  userDataPath: string
  runPython?: (command: PythonPackCommand) => Promise<PythonPackCommandResult>
  now?: () => Date
  onProgress?: (phase: PythonCapabilityPackInstallPhase) => void
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

function appendLimited(current: string, chunk: Buffer | string): string {
  return (current + chunk.toString()).slice(-MAX_OUTPUT_CHARS)
}

export function runPythonPackCommand(command: PythonPackCommand): Promise<PythonPackCommandResult> {
  return new Promise((resolve) => {
    let stdout = ''
    let stderr = ''
    let settled = false
    const child = spawn(command.executable, command.args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        PYTHONUTF8: '1',
        PYTHONDONTWRITEBYTECODE: '1',
        ...command.env
      }
    })
    const finish = (result: PythonPackCommandResult): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(result)
    }
    const timer = setTimeout(() => {
      child.kill()
      finish({ ok: false, stdout, stderr: 'Command timed out.' })
    }, COMMAND_TIMEOUT_MS)
    child.stdout.on('data', (chunk) => { stdout = appendLimited(stdout, chunk) })
    child.stderr.on('data', (chunk) => { stderr = appendLimited(stderr, chunk) })
    child.on('error', (error) => finish({ ok: false, stdout, stderr: error.message }))
    child.on('close', (code) => finish({ ok: code === 0, stdout, stderr }))
  })
}

function smokeTestScript(): string {
  const distributions = JSON.stringify(BASE_SCIENCE_LOCK.map(({ name }) => name))
  return [
    'import importlib.metadata as metadata',
    'import json',
    'import numpy as np',
    'import pandas as pd',
    'import scipy.stats as stats',
    'import matplotlib',
    'matplotlib.use("Agg")',
    'import matplotlib.pyplot as plt',
    'from sklearn.linear_model import LinearRegression',
    'from openpyxl import Workbook',
    'import anndata as ad',
    'import umap',
    'assert np.allclose(np.array([1, 2]).mean(), 1.5)',
    'assert pd.DataFrame({"x": [1, 2]}).shape == (2, 1)',
    'assert stats.ttest_1samp([1, 2, 3], 0).statistic > 0',
    'fig = plt.figure(); plt.close(fig)',
    'assert LinearRegression().fit([[0], [1]], [0, 1]).predict([[2]])[0] > 1.9',
    'assert Workbook().active is not None',
    'assert ad.AnnData(np.ones((2, 2))).shape == (2, 2)',
    'assert hasattr(umap, "UMAP")',
    `names = ${distributions}`,
    'snapshot = {name: metadata.version(name) for name in names}',
    `print("${SNAPSHOT_PREFIX}" + json.dumps(snapshot, sort_keys=True))`
  ].join('\n')
}

function parseSnapshot(stdout: string): Record<string, string> | null {
  const line = stdout.split(/\r?\n/u).find((item) => item.startsWith(SNAPSHOT_PREFIX))
  if (!line) return null
  try {
    const parsed = JSON.parse(line.slice(SNAPSHOT_PREFIX.length)) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    return Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, string] =>
      typeof entry[1] === 'string'
    ))
  } catch {
    return null
  }
}

function snapshotMatchesLock(snapshot: Record<string, string>): boolean {
  return BASE_SCIENCE_LOCK.every(({ name, version }) => snapshot[name] === version)
}

export async function installBaseScienceCapabilityPack(
  options: InstallBaseScienceCapabilityPackOptions
): Promise<PythonCapabilityPackInstallResult> {
  const pythonRoot = join(options.userDataPath, 'runtimes', 'python')
  const executable = join(pythonRoot, 'python.exe')
  if (!await pathExists(executable)) {
    return { ok: false, code: 'runtime-not-installed', message: '请先安装科研分析引擎。' }
  }
  const runPython = options.runPython ?? runPythonPackCommand
  const packRoot = join(options.userDataPath, 'runtimes', 'python-packages', 'base-science')
  const staging = join(packRoot, '.staging')
  const active = join(packRoot, BASE_SCIENCE_PACK_VERSION)
  const backup = join(packRoot, '.backup')
  const activeEnvironment = join(packRoot, 'active-environment.json')
  const pendingEnvironment = join(packRoot, '.active-environment.json.tmp')
  const sitePackages = join(pythonRoot, 'Lib', 'site-packages')
  const activationFile = join(sitePackages, 'zhiyan-base-science.pth')
  options.onProgress?.('preparing')
  await mkdir(packRoot, { recursive: true })
  await rm(staging, { recursive: true, force: true })
  await mkdir(staging, { recursive: true })

  const bootstrap = await runPython({
    kind: 'bootstrap', executable, args: ['-m', 'ensurepip', '--upgrade']
  })
  if (!bootstrap.ok) {
    await rm(staging, { recursive: true, force: true })
    return { ok: false, code: 'install-failed', message: '科研分析组件安装准备失败。' }
  }
  options.onProgress?.('installing')
  const install = await runPython({
    kind: 'install',
    executable,
    args: [
      '-m', 'pip', 'install',
      '--disable-pip-version-check', '--no-input', '--only-binary=:all:',
      '--target', staging,
      ...BASE_SCIENCE_LOCK.map(({ name, version }) => `${name}==${version}`)
    ]
  })
  if (!install.ok) {
    await rm(staging, { recursive: true, force: true })
    return { ok: false, code: 'install-failed', message: '科研分析组件安装失败，请检查网络后重试。' }
  }
  options.onProgress?.('testing')
  const smoke = await runPython({
    kind: 'smoke-test',
    executable,
    args: ['-c', smokeTestScript()],
    env: { PYTHONPATH: staging }
  })
  const packages = smoke.ok ? parseSnapshot(smoke.stdout) : null
  if (!packages || !snapshotMatchesLock(packages)) {
    await rm(staging, { recursive: true, force: true })
    return { ok: false, code: 'smoke-test-failed', message: '科研分析组件自检失败，未启用本次安装。' }
  }

  const environment = {
    schemaVersion: 1,
    packVersion: BASE_SCIENCE_PACK_VERSION,
    pythonPath: executable,
    recordedAt: (options.now ?? (() => new Date()))().toISOString(),
    packages
  }
  await writeFile(join(staging, 'environment.json'), JSON.stringify(environment, null, 2), 'utf8')
  options.onProgress?.('activating')
  await rm(backup, { recursive: true, force: true })
  if (await pathExists(active)) await rename(active, backup)
  try {
    await rename(staging, active)
    await mkdir(sitePackages, { recursive: true })
    await writeFile(activationFile, active, 'utf8')
    await writeFile(pendingEnvironment, JSON.stringify(environment, null, 2), 'utf8')
    await rename(pendingEnvironment, activeEnvironment)
    await rm(backup, { recursive: true, force: true })
  } catch {
    await rm(active, { recursive: true, force: true }).catch(() => undefined)
    if (await pathExists(backup)) await rename(backup, active).catch(() => undefined)
    await rm(pendingEnvironment, { force: true }).catch(() => undefined)
    return { ok: false, code: 'install-failed', message: '科研分析组件启用失败，原有环境已恢复。' }
  }
  options.onProgress?.('complete')
  return { ok: true, packVersion: BASE_SCIENCE_PACK_VERSION, environmentPath: join(active, 'environment.json') }
}
