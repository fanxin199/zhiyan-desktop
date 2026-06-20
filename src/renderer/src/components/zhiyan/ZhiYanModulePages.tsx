import { useState, useRef, type ReactElement } from 'react'
import {
  GraduationCap,
  Presentation,
  PenTool,
  Search,
  BookOpen,
  Microscope,
  FolderOpen,
  Upload,
  Trash2,
  Check,
  FileText,
  Loader2,
  AlertCircle,
  CheckCircle2,
  type LucideIcon
} from 'lucide-react'
import { extractPdfText, type PdfExtractResult } from '@renderer/lib/pdf-text-extractor'
import { CoursewarePage } from './CoursewarePage'
import { TextbookWorkbenchPage } from './TextbookWorkbenchPage'

type ModulePageProps = {
  onStartChat: (prompt: string, options?: { workspaceRoot?: string }) => void
  className?: string
}

type ModuleConfig = {
  icon: LucideIcon
  title: string
  subtitle: string
  gradient: string
  features: Array<{
    title: string
    description: string
  }>
  quickPrompts: string[]
  comingSoon?: boolean
}

function ModulePageShell({
  config,
  onStartChat,
  className = ''
}: {
  config: ModuleConfig
  onStartChat: (prompt: string) => void
  className?: string
}): ReactElement {
  const Icon = config.icon

  return (
    <div className={`flex h-full flex-col overflow-y-auto bg-ds-main ${className}`}>
      <div className="mx-auto w-full max-w-3xl px-6 py-8 sm:px-8 md:px-12">
        {/* Module Header */}
        <div className="mb-8 flex items-center gap-4">
          <div className={`flex h-14 w-14 items-center justify-center rounded-2xl ${config.gradient}`}>
            <Icon className="h-7 w-7 text-white" strokeWidth={1.8} />
          </div>
          <div>
            <h1 className="text-[24px] font-bold text-ds-text">{config.title}</h1>
            <p className="text-[14px] text-ds-muted">{config.subtitle}</p>
          </div>
        </div>

        {config.comingSoon ? (
          <div className="mt-12 flex flex-col items-center justify-center text-center">
            <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-ds-card shadow-sm border border-ds-border-muted">
              <Icon className="h-10 w-10 text-ds-faint" strokeWidth={1.5} />
            </div>
            <h2 className="text-[18px] font-semibold text-ds-text">功能即将开放</h2>
            <p className="mt-2 max-w-md text-[14px] text-ds-muted">
              此模块正在开发中，敬请期待。您可以先通过 AI 对话来使用相关功能。
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Features Grid */}
            {config.features && config.features.length > 0 && (
              <div className="space-y-4">
                <h3 className="text-[14px] font-semibold text-accent flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-accent"></span>
                  核心功能特点
                </h3>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {config.features.map((feature, idx) => (
                    <div
                      key={idx}
                      className="rounded-xl border border-ds-border-muted bg-ds-card p-4 space-y-1 hover:border-accent/30 hover:shadow-sm transition-all"
                    >
                      <h4 className="text-[13.5px] font-semibold text-ds-text">{feature.title}</h4>
                      <p className="text-[12.5px] text-ds-muted">{feature.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Quick Prompts */}
            {config.quickPrompts && config.quickPrompts.length > 0 && (
              <div className="space-y-4">
                <h3 className="text-[14px] font-semibold text-accent flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-accent"></span>
                  快捷任务入口
                </h3>
                <div className="space-y-2.5">
                  {config.quickPrompts.map((prompt, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => onStartChat(prompt)}
                      className="w-full text-left rounded-xl border border-ds-border-muted bg-ds-card px-4 py-3 text-[13.5px] text-ds-text hover:border-accent/40 hover:bg-accent/5 transition-all shadow-sm flex items-center justify-between group"
                    >
                      <span className="truncate pr-4">{prompt}</span>
                      <span className="text-ds-faint group-hover:text-accent font-medium text-[12px] shrink-0 transition-colors flex items-center gap-1">
                        立即执行 &rarr;
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

const PPT_CONFIG: ModuleConfig = {
  icon: Presentation,
  title: '课件 PPT 生成',
  subtitle: '上传教材或讲义 PDF，AI 自动生成教学课件',
  gradient: 'bg-gradient-to-br from-purple-600 to-purple-800',
  features: [
    { title: 'PDF 解析', description: '自动识别教材章节结构和核心内容' },
    { title: '智能配图', description: 'AI 生成配套教学示意图' },
    { title: '多种模板', description: '内置多套学术风格 PPT 模板' },
    { title: '导出 PPTX', description: '直接导出可编辑的 .pptx 文件' }
  ],
  quickPrompts: [
    '帮我把上传的 PDF 教材转化为教学用的 PPT 课件',
    '帮我制作一个关于"T细胞免疫应答"的20页教学PPT',
    '将我的实验方案制作成组会汇报用的PPT'
  ]
}

const PAPER_CONFIG: ModuleConfig = {
  icon: PenTool,
  title: '科研文本写作',
  subtitle: '自然基金、论文、综述和长文档的上下文感知写作与润色',
  gradient: 'bg-gradient-to-br from-rose-600 to-rose-800',
  features: [
    { title: '项目主线 Blueprint', description: '先固定科学问题、核心假说、研究目的和术语表，再开始写作' },
    { title: '逐段写作', description: '每次只处理一个部分，自动承接上一节并限制下一节内容' },
    { title: '断点续写', description: '用 STATUS 记录进度、已完成小节和下一步，避免跨对话写偏' },
    { title: '证据边界', description: '区分用户数据、文献事实、机制推断和待验证假设' }
  ],
  quickPrompts: [
    '请先帮我建立一个基金/论文写作 Blueprint：包括项目主线、科学问题、核心假说、研究目的、术语表和各章节写作边界。确认后再逐段写作。',
    '帮我按上下文逐段优化这篇英文论文。每处理一个 Results 或 Discussion 小节前都要读取全文主线、上一节摘要和本节目的，完成后生成本节摘要卡片。',
    '帮我把这段中文科研文本改写成英文论文表达。不要逐句翻译，先判断它在全文中的功能，再保持科学含义和作者语气进行改写。'
  ]
}

const LITERATURE_CONFIG: ModuleConfig = {
  icon: Search,
  title: '文献阅读',
  subtitle: '单篇精读、多篇证据整理和文献汇报 PPT 制作',
  gradient: 'bg-gradient-to-br from-amber-600 to-amber-800',
  features: [
    { title: '文献精读', description: '围绕科学问题、模型、方法、结果、图表和局限性拆解单篇论文' },
    { title: '图表解读', description: '先读全文和图注，再逐图解释证据链，而不是只概括摘要' },
    { title: '汇报 PPT', description: '将论文转化为研究生组会或课题组汇报的页面结构' },
    { title: '证据核实', description: '联网核实 PMID、DOI、年份、期刊和临床试验信息' }
  ],
  quickPrompts: [
    '请对我上传的 PDF 做文献精读：按研究问题、实验设计、关键图、主要结论、局限性和对我课题的启发来整理。',
    '请把这篇文献做成研究生组会汇报 PPT 大纲，包含背景、科学问题、每个主图的讲解、创新点、局限性和讨论问题。',
    '请围绕 B 细胞亚群、TLS 和肿瘤免疫治疗反应检索最新文献，区分综述、原始研究和临床队列证据，并列出 PMID/DOI。'
  ]
}

const REVIEW_CONFIG: ModuleConfig = {
  icon: Search,
  title: '综述撰写',
  subtitle: '围绕科研问题完成文献框架、证据链整理和分段综述初稿',
  gradient: 'bg-gradient-to-br from-cyan-600 to-cyan-800',
  features: [
    { title: '主题框架', description: '从研究问题生成综述章节结构与论证主线' },
    { title: '证据组织', description: '按机制、模型、疾病场景和技术路线整理文献' },
    { title: '初稿生成', description: '生成符合生物医学期刊风格的综述段落' },
    { title: '争议梳理', description: '明确证据等级、替代解释和未解决问题' }
  ],
  quickPrompts: [
    '帮我设计一篇关于 B 细胞亚群在肿瘤免疫中作用的综述 Blueprint，先明确中心论点、章节逻辑和每节边界。',
    '围绕 TLS、浆细胞和免疫治疗反应整理综述大纲，并标出哪些结论有实验证据、哪些只是相关性支持。',
    '帮我把这些文献组织成综述的段落链条，每次只写一个小节，写完后生成摘要卡片和下一节承接点。'
  ]
}

const GRANT_CONFIG: ModuleConfig = {
  icon: PenTool,
  title: '自然基金撰写',
  subtitle: '辅助撰写国自然申请书的立项依据、研究内容和技术路线',
  gradient: 'bg-gradient-to-br from-orange-600 to-orange-800',
  features: [
    { title: '立项依据', description: '建立科学问题、研究现状、创新点之间的证据链' },
    { title: '研究内容', description: '拆解目标、假说、关键实验和预期结果' },
    { title: '技术路线', description: '把实验设计转化为清晰可执行的路线图' },
    { title: '风险替代', description: '补充技术风险、替代方案和可行性论证' }
  ],
  quickPrompts: [
    '请先为我的国自然项目建立写作 Blueprint：题目、科学问题、核心假说、研究目的、三项研究内容、技术路线和创新边界。',
    '在已确认 Blueprint 的基础上，只撰写立项依据部分。要求围绕研究主线展开，关键论点补充 PMID，写完后暂停等待我确认。',
    '帮我修改基金申请书的创新点，要求先判断每个创新点是否与科学问题和研究内容对应，避免空泛表述。'
  ]
}

const TEXTBOOK_CONFIG: ModuleConfig = {
  icon: BookOpen,
  title: '教材与基金撰写',
  subtitle: 'AI 辅助撰写教材章节、基金申请书和学术综述',
  gradient: 'bg-gradient-to-br from-teal-600 to-teal-800',
  features: [
    { title: '教材写作', description: '按章节结构撰写教材内容' },
    { title: '国自然申请', description: '辅助撰写国家自然科学基金申请书' },
    { title: '综述写作', description: 'IMRaD 框架学术综述撰写' },
    { title: '全文连贯', description: '跨章节术语一致性和逻辑检查' }
  ],
  quickPrompts: [
    '帮我撰写国自然面上项目的立项依据部分，研究方向是肿瘤免疫微环境',
    '帮我写教材《免疫学》第三章"免疫应答"的内容',
    '帮我撰写一篇关于 scRNA-seq 在肿瘤研究中应用的综述文章'
  ]
}

const BIOINFORMATICS_CONFIG: ModuleConfig = {
  icon: Microscope,
  title: '下游数据分析',
  subtitle: '基于整理好的 bulk mRNA 和单细胞数据做可视化、解释和报告',
  gradient: 'bg-gradient-to-br from-emerald-600 to-emerald-800',
  features: [
    { title: 'bulk mRNA 下游可视化', description: '从表达矩阵、分组表或差异结果生成 PCA、火山图、热图和富集图' },
    { title: '单细胞下游可视化', description: '从 h5ad/注释表/marker 表生成 UMAP、比例图、dotplot 和 violin 图' },
    { title: '免疫学解释框架', description: '重点支持 B 细胞亚群、TLS、浆细胞、Tfh/Tfr 和免疫治疗反应解释' },
    { title: '可复现交付', description: '输出图表、参数、代码、结果解释和可能陷阱，不从原始 FASTQ 开始' }
  ],
  quickPrompts: [
    '我有整理好的 bulk mRNA 差异分析结果表。请先检查列名和阈值，再生成火山图、差异基因热图、GO/KEGG 富集图和免疫学解释报告。',
    '我有整理好的单细胞 h5ad 或细胞注释表。请做下游可视化：UMAP、细胞比例、B 细胞亚群 marker dotplot、violin 图，并说明哪些结论只是转录特征推断。',
    '请围绕肿瘤免疫中的 B 细胞/TLS 主题，对我提供的基因列表或 marker 表做通路富集和可视化，报告背景基因集、FDR 和解释边界。'
  ]
}

const FILE_MANAGER_CONFIG: ModuleConfig = {
  icon: FolderOpen,
  title: '文件管理',
  subtitle: '管理您的项目文件夹，预览和操作各类文档',
  gradient: 'bg-gradient-to-br from-slate-600 to-slate-700',
  features: [
    { title: '文件预览', description: '预览 PDF、Word、Excel、图片等文件' },
    { title: 'AI 分析', description: '选择文件让 AI 进行分析和处理' },
    { title: '批量操作', description: '批量导出、格式转换' },
    { title: '工作区管理', description: '创建和管理项目文件夹' }
  ],
  quickPrompts: [
    '帮我整理当前文件夹中的论文文件',
    '将文件夹中的所有 PDF 文件提取摘要',
    '帮我把这份 Word 文档转换为 PDF 格式'
  ]
}

// ── Exported Module Pages ──────────────────────────────────────────

const REFERENCE_LESSON_PLAN_TEMPLATE = `________ ________ 教案

+------------------------------+------------------+-------------------------------------------+
| 学科系：________             | 授课教师：______ | 授课时间：[年月日 节次 班次]               |
+==============================+==================+===========================================+

+:------------------:+---------------------------------------------------------------------------------------------+
| **授课题目**       | **[根据内容源填写实际章节题目]**                                                            |
+--------------------+---------------------------------------------------------------+-----------------------------+
| **课程名称**       | [课程名称]                                                    | **计划学时** | [X学时]      |
+--------------------+---------------------------------------------------------------+--------------+--------------+
| **授课对象**       | [年级]                                                        | **专 业**    | [专业]       |
+--------------------+-------------------------------+-------------------------------------------------------------+
| **教材和参考资料** | **教材**                      |                                                             |
|                    +-------------------------------+-------------------------------------------------------------+
|                    | **参考资料**                  |                                                             |
+--------------------+-------------------------------+-------------------------------------------------------------+
| **教学目的**       | 知识层面：                                                                                  |
|                    | 1. [从内容源提炼：掌握XXX]                                                                  |
| **与要求**         | 2. [从内容源提炼：熟悉XXX]                                                                  |
|                    | 3. [从内容源提炼：了解XXX]                                                                  |
|                    | 拓展层面：                                                                                  |
|                    | [从内容源提炼拓展内容]                                                                      |
+--------------------+-------------------------------+-------------------------------------------------------------+
| **教学重点**       | **重点**                      | [从内容源分析重点，列2-3条]                                 |
| **难点分析**       +-------------------------------+-------------------------------------------------------------+
|                    | **难点**                      | [从内容源分析难点，列1-2条]                                 |
+--------------------+-------------------------------+-------------------------------------------------------------+
| **教学对象分析**   | [根据授课对象信息分析学生知识基础]                                                          |
+--------------------+-------------------------------+-------------------------------------------------------------+
| **教学方法**       | **教学方法**                  | [根据教学方法偏好填写]                                      |
| **与组织**         +-------------------------------+-------------------------------------------------------------+
|                    | **教学用具**                  | 计算机多媒体设备                                            |
|                    +-------------------------------+-------------------------------------------------------------+
|                    | **教学手段**                  | [填写教学手段]                                              |
|                    +-------------------------------+-------------------------------------------------------------+
|                    | **教学内容时间分配**          | [根据内容源结构和计划学时合理分配]                           |
|                    |                               | 1. [模块1]（X分钟）                                         |
|                    |                               | 2. [模块2]（X分钟）                                         |
|                    |                               | 3. [模块3]（X分钟）                                         |
+--------------------+-------------------------------+-------------------------------------------------------------+
| **教学设计**       | [根据内容源设计教学流程]                                                                    |
| **与教学手段**     |                                                                                             |
+--------------------+---------------------------------------------------------------------------------------------+
| **新进展内容**     | [根据内容源填写本领域最新进展]                                                              |
+--------------------+---------------------------------------------------------------------------------------------+
| **教学改进**       | [填写教学改进措施]                                                                          |
+--------------------+---------------------------------------------------------------------------------------------+`

const METHODS = ['讲授法', '案例教学法', '问题引导法', '启发式教学', '小组讨论法', '实验演示']
const FOCUS_AREAS = ['临床新进展', '思政教育与拓展', '学术前沿与创新', '基础理论强化']

const getDirectoryPath = (filePath: string): string => {
  const lastIndex = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'))
  if (lastIndex === -1) return ''
  return filePath.substring(0, lastIndex)
}

export function SyllabusPage({ onStartChat, className = '' }: ModulePageProps): ReactElement {
  // Form fields state
  const [teacher, setTeacher] = useState('')
  const [courseName, setCourseName] = useState('')
  const [topic, setTopic] = useState('')
  const [hours, setHours] = useState('')
  const [students, setStudents] = useState('')
  const [major, setMajor] = useState('')
  const [school, setSchool] = useState('')
  const [department, setDepartment] = useState('')

  const [methods, setMethods] = useState<string[]>(['讲授法', '案例教学法', '问题引导法'])
  const [focusAreas, setFocusAreas] = useState<string[]>(['临床新进展'])

  const [sourceType, setSourceType] = useState<'text' | 'file'>('text')
  const [textSource, setTextSource] = useState('')
  const [selectedFile, setSelectedFile] = useState<{ name: string; path: string } | null>(null)

  // PDF 文本提取状态
  const [extractedContent, setExtractedContent] = useState<PdfExtractResult | null>(null)
  const [isExtracting, setIsExtracting] = useState(false)
  const [extractError, setExtractError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)

  const toggleMethod = (method: string) => {
    setMethods((prev) =>
      prev.includes(method) ? prev.filter((m) => m !== method) : [...prev, method]
    )
  }

  const toggleFocusArea = (area: string) => {
    setFocusAreas((prev) =>
      prev.includes(area) ? prev.filter((a) => a !== area) : [...prev, area]
    )
  }

  const handlePickFile = async () => {
    const dsGui = (window as any).dsGui
    if (!dsGui?.pickFile) {
      setFormError('当前环境不支持文件选择对话框')
      return
    }
    setFormError(null)
    const result = await dsGui.pickFile({
      filters: [{ name: 'PDF / Word', extensions: ['pdf', 'doc', 'docx'] }]
    })
    if (result.canceled || !result.path) return

    const fullPath = result.path as string
    const fileName = fullPath.split(/[\\/]/).pop() || fullPath
    setSelectedFile({ name: fileName, path: fullPath })
    setExtractedContent(null)
    setExtractError(null)

    // 如果是 PDF 文件，立即提取文本内容
    if (fileName.toLowerCase().endsWith('.pdf')) {
      setIsExtracting(true)
      try {
        // 通过 IPC readFileBinary 协议读取本地文件为 Blob，再构造 File 对象
        const readResult = await dsGui.readFileBinary(fullPath)
        if (!readResult.ok) {
          throw new Error(readResult.message)
        }
        const binaryStr = atob(readResult.data)
        const bytes = new Uint8Array(binaryStr.length)
        for (let i = 0; i < binaryStr.length; i++) {
          bytes[i] = binaryStr.charCodeAt(i)
        }
        const file = new File([bytes], fileName, { type: 'application/pdf' })
        const extractResult = await extractPdfText(file)
        setExtractedContent(extractResult)
        if (extractResult.text.trim().length === 0) {
          setExtractError('PDF 文件中未提取到文本内容，可能是扫描版 PDF。请尝试使用文字版 PDF。')
        }
      } catch (err) {
        console.error('PDF extraction failed:', err)
        setExtractError('PDF 解析失败：' + (err instanceof Error ? err.message : String(err)))
      } finally {
        setIsExtracting(false)
      }
    }
  }

  // Keep legacy handler for drag-drop fallback
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const filePath = (file as any).path || file.name
    setSelectedFile({ name: file.name, path: filePath })
    setExtractedContent(null)
    setExtractError(null)

    if (file.name.toLowerCase().endsWith('.pdf')) {
      setIsExtracting(true)
      try {
        const result = await extractPdfText(file)
        setExtractedContent(result)
        if (result.text.trim().length === 0) {
          setExtractError('PDF 文件中未提取到文本内容，可能是扫描版 PDF。请尝试使用文字版 PDF。')
        }
      } catch (err) {
        console.error('PDF extraction failed:', err)
        setExtractError('PDF 解析失败：' + (err instanceof Error ? err.message : String(err)))
      } finally {
        setIsExtracting(false)
      }
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)

    let sourceDetail = ''
    let targetDocxPath = ''
    let sourceDir = ''
    const cleanTopic = (topic || '未命名').replace(/[\\/:*?"<>|]/g, '_')

    if (sourceType === 'file') {
      if (!selectedFile) {
        setFormError('请选择本地章节文件！')
        return
      }
      if (selectedFile.name.toLowerCase().endsWith('.pdf') && !extractedContent?.text?.trim()) {
        setFormError('PDF 文本提取尚未完成或未提取到内容，请等待提取完成后再提交。')
        return
      }
      sourceDetail = '本地文件路径：' + selectedFile.path
      // 源文件所在目录 = 教案输出目录
      sourceDir = getDirectoryPath(selectedFile.path)
      targetDocxPath = sourceDir
        ? sourceDir + '\\' + cleanTopic + '教案.docx'
        : cleanTopic + '教案.docx'
    } else {
      if (!textSource.trim()) {
        setFormError('请填写章节大纲或核心内容描述！')
        return
      }
      sourceDetail = textSource.trim()
      sourceDir = ''
      targetDocxPath = cleanTopic + '教案.docx'
    }

    // 构建内容源部分
    let contentSourceSection = ''
    if (sourceType === 'file' && extractedContent?.text?.trim()) {
      const truncationNote = extractedContent.truncated
        ? '\n\n> 注意：原 PDF 共 ' + extractedContent.pageCount + ' 页，因字符限制仅提取了前 ' + extractedContent.extractedPages + ' 页的内容。'
        : ''
      contentSourceSection = '以下是从用户上传的 PDF 文件「' + (selectedFile?.name || '') + '」中自动提取的完整教学内容（共 ' + extractedContent.pageCount + ' 页）：' + truncationNote + '\n\n' + extractedContent.text + '\n\n请基于上述提取的 PDF 内容编写教案。'
    } else if (sourceType === 'file') {
      contentSourceSection = '用户上传了文件「' + (selectedFile?.name || '') + '」，请使用 bash 工具通过 PowerShell 命令读取该文件内容：' + (selectedFile?.path || '')
    } else {
      contentSourceSection = '直接使用以下内容源进行编写：\n' + sourceDetail
    }

    // 学校、院系、教师：用户填了就用，没填就留空
    const schoolValue = school.trim()
    const departmentValue = department.trim()
    const teacherValue = teacher.trim()

    // 输出目录说明
    const outputDirNote = sourceDir
      ? '所有文件必须保存到源文件所在目录：' + sourceDir
      : '保存到当前工作目录'

    const promptParts: string[] = []
    promptParts.push('你是一个高校教学辅助AI，专门为大学教师生成标准教案。')
    promptParts.push('')
    promptParts.push('## 最重要的规则：')
    promptParts.push('1. 教案的全部教学内容必须且只能来自下方第2节"内容源"，但你需要提炼核心知识点，而非照搬原文。')
    promptParts.push('2. 第3节"格式模板"仅用于参考表格结构和排版样式，其中的占位文字不得作为教案内容。')
    promptParts.push('3. 教材和参考资料部分：只保留标题行，内容留白，由教师本人填写。')
    promptParts.push('')
    promptParts.push('## 内容精炼要求（极其重要）：')
    promptParts.push('- PDF 原文内容仅作为知识库，你必须从中提炼核心知识点、关键概念和教学要点。')
    promptParts.push('- 每个栏目的内容必须精练、概括性强，用教学语言重新组织，而非大段复制原文。')
    promptParts.push('- 教学目的/要求：3-5条，每条一句话概括。')
    promptParts.push('- 教学重点/难点：各列2-4个关键词或短句即可。')
    promptParts.push('- 教学内容摘要：按知识模块分点列出核心概念（每点1-2句），总字数控制在300-500字。')
    promptParts.push('- 教学过程设计：按时间段简要列出教学活动和知识点分配，不要写详细讲稿。')
    promptParts.push('- 整份教案总字数控制在1500-2500字以内。')
    promptParts.push('')
    promptParts.push('### 1. 教案基本信息：')
    promptParts.push('- 学校名称：' + (schoolValue || '（用户未填写，教案中此处留空）'))
    promptParts.push('- 学科系/院系：' + (departmentValue || '（用户未填写，教案中此处留空）'))
    promptParts.push('- 授课教师：' + (teacherValue || '（用户未填写，教案中此处留空）'))
    promptParts.push('- 课程名称：' + (courseName || '(请从内容源推断)'))
    promptParts.push('- 授课题目：' + (topic || '(请从内容源推断章节标题)'))
    promptParts.push('- 计划学时：' + (hours || '(请根据内容量合理设定)'))
    promptParts.push('- 授课对象：' + (students || '(请合理设定)'))
    promptParts.push('- 专 业：' + (major || '(请合理设定)'))
    promptParts.push('- 教学方法偏好：' + (methods.join('、') || '讲授法'))
    promptParts.push('- 拓展侧重点：' + (focusAreas.join('、') || '无'))
    promptParts.push('')
    promptParts.push('### 2. 内容源（教案的唯一内容来源，已自动提取，无需读取任何文件）：')
    promptParts.push(contentSourceSection)
    promptParts.push('')
    promptParts.push('### 3. 格式模板（仅参考排版结构）：')
    promptParts.push(REFERENCE_LESSON_PLAN_TEMPLATE)
    promptParts.push('')
    promptParts.push('### 4. 文件输出目录与 DOCX 导出（极其重要，必须严格执行）：')
    promptParts.push('')
    if (sourceDir) {
      promptParts.push('**输出目录（绝对路径）：' + sourceDir + '**')
      promptParts.push('')
      promptParts.push('操作步骤：')
      promptParts.push('1. 所有中间文件（.md）和最终文件（.docx）都必须保存到上述绝对路径目录，禁止保存到其他任何目录。')
      promptParts.push('2. 先用 write 工具将教案 Markdown 保存为：' + sourceDir + '\\' + cleanTopic + '教案.md')
      promptParts.push('3. 然后用 bash 工具执行 python-docx 脚本，将 .md 转为 .docx。')
      promptParts.push('4. 最终 DOCX 的完整绝对路径必须是：' + targetDocxPath)
      promptParts.push('5. 使用 bash 工具时，先 cd 到输出目录：cd "' + sourceDir + '"')
      promptParts.push('6. 成功后在回复开头写：已为您生成教案并保存为 Word 文件，路径为 ' + targetDocxPath)
      promptParts.push('')
      promptParts.push('WARNING: 不要将文件保存到 workspace 默认目录或任何其他目录，必须保存到 ' + sourceDir)
    } else {
      promptParts.push('1. 最终教案必须保存为 .docx 文件。')
      promptParts.push('2. 先用 write 工具保存 Markdown 为临时 .md 文件，再用 bash 执行 python-docx 脚本转为 .docx。')
      promptParts.push('3. 保存路径为 ' + targetDocxPath)
      promptParts.push('4. 成功后在回复开头写：已为您生成教案并保存为 Word 文件，路径为 ' + targetDocxPath)
    }
    promptParts.push('')
    promptParts.push('### 5. 内容编写指令：')
    promptParts.push('1. 从内容源中提炼核心知识点，用教学语言重新组织，不要照搬 PDF 原文。')
    promptParts.push('2. 每个教案栏目内容要精练概括，严格控制字数，整份教案1500-2500字。')
    if (schoolValue) {
      promptParts.push('3. 学校名称字段：填写"' + schoolValue + '"。')
    } else {
      promptParts.push('3. 学校名称字段：留空，不要写任何内容或提示符。')
    }
    if (departmentValue) {
      promptParts.push('4. 学科系/院系字段：填写"' + departmentValue + '"。')
    } else {
      promptParts.push('4. 学科系/院系字段：留空，不要写任何内容或提示符。')
    }
    if (teacherValue) {
      promptParts.push('5. 授课教师字段：填写"' + teacherValue + '"。')
    } else {
      promptParts.push('5. 授课教师字段：留空，不要写任何内容或提示符。')
    }
    promptParts.push('6. 教材和参考资料部分：只输出"教材："和"参考资料："的标题行，内容留白，由教师自行填写。')
    promptParts.push('7. 严格遵循格式模板的表格结构。')

    const prompt = promptParts.join('\n')

    // 将 PDF 所在目录作为 workspace 传递给 Kun agent
    onStartChat(prompt, sourceDir ? { workspaceRoot: sourceDir } : undefined)
  }

    return (
    <div className={`flex h-full flex-col overflow-y-auto bg-ds-main ${className}`}>
      <div className="mx-auto w-full max-w-3xl px-6 py-8 sm:px-8 md:px-12">
        {/* Module Header */}
        <div className="mb-6 flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-blue-800">
            <GraduationCap className="h-7 w-7 text-white" strokeWidth={1.8} />
          </div>
          <div>
            <h1 className="text-[24px] font-bold text-ds-text">智能教案生成</h1>
            <p className="text-[14px] text-ds-muted">AI 辅助生成符合规范的课程教案，可直接导出为 Word 文档</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {formError ? (
            <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[13px] leading-relaxed text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.8} />
              <span>{formError}</span>
            </div>
          ) : null}

          {/* Section 1: Basic Info */}
          <div className="rounded-xl border border-ds-border-muted bg-ds-card p-5 space-y-4">
            <h3 className="text-[14px] font-semibold text-accent flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-accent"></span>
              基本课程信息
            </h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
              <div>
                <label className="block text-[12.5px] font-semibold text-ds-text mb-1">授课教师</label>
                <input
                  type="text"
                  value={teacher}
                  onChange={(e) => setTeacher(e.target.value)}
                  className="w-full min-w-0 rounded-xl border border-ds-border bg-ds-card px-3 py-1.5 text-[13.5px] text-ds-ink shadow-sm focus:border-accent/40 focus:outline-none focus:ring-1 focus:ring-accent/30"
                  placeholder="如：张三"
                />
              </div>
              <div>
                <label className="block text-[12.5px] font-semibold text-ds-text mb-1">课程名称</label>
                <input
                  type="text"
                  value={courseName}
                  onChange={(e) => setCourseName(e.target.value)}
                  className="w-full min-w-0 rounded-xl border border-ds-border bg-ds-card px-3 py-1.5 text-[13.5px] text-ds-ink shadow-sm focus:border-accent/40 focus:outline-none focus:ring-1 focus:ring-accent/30"
                  placeholder="如：医学免疫学"
                />
              </div>
              <div>
                <label className="block text-[12.5px] font-semibold text-ds-text mb-1">授课题目</label>
                <input
                  type="text"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  className="w-full min-w-0 rounded-xl border border-ds-border bg-ds-card px-3 py-1.5 text-[13.5px] text-ds-ink shadow-sm focus:border-accent/40 focus:outline-none focus:ring-1 focus:ring-accent/30"
                  placeholder="如：第二十三章 移植免疫"
                />
              </div>
              <div>
                <label className="block text-[12.5px] font-semibold text-ds-text mb-1">计划学时</label>
                <input
                  type="text"
                  value={hours}
                  onChange={(e) => setHours(e.target.value)}
                  className="w-full min-w-0 rounded-xl border border-ds-border bg-ds-card px-3 py-1.5 text-[13.5px] text-ds-ink shadow-sm focus:border-accent/40 focus:outline-none focus:ring-1 focus:ring-accent/30"
                  placeholder="如：1学时（50分钟）"
                />
              </div>
              <div>
                <label className="block text-[12.5px] font-semibold text-ds-text mb-1">授课对象</label>
                <input
                  type="text"
                  value={students}
                  onChange={(e) => setStudents(e.target.value)}
                  className="w-full min-w-0 rounded-xl border border-ds-border bg-ds-card px-3 py-1.5 text-[13.5px] text-ds-ink shadow-sm focus:border-accent/40 focus:outline-none focus:ring-1 focus:ring-accent/30"
                  placeholder="如：2022级本科生"
                />
              </div>
              <div>
                <label className="block text-[12.5px] font-semibold text-ds-text mb-1">专 业</label>
                <input
                  type="text"
                  value={major}
                  onChange={(e) => setMajor(e.target.value)}
                  className="w-full min-w-0 rounded-xl border border-ds-border bg-ds-card px-3 py-1.5 text-[13.5px] text-ds-ink shadow-sm focus:border-accent/40 focus:outline-none focus:ring-1 focus:ring-accent/30"
                  placeholder="如：临床医学"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 pt-2 border-t border-ds-border-muted/50">
              <div>
                <label className="block text-[12.5px] font-semibold text-ds-text mb-1">学校名称</label>
                <input
                  type="text"
                  value={school}
                  onChange={(e) => setSchool(e.target.value)}
                  className="w-full min-w-0 rounded-xl border border-ds-border bg-ds-card px-3 py-1.5 text-[13.5px] text-ds-ink shadow-sm focus:border-accent/40 focus:outline-none focus:ring-1 focus:ring-accent/30"
                  placeholder="如：仙交大"
                />
              </div>
              <div>
                <label className="block text-[12.5px] font-semibold text-ds-text mb-1">学科系 / 院系</label>
                <input
                  type="text"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  className="w-full min-w-0 rounded-xl border border-ds-border bg-ds-card px-3 py-1.5 text-[13.5px] text-ds-ink shadow-sm focus:border-accent/40 focus:outline-none focus:ring-1 focus:ring-accent/30"
                  placeholder="如：基础医学院病原生物学与免疫学系"
                />
              </div>
            </div>
          </div>



          {/* Section 3: Preferences */}
          <div className="rounded-xl border border-ds-border-muted bg-ds-card p-5 space-y-4">
            <div>
              <h4 className="text-[13px] font-semibold text-ds-text mb-2">教学方法选择</h4>
              <div className="flex flex-wrap gap-2">
                {METHODS.map((method) => {
                  const selected = methods.includes(method)
                  return (
                    <button
                      key={method}
                      type="button"
                      onClick={() => toggleMethod(method)}
                      className={`px-3 py-1.5 rounded-full text-[12.5px] font-medium border transition-all ${
                        selected
                          ? 'bg-accent text-white border-accent'
                          : 'bg-ds-card text-ds-text border-ds-border-muted hover:border-accent/40 hover:bg-accent/5'
                      }`}
                    >
                      {method}
                    </button>
                  )
                })}
              </div>
            </div>

            <div>
              <h4 className="text-[13px] font-semibold text-ds-text mb-2">教学拓展与侧重</h4>
              <div className="flex flex-wrap gap-2">
                {FOCUS_AREAS.map((area) => {
                  const selected = focusAreas.includes(area)
                  return (
                    <button
                      key={area}
                      type="button"
                      onClick={() => toggleFocusArea(area)}
                      className={`px-3 py-1.5 rounded-full text-[12.5px] font-medium border transition-all ${
                        selected
                          ? 'bg-accent text-white border-accent'
                          : 'bg-ds-card text-ds-text border-ds-border-muted hover:border-accent/40 hover:bg-accent/5'
                      }`}
                    >
                      {area}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Section 4: Content Source */}
          <div className="rounded-xl border border-ds-border-muted bg-ds-card p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-ds-border-muted/50 pb-3">
              <h3 className="text-[14px] font-semibold text-accent flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-accent"></span>
                教案生成内容源
              </h3>
              <div className="flex bg-ds-main p-1 rounded-lg border border-ds-border-muted">
                <button
                  type="button"
                  onClick={() => setSourceType('text')}
                  className={`px-3 py-1 rounded-md text-[12px] font-medium transition-all ${
                    sourceType === 'text'
                      ? 'bg-ds-card text-ds-text shadow-sm'
                      : 'text-ds-muted hover:text-ds-text'
                  }`}
                >
                  手动输入大纲
                </button>
                <button
                  type="button"
                  onClick={() => setSourceType('file')}
                  className={`px-3 py-1 rounded-md text-[12px] font-medium transition-all ${
                    sourceType === 'file'
                      ? 'bg-ds-card text-ds-text shadow-sm'
                      : 'text-ds-muted hover:text-ds-text'
                  }`}
                >
                  选择本地文件
                </button>
              </div>
            </div>

            {sourceType === 'text' ? (
              <div>
                <textarea
                  value={textSource}
                  onChange={(e) => setTextSource(e.target.value)}
                  rows={4}
                  className="w-full min-w-0 rounded-xl border border-ds-border bg-ds-card px-3 py-2 text-[13.5px] text-ds-ink shadow-sm focus:border-accent/40 focus:outline-none focus:ring-1 focus:ring-accent/30 resize-y"
                  placeholder="请在此处粘贴本章的大纲结构、核心知识点、PPT大纲或要求生成教案的简短描述（例如：第一节 移植免疫概述；第二节 同种异型移植排斥反应机制；第三节 移植排斥反应的临床类型与特点）..."
                  required={sourceType === 'text'}
                />
              </div>
            ) : (
              <div className="space-y-3">
                <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  onChange={handleFileChange}
                  accept=".pdf,.doc,.docx"
                />
                {!selectedFile ? (
                  <div
                    onClick={handlePickFile}
                    className="flex flex-col items-center justify-center border border-dashed border-ds-border-muted rounded-xl p-8 bg-ds-card hover:border-accent/40 hover:bg-accent/5 transition-all cursor-pointer group"
                  >
                    <Upload className="h-8 w-8 text-ds-faint mb-2 group-hover:text-accent transition-colors" />
                    <p className="text-[13.5px] text-ds-text font-medium">点击选择本地 PDF 或 Word 章节文件</p>
                    <p className="text-[11.5px] text-ds-muted mt-1">AI 将自动读取并根据文件内容为您制作规范教案</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between border border-ds-border-muted rounded-xl p-4 bg-ds-card">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="p-2 rounded-lg bg-accent/10">
                          <FileText className="h-5 w-5 text-accent" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[13.5px] font-semibold text-ds-text truncate">{selectedFile.name}</p>
                          <p className="text-[11.5px] text-ds-muted truncate">{selectedFile.path}</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedFile(null)
                          setExtractedContent(null)
                          setExtractError(null)
                          if (fileInputRef.current) fileInputRef.current.value = ''
                        }}
                        className="p-1.5 rounded-lg text-ds-muted hover:text-red-500 hover:bg-red-500/10 transition-colors"
                      >
                        <Trash2 className="h-4.5 w-4.5" />
                      </button>
                    </div>

                    {/* PDF 提取状态显示 */}
                    {isExtracting && (
                      <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-[12.5px] text-blue-600">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>正在提取 PDF 文本内容，请稍候...</span>
                      </div>
                    )}
                    {extractError && (
                      <div className="flex items-start gap-2 px-4 py-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-[12.5px] text-red-600">
                        <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                        <span>{extractError}</span>
                      </div>
                    )}
                    {extractedContent && !extractError && (
                      <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-green-500/10 border border-green-500/20 text-[12.5px] text-green-600">
                        <CheckCircle2 className="h-4 w-4 shrink-0" />
                        <span>
                          已成功提取 PDF 内容：共 {extractedContent.pageCount} 页，
                          提取 {extractedContent.extractedPages} 页，
                          {extractedContent.text.length.toLocaleString()} 字符
                          {extractedContent.truncated && '（已达字符上限，部分内容被截断）'}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Submit button */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={isExtracting}
              className={`w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-blue-800 text-white font-medium py-3 px-4 shadow hover:opacity-95 hover:shadow-md transition-all text-[15px] ${isExtracting ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {isExtracting ? (
                <><Loader2 className="h-5 w-5 animate-spin" /> PDF 内容提取中...</>
              ) : (
                <><Check className="h-5 w-5" strokeWidth={2} /> 开始生成智能教案</>
              )}
            </button>
            <p className="text-center text-[12px] text-ds-muted mt-2">
              系统将根据您填写的参数与上传内容自动进入 AI 对话界面，为您量身定制规范教案
            </p>
          </div>
        </form>
      </div>
    </div>
  )
}

export function PptGenPage(props: ModulePageProps): ReactElement {
  return <CoursewarePage className={props.className} />
}

export function PaperPolishPage(props: ModulePageProps): ReactElement {
  return <ModulePageShell config={PAPER_CONFIG} {...props} />
}

export function LiteraturePage(props: ModulePageProps): ReactElement {
  return <ModulePageShell config={LITERATURE_CONFIG} {...props} />
}

export function ReviewWritingPage(props: ModulePageProps): ReactElement {
  return <ModulePageShell config={REVIEW_CONFIG} {...props} />
}

export function GrantWritingPage(props: ModulePageProps): ReactElement {
  return <ModulePageShell config={GRANT_CONFIG} {...props} />
}

export function TextbookPage(props: ModulePageProps): ReactElement {
  return <TextbookWorkbenchPage className={props.className} />
}

export function BioinformaticsPage(props: ModulePageProps): ReactElement {
  return <ModulePageShell config={BIOINFORMATICS_CONFIG} {...props} />
}

export function FileManagerPage(props: ModulePageProps): ReactElement {
  return <ModulePageShell config={FILE_MANAGER_CONFIG} {...props} />
}
