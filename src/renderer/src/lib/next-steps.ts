import { create } from 'zustand'
import type { ArtifactKind } from '@shared/artifact'
import type { ToolRequest } from './tool-request'

export type ToolMaterial = { name: string; text: string }

type ToolOpenerState = {
  /** Set by the workbench: opens a tool with its input filled and materials attached. */
  open: ((request: ToolRequest, text: string, materials?: ToolMaterial[]) => void) | null
  setOpen: (open: ToolOpenerState['open']) => void
}

/**
 * How any panel opens another tool for a next step (Task 3.4.1) without threading callbacks
 * through every page.
 */
export const useToolOpenerStore = create<ToolOpenerState>((set) => ({
  open: null,
  setOpen: (open) => set({ open })
}))

export type ArtifactNextStep = {
  id: string
  label: string
  description?: string
  request: ToolRequest
  text: string
  /** The finished result itself, handed to the next tool as material. */
  materials: ToolMaterial[]
}

/** Enough of a result for the next tool to work from. */
const MATERIAL_CHARS = 20_000
/** Courseware takes the request text as its emphasis, so only a short excerpt goes along. */
const COURSEWARE_EXCERPT_CHARS = 1_500

/**
 * What usually follows a finished result (Task 3.4.1), replacing the home page's fixed list: each
 * step names the tool, writes the request and carries the result along.
 */
export function artifactNextSteps(artifact: { kind: ArtifactKind; title: string; markdown?: string }): ArtifactNextStep[] {
  const content = artifact.markdown?.trim() ?? ''
  const materials = content ? [{ name: artifact.title, text: content.slice(0, MATERIAL_CHARS) }] : []
  const excerpt = content ? `\n\n参考“${artifact.title}”的要点：\n${content.slice(0, COURSEWARE_EXCERPT_CHARS)}` : ''
  switch (artifact.kind) {
    case 'lesson-plan':
      return [
        { id: 'courseware', label: '做配套课件', description: '在课件中选择教材作为依据', request: { moduleId: 'ppt-gen', label: '课件' }, text: `根据教案“${artifact.title}”做一套配套课件${excerpt}`, materials: [] },
        { id: 'quiz', label: '出随堂题', description: '选择题和简答题，含答案与解析', request: { moduleId: 'quiz', label: '随堂题' }, text: `根据教案“${artifact.title}”出 10 道随堂题`, materials },
        { id: 'textbook', label: '编写对应的教材章节', request: { moduleId: 'textbook', label: '教材' }, text: `根据教案“${artifact.title}”编写对应的教材章节`, materials: [] }
      ]
    case 'courseware':
      return [
        { id: 'lesson-plan', label: '补一份完整教案', request: { moduleId: 'syllabus', label: '教案' }, text: `为课件“${artifact.title}”补一份完整教案`, materials },
        { id: 'quiz', label: '出随堂题', request: { moduleId: 'quiz', label: '随堂题' }, text: `根据课件“${artifact.title}”出 10 道随堂题`, materials }
      ]
    case 'textbook-chapter':
      return [
        { id: 'courseware', label: '转为课堂课件', request: { moduleId: 'ppt-gen', label: '课件' }, text: `把教材章节“${artifact.title}”做成课堂课件${excerpt}`, materials: [] },
        { id: 'quiz', label: '出课后练习', request: { moduleId: 'quiz', label: '随堂题' }, text: `根据教材章节“${artifact.title}”出课后练习`, materials }
      ]
    case 'literature-report':
    case 'evidence-table': {
      const kindLabel = artifact.kind === 'evidence-table' ? '证据表' : '文献报告'
      return [
        { id: 'journal-club', label: '做成组会汇报 PPT', description: '在课件中选择这篇论文的 PDF 作为依据', request: { moduleId: 'ppt-gen', label: '课件' }, text: `根据“${artifact.title}”做一套组会汇报 PPT，讲清研究问题、方法、关键图和局限`, materials: [] },
        { id: 'review', label: '写进综述', request: { moduleId: 'write', template: 'review', label: '文稿 · 综述' }, text: `根据附上的${kindLabel}写综述的相关段落，保留文献标识`, materials },
        { id: 'grant', label: '写进基金立项依据', request: { moduleId: 'write', template: 'grant', label: '文稿 · 国自然' }, text: `根据附上的${kindLabel}写国自然立项依据的相关段落，保留文献标识`, materials }
      ]
    }
    case 'analysis-report':
      return [
        { id: 'results', label: '写成论文的 Results', request: { moduleId: 'write', template: 'paper', label: '文稿 · 论文' }, text: `把附上的分析报告写成论文的 Results 段落，数字与图号和报告一致`, materials },
        { id: 'literature', label: '找文献支持结论', request: { moduleId: 'literature', label: '文献' }, text: `为“${artifact.title}”的主要结论找支持或反驳的文献`, materials: [] }
      ]
    case 'document':
      return [
        { id: 'literature', label: '核验关键文献', request: { moduleId: 'literature', label: '文献' }, text: `核验“${artifact.title}”中关键论点的文献证据`, materials }
      ]
    default:
      return []
  }
}
