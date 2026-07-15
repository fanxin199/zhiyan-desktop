import { useState, type KeyboardEvent as ReactKeyboardEvent, type ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ArrowRight,
  Clock3,
  MessageCircle,
  Search,
  type LucideIcon
} from 'lucide-react'
import type { NormalizedThread } from '../../agent/types'
import { formatRelativeTime } from '../../lib/format-relative-time'
import {
  ZHIYAN_MODULE_SECTIONS,
  getZhiYanDashboardModules,
  getZhiYanModule,
  isZhiYanModuleRoute,
  type ZhiYanModuleRouteId,
  type ZhiYanModuleSectionId
} from './zhiyan-module-registry'

type QuickActionCardProps = {
  icon: LucideIcon
  title: string
  description: string
  gradient: string
  onClick: () => void
}

type DashboardActionCard = QuickActionCardProps & {
  id: ZhiYanModuleRouteId
  keywords: readonly string[]
}

export type DashboardTaskRecommendation = {
  sourceModuleId: string
  targetId: ZhiYanModuleRouteId
  title: string
  description: string
}

type RecentThreadCardProps = {
  thread: NormalizedThread
  locale: string
  onOpen: (threadId: string) => void
}

const RECENT_THREAD_LIMIT = 5

const DASHBOARD_SECTION_LABELS = Object.fromEntries(
  ZHIYAN_MODULE_SECTIONS.map((section) => [section.id, section.dashboardLabel])
) as Record<ZhiYanModuleSectionId, string>

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
  const moduleId = moduleIdFromProjectId(thread.projectId)
  return isZhiYanModuleRoute(moduleId) ? getZhiYanModule(moduleId)?.icon ?? MessageCircle : MessageCircle
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

function dashboardActionCards(
  section: ZhiYanModuleSectionId,
  onOpenModule: (route: ZhiYanModuleRouteId) => void
): DashboardActionCard[] {
  return getZhiYanDashboardModules(section).map((module) => ({
    id: module.id,
    icon: module.icon,
    title: module.dashboard.title,
    description: module.taskDescription,
    keywords: module.keywords,
    gradient: module.dashboard.gradient,
    onClick: () => onOpenModule(module.id)
  }))
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

function DashboardCardSection({
  title,
  cards,
  compact = false
}: {
  title: string
  cards: DashboardActionCard[]
  compact?: boolean
}): ReactElement | null {
  if (cards.length === 0) return null
  return (
    <div>
      <h2 className="mb-4 text-ui-body-sm font-semibold uppercase tracking-wider text-ds-faint">
        {title}
      </h2>
      <div className={`grid grid-cols-1 gap-4 sm:grid-cols-2 ${compact ? '' : 'lg:grid-cols-3'}`}>
        {cards.map((card) => <QuickActionCard key={card.id} {...card} />)}
      </div>
    </div>
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
  const Icon = getZhiYanModule(recommendation.targetId)?.icon ?? MessageCircle
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
  onOpenModule: (route: ZhiYanModuleRouteId) => void
  recentThreads?: NormalizedThread[]
  onOpenRecentThread?: (threadId: string) => void
  onSubmitPrompt?: (prompt: string) => void
  className?: string
}

export function ZhiYanDashboard({
  onOpenModule,
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

  const teachingCards = dashboardActionCards('teaching', onOpenModule)
  const researchCards = dashboardActionCards('research', onOpenModule)
  const capabilityCards = dashboardActionCards('capabilities', onOpenModule)

  const visibleTeachingCards = filterDashboardActionCards(teachingCards, searchQuery)
  const visibleResearchCards = filterDashboardActionCards(researchCards, searchQuery)
  const visibleCapabilityCards = filterDashboardActionCards(capabilityCards, searchQuery)
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
                  onOpen={() => onOpenModule(recommendation.targetId)}
                />
              ))}
            </div>
          </div>
        ) : null}

        {hasSearchQuery ? (
          hasSearchResults ? (
            <div className="space-y-8">
              <DashboardCardSection title={DASHBOARD_SECTION_LABELS.teaching} cards={visibleTeachingCards} />
              <DashboardCardSection title={DASHBOARD_SECTION_LABELS.research} cards={visibleResearchCards} />
              <DashboardCardSection title={DASHBOARD_SECTION_LABELS.capabilities} cards={visibleCapabilityCards} compact />
            </div>
          ) : (
            <div className="rounded-2xl border border-ds-border-muted bg-ds-card px-5 py-8 text-center">
              <p className="text-sm font-semibold text-ds-text">没有找到匹配的功能</p>
              <p className="mt-1 text-ui-body-sm text-ds-muted">可以换一个关键词，或直接打开 AI 对话描述需求。</p>
            </div>
          )
        ) : null}

        {!hasSearchQuery ? (
          <div className="space-y-8">
            <DashboardCardSection title={DASHBOARD_SECTION_LABELS.teaching} cards={teachingCards} />
            <DashboardCardSection title={DASHBOARD_SECTION_LABELS.research} cards={researchCards} />
            <DashboardCardSection title={DASHBOARD_SECTION_LABELS.capabilities} cards={capabilityCards} compact />
          </div>
        ) : null}
      </div>
    </div>
  )
}
