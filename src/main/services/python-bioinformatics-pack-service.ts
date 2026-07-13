import { access, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { delimiter, join } from 'node:path'
import {
  runPythonPackCommand,
  type PythonPackCommand
} from './python-capability-pack-service'
import type {
  PythonCapabilityPackInstallPhase,
  PythonCapabilityPackInstallResult
} from '../../shared/python-runtime'

export const BIOINFORMATICS_EXTENSION_VERSION = '2026.07.1'

export const BIOINFORMATICS_EXTENSION_LOCK = [
  { name: 'certifi', version: '2026.6.17' },
  { name: 'fast-array-utils', version: '1.4.1' },
  { name: 'igraph', version: '1.0.0' },
  { name: 'leidenalg', version: '0.12.0' },
  { name: 'networkx', version: '3.6.1' },
  { name: 'python-igraph', version: '1.0.0' },
  { name: 'scanpy', version: '1.12.1' },
  { name: 'texttable', version: '1.7.0' }
] as const

export const BIOINFORMATICS_EXTENSION_SCOPE = {
  supported: [
    'processed-h5ad',
    'processed-expression-matrix',
    'processed-spatial-table'
  ],
  notSupported: [
    'fastq',
    'bam',
    'cram',
    'cell-ranger-pipeline'
  ]
} as const

const SNAPSHOT_PREFIX = 'ZHIYAN_BIO_PACK_SNAPSHOT='

export type InstallBioinformaticsCapabilityPackOptions = {
  userDataPath: string
  runPython?: (command: PythonPackCommand) => Promise<{ ok: boolean; stdout: string; stderr: string }>
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

async function readActiveBasePackPath(userDataPath: string): Promise<string | null> {
  try {
    const root = join(userDataPath, 'runtimes', 'python-packages', 'base-science')
    const value = JSON.parse(await readFile(join(root, 'active-environment.json'), 'utf8')) as {
      packVersion?: unknown
    }
    if (typeof value.packVersion !== 'string' || !/^[A-Za-z0-9._-]+$/u.test(value.packVersion)) return null
    const active = join(root, value.packVersion)
    return await pathExists(active) ? active : null
  } catch {
    return null
  }
}

function smokeTestScript(): string {
  const distributions = JSON.stringify(BIOINFORMATICS_EXTENSION_LOCK.map(({ name }) => name))
  return [
    'import importlib.metadata as metadata',
    'import json',
    'import numpy as np',
    'import anndata as ad',
    'import scanpy as sc',
    'import igraph as ig',
    'import leidenalg',
    'adata = ad.AnnData(np.random.default_rng(7).poisson(2, size=(40, 12)).astype(float))',
    'sc.pp.normalize_total(adata)',
    'sc.pp.log1p(adata)',
    'sc.pp.pca(adata, n_comps=5)',
    'sc.pp.neighbors(adata, n_neighbors=5)',
    'sc.tl.leiden(adata, key_added="zhiyan_cluster", flavor="igraph", n_iterations=2, directed=False)',
    'assert "zhiyan_cluster" in adata.obs',
    'assert len(adata.obs["zhiyan_cluster"]) == 40',
    'assert ig.Graph.Ring(5).vcount() == 5',
    'assert hasattr(leidenalg, "find_partition")',
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
  return BIOINFORMATICS_EXTENSION_LOCK.every(({ name, version }) => snapshot[name] === version)
}

export async function installBioinformaticsCapabilityPack(
  options: InstallBioinformaticsCapabilityPackOptions
): Promise<PythonCapabilityPackInstallResult> {
  const pythonRoot = join(options.userDataPath, 'runtimes', 'python')
  const executable = join(pythonRoot, 'python.exe')
  if (!await pathExists(executable)) {
    return { ok: false, code: 'runtime-not-installed', message: '请先安装科研分析引擎。' }
  }
  const basePackPath = await readActiveBasePackPath(options.userDataPath)
  if (!basePackPath) {
    return { ok: false, code: 'base-pack-required', message: '请先安装并通过基础科研组件自检。' }
  }

  const runPython = options.runPython ?? runPythonPackCommand
  const packRoot = join(options.userDataPath, 'runtimes', 'python-packages', 'bioinformatics')
  const staging = join(packRoot, '.staging')
  const active = join(packRoot, BIOINFORMATICS_EXTENSION_VERSION)
  const backup = join(packRoot, '.backup')
  const activeEnvironment = join(packRoot, 'active-environment.json')
  const pendingEnvironment = join(packRoot, '.active-environment.json.tmp')
  const sitePackages = join(pythonRoot, 'Lib', 'site-packages')
  const activationFile = join(sitePackages, 'zhiyan-bioinformatics.pth')

  options.onProgress?.('preparing')
  await mkdir(packRoot, { recursive: true })
  await rm(staging, { recursive: true, force: true })
  await mkdir(staging, { recursive: true })
  options.onProgress?.('installing')
  const install = await runPython({
    kind: 'install',
    executable,
    args: [
      '-m', 'pip', 'install',
      '--disable-pip-version-check', '--no-input', '--only-binary=:all:', '--no-deps',
      '--target', staging,
      ...BIOINFORMATICS_EXTENSION_LOCK.map(({ name, version }) => `${name}==${version}`)
    ]
  })
  if (!install.ok) {
    await rm(staging, { recursive: true, force: true })
    return { ok: false, code: 'install-failed', message: '生物信息学扩展安装失败，请检查网络后重试。' }
  }

  options.onProgress?.('testing')
  const smoke = await runPython({
    kind: 'smoke-test',
    executable,
    args: ['-c', smokeTestScript()],
    env: { PYTHONPATH: `${staging}${delimiter}${basePackPath}` }
  })
  const packages = smoke.ok ? parseSnapshot(smoke.stdout) : null
  if (!packages || !snapshotMatchesLock(packages)) {
    await rm(staging, { recursive: true, force: true })
    return { ok: false, code: 'smoke-test-failed', message: '生物信息学扩展自检失败，未启用本次安装。' }
  }

  const environment = {
    schemaVersion: 1,
    packVersion: BIOINFORMATICS_EXTENSION_VERSION,
    basePackPath,
    pythonPath: executable,
    recordedAt: (options.now ?? (() => new Date()))().toISOString(),
    packages,
    scope: BIOINFORMATICS_EXTENSION_SCOPE
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
    return { ok: false, code: 'install-failed', message: '生物信息学扩展启用失败，原有环境已恢复。' }
  }
  options.onProgress?.('complete')
  return {
    ok: true,
    packVersion: BIOINFORMATICS_EXTENSION_VERSION,
    environmentPath: join(active, 'environment.json')
  }
}
