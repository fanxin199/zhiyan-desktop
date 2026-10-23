import type { PythonRuntimeStatusV1 } from '@shared/python-runtime'
import type { WorkspaceFileWritePayload, WorkspaceFileWriteResult } from '@shared/workspace-file'

export type AnalysisReproducibilityManifestV1 = {
  version: 1
  task: {
    id: string
    typeId: string
    label: string
    objective: string
    createdAt: string
  }
  inputs: Array<{
    name: string
    path: string
    sha256: string | null
    size: number | null
  }>
  parameters: {
    groupingMetadata: string
  }
  runtime: {
    source: PythonRuntimeStatusV1['source']
    pythonVersion: string | null
    capabilityPacks: Record<string, string | null>
    packageVersions: Record<string, string>
    checkedAt: string
  }
  artifacts: {
    manifest: string
    code: string
    log: string
    outputs: string
    /** The 分析报告 the agent writes (Task 2.6.2); absent in records made before it. */
    report?: string
  }
  outputFiles: Array<{ path: string; sha256?: string; size?: number }>
}

export function validateAnalysisMetadata(
  taskTypeId: string,
  groupingMetadata: string
): { ok: true } | { ok: false; message: string } {
  if ((taskTypeId === 'bulk' || taskTypeId === 'single-cell') && !groupingMetadata.trim()) {
    return { ok: false, message: '请填写样本分组和比较关系后再开始统计分析。' }
  }
  return { ok: true }
}

function safeTaskDirectory(taskId: string): string {
  return taskId
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 120) || 'analysis-task'
}

export function createAnalysisReproducibilityManifest(input: {
  taskId: string
  taskTypeId: string
  taskLabel: string
  objective: string
  groupingMetadata: string
  files: Array<{ name: string; path: string }>
  runtime: PythonRuntimeStatusV1
  createdAt?: string
}): AnalysisReproducibilityManifestV1 {
  const directory = `.zhiyan-analysis/${safeTaskDirectory(input.taskId)}`
  return {
    version: 1,
    task: {
      id: input.taskId,
      typeId: input.taskTypeId,
      label: input.taskLabel,
      objective: input.objective.trim(),
      createdAt: input.createdAt ?? new Date().toISOString()
    },
    inputs: input.files.map((file) => ({
      name: file.name,
      path: file.path,
      sha256: null,
      size: null
    })),
    parameters: {
      groupingMetadata: input.groupingMetadata.trim()
    },
    runtime: {
      source: input.runtime.source,
      pythonVersion: input.runtime.interpreter?.version ?? null,
      capabilityPacks: Object.fromEntries(input.runtime.capabilityPacks.map((pack) => [
        pack.id,
        pack.installedVersion ?? null
      ])),
      packageVersions: {},
      checkedAt: input.runtime.checkedAt
    },
    artifacts: {
      manifest: `${directory}/manifest.json`,
      code: `${directory}/analysis.py`,
      log: `${directory}/run.log`,
      outputs: `${directory}/outputs.json`,
      report: `${directory}/report.md`
    },
    outputFiles: []
  }
}

export async function persistAnalysisReproducibilityManifest(
  workspaceRoot: string,
  manifest: AnalysisReproducibilityManifestV1,
  api: {
    writeWorkspaceFile: (payload: WorkspaceFileWritePayload) => Promise<WorkspaceFileWriteResult>
  } = window.dsGui
): Promise<string> {
  const initialFiles = [
    {
      path: manifest.artifacts.manifest,
      content: `${JSON.stringify(manifest, null, 2)}\n`
    },
    {
      path: manifest.artifacts.code,
      content: '# 智研助手可复现分析代码\n# 实际执行的全部代码将记录在此文件。\n'
    },
    {
      path: manifest.artifacts.log,
      content: `[${manifest.task.createdAt}] 已创建可复现分析记录。\n`
    },
    {
      path: manifest.artifacts.outputs,
      content: '[]\n'
    },
    ...(manifest.artifacts.report ? [{ path: manifest.artifacts.report, content: ANALYSIS_REPORT_PLACEHOLDER }] : [])
  ]
  for (const file of initialFiles) {
    const result = await api.writeWorkspaceFile({
      workspaceRoot,
      path: file.path,
      content: file.content
    })
    if (!result.ok) throw new Error(result.message)
  }
  return manifest.artifacts.manifest
}

/** report.md until the agent has written the real report. */
export const ANALYSIS_REPORT_PLACEHOLDER = '# 分析报告\n\n分析尚未完成。\n'

/** What the agent must write as the 分析报告 so it opens part by part like other results (Task 2.6.2). */
export function buildAnalysisReportPrompt(manifest: AnalysisReproducibilityManifestV1): string {
  const report = manifest.artifacts.report ?? ''
  return [
    '## 分析报告（必须写入文件）',
    `分析完成后，把报告写入 ${report}（覆盖其中的占位内容），使用中文 Markdown，结构固定为：`,
    '- 一级标题：报告题目',
    '- ## 分析概要：三五句话说明做了什么、主要发现',
    '- ## 数据与分组：输入文件、样本数、老师确认的分组与比较方向',
    '- ## 统计方法：方法、软件包版本、阈值与多重检验校正',
    '- ## 结果：每张图一个三级标题（### 图 1 ……），用 ![图注](相对路径) 引用本任务目录下的图片，下面写关键数字和解读',
    '- ## 解释与边界：哪些结论有数据支持，哪些只是推断',
    '- ## 可复现记录：分析代码、运行日志、分析清单和输出清单的路径',
    '图片保存为 PNG，路径相对于报告所在目录；不要在报告中粘贴大段代码。'
  ].join('\n')
}

export function buildAnalysisReproducibilityPrompt(
  manifest: AnalysisReproducibilityManifestV1
): string {
  return [
    '## 可复现分析要求（必须执行）',
    `分析清单：${manifest.artifacts.manifest}`,
    `分析代码：${manifest.artifacts.code}`,
    `运行日志：${manifest.artifacts.log}`,
    `输出清单：${manifest.artifacts.outputs}`,
    `用户明确提供的分组/比较：${manifest.parameters.groupingMetadata || '此任务不要求样本分组'}`,
    '',
    '1. 开始统计前核对样本元数据；不得根据文件名猜测样本分组、配对关系或处理条件。若元数据与任务说明不一致，停止统计并向用户说明缺失项。',
    '2. 计算每个输入文件的 SHA-256 和大小，并回写分析清单。',
    '3. 在运行代码开始时记录实际导入包的版本，并回写 runtime.packageVersions。',
    '4. 将所有实际执行的分析代码完整保存到上述代码文件，不只在回复中展示片段。',
    '5. 将关键参数、命令、警告、失败与恢复过程追加到运行日志。',
    '6. 将所有生成文件的相对路径、大小和校验值写入 outputs.json，并同步更新分析清单的 outputFiles。',
    '7. 不覆盖原始输入文件；所有新结果保存在本任务目录或明确的结果子目录。'
  ].join('\n')
}
