import { z } from 'zod'

/**
 * Templates of the 文稿 tool, which replaced the separate paper, review and grant writing pages
 * (docs/AI_NATIVE_REDESIGN_PLAN.md Task 1.4). A template writes a blueprint first: the topic, key
 * terms and every section with what it must cover. The teacher then writes section by section with
 * “说一句就改” and polishes the whole (蓝图 → 分段写作 → 润色).
 */
export const DOCUMENT_TEMPLATE_IDS = ['paper', 'review', 'grant', 'blank'] as const
export const documentTemplateIdSchema = z.enum(DOCUMENT_TEMPLATE_IDS)
export type DocumentTemplateId = z.infer<typeof documentTemplateIdSchema>

/** Module pages that became templates of 文稿; their route ids still open 文稿 with that template. */
export const LEGACY_DOCUMENT_MODULES = {
  'paper-polish': 'paper',
  'review-writing': 'review',
  'grant-writing': 'grant'
} as const satisfies Record<string, DocumentTemplateId>

export type LegacyDocumentModuleId = keyof typeof LEGACY_DOCUMENT_MODULES

export function documentTemplateForModule(moduleId: string): DocumentTemplateId | null {
  return (LEGACY_DOCUMENT_MODULES as Record<string, DocumentTemplateId>)[moduleId] ?? null
}

export type DocumentTemplate = {
  id: DocumentTemplateId
  label: string
  description: string
  placeholder: string
  /** At most three (§3.3). */
  examples: string[]
  /** Rules the AI follows whenever it writes or revises a document of this kind. */
  constraints: string[]
  /** What the first draft from one sentence should be. */
  draftInstruction: string
  /** Stage recorded for the first draft. */
  draftStage: string
}

const SHARED_CONSTRAINTS = [
  '不得编造实验结果、样本量、统计显著性、伦理批准号或不存在的参考文献；需要引用处写“〔待补充文献〕”。',
  '明确区分用户材料、文献事实、机制推断和待验证假设，不把推测写成事实。'
]

const BLUEPRINT_SHAPE = [
  '用 Markdown 输出一份写作蓝图：一级标题是文稿题目；',
  '开头用“## 写作主线”写清核心问题、核心假说或中心论点和术语表；',
  '然后每个正文小节一个二级标题，标题下用“本节要写：”列出该节的论证功能、要点和边界，暂不展开正文。'
].join('')

export const DOCUMENT_TEMPLATES: Record<DocumentTemplateId, DocumentTemplate> = {
  paper: {
    id: 'paper',
    label: '论文',
    description: '先锁定科学问题和章节边界，再逐节写作与润色',
    placeholder: '说说这篇论文要写什么，例如：缺血再灌注损伤中线粒体稳态的研究，先写 Discussion 的蓝图。',
    examples: [
      '我要写一篇关于缺血再灌注损伤中线粒体稳态的论文 Discussion，先帮我建立写作蓝图。',
      '根据我上传的结果，搭一篇原创研究论文的框架：引言、方法、结果、讨论。',
      '把这段中文研究背景改写成英文论文的 Introduction 结构。'
    ],
    constraints: [
      '先判断文本在全文中的功能，再写作或修改；保留作者语气。',
      ...SHARED_CONSTRAINTS
    ],
    draftInstruction: `${BLUEPRINT_SHAPE}按论文的常见结构安排小节。`,
    draftStage: '写作蓝图'
  },
  review: {
    id: 'review',
    label: '综述',
    description: '先定中心论点和章节逻辑，按证据链分节成稿',
    placeholder: '说说综述的主题和想证明的中心论点，例如：细胞衰老在组织纤维化中的作用。',
    examples: [
      '帮我设计一篇关于细胞衰老与组织纤维化的综述，先明确中心论点和每节边界。',
      '围绕神经炎症、突触可塑性与认知障碍搭一篇综述的章节结构。',
      '把我上传的这些文献组织成一篇综述的论证主线。'
    ],
    constraints: [
      '先形成论证主线再分节写作；每节说明论证功能和边界，避免材料堆叠。',
      '标明证据等级、争议点、替代解释和未解决问题；不把相关性写成因果机制。',
      ...SHARED_CONSTRAINTS
    ],
    draftInstruction: `${BLUEPRINT_SHAPE}每节注明需要的证据类型和争议点。`,
    draftStage: '综述蓝图'
  },
  grant: {
    id: 'grant',
    label: '国自然',
    description: '固定科学问题与研究内容，立项依据、技术路线相互对应',
    placeholder: '说说项目题目和科学问题，例如：机械应力调控骨重建的细胞与分子机制。',
    examples: [
      '帮我搭一份国自然面上项目申请书：题目暂定为机械应力调控骨重建的细胞与分子机制。',
      '根据我的前期结果，先写国自然的项目蓝图：科学问题、核心假说和三项研究内容。',
      '我要申请青年基金，研究肿瘤相关巨噬细胞的代谢重编程，先列出各部分要点。'
    ],
    constraints: [
      '立项依据、科学问题、研究内容、技术路线和创新点必须围绕同一科学问题相互对应。',
      '研究内容、关键实验和预期结果一一对应，避免目标与实验脱节；减少空泛表述。',
      ...SHARED_CONSTRAINTS
    ],
    draftInstruction: `${BLUEPRINT_SHAPE}小节依次为立项依据、研究目标、研究内容、拟解决的关键科学问题、研究方案与技术路线、可行性分析、特色与创新、预期成果。`,
    draftStage: '项目蓝图'
  },
  blank: {
    id: 'blank',
    label: '空白',
    description: '日常文稿、通知、总结或任何长文',
    placeholder: '说说想写什么，例如：本学期教学工作总结，突出课程改革和学生反馈。',
    examples: [
      '写一份本学期教学工作总结，突出课程改革和学生反馈。',
      '给研究生写一份实验室安全须知。',
      '把我的会议笔记整理成一份条理清楚的纪要。'
    ],
    constraints: SHARED_CONSTRAINTS,
    draftInstruction: '用 Markdown 直接写出完整初稿：一级标题是题目，按内容分成若干二级标题小节。',
    draftStage: '初稿'
  }
}

export const documentMaterialSchema = z.object({
  name: z.string().trim().min(1).max(255),
  text: z.string().max(200_000)
}).strict()

export const documentCreateInputSchema = z.object({
  workspaceRoot: z.string().trim().min(1).max(4_096),
  template: documentTemplateIdSchema,
  /** Empty for a blank document without a first draft. */
  instruction: z.string().trim().max(8_000),
  materials: z.array(documentMaterialSchema).max(10)
}).strict()

export type DocumentMaterial = z.infer<typeof documentMaterialSchema>
export type DocumentCreateInput = z.infer<typeof documentCreateInputSchema>
