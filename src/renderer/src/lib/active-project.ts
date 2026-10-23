import { create } from 'zustand'
import type { ArtifactKind, ArtifactListItem } from '@shared/artifact'
import type { TeacherProjectSettingsV1 } from '@shared/app-settings'
import type { ToolRequest } from './tool-request'

type ActiveProjectState = {
  /** The project the teacher is working in; new results are filed into it (Task 3.2). */
  projectId: string | null
  setProjectId: (projectId: string | null) => void
}

/**
 * The project a tool was opened from. It lives outside the workbench, which is rebuilt on every
 * page change, so the tool page that opens next can still see it.
 */
export const useActiveProjectStore = create<ActiveProjectState>((set) => ({
  projectId: null,
  setProjectId: (projectId) => set({ projectId })
}))

export type ProjectNextStep = { id: string; label: string; request: ToolRequest; text: string }

function has(artifacts: Array<Pick<ArtifactListItem, 'kind'>>, kinds: ArtifactKind[]): boolean {
  return artifacts.some((artifact) => kinds.includes(artifact.kind))
}

/**
 * What a project still lacks, as at most three next steps with the request already written from the
 * project's key points (Task 3.1.3).
 */
export function projectNextSteps(
  project: Pick<TeacherProjectSettingsV1, 'type' | 'brief' | 'name'>,
  artifacts: Array<Pick<ArtifactListItem, 'kind'>>
): ProjectNextStep[] {
  const brief = project.brief ?? {}
  const steps: ProjectNextStep[] = []
  if (project.type === 'teaching') {
    const lesson = [brief.courseName, brief.chapter].filter(Boolean).join(' ') || project.name
    if (!has(artifacts, ['lesson-plan'])) {
      steps.push({
        id: 'lesson-plan', label: '写这一章的教案', request: { moduleId: 'syllabus', label: '教案' },
        text: `帮我写${lesson}的教案${brief.hours ? `，${brief.hours}` : ''}${brief.audience ? `，${brief.audience}` : ''}`
      })
    }
    if (!has(artifacts, ['courseware'])) {
      steps.push({ id: 'courseware', label: '做配套课件', request: { moduleId: 'ppt-gen', label: '课件' }, text: `做一套${lesson}的课件` })
    }
    if (!has(artifacts, ['textbook-chapter'])) {
      steps.push({ id: 'textbook', label: '编写教材章节', request: { moduleId: 'textbook', label: '教材' }, text: `编写${lesson}的教材章节` })
    }
  } else {
    const title = brief.title || project.name
    if (!has(artifacts, ['literature-report', 'evidence-table'])) {
      steps.push({ id: 'literature', label: '整理关键文献', request: { moduleId: 'literature', label: '文献' }, text: `围绕“${title}”整理关键文献` })
    }
    if (!has(artifacts, ['document'])) {
      const grant = /基金|国自然|NSFC/iu.test(brief.target ?? '')
      steps.push({
        id: 'document', label: grant ? '起草基金申请书' : '起草论文',
        request: { moduleId: 'write', template: grant ? 'grant' : 'paper', label: grant ? '文稿 · 国自然' : '文稿 · 论文' },
        text: `围绕“${title}”起草${grant ? '基金申请书' : '论文'}${brief.question ? `，科学问题：${brief.question}` : ''}`
      })
    }
    if (!has(artifacts, ['analysis-report'])) {
      steps.push({ id: 'analysis', label: '分析实验数据', request: { moduleId: 'bioinformatics', label: '数据分析' }, text: `分析“${title}”的实验数据` })
    }
  }
  return steps.slice(0, 3)
}
