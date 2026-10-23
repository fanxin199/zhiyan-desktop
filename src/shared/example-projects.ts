import type { TeacherProjectTypeV1 } from './app-settings-types'
import type { ArtifactKind } from './artifact'
import { buildLessonPlanMarkdown } from './lesson-plan'
import { buildLiteratureReportMarkdown } from './literature-report'
import { buildQuestionSetMarkdown } from './question-set'

/**
 * 示例项目 (Task 4.2.1): one course and one research topic, each with finished results, so a new
 * teacher can see what the app makes before writing a sentence. Everything is made up: no real
 * teacher, school, student or paper is named, and the example paper is marked as invented.
 */
export type ExampleArtifact = {
  kind: ArtifactKind
  toolId: string
  title: string
  /** File name inside the project folder. */
  fileName: string
  stage: string
  markdown: string
}

export type ExampleProject = {
  /** Fixed, so installing twice finds the project already there. */
  id: string
  type: TeacherProjectTypeV1
  brief: Record<string, string>
  artifacts: ExampleArtifact[]
}

export const EXAMPLE_NOTE = '> 这是智研助手自带的示例，内容为演示而写，人物、学校与论文均为虚构。可以随意修改或删除。'

function withNote(markdown: string): string {
  const [heading, ...rest] = markdown.split('\n')
  return [heading, '', EXAMPLE_NOTE, ...rest].join('\n')
}

const courseLessonPlan = buildLessonPlanMarkdown(
  {
    courseName: '医学免疫学',
    topic: '第九章 T 细胞介导的细胞免疫应答',
    hours: '2 学时',
    audience: '临床医学本科二年级',
    major: '临床医学',
    teacher: '示例教师',
    school: '示例医学院',
    department: '免疫学系'
  },
  {
    objectives: {
      knowledge: [
        '说出 T 细胞活化所需的双信号及其分子基础（TCR–pMHC、CD28–B7）。',
        '描述 CD4+ T 细胞向 Th1、Th2、Th17 和 Treg 分化的主要细胞因子条件。',
        '解释 CD8+ CTL 通过穿孔素–颗粒酶和 Fas–FasL 杀伤靶细胞的过程。'
      ],
      extension: ['结合 PD-1 抑制剂的临床应用，理解共抑制分子在肿瘤免疫中的意义。']
    },
    keyPoints: ['T 细胞活化的双信号学说', 'CTL 杀伤靶细胞的机制'],
    difficulties: ['共刺激与共抑制分子如何决定 T 细胞的命运', 'Th 亚群分化与细胞因子网络'],
    learnerAnalysis: '学生已学过抗原提呈和 MHC 分子，具备 T 细胞识别抗原的基础；对信号转导和细胞因子网络普遍感到抽象，需要用流程图和临床病例把机制串起来。',
    methods: '讲授与病例讨论结合，课堂提问，机制图逐步展开',
    teachingAids: '计算机多媒体设备、雨课堂',
    means: '课前推送预习问题，课中随堂测验 2 题',
    process: [
      { title: '导入：一位黑色素瘤患者的免疫治疗', minutes: 8, content: '展示病例：晚期黑色素瘤患者使用 PD-1 抑制剂后肿瘤缩小。提问：抗体并不直接杀伤肿瘤细胞，为什么有效？引出“T 细胞活化需要什么”。' },
      { title: 'T 细胞活化的双信号', minutes: 25, content: '第一信号：TCR 识别 pMHC，CD4/CD8 作为共受体。第二信号：CD28 与 B7（CD80/CD86）结合。只有第一信号会导致无能（anergy）。用“钥匙与点火”类比，并画出信号通路简图。' },
      { title: 'CD4+ T 细胞的分化', minutes: 20, content: 'IL-12、IFN-γ 诱导 Th1；IL-4 诱导 Th2；TGF-β 加 IL-6 诱导 Th17；TGF-β 加 IL-2 诱导 Treg。以表格对比各亚群的转录因子、主要细胞因子和功能。' },
      { title: 'CTL 的杀伤机制', minutes: 22, content: '效应 CTL 与靶细胞形成免疫突触，释放穿孔素和颗粒酶诱导凋亡；FasL 与 Fas 结合激活 caspase。强调杀伤具有抗原特异性、MHC I 类限制，且 CTL 可连续杀伤。' },
      { title: '回到病例与小结', minutes: 10, content: '解释 PD-1 与 PD-L1 结合抑制 T 细胞，阻断后恢复 CTL 功能；随堂测验 2 题；用一张流程图小结“识别—活化—分化—效应”。' },
      { title: '布置作业', minutes: 5, content: '阅读教材相关章节，完成随堂题中的简答题；思考：为什么 CTLA-4 抑制剂比 PD-1 抑制剂更容易引起自身免疫不良反应？' }
    ],
    advances: '免疫检查点抑制剂已成为多种实体瘤的标准治疗之一；CAR-T 细胞通过嵌合受体把抗原识别与共刺激信号整合在一条分子上。',
    improvement: ''
  }
)

const courseQuestions = buildQuestionSetMarkdown({
  title: '医学免疫学 · T 细胞介导的细胞免疫应答 随堂题',
  questions: [
    {
      type: 'single',
      stem: 'T 细胞活化的第二信号主要来自下列哪对分子的结合？',
      options: ['TCR 与 pMHC', 'CD28 与 B7', 'CD4 与 MHC II 类分子', 'PD-1 与 PD-L1', 'Fas 与 FasL'],
      answer: 'B',
      explanation: 'CD28 与抗原提呈细胞上的 B7（CD80/CD86）结合提供共刺激信号；TCR 与 pMHC 是第一信号，PD-1 与 PD-L1 传递抑制信号。',
      objective: 'T 细胞活化的双信号',
      difficulty: '基础'
    },
    {
      type: 'single',
      stem: '初始 CD4+ T 细胞在 TGF-β 和 IL-6 共同作用下主要分化为：',
      options: ['Th1', 'Th2', 'Th17', 'Treg', 'Tfh'],
      answer: 'C',
      explanation: 'TGF-β 与 IL-6 共同诱导 RORγt 表达，形成 Th17；只有 TGF-β 而缺少 IL-6 时倾向于形成 Treg。',
      objective: 'Th 亚群分化条件',
      difficulty: '中等'
    },
    {
      type: 'single',
      stem: '关于 CTL 杀伤靶细胞，下列说法错误的是：',
      options: ['受 MHC I 类分子限制', '可通过穿孔素和颗粒酶诱导靶细胞凋亡', '可通过 FasL 与 Fas 结合杀伤靶细胞', '一个 CTL 只能杀伤一个靶细胞', '杀伤具有抗原特异性'],
      answer: 'D',
      explanation: 'CTL 杀伤后与靶细胞分离，可继续杀伤其他靶细胞，即连续杀伤。',
      objective: 'CTL 杀伤机制',
      difficulty: '中等'
    },
    {
      type: 'short',
      stem: '简述只有第一信号而缺少第二信号时 T 细胞的结局及其生理意义。',
      points: [
        { point: '只有 TCR 信号、缺少 CD28 共刺激时，T 细胞不能充分活化', score: 2 },
        { point: '进入无能（anergy）状态或发生凋亡', score: 2 },
        { point: '意义：维持外周耐受，避免对自身抗原的应答', score: 1 }
      ],
      objective: 'T 细胞活化的双信号',
      difficulty: '中等'
    },
    {
      type: 'essay',
      stem: '结合 T 细胞活化的调控机制，论述 PD-1 抑制剂治疗肿瘤的原理及可能出现的不良反应。',
      points: [
        { point: 'T 细胞活化需要第一、第二信号，并受共抑制分子负调控', score: 2 },
        { point: '肿瘤细胞或微环境细胞表达 PD-L1，与 T 细胞上的 PD-1 结合，抑制其增殖和杀伤', score: 2 },
        { point: 'PD-1 抑制剂阻断这一结合，恢复肿瘤特异性 CTL 的功能', score: 2 },
        { point: '解除抑制也可能激活自身反应性 T 细胞，引起免疫相关不良反应，如肺炎、结肠炎、甲状腺炎', score: 2 },
        { point: '疗效与肿瘤抗原负荷、T 细胞浸润程度等有关，并非所有患者都有效', score: 2 }
      ],
      objective: '共抑制分子与肿瘤免疫治疗',
      difficulty: '较难'
    }
  ]
})

const EXAMPLE_PAPER_NAME = '示例论文（虚构，仅供演示）'

const topicLiteratureReport = buildLiteratureReportMarkdown(
  {
    title: '三级淋巴结构与结直肠癌免疫治疗应答（示例解读）',
    citation: '示例作者等，示例期刊，2025（虚构论文，仅供演示）',
    answer: '',
    researchQuestion: '结直肠癌组织中三级淋巴结构（TLS）的数量和成熟度，是否与患者接受 PD-1 抑制剂后的应答相关？',
    methods: '回顾性队列：收集接受 PD-1 抑制剂治疗的结直肠癌患者治疗前的肿瘤切片，用 CD20、CD3、CD21 多重免疫荧光识别 TLS 并按有无生发中心分为成熟与不成熟；按 RECIST 标准评估疗效，并用多因素回归校正微卫星状态等因素。',
    figures: [
      { label: '图 1', finding: '应答者肿瘤边缘的 TLS 密度高于无应答者。', interpretation: 'TLS 可能是局部抗肿瘤免疫活跃的标志，但单看密度不能区分因果。' },
      { label: '图 2', finding: '含生发中心的成熟 TLS 与应答的关联强于不成熟 TLS。', interpretation: '提示 B 细胞在生发中心的活化可能参与支持 T 细胞应答。' },
      { label: '图 3', finding: '校正微卫星状态后，成熟 TLS 仍与应答独立相关。', interpretation: 'TLS 的预测作用不完全由高突变负荷解释，值得前瞻性验证。' }
    ],
    conclusions: '成熟 TLS 与 PD-1 抑制剂应答相关，可能作为疗效预测指标；其中 B 细胞的作用需要机制研究证实。',
    limitations: ['回顾性单中心样本，存在选择偏倚。', 'TLS 判读依赖切片位置，可能低估或高估数量。', '没有机制实验，不能说明 TLS 导致应答。']
  },
  { name: EXAMPLE_PAPER_NAME, text: '', source: 'fulltext' },
  ''
)

const topicGrantDraft = [
  '# 三级淋巴结构中 B 细胞促进结直肠癌免疫治疗应答的机制（立项依据提纲）',
  '',
  '## 一、科学问题',
  '',
  '结直肠癌中成熟三级淋巴结构（TLS）与 PD-1 抑制剂应答相关，但 TLS 中的 B 细胞如何影响肿瘤特异性 T 细胞的功能尚不清楚。本课题拟回答：TLS 中的 B 细胞是否通过抗原提呈和共刺激增强 CD8+ T 细胞的抗肿瘤功能？',
  '',
  '## 二、研究内容',
  '',
  '### （一）结直肠癌 TLS 中 B 细胞亚群的组成与分布',
  '',
  '比较应答者与无应答者肿瘤组织中 TLS 内 B 细胞亚群的组成和空间位置。',
  '',
  '### （二）TLS 中 B 细胞对 CD8+ T 细胞功能的影响',
  '',
  '检测 B 细胞的抗原提呈和共刺激分子表达，评估其对 CD8+ T 细胞增殖和杀伤的作用。',
  '',
  '### （三）B 细胞缺失对 PD-1 抑制剂疗效的影响',
  '',
  '在小鼠结直肠癌模型中去除 B 细胞，观察 PD-1 抑制剂的疗效变化。',
  '',
  '## 三、技术路线',
  '',
  '1. 收集临床样本，用多重免疫荧光和空间转录组分析 TLS 中 B 细胞亚群的组成与分布。',
  '2. 分选 TLS 来源的 B 细胞与 CD8+ T 细胞共培养，检测抗原提呈和共刺激分子表达，评估 B 细胞对 CD8+ T 细胞增殖和杀伤功能的影响。',
  '3. 在小鼠结直肠癌模型中用抗 CD20 抗体去除 B 细胞，比较 PD-1 抑制剂疗效，检测肿瘤内 CD8+ T 细胞的变化。',
  '',
  '## 四、创新点',
  '',
  '1. 从 TLS 中 B 细胞的空间位置出发，解释成熟 TLS 预测免疫治疗应答的原因。',
  '2. 把临床队列观察与动物模型中的功能验证联系起来，为联合治疗提供依据。',
  '',
  '## 五、参考文献',
  '',
  '（示例中不列文献。实际撰写时，智研助手会到 PubMed 核验引用的 PMID 和 DOI。）',
  ''
].join('\n')

export const EXAMPLE_PROJECTS: readonly ExampleProject[] = [
  {
    id: 'course-example-immunology',
    type: 'teaching',
    brief: {
      courseName: '医学免疫学（示例）',
      chapter: '第九章 T 细胞介导的细胞免疫应答',
      audience: '临床医学本科二年级',
      hours: '2 学时',
      major: '临床医学',
      goals: '掌握 T 细胞活化的双信号和 CTL 杀伤机制，理解免疫检查点抑制剂的原理。',
      glossary: '细胞毒性 T 细胞 CTL\n共刺激分子 costimulatory molecule\n无能 anergy'
    },
    artifacts: [
      { kind: 'lesson-plan', toolId: 'syllabus', title: '医学免疫学 · 第九章 T 细胞介导的细胞免疫应答 教案', fileName: 'T 细胞介导的细胞免疫应答 教案.md', stage: '示例', markdown: withNote(courseLessonPlan) },
      { kind: 'question-set', toolId: 'quiz', title: 'T 细胞介导的细胞免疫应答 随堂题', fileName: 'T 细胞介导的细胞免疫应答 随堂题.md', stage: '示例', markdown: withNote(courseQuestions) }
    ]
  },
  {
    id: 'topic-example-tls',
    type: 'research',
    brief: {
      title: '三级淋巴结构中 B 细胞与结直肠癌免疫治疗（示例）',
      question: 'TLS 中的 B 细胞是否增强 CD8+ T 细胞的抗肿瘤功能，从而促进 PD-1 抑制剂应答？',
      hypothesis: 'TLS 中的 B 细胞通过抗原提呈和共刺激增强肿瘤特异性 CD8+ T 细胞的功能。',
      keyTerms: '三级淋巴结构 TLS\nPD-1 抑制剂\nCD8+ T 细胞',
      target: '国自然面上项目'
    },
    artifacts: [
      { kind: 'literature-report', toolId: 'literature', title: '三级淋巴结构与结直肠癌免疫治疗应答（示例解读）', fileName: 'TLS 与免疫治疗应答 文献报告.md', stage: '示例', markdown: withNote(topicLiteratureReport) },
      { kind: 'document', toolId: 'write', title: '立项依据提纲（示例）', fileName: '立项依据提纲.md', stage: '示例', markdown: withNote(topicGrantDraft) }
    ]
  }
]

export function isExampleProjectId(id: string | null | undefined): boolean {
  return EXAMPLE_PROJECTS.some((project) => project.id === id)
}
