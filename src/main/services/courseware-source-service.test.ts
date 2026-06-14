import { describe, expect, it, vi } from 'vitest'
import { analyzeCoursewareSource } from './courseware-source-service'

describe('analyzeCoursewareSource', () => {
  it('dispatches PDF and PPTX sources by extension', async () => {
    const pdf = vi.fn().mockResolvedValue({ ok: false, code: 'READ_FAILED', message: 'pdf' })
    const pptx = vi.fn().mockResolvedValue({ ok: false, code: 'READ_FAILED', message: 'pptx' })

    await analyzeCoursewareSource('C:\\course\\chapter.pdf', { pdf, pptx })
    await analyzeCoursewareSource('C:\\course\\lecture.PPTX', { pdf, pptx })

    expect(pdf).toHaveBeenCalledWith('C:\\course\\chapter.pdf')
    expect(pptx).toHaveBeenCalledWith('C:\\course\\lecture.PPTX')
  })

  it('rejects unsupported source files', async () => {
    const result = await analyzeCoursewareSource('C:\\course\\notes.docx')
    expect(result).toEqual({
      ok: false,
      code: 'UNSUPPORTED_SOURCE',
      message: '目前仅支持 PDF 和 PPTX 教材文件。'
    })
  })
})
