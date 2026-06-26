import { describe, expect, it } from 'vitest'
import type { WorkspaceEntry } from '@shared/workspace-file'
import { fileCategory } from './FileManagerWorkspacePage'

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
})
