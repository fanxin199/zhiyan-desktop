import { describe, expect, it } from 'vitest'
import {
  createPythonRuntimeStatus,
  emptyPythonRuntimeStatus,
  pythonRuntimeTeacherSummary,
  resolvePythonRuntimeState,
  type PythonRuntimeStatusInput
} from './python-runtime'

const interpreter = {
  path: 'C:\\Users\\teacher\\AppData\\Local\\ZhiYan\\runtimes\\python\\python.exe',
  version: '3.12.4',
  architecture: 'x64' as const
}

function input(patch: Partial<PythonRuntimeStatusInput> = {}): PythonRuntimeStatusInput {
  return {
    source: 'managed',
    checkedAt: '2026-07-11T08:00:00.000Z',
    interpreter,
    managedRoot: 'C:\\Users\\teacher\\AppData\\Local\\ZhiYan\\runtimes\\python',
    engineVersion: '2026.1',
    capabilityPacks: [{
      id: 'base-science',
      state: 'ready',
      installedVersion: '2026.1',
      targetVersion: '2026.1',
      missingPackages: []
    }],
    ...patch
  }
}

describe('Python runtime status contract', () => {
  it('distinguishes every teacher-relevant runtime state', () => {
    expect(resolvePythonRuntimeState(input({ checking: true }))).toBe('checking')
    expect(resolvePythonRuntimeState(input({ source: 'none', interpreter: null }))).toBe('not-installed')
    expect(resolvePythonRuntimeState(input({ issue: { code: 'launch-failed', message: 'failed' } }))).toBe('broken')
    expect(resolvePythonRuntimeState(input({ capabilityPacks: [] }))).toBe('incomplete')
    expect(resolvePythonRuntimeState(input({
      capabilityPacks: [{
        id: 'base-science',
        state: 'upgrade-required',
        installedVersion: '2025.1',
        targetVersion: '2026.1',
        missingPackages: []
      }]
    }))).toBe('upgrade-required')
    expect(resolvePythonRuntimeState(input())).toBe('ready')
  })

  it('creates a versioned status with interpreter and capability pack metadata', () => {
    const status = createPythonRuntimeStatus(input())

    expect(status).toMatchObject({
      version: 1,
      state: 'ready',
      source: 'managed',
      interpreter: {
        version: '3.12.4',
        architecture: 'x64'
      },
      engineVersion: '2026.1',
      capabilityPacks: [{ id: 'base-science', state: 'ready' }]
    })
  })

  it('keeps teacher-facing summaries free of environment jargon', () => {
    const missing = pythonRuntimeTeacherSummary(emptyPythonRuntimeStatus())
    const broken = pythonRuntimeTeacherSummary(createPythonRuntimeStatus(input({
      issue: { code: 'launch-failed', message: 'CreateProcess failed' }
    })))

    expect(missing).toMatchObject({ action: 'install', title: '尚未安装科研分析引擎' })
    expect(broken).toMatchObject({ action: 'repair', title: '科研分析引擎无法启动' })
    expect(`${missing.description}${broken.description}`).not.toMatch(/PATH|pip|venv|CreateProcess/u)
  })
})
