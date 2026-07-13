import { describe, expect, it, vi } from 'vitest'
import {
  BASE_SCIENCE_PACKAGES,
  inspectPythonRuntime,
  type PythonCandidateRunResult,
  type PythonProbeData,
  type PythonRuntimeCandidate
} from './python-runtime-service'

const checkedAt = new Date('2026-07-13T08:00:00.000Z')

function probe(overrides: Partial<PythonProbeData> = {}): PythonProbeData {
  return {
    executable: 'C:\\Python312\\python.exe',
    version: '3.12.4',
    architecture: 'x64',
    packages: BASE_SCIENCE_PACKAGES.map(({ id }) => ({
      id,
      available: true,
      version: '1.0.0'
    })),
    ...overrides
  }
}

function success(data = probe()): PythonCandidateRunResult {
  return { kind: 'success', data }
}

describe('inspectPythonRuntime', () => {
  it('prefers a working application-managed interpreter', async () => {
    const runCandidate = vi.fn(async () => success(probe({
      executable: 'C:\\ZhiYan\\runtimes\\python\\python.exe',
      packages: [
        ...probe().packages,
        { id: 'scanpy', available: true, version: '1.12.1' },
        { id: 'python-igraph', available: true, version: '1.0.0' },
        { id: 'leidenalg', available: true, version: '0.12.0' }
      ]
    })))

    const status = await inspectPythonRuntime({
      userDataPath: 'C:\\ZhiYan',
      platform: 'win32',
      fileExists: () => true,
      runCandidate,
      readBaseSciencePackVersion: async () => '2026.07.1',
      readBioinformaticsPackVersion: async () => '2026.07.1',
      now: () => checkedAt
    })

    expect(status).toMatchObject({
      state: 'ready',
      source: 'managed',
      checkedAt: checkedAt.toISOString(),
      interpreter: { version: '3.12.4', architecture: 'x64' },
      capabilityPacks: [
        {
          id: 'base-science',
          state: 'ready',
          installedVersion: '2026.07.1',
          missingPackages: []
        },
        {
          id: 'bioinformatics',
          state: 'ready',
          installedVersion: '2026.07.1',
          missingPackages: []
        }
      ]
    })
    expect(runCandidate).toHaveBeenCalledWith(expect.objectContaining({ source: 'managed' }))
  })

  it('reports a damaged managed interpreter without silently switching runtimes', async () => {
    const runCandidate = vi.fn(async (): Promise<PythonCandidateRunResult> => ({
      kind: 'failed', code: 'probe-failed', message: 'broken environment'
    }))

    const status = await inspectPythonRuntime({
      userDataPath: 'C:\\ZhiYan',
      platform: 'win32',
      fileExists: () => true,
      runCandidate,
      now: () => checkedAt
    })

    expect(status).toMatchObject({ state: 'broken', source: 'managed' })
    expect(runCandidate).toHaveBeenCalledOnce()
  })

  it('tries safe Windows system candidates when no managed runtime exists', async () => {
    const calls: PythonRuntimeCandidate[] = []
    const runCandidate = vi.fn(async (candidate: PythonRuntimeCandidate) => {
      calls.push(candidate)
      return candidate.command === 'py' ? success() : { kind: 'not-found' } as const
    })

    const status = await inspectPythonRuntime({
      userDataPath: 'C:\\ZhiYan',
      platform: 'win32',
      fileExists: () => false,
      runCandidate,
      now: () => checkedAt
    })

    expect(status).toMatchObject({ state: 'ready', source: 'system' })
    expect(calls.map(({ command, prefixArgs }) => ({ command, prefixArgs }))).toEqual([
      { command: 'python', prefixArgs: [] },
      { command: 'py', prefixArgs: ['-3'] }
    ])
  })

  it('distinguishes missing packages and an outdated Python version', async () => {
    const missing = probe({
      packages: probe().packages.map((item) =>
        item.id === 'anndata' ? { id: item.id, available: false } : item
      )
    })
    const incomplete = await inspectPythonRuntime({
      userDataPath: '/tmp/zhiyan', platform: 'linux', fileExists: () => false,
      runCandidate: async () => success(missing), now: () => checkedAt
    })
    const outdated = await inspectPythonRuntime({
      userDataPath: '/tmp/zhiyan', platform: 'linux', fileExists: () => false,
      runCandidate: async () => success(probe({ version: '3.9.18' })), now: () => checkedAt
    })

    expect(incomplete).toMatchObject({
      state: 'incomplete',
      capabilityPacks: [
        { id: 'base-science', missingPackages: ['anndata'] },
        { id: 'bioinformatics', state: 'not-installed' }
      ]
    })
    expect(outdated.state).toBe('upgrade-required')
  })

  it('reports not installed when no candidate can be launched', async () => {
    const status = await inspectPythonRuntime({
      userDataPath: '/tmp/zhiyan', platform: 'linux', fileExists: () => false,
      runCandidate: async () => ({ kind: 'not-found' }), now: () => checkedAt
    })
    expect(status).toMatchObject({ state: 'not-installed', source: 'none', interpreter: null })
  })
})
