import {
  Award,
  BookOpen,
  FileText,
  FolderOpen,
  GraduationCap,
  Home,
  MessageCircle,
  Microscope,
  PenTool,
  Presentation,
  ScrollText,
  Search,
  type LucideIcon
} from 'lucide-react'

export type ZhiYanModuleSectionId = 'teaching' | 'research' | 'capabilities'

export type ZhiYanCapabilityDependency =
  | 'core-navigation'
  | 'ai'
  | 'workspace-files'
  | 'document-reading'
  | 'web-research'
  | 'native-docx-export'
  | 'native-pptx-export'
  | 'write-workspace'
  | 'python-base'
  | 'python-bioinformatics'

type ZhiYanDashboardDefinition = {
  title: string
  gradient: string
}

type ZhiYanModuleDefinition = {
  id: string
  icon: LucideIcon
  sidebarLabel: string
  section: ZhiYanModuleSectionId | null
  taskDescription: string
  keywords: readonly string[]
  requiredCapabilities: readonly ZhiYanCapabilityDependency[]
  showInSidebar: boolean
  dashboard?: ZhiYanDashboardDefinition
}

export const ZHIYAN_MODULE_SECTIONS = [
  { id: 'teaching', label: '教学', dashboardLabel: '教学工具' },
  { id: 'research', label: '科研', dashboardLabel: '科研工具' },
  { id: 'capabilities', label: '能力中心', dashboardLabel: '能力中心' }
] as const satisfies ReadonlyArray<{
  id: ZhiYanModuleSectionId
  label: string
  dashboardLabel: string
}>

export const ZHIYAN_MODULE_REGISTRY = [
  {
    id: 'dashboard',
    icon: Home,
    sidebarLabel: '工作台',
    section: null,
    taskDescription: '查看最近使用、搜索功能并获得下一步任务推荐。',
    keywords: ['工作台', '首页', '最近使用', '搜索', '推荐'],
    requiredCapabilities: ['core-navigation'],
    showInSidebar: true
  },
  {
    id: 'syllabus',
    icon: GraduationCap,
    sidebarLabel: '智能教案',
    section: 'teaching',
    taskDescription: '根据课程信息或章节内容，AI 辅助生成规范教案',
    keywords: ['教案', '教学设计', '课程', '授课', '章节', 'Word', 'DOCX'],
    requiredCapabilities: ['ai', 'workspace-files', 'document-reading', 'native-docx-export'],
    showInSidebar: true,
    dashboard: { title: '智能教案', gradient: 'bg-gradient-to-br from-blue-600 to-blue-800' }
  },
  {
    id: 'ppt-gen',
    icon: Presentation,
    sidebarLabel: '课件 PPT',
    section: 'teaching',
    taskDescription: '上传教材 PDF，自动生成教学课件',
    keywords: ['课件', 'PPT', '幻灯片', '教材', 'PDF', '讲稿', '教学'],
    requiredCapabilities: ['ai', 'workspace-files', 'document-reading', 'native-pptx-export'],
    showInSidebar: true,
    dashboard: { title: '制作课件 PPT', gradient: 'bg-gradient-to-br from-purple-600 to-purple-800' }
  },
  {
    id: 'textbook',
    icon: BookOpen,
    sidebarLabel: '教材编写',
    section: 'teaching',
    taskDescription: 'AI 辅助撰写教材章节，保持教学主线和术语一致',
    keywords: ['教材', '章节', '编写', '讲义', '课程建设', '教学材料'],
    requiredCapabilities: ['ai', 'workspace-files', 'document-reading', 'native-docx-export'],
    showInSidebar: true,
    dashboard: { title: '教材编写', gradient: 'bg-gradient-to-br from-teal-600 to-teal-800' }
  },
  {
    id: 'paper-polish',
    icon: PenTool,
    sidebarLabel: '文本写作',
    section: 'research',
    taskDescription: '自然基金、论文润色和长文档分段写作，先锁定项目主线',
    keywords: ['论文', '基金', '写作', '润色', '文本', '英文', '中文', 'Discussion', 'Results', '蓝图'],
    requiredCapabilities: ['ai', 'workspace-files', 'document-reading', 'write-workspace'],
    showInSidebar: true,
    dashboard: { title: '文本写作', gradient: 'bg-gradient-to-br from-rose-600 to-rose-800' }
  },
  {
    id: 'literature',
    icon: Search,
    sidebarLabel: '文献阅读',
    section: 'research',
    taskDescription: '文献精读、关键图解读和组会汇报 PPT 制作',
    keywords: ['文献', 'PDF', '论文', '精读', '阅读', '图表', '组会', 'Journal Club', 'PMID', 'DOI'],
    requiredCapabilities: ['ai', 'workspace-files', 'document-reading', 'web-research'],
    showInSidebar: true,
    dashboard: { title: '文献阅读', gradient: 'bg-gradient-to-br from-amber-600 to-amber-800' }
  },
  {
    id: 'review-writing',
    icon: ScrollText,
    sidebarLabel: '综述撰写',
    section: 'research',
    taskDescription: '围绕科研问题组织文献、框架和初稿',
    keywords: ['综述', '文献', '框架', '证据矩阵', '章节', '初稿', 'review'],
    requiredCapabilities: ['ai', 'workspace-files', 'document-reading', 'web-research', 'write-workspace'],
    showInSidebar: true,
    dashboard: { title: '综述撰写', gradient: 'bg-gradient-to-br from-cyan-600 to-cyan-800' }
  },
  {
    id: 'grant-writing',
    icon: Award,
    sidebarLabel: '自然基金撰写',
    section: 'research',
    taskDescription: '辅助立项依据、研究内容与技术路线成稿',
    keywords: ['自然基金', '基金', '国自然', 'NSFC', '立项依据', '技术路线', '研究内容'],
    requiredCapabilities: ['ai', 'workspace-files', 'document-reading', 'web-research', 'write-workspace'],
    showInSidebar: true,
    dashboard: { title: '自然基金撰写', gradient: 'bg-gradient-to-br from-orange-600 to-orange-800' }
  },
  {
    id: 'bioinformatics',
    icon: Microscope,
    sidebarLabel: '科研数据分析',
    section: 'research',
    taskDescription: '基于整理后数据生成 bulk 和单细胞可视化分析',
    keywords: ['数据', '分析', '单细胞', 'bulk', 'RNA-seq', '转录组', '可视化', '统计', '差异分析'],
    requiredCapabilities: ['ai', 'workspace-files', 'python-base', 'python-bioinformatics'],
    showInSidebar: true,
    dashboard: { title: '科研数据分析', gradient: 'bg-gradient-to-br from-emerald-600 to-emerald-800' }
  },
  {
    id: 'write',
    icon: FileText,
    sidebarLabel: '自由写作台',
    section: 'capabilities',
    taskDescription: '自由草稿、长文编辑、局部润色和 DOCX/PDF 导出',
    keywords: ['自由写作台', '写作工作台', 'Markdown', 'DOCX', 'PDF', '导出', '编辑器', '长文档', '草稿'],
    requiredCapabilities: ['workspace-files', 'write-workspace', 'native-docx-export'],
    showInSidebar: true,
    dashboard: { title: '自由写作台', gradient: 'bg-gradient-to-br from-indigo-600 to-indigo-800' }
  },
  {
    id: 'chat',
    icon: MessageCircle,
    sidebarLabel: 'AI 对话',
    section: 'capabilities',
    taskDescription: '自由对话，让 AI 助手帮您处理任何教学科研任务',
    keywords: ['对话', '聊天', 'AI', '助手', '问答', '任务'],
    requiredCapabilities: ['ai'],
    showInSidebar: true,
    dashboard: { title: 'AI 对话', gradient: 'bg-gradient-to-br from-slate-600 to-slate-800' }
  },
  {
    id: 'file-manager',
    icon: FolderOpen,
    sidebarLabel: '文件管理',
    section: 'capabilities',
    taskDescription: '浏览、预览和安全整理当前工作区文件。',
    keywords: ['文件', '文件夹', '整理', '预览', '重命名', '转换格式'],
    requiredCapabilities: ['workspace-files'],
    showInSidebar: true
  }
] as const satisfies readonly ZhiYanModuleDefinition[]

export type ZhiYanModuleDefinitionV1 = typeof ZHIYAN_MODULE_REGISTRY[number]
export type ZhiYanModuleRouteId = ZhiYanModuleDefinitionV1['id']
export type ZhiYanDashboardModuleDefinition = Extract<
  ZhiYanModuleDefinitionV1,
  { readonly dashboard: unknown }
>

export const ZHIYAN_MODULE_ROUTE_IDS: readonly ZhiYanModuleRouteId[] =
  ZHIYAN_MODULE_REGISTRY.map((module) => module.id)

const ZHIYAN_MODULE_ROUTE_SET = new Set<string>(ZHIYAN_MODULE_ROUTE_IDS)

export function isZhiYanModuleRoute(value: string): value is ZhiYanModuleRouteId {
  return ZHIYAN_MODULE_ROUTE_SET.has(value)
}

export function getZhiYanModule(id: ZhiYanModuleRouteId): ZhiYanModuleDefinitionV1 | undefined {
  return ZHIYAN_MODULE_REGISTRY.find((module) => module.id === id)
}

export function getZhiYanSidebarModules(): ZhiYanModuleDefinitionV1[] {
  return ZHIYAN_MODULE_REGISTRY.filter((module) => module.showInSidebar)
}

export function getZhiYanDashboardModules(
  section: ZhiYanModuleSectionId
): ZhiYanDashboardModuleDefinition[] {
  return ZHIYAN_MODULE_REGISTRY.filter(
    (module): module is ZhiYanDashboardModuleDefinition =>
      module.section === section && 'dashboard' in module
  )
}
