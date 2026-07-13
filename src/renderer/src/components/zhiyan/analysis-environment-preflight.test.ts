import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { createPythonRuntimeStatus, type PythonRuntimeStatusV1 } from '@shared/python-runtime'
import {
  AnalysisEnvironmentPreflight,
  resolveAnalysisEnvironmentPreflight,
  runAnalysisPreflightAction
} from './analysis-environment-preflight'

function status(
  patch: Partial<PythonRuntimeStatusV1> = {}
): PythonRuntimeStatusV1 {
  return {
    ...createPythonRuntimeStatus({
      source: 'managed',
      checkedAt: '2026-07-13T12:00:00.000Z',
      interpreter: { path: 'python.exe', version: '3.12.13', architecture: 'x64' },
      capabilityPacks: [
        { id: 'base-science', state: 'ready', installedVersion: '2026.07.1', missingPackages: [] },
        { id: 'bioinformatics', state: 'not-installed', missingPackages: ['scanpy'] }
      ]
    }),
    ...patch
  }
}

describe('resolveAnalysisEnvironmentPreflight', () => {
  it('allows base analysis while identifying a missing single-cell extension', () => {
    expect(resolveAnalysisEnvironmentPreflight(status(), 'base')).toMatchObject({
      ready: true,
      title: '可以直接分析'
    })
    expect(resolveAnalysisEnvironmentPreflight(status(), 'bioinformatics')).toMatchObject({
      ready: false,
      action: 'install-bioinformatics',
      title: '需要安装单细胞分析扩展'
    })
  })

  it('turns a missing or damaged runtime into teacher-facing actions', () => {
    const missing = status({ state: 'not-installed', source: 'none', interpreter: null, capabilityPacks: [] })
    const broken = status({
      state: 'broken',
      issue: { code: 'launch-failed', message: 'CreateProcess failed' }
    })

    expect(resolveAnalysisEnvironmentPreflight(missing, 'base')).toMatchObject({
      ready: false,
      action: 'install-core',
      title: '需要安装科研分析引擎'
    })
    expect(resolveAnalysisEnvironmentPreflight(broken, 'base')).toMatchObject({
      ready: false,
      action: 'repair-core',
      title: '科研分析引擎需要修复'
    })
  })

  it('prepares the private analysis engine instead of modifying a system installation', () => {
    const systemRuntime = status({
      source: 'system',
      managedRoot: undefined,
      capabilityPacks: [
        { id: 'base-science', state: 'not-installed', missingPackages: ['pandas'] }
      ]
    })

    expect(resolveAnalysisEnvironmentPreflight(systemRuntime, 'base')).toMatchObject({
      ready: false,
      action: 'install-core',
      title: '需要安装科研分析引擎'
    })
  })

  it('keeps teacher-facing copy free of environment jargon', () => {
    const models = [
      resolveAnalysisEnvironmentPreflight(status(), 'bioinformatics'),
      resolveAnalysisEnvironmentPreflight(status({ state: 'incomplete' }), 'base')
    ]
    expect(JSON.stringify(models)).not.toMatch(/PATH|pip|venv|site-packages|Python executable/u)
  })
})

describe('AnalysisEnvironmentPreflight', () => {
  it('renders install and defer actions without exposing technical controls', () => {
    const html = renderToStaticMarkup(createElement(AnalysisEnvironmentPreflight, {
      model: resolveAnalysisEnvironmentPreflight(status(), 'bioinformatics'),
      busy: false,
      onAction: vi.fn(),
      onDefer: vi.fn()
    }))

    expect(html).toContain('需要安装单细胞分析扩展')
    expect(html).toContain('一键安装')
    expect(html).toContain('稍后安装')
    expect(html).not.toMatch(/PATH|pip|venv/u)
  })

  it('installs only the components required by the selected action', async () => {
    const calls: string[] = []
    const api = {
      installPythonRuntime: vi.fn(async () => {
        calls.push('runtime')
        return { ok: true as const }
      }),
      installBaseSciencePack: vi.fn(async () => {
        calls.push('base')
        return { ok: true as const, packVersion: '2026.07.1', environmentPath: 'base' }
      }),
      installBioinformaticsPack: vi.fn(async () => {
        calls.push('bioinformatics')
        return { ok: true as const, packVersion: '2026.07.1', environmentPath: 'bio' }
      })
    }

    await runAnalysisPreflightAction('install-core', api)
    expect(calls).toEqual(['runtime', 'base'])

    calls.length = 0
    await runAnalysisPreflightAction('install-bioinformatics', api)
    expect(calls).toEqual(['bioinformatics'])
  })
})
