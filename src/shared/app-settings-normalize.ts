import {
  DEFAULT_GUI_UPDATE_CHANNEL,
  normalizeGuiUpdateChannel,
  type AppBehaviorConfigV1,
  type AppSettingsV1,
  type ClawSettingsPatchV1,
  type CoursewareModuleContextV1,
  type GuiUpdateConfigV1,
  type ModuleContextSettingsV1,
  type NotificationConfigV1,
  type ScheduleSettingsPatchV1,
  type TeacherModuleProjectContextV1,
  type TeacherProjectSettingsV1,
  type TeacherProfileSettingsV1,
  type WriteSettingsPatchV1
} from './app-settings-types'
import {
  defaultKunRuntimeSettings,
  getKunRuntimeSettings,
  kunSettingsEnvelope,
  mergeKunRuntimeSettings,
  migrateLegacyAppSettings
} from './app-settings-kun'
import { normalizeModelProviderSettings } from './app-settings-provider'
import { compactStrings, normalizeDeepseekBaseUrl } from './app-settings-normalizers'
import { normalizeClawSettings } from './app-settings-claw'
import { normalizeScheduleSettings } from './app-settings-schedule'
import { normalizeWriteSettings } from './app-settings-write'

export function normalizeAppSettings(settings: AppSettingsV1): AppSettingsV1 {
  const migrated = shouldMigrateLegacySettings(settings)
    ? migrateLegacyAppSettings(settings as Parameters<typeof migrateLegacyAppSettings>[0])
    : settings
  const maybeSettings = migrated as AppSettingsV1 & {
    appBehavior?: Partial<AppBehaviorConfigV1>
    notifications?: Partial<NotificationConfigV1>
    teacherProfile?: Partial<TeacherProfileSettingsV1>
    teacherProjects?: Array<Partial<TeacherProjectSettingsV1>>
    moduleContext?: Partial<ModuleContextSettingsV1>
    provider?: Parameters<typeof normalizeModelProviderSettings>[0]
    write?: WriteSettingsPatchV1
    claw?: ClawSettingsPatchV1
    schedule?: ScheduleSettingsPatchV1
    guiUpdate?: Partial<GuiUpdateConfigV1>
  }
  const runtime = getKunRuntimeSettings(maybeSettings)
  return {
    ...migrated,
    version: 1,
    locale: maybeSettings.locale === 'zh' ? 'zh' : 'en',
    theme:
      maybeSettings.theme === 'light' || maybeSettings.theme === 'dark' || maybeSettings.theme === 'system'
        ? maybeSettings.theme
        : 'system',
    uiFontScale:
      maybeSettings.uiFontScale === 'small' ||
      maybeSettings.uiFontScale === 'medium' ||
      maybeSettings.uiFontScale === 'large'
        ? maybeSettings.uiFontScale
        : 'small',
    provider: normalizeModelProviderSettings(maybeSettings.provider),
    agents: kunSettingsEnvelope(mergeKunRuntimeSettings(defaultKunRuntimeSettings(), {
      ...runtime,
      baseUrl: runtime.baseUrl.trim() ? normalizeDeepseekBaseUrl(runtime.baseUrl) : ''
    })),
    workspaceRoot: typeof maybeSettings.workspaceRoot === 'string' ? maybeSettings.workspaceRoot : '',
    log: {
      enabled: maybeSettings.log?.enabled !== false,
      retentionDays: typeof maybeSettings.log?.retentionDays === 'number' ? maybeSettings.log.retentionDays : 2
    },
    notifications: {
      turnComplete: maybeSettings.notifications?.turnComplete !== false
    },
    showTechnicalMetrics: maybeSettings.showTechnicalMetrics === true,
    teacherProfile: normalizeTeacherProfileSettings(maybeSettings.teacherProfile),
    teacherProjects: normalizeTeacherProjectSettings(maybeSettings.teacherProjects),
    moduleContext: normalizeModuleContextSettings(maybeSettings.moduleContext),
    appBehavior: normalizeAppBehaviorSettings(maybeSettings.appBehavior),
    write: normalizeWriteSettings(maybeSettings.write),
    claw: normalizeClawSettings(maybeSettings.claw),
    schedule: normalizeScheduleSettings(maybeSettings.schedule),
    guiUpdate: {
      channel: normalizeGuiUpdateChannel(
        maybeSettings.guiUpdate?.channel ?? DEFAULT_GUI_UPDATE_CHANNEL
      )
    }
  }
}

export function normalizeTeacherProfileSettings(
  profile?: Partial<TeacherProfileSettingsV1>
): TeacherProfileSettingsV1 {
  return {
    name: typeof profile?.name === 'string' ? profile.name.trim() : '',
    school: typeof profile?.school === 'string' ? profile.school.trim() : '',
    department: typeof profile?.department === 'string' ? profile.department.trim() : '',
    courses: compactStrings(profile?.courses),
    researchTopics: compactStrings(profile?.researchTopics)
  }
}

export function normalizeTeacherProjectSettings(
  projects?: Array<Partial<TeacherProjectSettingsV1>>
): TeacherProjectSettingsV1[] {
  if (!Array.isArray(projects)) return []

  return projects
    .slice(0, 200)
    .map((project) => {
      const id = typeof project?.id === 'string' ? project.id.trim() : ''
      const name = typeof project?.name === 'string' ? project.name.trim() : ''
      if (!id || !name) return null

      const workspacePath = typeof project?.workspacePath === 'string'
        ? project.workspacePath.trim()
        : ''
      const summary = typeof project?.summary === 'string' ? project.summary.trim() : ''
      const lastUsedAt = typeof project?.lastUsedAt === 'string' ? project.lastUsedAt.trim() : ''

      return {
        id,
        name,
        type: project?.type === 'research' ? 'research' : 'teaching',
        ...(workspacePath ? { workspacePath } : {}),
        lastUsedAt,
        ...(summary ? { summary } : {})
      }
    })
    .filter((project): project is TeacherProjectSettingsV1 => project !== null)
}

function normalizeContextString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeOptionalProjectId(value: unknown): string | undefined {
  const id = normalizeContextString(value)
  return id ? id : undefined
}

function normalizeContextStringArray(values: unknown): string[] {
  if (!Array.isArray(values)) return []
  return compactStrings(values).slice(0, 20)
}

function normalizeModuleProjectContext(project: unknown): TeacherModuleProjectContextV1 | null {
  if (!project || typeof project !== 'object' || Array.isArray(project)) return null
  const source = project as Record<string, unknown>
  const next: TeacherModuleProjectContextV1 = {}

  if (source.syllabus && typeof source.syllabus === 'object' && !Array.isArray(source.syllabus)) {
    const syllabus = source.syllabus as Record<string, unknown>
    const context = {
      courseName: normalizeContextString(syllabus.courseName),
      topic: normalizeContextString(syllabus.topic),
      hours: normalizeContextString(syllabus.hours),
      students: normalizeContextString(syllabus.students),
      major: normalizeContextString(syllabus.major),
      updatedAt: normalizeContextString(syllabus.updatedAt)
    }
    if (context.courseName || context.topic || context.hours || context.students || context.major) {
      next.syllabus = context
    }
  }

  if (source.courseware && typeof source.courseware === 'object' && !Array.isArray(source.courseware)) {
    const courseware = source.courseware as Record<string, unknown>
    const audience: CoursewareModuleContextV1['audience'] =
      courseware.audience === 'graduate' || courseware.audience === 'international'
        ? courseware.audience
        : 'undergraduate'
    const durationMinutes = typeof courseware.durationMinutes === 'number' && Number.isFinite(courseware.durationMinutes)
      ? Math.max(15, Math.min(480, Math.round(courseware.durationMinutes)))
      : 90
    const context = {
      topic: normalizeContextString(courseware.topic),
      durationMinutes,
      audience,
      focus: normalizeContextString(courseware.focus),
      updatedAt: normalizeContextString(courseware.updatedAt)
    }
    if (context.topic || context.focus) next.courseware = context
  }

  if (
    source.writingBlueprint &&
    typeof source.writingBlueprint === 'object' &&
    !Array.isArray(source.writingBlueprint)
  ) {
    const blueprint = source.writingBlueprint as Record<string, unknown>
    const context = {
      sourceModule: 'paper-polish' as const,
      taskLabel: normalizeContextString(blueprint.taskLabel),
      userInput: normalizeContextString(blueprint.userInput),
      fileNames: normalizeContextStringArray(blueprint.fileNames),
      displayText: normalizeContextString(blueprint.displayText),
      updatedAt: normalizeContextString(blueprint.updatedAt)
    }
    if (context.userInput || context.fileNames.length > 0 || context.displayText) {
      next.writingBlueprint = context
    }
  }

  return Object.keys(next).length > 0 ? next : null
}

export function normalizeModuleContextSettings(
  context?: Partial<ModuleContextSettingsV1>
): ModuleContextSettingsV1 {
  const projects: ModuleContextSettingsV1['projects'] = {}
  const rawProjects = context?.projects
  if (rawProjects && typeof rawProjects === 'object' && !Array.isArray(rawProjects)) {
    for (const [rawProjectId, rawProject] of Object.entries(rawProjects).slice(-200)) {
      const projectId = normalizeContextString(rawProjectId)
      if (!projectId) continue
      const normalized = normalizeModuleProjectContext(rawProject)
      if (normalized) projects[projectId] = normalized
    }
  }

  return {
    projects,
    recent: {
      ...(normalizeOptionalProjectId(context?.recent?.syllabusProjectId)
        ? { syllabusProjectId: normalizeOptionalProjectId(context?.recent?.syllabusProjectId) }
        : {}),
      ...(normalizeOptionalProjectId(context?.recent?.writingBlueprintProjectId)
        ? { writingBlueprintProjectId: normalizeOptionalProjectId(context?.recent?.writingBlueprintProjectId) }
        : {})
    }
  }
}

export function normalizeAppBehaviorSettings(
  settings?: Partial<AppBehaviorConfigV1>
): AppBehaviorConfigV1 {
  const openAtLogin = settings?.openAtLogin === true
  return {
    openAtLogin,
    startMinimized: openAtLogin && settings?.startMinimized === true,
    closeToTray: settings?.closeToTray === true
  }
}

function shouldMigrateLegacySettings(settings: AppSettingsV1): boolean {
  const raw = settings as AppSettingsV1 & {
    agentProvider?: unknown
    deepseek?: unknown
    agents?: {
      kun?: Partial<ReturnType<typeof defaultKunRuntimeSettings>>
      codewhale?: unknown
      reasonix?: unknown
    }
  }
  if (!raw.agents?.kun) return true
  if ('agentProvider' in raw || 'deepseek' in raw) return true
  if (raw.agents.codewhale || raw.agents.reasonix) return true
  const dataDir = typeof raw.agents.kun.dataDir === 'string'
    ? raw.agents.kun.dataDir.replace(/\\/g, '/').toLowerCase()
    : ''
  return dataDir === '~/.deepseekgui/coreagent' || dataDir.endsWith('/.deepseekgui/coreagent')
}
