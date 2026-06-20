import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import {
  BookOpen,
  FileText,
  FolderOpen,
  GraduationCap,
  Home,
  MessageCircle,
  Microscope,
  PenTool,
  Presentation,
  Search,
  Settings,
  type LucideIcon
} from 'lucide-react'
import type { SettingsRouteSection } from '../../store/chat-store'
import {
  SidebarCommandRow,
  SidebarFrame
} from '../sidebar/SidebarPrimitives'

type ZhiYanSidebarProps = {
  activeRoute: string
  onOpenDashboard: () => void
  onOpenSyllabus: () => void
  onOpenPptGen: () => void
  onOpenPaperPolish: () => void
  onOpenLiterature: () => void
  onOpenReviewWriting: () => void
  onOpenGrantWriting: () => void
  onOpenTextbook: () => void
  onOpenBioinformatics: () => void
  onOpenWrite: () => void
  onOpenFileManager: () => void
  onOpenSettings: (section?: SettingsRouteSection) => void
  onOpenChat: () => void
  onToggleSidebar: () => void
}

type NavItem = {
  id: string
  icon: LucideIcon
  label: string
  section?: 'teaching' | 'research' | 'capabilities'
  disabled?: boolean
  disabledHint?: string
}

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', icon: Home, label: '工作台', section: undefined },
  // Teaching
  { id: 'syllabus', icon: GraduationCap, label: '智能教案', section: 'teaching' },
  { id: 'ppt-gen', icon: Presentation, label: '课件 PPT', section: 'teaching' },
  { id: 'textbook', icon: BookOpen, label: '教材编写', section: 'teaching' },
  // Research
  { id: 'paper-polish', icon: PenTool, label: '文本写作', section: 'research' },
  { id: 'literature', icon: Search, label: '文献阅读', section: 'research' },
  { id: 'review-writing', icon: FileText, label: '综述撰写', section: 'research' },
  { id: 'grant-writing', icon: PenTool, label: '自然基金撰写', section: 'research' },
  { id: 'bioinformatics', icon: Microscope, label: '下游数据分析', section: 'research' },
  // Capabilities
  { id: 'write', icon: FileText, label: '写作工作台', section: 'capabilities' },
  { id: 'chat', icon: MessageCircle, label: 'AI 对话', section: 'capabilities' },
  { id: 'file-manager', icon: FolderOpen, label: '文件管理', section: 'capabilities' },
]

function getRouteHandler(
  id: string,
  props: ZhiYanSidebarProps
): (() => void) | undefined {
  switch (id) {
    case 'dashboard': return props.onOpenDashboard
    case 'syllabus': return props.onOpenSyllabus
    case 'ppt-gen': return props.onOpenPptGen
    case 'paper-polish': return props.onOpenPaperPolish
    case 'literature': return props.onOpenLiterature
    case 'review-writing': return props.onOpenReviewWriting
    case 'grant-writing': return props.onOpenGrantWriting
    case 'textbook': return props.onOpenTextbook
    case 'bioinformatics': return props.onOpenBioinformatics
    case 'write': return props.onOpenWrite
    case 'chat': return props.onOpenChat
    case 'file-manager': return props.onOpenFileManager
    default: return undefined
  }
}

function SectionLabel({ label }: { label: string }): ReactElement {
  return (
    <div className="mb-1 mt-4 px-3 text-[11px] font-semibold uppercase tracking-wider text-ds-faint first:mt-1">
      {label}
    </div>
  )
}

export function ZhiYanSidebar(props: ZhiYanSidebarProps): ReactElement {
  const { activeRoute, onOpenSettings, onToggleSidebar } = props
  const { t } = useTranslation('common')

  const sectionLabels: Record<string, string> = {
    teaching: '教学',
    research: '科研',
    capabilities: '能力中心'
  }

  let lastSection: string | undefined = undefined

  return (
    <SidebarFrame
      title="智研助手"
      onCollapse={onToggleSidebar}
      footer={
        <div className="space-y-1">
          <SidebarCommandRow
            icon={<Settings className="h-4 w-4" strokeWidth={1.75} />}
            label={t('settings')}
            onClick={() => onOpenSettings('general')}
            variant="footer"
          />
        </div>
      }
    >
      <div className="ds-no-drag flex flex-col px-1">
        {NAV_ITEMS.map((item) => {
          const showSection = item.section && item.section !== lastSection
          if (item.section) lastSection = item.section

          return (
            <div key={item.id}>
              {showSection && item.section ? (
                <SectionLabel label={sectionLabels[item.section] ?? item.section} />
              ) : null}
              <SidebarCommandRow
                icon={<item.icon className="h-4 w-4" strokeWidth={1.75} />}
                label={item.label}
                onClick={item.disabled ? undefined : getRouteHandler(item.id, props)}
                active={activeRoute === item.id}
                disabled={item.disabled}
                disabledHint={item.disabledHint}
              />
            </div>
          )
        })}
      </div>
    </SidebarFrame>
  )
}
