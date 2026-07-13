import { describe, expect, it, vi } from 'vitest'
import { createPythonRuntimeStatus } from '@shared/python-runtime'
import {
  buildAnalysisReproducibilityPrompt,
  createAnalysisReproducibilityManifest,
  persistAnalysisReproducibilityManifest,
  validateAnalysisMetadata
} from './analysis-reproducibility'

const runtime = createPythonRuntimeStatus({
  source: 'managed',
  checkedAt: '2026-07-14T08:00:00.000Z',
  interpreter: { path: 'python.exe', version: '3.12.13', architecture: 'x64' },
  capabilityPacks: [
    { id: 'base-science', state: 'ready', installedVersion: '2026.07.1', missingPackages: [] },
    { id: 'bioinformatics', state: 'ready', installedVersion: '2026.07.1', missingPackages: [] }
  ]
})

describe('analysis metadata guard', () => {
  it('blocks statistical tasks without explicit grouping metadata', () => {
    expect(validateAnalysisMetadata('bulk', '')).toEqual({
      ok: false,
      message: '请填写样本分组和比较关系后再开始统计分析。'
    })
    expect(validateAnalysisMetadata('single-cell', '样本列 patient_id；分组列 response：CR/PR 对比 SD/PD')).toEqual({ ok: true })
    expect(validateAnalysisMetadata('enrichment', '')).toEqual({ ok: true })
  })
})

describe('analysis reproducibility manifest', () => {
  it('records inputs, parameters, code, runtime, logs and output inventory locations', () => {
    const manifest = createAnalysisReproducibilityManifest({
      taskId: 'research-task:bioinformatics:abc',
      taskTypeId: 'bulk',
      taskLabel: 'bulk mRNA 数据分析',
      objective: '比较响应组与非响应组的 B 细胞相关通路',
      groupingMetadata: '分组列 response；Responder 对比 Non-responder',
      files: [{ name: 'expression.csv', path: 'J:/study/expression.csv' }],
      runtime,
      createdAt: '2026-07-14T08:01:00.000Z'
    })

    expect(manifest).toMatchObject({
      version: 1,
      task: { typeId: 'bulk' },
      inputs: [{ name: 'expression.csv', path: 'J:/study/expression.csv', sha256: null, size: null }],
      parameters: { groupingMetadata: '分组列 response；Responder 对比 Non-responder' },
      runtime: {
        pythonVersion: '3.12.13',
        capabilityPacks: { 'base-science': '2026.07.1', bioinformatics: '2026.07.1' },
        packageVersions: {}
      },
      artifacts: {
        code: '.zhiyan-analysis/research-task-bioinformatics-abc/analysis.py',
        log: '.zhiyan-analysis/research-task-bioinformatics-abc/run.log',
        outputs: '.zhiyan-analysis/research-task-bioinformatics-abc/outputs.json'
      },
      outputFiles: []
    })
  })

  it('writes the manifest inside the selected workspace and gives the agent strict update instructions', async () => {
    const writeWorkspaceFile = vi.fn(async (_payload: { workspaceRoot?: string; path: string; content: string }) => ({
      ok: true as const,
      path: 'J:/study/.zhiyan-analysis/task-1/manifest.json',
      savedAt: '2026-07-14T08:01:00.000Z'
    }))
    const manifest = createAnalysisReproducibilityManifest({
      taskId: 'task-1',
      taskTypeId: 'bulk',
      taskLabel: 'bulk mRNA 数据分析',
      objective: '分析 B 细胞相关差异',
      groupingMetadata: 'group 列：case 对比 control',
      files: [],
      runtime,
      createdAt: '2026-07-14T08:01:00.000Z'
    })

    await expect(persistAnalysisReproducibilityManifest('J:/study', manifest, { writeWorkspaceFile }))
      .resolves.toBe('.zhiyan-analysis/task-1/manifest.json')
    expect(writeWorkspaceFile).toHaveBeenCalledWith(expect.objectContaining({
      workspaceRoot: 'J:/study',
      path: '.zhiyan-analysis/task-1/manifest.json'
    }))
    expect(writeWorkspaceFile).toHaveBeenCalledTimes(4)
    expect(writeWorkspaceFile.mock.calls.map(([payload]) => payload.path)).toEqual([
      '.zhiyan-analysis/task-1/manifest.json',
      '.zhiyan-analysis/task-1/analysis.py',
      '.zhiyan-analysis/task-1/run.log',
      '.zhiyan-analysis/task-1/outputs.json'
    ])
    const prompt = buildAnalysisReproducibilityPrompt(manifest)
    expect(prompt).toContain('不得根据文件名猜测样本分组')
    expect(prompt).toContain('计算每个输入文件的 SHA-256 和大小')
    expect(prompt).toContain('记录实际导入包的版本')
    expect(prompt).toContain('.zhiyan-analysis/task-1/analysis.py')
    expect(prompt).toContain('outputs.json')
  })
})
