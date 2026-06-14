import type { CoursewareSourceAnalysisResult } from '../../shared/courseware'
import { analyzePdfCoursewareSource } from './courseware-pdf-service'
import { extractPptxCoursewareSource } from './courseware-pptx-service'

type CoursewareSourceDependencies = {
  pdf(path: string): Promise<CoursewareSourceAnalysisResult>
  pptx(path: string): Promise<CoursewareSourceAnalysisResult>
}

const defaultDependencies: CoursewareSourceDependencies = {
  pdf: analyzePdfCoursewareSource,
  pptx: extractPptxCoursewareSource
}

export async function analyzeCoursewareSource(
  path: string,
  dependencies: CoursewareSourceDependencies = defaultDependencies
): Promise<CoursewareSourceAnalysisResult> {
  const normalized = path.trim().toLowerCase()
  if (normalized.endsWith('.pdf')) return dependencies.pdf(path)
  if (normalized.endsWith('.pptx')) return dependencies.pptx(path)
  return {
    ok: false,
    code: 'UNSUPPORTED_SOURCE',
    message: '目前仅支持 PDF 和 PPTX 教材文件。'
  }
}
