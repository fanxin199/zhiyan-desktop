import { describe, expect, it } from 'vitest'
import type { WorkspaceEntry } from '@shared/workspace-file'
import { buildFileManagerAiPrompt, fileCategory } from './FileManagerWorkspacePage'

function entry(ext: string, type: WorkspaceEntry['type'] = 'file'): WorkspaceEntry {
  return { name: `sample.${ext}`, path: `C:\\workspace\\sample.${ext}`, type, ext }
}

describe('FileManagerWorkspacePage helpers', () => {
  it('classifies common teacher workspace files for filtering', () => {
    expect(fileCategory(entry('pdf'))).toBe('documents')
    expect(fileCategory(entry('xlsx'))).toBe('data')
    expect(fileCategory(entry('png'))).toBe('images')
    expect(fileCategory(entry('', 'directory'))).toBe('all')
  })

  it('builds a safe AI file-organization prompt with selected files', () => {
    const prompt = buildFileManagerAiPrompt({
      workspaceRoot: 'C:\\workspace',
      directory: 'C:\\workspace\\papers',
      taskLabel: '规范命名',
      userRequest: '按年份和主题重命名',
      selectedFiles: [
        { name: 'paper1.pdf', path: 'C:\\workspace\\papers\\paper1.pdf', type: 'file', ext: 'pdf' },
        { name: 'table.xlsx', path: 'C:\\workspace\\papers\\table.xlsx', type: 'file', ext: 'xlsx' }
      ],
      visibleEntries: []
    })

    expect(prompt).toContain('## 操作安全要求')
    expect(prompt).toContain('先生成整理方案，不要直接移动、删除、重命名、覆盖或转换任何文件')
    expect(prompt).toContain('## 选定文件')
    expect(prompt).toContain('paper1.pdf（PDF）：C:\\workspace\\papers\\paper1.pdf')
    expect(prompt).toContain('按年份和主题重命名')
  })

  it('falls back to the current folder when no files are selected', () => {
    const prompt = buildFileManagerAiPrompt({
      workspaceRoot: 'C:\\workspace',
      directory: 'C:\\workspace\\teaching',
      taskLabel: '分类整理',
      userRequest: '',
      selectedFiles: [],
      visibleEntries: [
        { name: 'chapter1.pdf', path: 'C:\\workspace\\teaching\\chapter1.pdf', type: 'file', ext: 'pdf' },
        { name: 'slides', path: 'C:\\workspace\\teaching\\slides', type: 'directory', ext: '' }
      ]
    })

    expect(prompt).toContain('## 当前文件夹')
    expect(prompt).toContain('C:\\workspace\\teaching')
    expect(prompt).toContain('## 当前可见文件')
    expect(prompt).toContain('chapter1.pdf（PDF）：C:\\workspace\\teaching\\chapter1.pdf')
  })
})
