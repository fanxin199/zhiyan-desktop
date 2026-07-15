import { useState, type KeyboardEvent as ReactKeyboardEvent, type ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ArrowRight,
  Award,
  BookOpen,
  Clock3,
  FileText,
  GraduationCap,
  MessageCircle,
  Microscope,
  Presentation,
  PenTool,
  ScrollText,
  Search,
  type LucideIcon
} from 'lucide-react'
import type { NormalizedThread } from '../../agent/types'
import { formatRelativeTime } from '../../lib/format-relative-time'

type QuickActionCardProps = {
  icon: LucideIcon
  title: string
  description: string
  gradient: string
  onClick: () => void
}

type DashboardActionCard = QuickActionCardProps & {
  id: string
  keywords: string[]
}

export type DashboardTaskRecommendation = {
  sourceModuleId: string
  targetId: 'syllabus' | 'ppt-gen' | 'paper-polish' | 'literature' | 'review-writing'
  title: string
  description: string
}

type RecentThreadCardProps = {
  thread: NormalizedThread
  locale: string
  onOpen: (threadId: string) => void
}

const RECENT_THREAD_LIMIT = 5

const RECENT_THREAD_ICONS: Record<string, LucideIcon> = {
  syllabus: GraduationCap,
  'ppt-gen': Presentation,
  textbook: BookOpen,
  literature: Search,
  'paper-polish': PenTool,
  'review-writing': ScrollText,
  'grant-writing': Award,
  bioinformatics: Microscope
}

const RECOMMENDATION_BY_SOURCE_MODULE: Record<string, Omit<DashboardTaskRecommendation, 'sourceModuleId'>> = {
  syllabus: {
    targetId: 'ppt-gen',
    title: '根据教案制作配套课件',
    description: '沿用最近教案的课程主题，继续生成课堂 PPT。'
  },
  'ppt-gen': {
    targetId: 'syllabus',
    title: '为课件补充完整教案',
    description: '把最近课件对应的教学目标、流程和课堂活动整理成教案。'
  },
  textbook: {
    targetId: 'ppt-gen',
    title: '将教材章节转为课堂课件',
    description: '从最近教材内容继续制作适合讲授的 PPT。'
  },
  'paper-polish': {
    targetId: 'literature',
    title: '核验写作中的关键证据',
    description: '检查关键论点对应的全文依据、PMID 和 DOI。'
  },
  literature: {
    targetId: 'review-writing',
    title: '将文献证据整理成综述',
    description: '把最近精读结果组织成证据矩阵和综述框架。'
  },
  'review-writing': {
    targetId: 'literature',
    title: '核验综述中的关键引用',
    description: '回到文献阅读，核对全文证据和引用标识。'
  },
  'grant-writing': {
    targetId: 'literature',
    title: '核验立项依据中的关键文献',
    description: '检查核心论点的最新证据、PMID 和 DOI。'
  },
  bioinformatics: {
    targetId: 'paper-polish',
    title: '把分析结果整理成论文段落',
    description: '将图表、统计结果和证据边界转为 Results 或 Discussion 草稿。'
  }
}

function normalizeDashboardSearchText(value: string): string {
  return value.trim().toLowerCase()
}

export function dashboardActionCardMatches(
  card: Pick<DashboardActionCard, 'title' | 'description' | 'keywords'>,
  query: string
): boolean {
  const normalizedQuery = normalizeDashboardSearchText(query)
  if (!normalizedQuery) return true

  const searchableValues = [
    card.title,
    card.description,
    ...card.keywords
  ].map(normalizeDashboardSearchText).filter(Boolean)

  if (searchableValues.some((value) => value.includes(normalizedQuery))) return true
  const titleAndKeywords = [card.title, ...card.keywords].map(normalizeDashboardSearchText).filter(Boolean)
  if (titleAndKeywords.some((value) => value.length >= 2 && normalizedQuery.includes(value))) return true

  const terms = normalizedQuery.split(/\s+/u).filter(Boolean)
  return terms.length > 0 && terms.every((term) =>
    searchableValues.some((value) => value.includes(term)) ||
    titleAndKeywords.some((value) => value.length >= 2 && term.includes(value))
  )
}

export function filterDashboardActionCards<T extends Pick<DashboardActionCard, 'title' | 'description' | 'keywords'>>(
  cards: T[],
  query: string
): T[] {
  return cards.filter((card) => dashboardActionCardMatches(card, query))
}

function moduleIdFromProjectId(projectId: string | undefined): string {
  const match = /^teacher-project:([^:]+):/u.exec(projectId ?? '')
  return match?.[1] ?? ''
}

function recentThreadIcon(thread: NormalizedThread): LucideIcon {
  return RECENT_THREAD_ICONS[moduleIdFromProjectId(thread.projectId)] ?? MessageCircle
}

export function getRecentDashboardThreads(threads: NormalizedThread[]): NormalizedThread[] {
  return [...threads]
    .filter((thread) => !thread.archived && thread.status !== 'archived')
    .sort((left, right) => {
      const leftTime = new Date(left.updatedAt).getTime()
      const rightTime = new Date(right.updatedAt).getTime()
      return (Number.isFinite(rightTime) ? rightTime : 0) - (Number.isFinite(leftTime) ? leftTime : 0)
    })
    .slice(0, RECENT_THREAD_LIMIT)
}

export function getDashboardTaskRecommendations(
  threads: NormalizedThread[]
): DashboardTaskRecommendation[] {
  const recommendations: DashboardTaskRecommendation[] = []
  const seenTargets = new Set<string>()
  for (const thread of getRecentDashboardThreads(threads)) {
    const sourceModuleId = moduleIdFromProjectId(thread.projectId)
    const recommendation = RECOMMENDATION_BY_SOURCE_MODULE[sourceModuleId]
    if (!recommendation || seenTargets.has(recommendation.targetId)) continue
    seenTargets.add(recommendation.targetId)
    recommendations.push({ sourceModuleId, ...recommendation })
    if (recommendations.length >= 2) break
  }
  return recommendations
}

function QuickActionCard({
  icon: Icon,
  title,
  description,
  gradient,
  onClick
}: QuickActionCardProps): ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative flex flex-col items-start gap-3 rounded-2xl border border-white/10 p-5 text-left transition-all duration-300 hover:scale-[1.02] hover:shadow-lg hover:shadow-black/5 active:scale-[0.98] ${gradient}`}
    >
      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/20 shadow-sm backdrop-blur-sm transition-transform duration-300 group-hover:scale-110">
        <Icon className="h-5.5 w-5.5 text-white" strokeWidth={1.8} />
      </div>
      <div>
        <h3 className="text-sm font-semibold text-white">{title}</h3>
        <p className="mt-1 text-ui-body-sm leading-relaxed text-white/70">{description}</p>
      </div>
    </button>
  )
}

function RecentThreadCard({ thread, locale, onOpen }: RecentThreadCardProps): ReactElement {
  const Icon = recentThreadIcon(thread)
  return (
    <button
      type="button"
      onClick={() => onOpen(thread.id)}
      className="group flex min-w-0 items-center gap-3 rounded-xl border border-ds-border-muted bg-ds-card px-3.5 py-3 text-left shadow-sm transition hover:border-accent/30 hover:bg-ds-hover"
      aria-label={`继续会话：${thread.title}`}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-ds-subtle text-ds-muted transition group-hover:text-accent">
        <Icon className="h-4.5 w-4.5" strokeWidth={1.8} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-ui-body font-semibold text-ds-text">
          {thread.title}
        </span>
        <span className="mt-0.5 flex items-center gap-1.5 text-ui-caption text-ds-faint">
          <Clock3 className="h-3 w-3" strokeWidth={1.8} />
          <span>{formatRelativeTime(thread.updatedAt, locale)}</span>
        </span>
      </span>
    </button>
  )
}

function TaskRecommendationCard({
  recommendation,
  onOpen
}: {
  recommendation: DashboardTaskRecommendation
  onOpen: () => void
}): ReactElement {
  const Icon = RECENT_THREAD_ICONS[recommendation.targetId] ?? MessageCircle
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex min-w-0 items-center gap-3 rounded-xl border border-accent/15 bg-accent/[0.045] px-3.5 py-3 text-left transition hover:border-accent/30 hover:bg-accent/[0.075]"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
        <Icon className="h-4.5 w-4.5" strokeWidth={1.8} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-ui-body-sm font-semibold text-ds-text">{recommendation.title}</span>
        <span className="mt-0.5 line-clamp-2 block text-ui-caption leading-5 text-ds-muted">{recommendation.description}</span>
      </span>
      <ArrowRight className="h-4 w-4 shrink-0 text-ds-faint transition group-hover:translate-x-0.5 group-hover:text-accent" strokeWidth={1.8} />
    </button>
  )
}

type ZhiYanDashboardProps = {
  onOpenSyllabus: () => void
  onOpenPptGen: () => void
  onOpenPaperPolish: () => void
  onOpenLiterature: () => void
  onOpenReviewWriting: () => void
  onOpenGrantWriting: () => void
  onOpenTextbook: () => void
  onOpenBioinformatics: () => void
  onOpenChat: () => void
  onOpenWrite: () => void
  recentThreads?: NormalizedThread[]
  onOpenRecentThread?: (threadId: string) => void
  onSubmitPrompt?: (prompt: string) => void
  className?: string
}

export function ZhiYanDashboard({
  onOpenSyllabus,
  onOpenPptGen,
  onOpenPaperPolish,
  onOpenLiterature,
  onOpenReviewWriting,
  onOpenGrantWriting,
  onOpenTextbook,
  onOpenBioinformatics,
  onOpenChat,
  onOpenWrite,
  recentThreads = [],
  onOpenRecentThread,
  onSubmitPrompt,
  className = ''
}: ZhiYanDashboardProps): ReactElement {
  const { i18n } = useTranslation('common')
  const [searchQuery, setSearchQuery] = useState('')
  const visibleRecentThreads = getRecentDashboardThreads(recentThreads)
  const taskRecommendations = getDashboardTaskRecommendations(recentThreads)

  const getGreeting = (): string => {
    const hour = new Date().getHours()
    if (hour < 6) return '夜深了，老师辛苦了！'
    if (hour < 12) return '早上好，老师！'
    if (hour < 14) return '中午好，老师！'
    if (hour < 18) return '下午好，老师！'
    return '晚上好，老师！'
  }

  const teachingCards: DashboardActionCard[] = [
    {
      id: 'syllabus',
      icon: GraduationCap,
      title: '智能教案',
      description: '根据课程信息或章节内容，AI 辅助生成规范教案',
      keywords: ['教案', '教学设计', '课程', '授课', '章节', 'Word', 'DOCX'],
      gradient: 'bg-gradient-to-br from-blue-600 to-blue-800',
      onClick: onOpenSyllabus
    },
    {
      id: 'ppt-gen',
      icon: Presentation,
      title: '制作课件 PPT',
      description: '上传教材 PDF，自动生成教学课件',
      keywords: ['课件', 'PPT', '幻灯片', '教材', 'PDF', '讲稿', '教学'],
      gradient: 'bg-gradient-to-br from-purple-600 to-purple-800',
      onClick: onOpenPptGen
    },
    {
      id: 'textbook',
      icon: BookOpen,
      title: '教材编写',
      description: 'AI 辅助撰写教材章节，保持教学主线和术语一致',
      keywords: ['教材', '章节', '编写', '讲义', '课程建设', '教学材料'],
      gradient: 'bg-gradient-to-br from-teal-600 to-teal-800',
      onClick: onOpenTextbook
    }
  ]

  const researchCards: DashboardActionCard[] = [
    {
      id: 'paper-polish',
      icon: PenTool,
      title: '文本写作',
      description: '自然基金、论文润色和长文档分段写作，先锁定项目主线',
      keywords: ['论文', '基金', '写作', '润色', '文本', '英文', '中文', 'Discussion', 'Results', '蓝图'],
      gradient: 'bg-gradient-to-br from-rose-600 to-rose-800',
      onClick: onOpenPaperPolish
    },
    {
      id: 'literature',
      icon: Search,
      title: '文献阅读',
      description: '文献精读、关键图解读和组会汇报 PPT 制作',
      keywords: ['文献', 'PDF', '论文', '精读', '阅读', '图表', '组会', 'Journal Club', 'PMID', 'DOI'],
      gradient: 'bg-gradient-to-br from-amber-600 to-amber-800',
      onClick: onOpenLiterature
    },
    {
      id: 'bioinformatics',
      icon: Microscope,
      title: '科研数据分析',
      description: '基于整理后数据生成 bulk 和单细胞可视化分析',
      keywords: ['数据', '分析', '单细胞', 'bulk', 'RNA-seq', '转录组', '可视化', '统计', '差异分析'],
      gradient: 'bg-gradient-to-br from-emerald-600 to-emerald-800',
      onClick: onOpenBioinformatics
    },
    {
      id: 'review-writing',
      icon: ScrollText,
      title: '综述撰写',
      description: '围绕科研问题组织文献、框架和初稿',
      keywords: ['综述', '文献', '框架', '证据矩阵', '章节', '初稿', 'review'],
      gradient: 'bg-gradient-to-br from-cyan-600 to-cyan-800',
      onClick: onOpenReviewWriting
    },
    {
      id: 'grant-writing',
      icon: Award,
      title: '自然基金撰写',
      description: '辅助立项依据、研究内容与技术路线成稿',
      keywords: ['自然基金', '基金', '国自然', 'NSFC', '立项依据', '技术路线', '研究内容'],
      gradient: 'bg-gradient-to-br from-orange-600 to-orange-800',
      onClick: onOpenGrantWriting
    }
  ]

  const capabilityCards: DashboardActionCard[] = [
    {
      id: 'write',
      icon: FileText,
      title: '自由写作台',
      description: '自由草稿、长文编辑、局部润色和 DOCX/PDF 导出',
      keywords: ['自由写作台', '写作工作台', 'Markdown', 'DOCX', 'PDF', '导出', '编辑器', '长文档', '草稿'],
      gradient: 'bg-gradient-to-br from-indigo-600 to-indigo-800',
      onClick: onOpenWrite
    },
    {
      id: 'chat',
      icon: MessageCircle,
      title: 'AI 对话',
      description: '自由对话，让 AI 助手帮您处理任何教学科研任务',
      keywords: ['对话', '聊天', 'AI', '助手', '问答', '任务'],
      gradient: 'bg-gradient-to-br from-slate-600 to-slate-800',
      onClick: onOpenChat
    }
  ]

  const visibleTeachingCards = filterDashboardActionCards(teachingCards, searchQuery)
  const visibleResearchCards = filterDashboardActionCards(researchCards, searchQuery)
  const visibleCapabilityCards = filterDashboardActionCards(capabilityCards, searchQuery)
  const directOpeners: Record<DashboardTaskRecommendation['targetId'], () => void> = {
    syllabus: onOpenSyllabus,
    'ppt-gen': onOpenPptGen,
    'paper-polish': onOpenPaperPolish,
    literature: onOpenLiterature,
    'review-writing': onOpenReviewWriting
  }
  const hasSearchQuery = searchQuery.trim().length > 0
  const hasSearchResults =
    visibleTeachingCards.length > 0 ||
    visibleResearchCards.length > 0 ||
    visibleCapabilityCards.length > 0

  const handleSearchKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>): void => {
    if (event.key !== 'Enter') return
    const prompt = searchQuery.trim()
    if (!prompt || !onSubmitPrompt) return
    event.preventDefault()
    onSubmitPrompt(prompt)
  }

  return (
    <div className={`flex h-full flex-col overflow-y-auto ${className}`}>
      <div className="mx-auto w-full max-w-4xl px-6 py-8 sm:px-8 md:px-12 lg:py-12">
        {/* Greeting */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-ds-text">
            {getGreeting()}
          </h1>
          <p className="mt-2 text-sm text-ds-muted">
            智研助手已就绪，请选择您需要的功能，或直接在下方输入需求
          </p>
        </div>

        <div className="mb-8">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-ds-faint" strokeWidth={1.8} />
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder="输入关键词搜索功能，或直接描述需求…"
              className="w-full rounded-2xl border border-ds-border bg-ds-card py-3 pl-11 pr-4 text-sm text-ds-text shadow-sm outline-none transition placeholder:text-ds-faint focus:border-accent/50 focus:ring-2 focus:ring-accent/10"
              aria-label="搜索功能"
            />
          </div>
        </div>

        {visibleRecentThreads.length > 0 && onOpenRecentThread ? (
          <div className="mb-8">
            <h2 className="mb-4 text-ui-body-sm font-semibold uppercase tracking-wider text-ds-faint">
              最近使用
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {visibleRecentThreads.map((thread) => (
                <RecentThreadCard
                  key={thread.id}
                  thread={thread}
                  locale={i18n.language}
                  onOpen={onOpenRecentThread}
                />
              ))}
            </div>
          </div>
        ) : null}

        {!hasSearchQuery && taskRecommendations.length > 0 ? (
          <div className="mb-8" data-testid="dashboard-task-recommendations">
            <h2 className="mb-3 text-ui-body-sm font-semibold uppercase tracking-wider text-ds-faint">
              推荐下一步
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {taskRecommendations.map((recommendation) => (
                <TaskRecommendationCard
                  key={`${recommendation.sourceModuleId}:${recommendation.targetId}`}
                  recommendation={recommendation}
                  onOpen={directOpeners[recommendation.targetId]}
                />
              ))}
            </div>
          </div>
        ) : null}

        {hasSearchQuery ? (
          hasSearchResults ? (
            <div className="space-y-8">
              {visibleTeachingCards.length > 0 ? (
                <div>
                  <h2 className="mb-4 text-ui-body-sm font-semibold uppercase tracking-wider text-ds-faint">
                    教学工具
                  </h2>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {visibleTeachingCards.map((card) => (
                      <QuickActionCard key={card.id} {...card} />
                    ))}
                  </div>
                </div>
              ) : null}

              {visibleResearchCards.length > 0 ? (
                <div>
                  <h2 className="mb-4 text-ui-body-sm font-semibold uppercase tracking-wider text-ds-faint">
                    科研工具
                  </h2>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {visibleResearchCards.map((card) => (
                      <QuickActionCard key={card.id} {...card} />
                    ))}
                  </div>
                </div>
              ) : null}

              {visibleCapabilityCards.length > 0 ? (
                <div>
                  <h2 className="mb-4 text-ui-body-sm font-semibold uppercase tracking-wider text-ds-faint">
                    能力中心
                  </h2>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {visibleCapabilityCards.map((card) => (
                      <QuickActionCard key={card.id} {...card} />
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="rounded-2xl border border-ds-border-muted bg-ds-card px-5 py-8 text-center">
              <p className="text-sm font-semibold text-ds-text">没有找到匹配的功能</p>
              <p className="mt-1 text-ui-body-sm text-ds-muted">可以换一个关键词，或直接打开 AI 对话描述需求。</p>
            </div>
          )
        ) : null}

        {!hasSearchQuery ? (
          <>
        {/* Quick Action Cards */}
        <div className="mb-8">
          <h2 className="mb-4 text-ui-body-sm font-semibold uppercase tracking-wider text-ds-faint">
            教学工具
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <QuickActionCard
              icon={GraduationCap}
              title="智能教案"
              description="根据课程信息或章节内容，AI 辅助生成规范教案"
              gradient="bg-gradient-to-br from-blue-600 to-blue-800"
              onClick={onOpenSyllabus}
            />
            <QuickActionCard
              icon={Presentation}
              title="制作课件 PPT"
              description="上传教材 PDF，自动生成教学课件"
              gradient="bg-gradient-to-br from-purple-600 to-purple-800"
              onClick={onOpenPptGen}
            />
            <QuickActionCard
              icon={BookOpen}
              title="教材编写"
              description="AI 辅助撰写教材章节，保持教学主线和术语一致"
              gradient="bg-gradient-to-br from-teal-600 to-teal-800"
              onClick={onOpenTextbook}
            />
          </div>
        </div>

        <div className="mb-8">
          <h2 className="mb-4 text-ui-body-sm font-semibold uppercase tracking-wider text-ds-faint">
            科研工具
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <QuickActionCard
              icon={PenTool}
              title="文本写作"
              description="自然基金、论文润色和长文档分段写作，先锁定项目主线"
              gradient="bg-gradient-to-br from-rose-600 to-rose-800"
              onClick={onOpenPaperPolish}
            />
            <QuickActionCard
              icon={Search}
              title="文献阅读"
              description="文献精读、关键图解读和组会汇报 PPT 制作"
              gradient="bg-gradient-to-br from-amber-600 to-amber-800"
              onClick={onOpenLiterature}
            />
            <QuickActionCard
              icon={Microscope}
              title="科研数据分析"
              description="基于整理后数据生成 bulk 和单细胞可视化分析"
              gradient="bg-gradient-to-br from-emerald-600 to-emerald-800"
              onClick={onOpenBioinformatics}
            />
            <QuickActionCard
              icon={ScrollText}
              title="综述撰写"
              description="围绕科研问题组织文献、框架和初稿"
              gradient="bg-gradient-to-br from-cyan-600 to-cyan-800"
              onClick={onOpenReviewWriting}
            />
            <QuickActionCard
              icon={Award}
              title="自然基金撰写"
              description="辅助立项依据、研究内容与技术路线成稿"
              gradient="bg-gradient-to-br from-orange-600 to-orange-800"
              onClick={onOpenGrantWriting}
            />
          </div>
        </div>

        <div>
          <h2 className="mb-4 text-ui-body-sm font-semibold uppercase tracking-wider text-ds-faint">
            能力中心
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <QuickActionCard
              icon={FileText}
              title="自由写作台"
              description="自由草稿、长文编辑、局部润色和 DOCX/PDF 导出"
              gradient="bg-gradient-to-br from-indigo-600 to-indigo-800"
              onClick={onOpenWrite}
            />
            <QuickActionCard
              icon={MessageCircle}
              title="AI 对话"
              description="自由对话，让 AI 助手帮您处理任何教学科研任务"
              gradient="bg-gradient-to-br from-slate-600 to-slate-800"
              onClick={onOpenChat}
            />
          </div>
        </div>
          </>
        ) : null}
      </div>
    </div>
  )
}
