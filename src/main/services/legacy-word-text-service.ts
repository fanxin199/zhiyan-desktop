import { execFile } from 'node:child_process'
import { stat } from 'node:fs/promises'
import { extname } from 'node:path'
import { promisify } from 'node:util'
import type { LegacyWordTextExtractResult } from '../../shared/ds-gui-api'

const execFileAsync = promisify(execFile)
const MAX_EXTRACTED_TEXT_CHARS = 240_000
const WORD_AUTOMATION_TIMEOUT_MS = 30_000

const WORD_TEXT_SCRIPT = [
  '& {',
  'param([string]$sourcePath)',
  '$ErrorActionPreference = "Stop"',
  '$word = $null',
  '$document = $null',
  'try {',
  '  $word = New-Object -ComObject Word.Application',
  '  $word.Visible = $false',
  '  $word.DisplayAlerts = 0',
  '  $document = $word.Documents.Open($sourcePath, $false, $true)',
  '  [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)',
  '  [Console]::Write($document.Content.Text)',
  '} finally {',
  '  if ($document -ne $null) { $document.Close($false) }',
  '  if ($word -ne $null) { $word.Quit() }',
  '}',
  '}'
].join('; ')

function clipText(text: string): { text: string; truncated: boolean } {
  if (text.length <= MAX_EXTRACTED_TEXT_CHARS) return { text, truncated: false }
  return { text: text.slice(0, MAX_EXTRACTED_TEXT_CHARS), truncated: true }
}

function readableFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  if (/class not registered|New-Object.*ComObject|Word\.Application/i.test(message)) {
    return '未检测到可用的 Microsoft Word，无法读取旧版 DOC 文件。请安装 Word，或将文件另存为 DOCX/PDF 后重试。'
  }
  if (/timed out|ETIMEDOUT/i.test(message)) {
    return '读取 DOC 文件超时。请确认文件未被其他程序锁定，或将其另存为 DOCX 后重试。'
  }
  return `读取 DOC 文件失败：${message}`
}

export async function extractLegacyWordText(path: string): Promise<LegacyWordTextExtractResult> {
  if (process.platform !== 'win32') {
    return { ok: false, message: '旧版 DOC 文件读取目前仅支持 Windows。请先转换为 DOCX 或 PDF。' }
  }
  if (extname(path).toLowerCase() !== '.doc') {
    return { ok: false, message: '该读取接口仅用于旧版 DOC 文件。' }
  }
  try {
    const info = await stat(path)
    if (!info.isFile()) return { ok: false, message: '所选路径不是文件。' }
    const { stdout } = await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-STA', '-ExecutionPolicy', 'Bypass', '-Command', WORD_TEXT_SCRIPT, path],
      {
        timeout: WORD_AUTOMATION_TIMEOUT_MS,
        maxBuffer: MAX_EXTRACTED_TEXT_CHARS * 6,
        windowsHide: true
      }
    )
    const extracted = clipText(String(stdout).replace(/\r\n/g, '\n').trim())
    if (!extracted.text) return { ok: false, message: 'DOC 文件中未提取到可读正文。' }
    return { ok: true, ...extracted }
  } catch (error) {
    return { ok: false, message: readableFailure(error) }
  }
}
