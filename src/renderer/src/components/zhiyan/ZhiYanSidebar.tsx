import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import { Settings, Sparkles } from 'lucide-react'
import type { SettingsRouteSection } from '../../store/chat-store'
import {
  SidebarCommandRow,
  SidebarFrame
} from '../sidebar/SidebarPrimitives'
import {
  ZHIYAN_MODULE_SECTIONS,
  getZhiYanSidebarModules,
  type ZhiYanModuleRouteId
} from './zhiyan-module-registry'

type ZhiYanSidebarProps = {
  activeRoute: string
  onOpenModule: (route: ZhiYanModuleRouteId) => void
  onOpenSettings: (section?: SettingsRouteSection) => void
  onToggleSidebar: () => void
  /** Opens or closes the AI assistant, which works over any page. */
  onOpenAssistant?: () => void
  assistantOpen?: boolean
}

function SectionLabel({ label }: { label: string }): ReactElement {
  return (
    <div className="mb-1 mt-4 px-3 text-caption font-semibold uppercase tracking-wider text-ds-faint first:mt-1">
      {label}
    </div>
  )
}

export function ZhiYanSidebar(props: ZhiYanSidebarProps): ReactElement {
  const { activeRoute, onOpenModule, onOpenSettings, onToggleSidebar, onOpenAssistant, assistantOpen = false } = props
  const { t } = useTranslation('common')
  const sectionLabels = Object.fromEntries(
    ZHIYAN_MODULE_SECTIONS.map((section) => [section.id, section.label])
  )

  let lastSection: string | null = null

  return (
    <SidebarFrame
      title="智研助手"
      onCollapse={onToggleSidebar}
      footer={
        <div className="space-y-1">
          {onOpenAssistant ? (
            <SidebarCommandRow
              icon={<Sparkles className="h-4 w-4" strokeWidth={1.75} />}
              label="AI 助手"
              onClick={onOpenAssistant}
              active={assistantOpen}
              variant="footer"
            />
          ) : null}
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
        {getZhiYanSidebarModules().map((item) => {
          const startsSection = item.section !== null && item.section !== lastSection
          const sectionLabel = item.section ? sectionLabels[item.section] : null
          // A group without a heading right after 首页 needs no gap.
          const afterGroup = lastSection !== null
          lastSection = item.section

          return (
            <div key={item.id}>
              {startsSection ? (
                // A group without a heading is only set apart from the one above it.
                sectionLabel ? <SectionLabel label={sectionLabel} /> : afterGroup ? <div className="mt-4" aria-hidden="true" /> : null
              ) : null}
              <SidebarCommandRow
                icon={<item.icon className="h-4 w-4" strokeWidth={1.75} />}
                label={item.sidebarLabel}
                onClick={() => onOpenModule(item.id)}
                active={activeRoute === item.id}
              />
            </div>
          )
        })}
      </div>
    </SidebarFrame>
  )
}
