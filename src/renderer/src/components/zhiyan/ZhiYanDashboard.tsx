import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import {
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

type RecentThreadCardProps = {
  thread: NormalizedThread
  locale: string
  onOpen: (threadId: string) => void
}

const RECENT_THREAD_LIMIT = 5

const RECENT_THREAD_ICONS: Record<string, LucideIcon> = {
  syllabus: GraduationCap,
  literature: Search,
  'paper-polish': PenTool,
  'review-writing': ScrollText,
  'grant-writing': Award,
  bioinformatics: Microscope
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
        <h3 className="text-[15px] font-semibold text-white">{title}</h3>
        <p className="mt-1 text-[12.5px] leading-relaxed text-white/70">{description}</p>
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
        <span className="block truncate text-[13.5px] font-semibold text-ds-text">
          {thread.title}
        </span>
        <span className="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-ds-faint">
          <Clock3 className="h-3 w-3" strokeWidth={1.8} />
          <span>{formatRelativeTime(thread.updatedAt, locale)}</span>
        </span>
      </span>
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
  className = ''
}: ZhiYanDashboardProps): ReactElement {
  const { i18n } = useTranslation('common')
  const visibleRecentThreads = getRecentDashboardThreads(recentThreads)

  const getGreeting = (): string => {
    const hour = new Date().getHours()
    if (hour < 6) return '夜深了，老师辛苦了！'
    if (hour < 12) return '早上好，老师！'
    if (hour < 14) return '中午好，老师！'
    if (hour < 18) return '下午好，老师！'
    return '晚上好，老师！'
  }

  return (
    <div className={`flex h-full flex-col overflow-y-auto ${className}`}>
      <div className="mx-auto w-full max-w-4xl px-6 py-8 sm:px-8 md:px-12 lg:py-12">
        {/* Greeting */}
        <div className="mb-8">
          <h1 className="text-[28px] font-bold tracking-tight text-ds-text">
            {getGreeting()}
          </h1>
          <p className="mt-2 text-[15px] text-ds-muted">
            智研助手已就绪，请选择您需要的功能，或直接在下方输入需求
          </p>
        </div>

        {visibleRecentThreads.length > 0 && onOpenRecentThread ? (
          <div className="mb-8">
            <h2 className="mb-4 text-[13px] font-semibold uppercase tracking-wider text-ds-faint">
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

        {/* Quick Action Cards */}
        <div className="mb-8">
          <h2 className="mb-4 text-[13px] font-semibold uppercase tracking-wider text-ds-faint">
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
          <h2 className="mb-4 text-[13px] font-semibold uppercase tracking-wider text-ds-faint">
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
          <h2 className="mb-4 text-[13px] font-semibold uppercase tracking-wider text-ds-faint">
            能力中心
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <QuickActionCard
              icon={FileText}
              title="写作工作台"
              description="Markdown 编辑器 + AI 写作助手，支持导出 DOCX/PDF"
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
      </div>
    </div>
  )
}
