import { describe, expect, it, vi } from 'vitest'
import { createPythonRuntimeStatus } from '@shared/python-runtime'
import bulkExpression from '../../../../../test/fixtures/teacher-validation/bulk-bcell-expression.csv?raw'
import bulkMetadata from '../../../../../test/fixtures/teacher-validation/bulk-sample-metadata.tsv?raw'
import singleCellMarkers from '../../../../../test/fixtures/teacher-validation/single-cell-bcell-markers.csv?raw'
import singleCellMetadata from '../../../../../test/fixtures/teacher-validation/single-cell-cluster-metadata.tsv?raw'
import {
  BIOINFORMATICS_CONFIG,
  buildResearchTaskPrompt,
  extractResearchTaskFileText
} from './ZhiYanModulePages'
import {
  resolveAnalysisEnvironmentPreflight,
  runAnalysisPreflightAction
} from './analysis-environment-preflight'
import {
  buildAnalysisReproducibilityPrompt,
  createAnalysisReproducibilityManifest,
  persistAnalysisReproducibilityManifest,
  validateAnalysisMetadata
} from './analysis-reproducibility'
import {
  applyResearchTaskExecution,
  buildResearchTaskResumeText,
  createResearchTaskCard
} from './research-task-card'

function utf8Base64(value: string): string {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

const runtime = createPythonRuntimeStatus({
  source: 'managed',
  checkedAt: '2026-07-15T08:00:00.000Z',
  interpreter: { path: 'python.exe', version: '3.12.13', architecture: 'x64' },
  capabilityPacks: [
    { id: 'base-science', state: 'ready', installedVersion: '2026.07.1', missingPackages: [] },
    { id: 'bioinformatics', state: 'ready', installedVersion: '2026.07.1', missingPackages: [] }
  ]
})

describe('3.4 teacher-facing analysis acceptance', () => {
  it('offers install, private-engine preparation, ready and repair actions without technical controls', async () => {
    const noPython = createPythonRuntimeStatus({
      source: 'none', checkedAt: runtime.checkedAt, interpreter: null, capabilityPacks: []
    })
    const systemPython = createPythonRuntimeStatus({
      source: 'system',
      checkedAt: runtime.checkedAt,
      interpreter: { path: 'C:\\Python312\\python.exe', version: '3.12.13', architecture: 'x64' },
      capabilityPacks: [
        { id: 'base-science', state: 'ready', missingPackages: [] },
        { id: 'bioinformatics', state: 'ready', missingPackages: [] }
      ]
    })
    const damagedPrivatePython = createPythonRuntimeStatus({
      source: 'managed',
      checkedAt: runtime.checkedAt,
      interpreter: null,
      capabilityPacks: [],
      issue: { code: 'launch-failed', message: 'runtime damaged' }
    })
    const models = [
      resolveAnalysisEnvironmentPreflight(noPython, 'base'),
      resolveAnalysisEnvironmentPreflight(systemPython, 'base'),
      resolveAnalysisEnvironmentPreflight(runtime, 'bioinformatics'),
      resolveAnalysisEnvironmentPreflight(damagedPrivatePython, 'base')
    ]

    expect(models.map(({ action }) => action)).toEqual([
      'install-core',
      'install-core',
      'none',
      'repair-core'
    ])
    expect(JSON.stringify(models)).not.toMatch(/PATH|pip|venv|site-packages|terminal|终端/u)

    const repairApi = {
      installPythonRuntime: vi.fn(async () => ({ ok: true as const })),
      installBaseSciencePack: vi.fn(async () => ({
        ok: true as const,
        packVersion: '2026.07.1',
        environmentPath: 'private-base'
      })),
      installBioinformaticsPack: vi.fn(async () => ({
        ok: true as const,
        packVersion: '2026.07.1',
        environmentPath: 'private-bioinformatics'
      }))
    }
    await runAnalysisPreflightAction('repair-core', repairApi)
    expect(repairApi.installPythonRuntime).toHaveBeenCalledWith(true)
    expect(repairApi.installBaseSciencePack).toHaveBeenCalledWith(true)
  })

  it('carries bulk and single-cell downstream files through extraction, guardrails, recovery and reproducibility records', async () => {
    const writtenFiles = new Map<string, string>()
    const writeWorkspaceFile = vi.fn(async (payload: { path: string; content: string }) => {
      writtenFiles.set(payload.path, payload.content)
      return { ok: true as const, path: `D:/teacher-analysis/${payload.path}`, savedAt: runtime.checkedAt }
    })
    const cases = [{
      taskTypeId: 'bulk',
      objective: '比较 Responder 与 Non-responder 的 B 细胞相关表达特征',
      groupingMetadata: '按 sample_id 连接元数据；response 列：Responder 对比 Non-responder；batch 作为协变量',
      files: [
        { name: 'bulk-bcell-expression.csv', text: bulkExpression },
        { name: 'bulk-sample-metadata.tsv', text: bulkMetadata }
      ],
      expectedText: ['MS4A1', 'Non-responder']
    }, {
      taskTypeId: 'single-cell',
      objective: '比较不同疗效组的 B 细胞亚群组成和 marker 特征',
      groupingMetadata: '样本列 sample_id；患者列 patient_id；response 列：Responder 对比 Non-responder',
      files: [
        { name: 'single-cell-bcell-markers.csv', text: singleCellMarkers },
        { name: 'single-cell-cluster-metadata.tsv', text: singleCellMetadata }
      ],
      expectedText: ['avg_log2FC', 'Plasma']
    }]

    for (const entry of cases) {
      const task = BIOINFORMATICS_CONFIG.taskEntry?.taskTypes.find(({ id }) => id === entry.taskTypeId)
      expect(task).toBeDefined()
      if (!task) continue
      const files = await Promise.all(entry.files.map(async ({ name, text }) => {
        const path = `D:/teacher-analysis/inputs/${name}`
        const extracted = await extractResearchTaskFileText({ name, dataBase64: utf8Base64(text) })
        expect(extracted.kind).toBe('text')
        return { name, path, extractedText: extracted.text, truncated: extracted.truncated }
      }))
      const combinedText = files.map(({ extractedText }) => extractedText).join('\n')
      for (const expected of entry.expectedText) expect(combinedText).toContain(expected)
      expect(validateAnalysisMetadata(entry.taskTypeId, entry.groupingMetadata)).toEqual({ ok: true })

      const prompt = buildResearchTaskPrompt(BIOINFORMATICS_CONFIG, task, entry.objective, files)
      expect(prompt).toContain(entry.objective)
      expect(prompt).toContain('先检查数据格式、列名、样本分组、阈值')
      expect(prompt).toContain('<<<ZHIYAN_UNTRUSTED_MATERIAL_START>>>')
      const taskId = `teacher-validation-${entry.taskTypeId}`
      const manifest = createAnalysisReproducibilityManifest({
        taskId,
        taskTypeId: entry.taskTypeId,
        taskLabel: task.label,
        objective: entry.objective,
        groupingMetadata: entry.groupingMetadata,
        files,
        runtime,
        createdAt: runtime.checkedAt
      })
      await expect(persistAnalysisReproducibilityManifest(
        'D:/teacher-analysis', manifest, { writeWorkspaceFile }
      )).resolves.toBe(manifest.artifacts.manifest)
      const savedManifest = JSON.parse(writtenFiles.get(manifest.artifacts.manifest) ?? '{}') as {
        inputs?: Array<{ name: string }>
      }
      expect(savedManifest.inputs?.map(({ name }) => name)).toEqual(entry.files.map(({ name }) => name))
      expect(buildAnalysisReproducibilityPrompt(manifest)).toContain('不得根据文件名猜测样本分组')
      for (const artifact of Object.values(manifest.artifacts)) expect(writtenFiles.has(artifact)).toBe(true)

      const card = createResearchTaskCard({
        id: taskId,
        moduleId: 'bioinformatics',
        taskTypeId: entry.taskTypeId,
        taskLabel: task.label,
        objective: entry.objective,
        groupingMetadata: entry.groupingMetadata,
        materials: files.map(({ name, path }) => ({ name, path })),
        saveLocation: 'D:/teacher-analysis',
        now: runtime.checkedAt
      })
      const interrupted = applyResearchTaskExecution(card, {
        taskId,
        status: 'failed',
        lastSuccessfulStep: '完成输入文件与分组核对',
        errorMessage: '模拟分析中断'
      })
      expect(buildResearchTaskResumeText(interrupted)).toContain('从“完成输入文件与分组核对”之后继续')
      expect(interrupted.materials.map(({ name }) => name)).toEqual(entry.files.map(({ name }) => name))
    }
  })
})
