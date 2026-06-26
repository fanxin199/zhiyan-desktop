import { describe, expect, it } from 'vitest'
import { extractLegacyWordText } from './legacy-word-text-service'

describe('extractLegacyWordText', () => {
  it('rejects unsupported extensions before trying to automate Word', async () => {
    await expect(extractLegacyWordText('C:\\materials\\lesson.docx')).resolves.toEqual({
      ok: false,
      message: '该读取接口仅用于旧版 DOC 文件。'
    })
  })
})
