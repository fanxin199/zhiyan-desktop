import { z } from 'zod'

export const PYTHON_RUNTIME_STATES = [
  'checking',
  'not-installed',
  'ready',
  'incomplete',
  'broken',
  'upgrade-required'
] as const

export const PYTHON_RUNTIME_SOURCES = ['none', 'managed', 'system'] as const
export const PYTHON_ARCHITECTURES = ['x64', 'arm64', 'x86', 'unknown'] as const
export const PYTHON_CAPABILITY_PACK_STATES = [
  'not-installed',
  'partial',
  'ready',
  'upgrade-required'
] as const
export const PYTHON_CAPABILITY_PACK_IDS = ['base-science', 'bioinformatics'] as const

export type PythonRuntimeState = typeof PYTHON_RUNTIME_STATES[number]
export type PythonRuntimeSource = typeof PYTHON_RUNTIME_SOURCES[number]
export type PythonArchitecture = typeof PYTHON_ARCHITECTURES[number]
export type PythonCapabilityPackState = typeof PYTHON_CAPABILITY_PACK_STATES[number]
export type PythonCapabilityPackId = typeof PYTHON_CAPABILITY_PACK_IDS[number]

export const PythonInterpreterInfoSchema = z.object({
  path: z.string().min(1),
  version: z.string().min(1),
  architecture: z.enum(PYTHON_ARCHITECTURES)
}).strict()

export type PythonInterpreterInfo = z.infer<typeof PythonInterpreterInfoSchema>

export const PythonCapabilityPackStatusSchema = z.object({
  id: z.enum(PYTHON_CAPABILITY_PACK_IDS),
  state: z.enum(PYTHON_CAPABILITY_PACK_STATES),
  installedVersion: z.string().optional(),
  targetVersion: z.string().optional(),
  missingPackages: z.array(z.string()).default([])
}).strict()

export type PythonCapabilityPackStatus = z.infer<typeof PythonCapabilityPackStatusSchema>

export const PythonRuntimeIssueSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1)
}).strict()

export type PythonRuntimeIssue = z.infer<typeof PythonRuntimeIssueSchema>

export const PythonRuntimeStatusV1Schema = z.object({
  version: z.literal(1),
  state: z.enum(PYTHON_RUNTIME_STATES),
  source: z.enum(PYTHON_RUNTIME_SOURCES),
  checkedAt: z.string(),
  interpreter: PythonInterpreterInfoSchema.nullable(),
  managedRoot: z.string().optional(),
  engineVersion: z.string().optional(),
  capabilityPacks: z.array(PythonCapabilityPackStatusSchema),
  issue: PythonRuntimeIssueSchema.optional()
}).strict()

export type PythonRuntimeStatusV1 = z.infer<typeof PythonRuntimeStatusV1Schema>

export type PythonRuntimeStatusInput = Omit<PythonRuntimeStatusV1, 'version' | 'state'> & {
  checking?: boolean
}

export type PythonRuntimeTeacherSummary = {
  tone: 'neutral' | 'positive' | 'warning' | 'danger'
  title: string
  description: string
  action: 'none' | 'install' | 'repair' | 'upgrade'
}

export type PythonRuntimeManifest = {
  id: string
  pythonVersion: string
  build: string
  platform: 'win32'
  architecture: 'x64'
  url: string
  size: number
  sha256: string
  source: { name: string; homepage: string }
  license: { name: string; url: string }
  uninstall: { removesManagedRootOnly: true }
}

export type PythonRuntimeInstallProgress = {
  phase: 'preparing' | 'downloading' | 'verifying' | 'installing' | 'complete'
  transferred?: number
  total?: number
}

export type PythonRuntimeManagerResult =
  | { ok: true }
  | { ok: false; code: 'unsupported-platform' | 'checksum-mismatch' | 'cancelled' | 'install-failed'; message: string }

export type PythonCapabilityPackInstallPhase =
  | 'preparing'
  | 'installing'
  | 'testing'
  | 'activating'
  | 'complete'

export type PythonCapabilityPackInstallResult =
  | { ok: true; packVersion: string; environmentPath: string }
  | { ok: false; code: 'runtime-not-installed' | 'install-failed' | 'smoke-test-failed'; message: string }

function baseSciencePack(
  capabilityPacks: PythonCapabilityPackStatus[]
): PythonCapabilityPackStatus | undefined {
  return capabilityPacks.find((pack) => pack.id === 'base-science')
}

export function resolvePythonRuntimeState(
  input: PythonRuntimeStatusInput
): PythonRuntimeState {
  if (input.checking) return 'checking'
  if (input.issue) return 'broken'
  if (input.source === 'none' || !input.interpreter) return 'not-installed'

  const basePack = baseSciencePack(input.capabilityPacks)
  if (basePack?.state === 'upgrade-required') return 'upgrade-required'
  if (!basePack || basePack.state !== 'ready') return 'incomplete'
  return 'ready'
}

export function createPythonRuntimeStatus(
  input: PythonRuntimeStatusInput
): PythonRuntimeStatusV1 {
  return PythonRuntimeStatusV1Schema.parse({
    version: 1,
    state: resolvePythonRuntimeState(input),
    source: input.source,
    checkedAt: input.checkedAt,
    interpreter: input.interpreter,
    ...(input.managedRoot ? { managedRoot: input.managedRoot } : {}),
    ...(input.engineVersion ? { engineVersion: input.engineVersion } : {}),
    capabilityPacks: input.capabilityPacks,
    ...(input.issue ? { issue: input.issue } : {})
  })
}

export function emptyPythonRuntimeStatus(
  checkedAt = ''
): PythonRuntimeStatusV1 {
  return createPythonRuntimeStatus({
    source: 'none',
    checkedAt,
    interpreter: null,
    capabilityPacks: []
  })
}

export function pythonRuntimeTeacherSummary(
  status: PythonRuntimeStatusV1
): PythonRuntimeTeacherSummary {
  switch (status.state) {
    case 'checking':
      return {
        tone: 'neutral',
        title: '正在检查科研分析引擎',
        description: '正在确认本机是否可以直接运行统计、绘图和下游分析。',
        action: 'none'
      }
    case 'not-installed':
      return {
        tone: 'warning',
        title: '尚未安装科研分析引擎',
        description: '基础教学和写作功能仍可使用；安装后可执行统计、科研绘图和下游生信分析。',
        action: 'install'
      }
    case 'incomplete':
      return {
        tone: 'warning',
        title: '科研分析组件不完整',
        description: '部分分析能力暂不可用，可修复组件后继续。',
        action: 'repair'
      }
    case 'broken':
      return {
        tone: 'danger',
        title: '科研分析引擎无法启动',
        description: '当前环境需要修复；基础教学和写作功能不受影响。',
        action: 'repair'
      }
    case 'upgrade-required':
      return {
        tone: 'warning',
        title: '科研分析引擎需要升级',
        description: '升级后可继续使用经过验证的统计和生信分析组件。',
        action: 'upgrade'
      }
    case 'ready':
      return {
        tone: 'positive',
        title: '科研分析引擎可用',
        description: '可以直接执行统计、科研绘图和已支持的下游分析。',
        action: 'none'
      }
  }
}
