import { afterEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  defaultClawSettings,
  defaultKunRuntimeSettings,
  defaultModelProviderSettings,
  defaultScheduleSettings,
  defaultWriteSettings,
  type AppSettingsV1
} from '@shared/app-settings'
import { GeneralSettingsSection } from './settings-section-general'

const labels: Record<string, string> = {
  sectionGeneral: '基础设置',
  apiKey: 'API Key',
  apiKeySharedDesc: 'API Key description',
  showSecret: '显示',
  hideSecret: '隐藏',
  baseUrl: '服务地址',
  baseUrlSharedDesc: '服务地址说明',
  baseUrlPlaceholder: 'https://api.deepseek.com',
  language: '语言',
  languageDesc: '语言说明',
  theme: '主题',
  themeDesc: '主题说明',
  themeSystem: '跟随系统',
  themeLight: '浅色',
  themeDark: '深色',
  onboardingPreview: '预览引导',
  onboardingPreviewDesc: '预览引导说明',
  onboardingPreviewOpen: '打开预览',
  fontScale: '字号',
  fontScaleDesc: '字号说明',
  fontScaleSmall: '小',
  fontScaleMedium: '中',
  fontScaleLarge: '大',
  turnCompleteNotification: '完成提醒',
  turnCompleteNotificationDesc: '完成提醒说明',
  showTechnicalMetrics: '显示技术指标',
  showTechnicalMetricsDesc: '技术指标说明',
  workspaceRoot: '默认工作目录',
  workspaceRootDesc: '默认工作目录说明',
  workspaceRootPlaceholder: '~/.zhiyan/default_workspace',
  restoreWorkspaceDefault: '恢复默认',
  browse: '浏览',
  teacherProfileTitle: '教师信息',
  teacherProfileDesc: '用于自动填充教案、课件和科研写作中的常用身份信息。可留空。',
  teacherProfileName: '教师姓名',
  teacherProfileNamePlaceholder: '例如 李老师',
  teacherProfileSchool: '学校',
  teacherProfileSchoolPlaceholder: '例如 某某医科大学',
  teacherProfileDepartment: '院系',
  teacherProfileDepartmentPlaceholder: '例如 基础医学院免疫学系',
  teacherProfileCourses: '授课课程',
  teacherProfileCoursesPlaceholder: '一行一个课程',
  teacherProfileResearchTopics: '研究方向',
  teacherProfileResearchTopicsPlaceholder: '一行一个方向',
  desktopBehavior: '桌面行为',
  desktopOpenAtLogin: '开机启动',
  desktopOpenAtLoginDesc: '开机启动说明',
  desktopOpenAtLoginUnsupportedDesc: '不支持开机启动',
  desktopStartMinimized: '启动后最小化',
  desktopStartMinimizedDesc: '最小化说明',
  desktopStartMinimizedDisabledDesc: '未启用',
  desktopCloseToTray: '关闭到托盘',
  desktopCloseToTrayDesc: '关闭到托盘说明',
  logTitle: '日志',
  logEnabled: '启用日志',
  logEnabledDesc: '启用日志说明',
  logRetention: '保留时间',
  logRetentionDesc: '保留时间说明',
  logRetentionOne: '1 天',
  logRetentionTwo: '2 天',
  logRetentionThree: '3 天',
  logRetentionFive: '5 天',
  logRetentionSeven: '7 天',
  logDir: '日志目录',
  logDirDesc: '日志目录说明',
  logDirOpen: '打开日志目录'
}

function t(key: string): string {
  return labels[key] ?? key
}

function settings(): AppSettingsV1 {
  return {
    version: 1,
    locale: 'zh',
    theme: 'system',
    uiFontScale: 'small',
    provider: defaultModelProviderSettings(),
    agents: { kun: defaultKunRuntimeSettings() },
    workspaceRoot: '/tmp/workspace',
    log: { enabled: true, retentionDays: 2 },
    notifications: { turnComplete: true },
    showTechnicalMetrics: false,
    teacherProfile: {
      name: '李老师',
      school: '某某医科大学',
      department: '基础医学院免疫学系',
      courses: ['医学免疫学', '肿瘤免疫学'],
      researchTopics: ['B 细胞亚群', 'TLS']
    },
    teacherProjects: [],
    moduleContext: { projects: {}, recent: {} },
    appBehavior: { openAtLogin: false, startMinimized: false, closeToTray: false },
    write: defaultWriteSettings(),
    claw: defaultClawSettings(),
    schedule: defaultScheduleSettings(),
    guiUpdate: { channel: 'stable' }
  }
}

function baseCtx(): Record<string, unknown> {
  const noop = () => undefined
  const asyncNoop = async () => undefined
  return {
    t,
    tCommon: t,
    form: settings(),
    kun: defaultKunRuntimeSettings(),
    activeApiKey: '',
    update: noop,
    updateKun: noop,
    updateSharedCredential: noop,
    sharedApiKey: '',
    sharedBaseUrl: '',
    showApiKey: false,
    setShowApiKey: noop,
    showRuntimeToken: false,
    setShowRuntimeToken: noop,
    portError: '',
    selectControlClass: 'select',
    openOnboardingPreview: noop,
    pickWorkspace: asyncNoop,
    resetWorkspaceToDefault: noop,
    workspacePickerError: '',
    guiUpdateInfo: null,
    checkingGuiUpdate: false,
    downloadingGuiUpdate: false,
    installingGuiUpdate: false,
    guiUpdateDownloaded: false,
    guiUpdateProgress: null,
    guiUpdateError: null,
    checkGuiUpdate: asyncNoop,
    downloadGuiUpdate: asyncNoop,
    installGuiUpdate: asyncNoop,
    logPath: '',
    logDirOpenError: '',
    setLogDirOpenError: noop,
    pickWriteWorkspace: asyncNoop,
    resetWriteWorkspaceToDefault: noop,
    writeWorkspacePickerError: '',
    writeInlineBaseUrlInherited: false,
    effectiveWriteInlineBaseUrl: '',
    writeInlineModelInherited: false,
    effectiveWriteInlineModel: '',
    setWriteDebugModalOpen: noop,
    loadWriteDebugEntries: asyncNoop,
    scrollToAgentSection: noop,
    agentsSectionRef: { current: null },
    skillSectionRef: { current: null },
    mcpSectionRef: { current: null },
    permissionsSectionRef: { current: null },
    selectedSkillRoot: null,
    skillRootOptions: [],
    skillRootId: 'workspace',
    setSkillRootId: noop,
    skillNotice: null,
    openSkillRoot: asyncNoop,
    openPlugins: noop,
    mcpConfigPath: '',
    mcpConfigExists: false,
    mcpConfigText: '',
    setMcpConfigText: noop,
    mcpLoading: false,
    mcpBusy: false,
    mcpNotice: null,
    saveMcpConfig: asyncNoop,
    loadMcpConfig: asyncNoop,
    openMcpConfigDir: asyncNoop
  }
}

describe('GeneralSettingsSection teacher profile', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders teacher profile fields in general settings', () => {
    vi.stubGlobal('window', { dsGui: { platform: 'win32' } })
    const html = renderToStaticMarkup(createElement(GeneralSettingsSection, { ctx: baseCtx() }))

    expect(html).toContain('教师信息')
    expect(html).toContain('教师姓名')
    expect(html).toContain('李老师')
    expect(html).toContain('学校')
    expect(html).toContain('某某医科大学')
    expect(html).toContain('院系')
    expect(html).toContain('基础医学院免疫学系')
    expect(html).toContain('授课课程')
    expect(html).toContain('医学免疫学')
    expect(html).toContain('研究方向')
    expect(html).toContain('B 细胞亚群')
  })
})
