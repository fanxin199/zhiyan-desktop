import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import { Settings } from 'lucide-react'
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
}

function SectionLabel({ label }: { label: string }): ReactElement {
  return (
    <div className="mb-1 mt-4 px-3 text-[11px] font-semibold uppercase tracking-wider text-ds-faint first:mt-1">
      {label}
    </div>
  )
}

export function ZhiYanSidebar(props: ZhiYanSidebarProps): ReactElement {
  const { activeRoute, onOpenModule, onOpenSettings, onToggleSidebar } = props
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
          const showSection = item.section && item.section !== lastSection
          lastSection = item.section

          return (
            <div key={item.id}>
              {showSection && item.section ? (
                <SectionLabel label={sectionLabels[item.section] ?? item.section} />
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
