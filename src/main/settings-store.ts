import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { safeStorage } from 'electron'
import {
  applyKunRuntimePatch,
  kunSettingsEnvelope,
  DEFAULT_GUI_UPDATE_CHANNEL,
  DEFAULT_WRITE_WORKSPACE_ROOT,
  defaultClawSettings,
  defaultKunRuntimeSettings,
  defaultModelProviderSettings,
  defaultScheduleSettings,
  getKunRuntimeSettings,
  mergeKunRuntimeSettings,
  mergeModelProviderSettings,
  defaultWriteSettings,
  mergeClawSettings,
  mergeScheduleSettings,
  mergeWriteSettings,
  normalizeAppBehaviorSettings,
  normalizeModuleContextSettings,
  normalizeTeacherProjectSettings,
  normalizeTeacherProfileSettings,
  migrateLegacyAppSettings,
  normalizeAppSettings,
  type AppSettingsPatch,
  type AppSettingsV1,
  type ClawImChannelV1,
  type ClawImConversationV1
} from '../shared/app-settings'

export type { AppSettingsV1 }

type EncryptedSettingsSecretsV1 = {
  providerApiKey?: string
  providerProfileApiKeys?: Record<string, string>
  kunApiKey?: string
  writeInlineCompletionApiKey?: string
}

type SettingsDiskSnapshot = Partial<AppSettingsV1> & Record<string, any> & {
  encryptedSecrets?: EncryptedSettingsSecretsV1
}

const DEFAULT_WORKSPACE_ROOT = join(homedir(), '.zhiyan', 'default_workspace')
const DEFAULT_CLAW_CHANNELS_ROOT = join(homedir(), '.zhiyan', 'claw')
const DEFAULT_WRITE_WORKSPACE_ROOT_ABSOLUTE = expandHomePath(DEFAULT_WRITE_WORKSPACE_ROOT)
const WELCOME_MARKDOWN = `# Welcome to Write

This is your default writing workspace.

- Create Markdown drafts from the sidebar.
- Select text in the editor and ask the writing assistant about it.
- Switch between source, live, split, and preview modes from the top bar.
`

export function expandHomePath(raw: string | null | undefined): string {
  const value = typeof raw === 'string' ? raw.trim() : ''
  if (!value) return ''
  if (value === '~') return homedir()
  if (value.startsWith('~/') || value.startsWith('~\\')) {
    return join(homedir(), value.slice(2))
  }
  return value
}

function normalizeWorkspaceRoot(raw: string | null | undefined): string {
  return expandHomePath(raw) || DEFAULT_WORKSPACE_ROOT
}

function normalizeWriteWorkspaceRoot(raw: string | null | undefined): string {
  return expandHomePath(raw) || DEFAULT_WRITE_WORKSPACE_ROOT_ABSOLUTE
}

function sanitizePathSegment(raw: string | null | undefined, fallback: string): string {
  const value = typeof raw === 'string' ? raw.trim() : ''
  const sanitized = value
    .replace(/[\\/]/g, '-')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return sanitized || fallback
}

function defaultClawChannelWorkspaceRoot(channel: ClawImChannelV1): string {
  const credential = channel.platformCredential
  const domain = credential?.kind === 'feishu'
    ? credential.domain
    : credential?.kind === 'weixin'
      ? 'weixin'
      : channel.provider
  const credentialId = credential?.kind === 'feishu'
    ? credential.appId
    : credential?.kind === 'weixin'
      ? credential.accountId
      : ''
  const workspaceId = sanitizePathSegment(credentialId || channel.id, 'channel')
  return join(DEFAULT_CLAW_CHANNELS_ROOT, channel.provider, domain, workspaceId)
}

function normalizeClawChannelWorkspaceRoot(channel: ClawImChannelV1): string {
  return expandHomePath(channel.workspaceRoot) || defaultClawChannelWorkspaceRoot(channel)
}

function sanitizeConversationWorkspaceSegment(conversation: ClawImConversationV1): string {
  return sanitizePathSegment(
    conversation.remoteThreadId || conversation.chatId,
    conversation.id || 'conversation'
  )
}

function defaultClawConversationWorkspaceRoot(
  channel: ClawImChannelV1,
  conversation: ClawImConversationV1
): string {
  return join(normalizeClawChannelWorkspaceRoot(channel), 'conversations', sanitizeConversationWorkspaceSegment(conversation))
}

function normalizeClawConversationWorkspaceRoot(
  channel: ClawImChannelV1,
  conversation: ClawImConversationV1
): string {
  return expandHomePath(conversation.workspaceRoot) || defaultClawConversationWorkspaceRoot(channel, conversation)
}

function normalizeStoredSettings(settings: AppSettingsV1): AppSettingsV1 {
  const normalized = normalizeAppSettings(settings)
  const writeDefaultRoot = normalizeWriteWorkspaceRoot(normalized.write.defaultWorkspaceRoot)
  const writeActiveRoot = normalizeWriteWorkspaceRoot(normalized.write.activeWorkspaceRoot || writeDefaultRoot)
  const writeWorkspaces = [...new Set(
    [writeDefaultRoot, writeActiveRoot, ...normalized.write.workspaces.map(normalizeWriteWorkspaceRoot)]
      .filter(Boolean)
  )]
  return {
    ...normalized,
    workspaceRoot: normalizeWorkspaceRoot(normalized.workspaceRoot),
    write: {
      defaultWorkspaceRoot: writeDefaultRoot,
      activeWorkspaceRoot: writeWorkspaces.includes(writeActiveRoot) ? writeActiveRoot : writeDefaultRoot,
      workspaces: writeWorkspaces.length > 0 ? writeWorkspaces : [writeDefaultRoot],
      inlineCompletion: normalized.write.inlineCompletion
    },
    claw: {
      ...normalized.claw,
      channels: normalized.claw.channels.map((channel) => ({
        ...channel,
        workspaceRoot: normalizeClawChannelWorkspaceRoot(channel),
        conversations: channel.conversations.map((conversation) => ({
          ...conversation,
          workspaceRoot: normalizeClawConversationWorkspaceRoot(channel, conversation)
        }))
      }))
    }
  }
}

function canUseSafeStorage(): boolean {
  try {
    return safeStorage.isEncryptionAvailable()
  } catch {
    return false
  }
}

function encryptSecret(value: string): string {
  return safeStorage.encryptString(value).toString('base64')
}

function decryptSecret(value: string): string {
  return safeStorage.decryptString(Buffer.from(value, 'base64'))
}

function cloneSettingsForDisk(settings: AppSettingsV1): SettingsDiskSnapshot {
  return JSON.parse(JSON.stringify(settings)) as SettingsDiskSnapshot
}

function redactEncryptedSettingsSecrets(settings: AppSettingsV1): SettingsDiskSnapshot {
  if (!canUseSafeStorage()) return settings

  const disk = cloneSettingsForDisk(settings)
  const encryptedSecrets: EncryptedSettingsSecretsV1 = {}

  const providerApiKey = disk.provider?.apiKey?.trim() ?? ''
  if (providerApiKey) {
    encryptedSecrets.providerApiKey = encryptSecret(providerApiKey)
    disk.provider!.apiKey = ''
  }

  for (const provider of disk.provider?.providers ?? []) {
    const apiKey = provider.apiKey?.trim() ?? ''
    if (!apiKey) continue
    encryptedSecrets.providerProfileApiKeys ??= {}
    encryptedSecrets.providerProfileApiKeys[provider.id] = encryptSecret(apiKey)
    provider.apiKey = ''
  }

  const kunApiKey = disk.agents?.kun?.apiKey?.trim() ?? ''
  if (kunApiKey) {
    encryptedSecrets.kunApiKey = encryptSecret(kunApiKey)
    disk.agents!.kun!.apiKey = ''
  }

  const inlineApiKey = disk.write?.inlineCompletion?.apiKey?.trim() ?? ''
  if (inlineApiKey) {
    encryptedSecrets.writeInlineCompletionApiKey = encryptSecret(inlineApiKey)
    disk.write!.inlineCompletion.apiKey = ''
  }

  if (Object.keys(encryptedSecrets).length > 0) {
    disk.encryptedSecrets = encryptedSecrets
  }
  return disk
}

function hydrateEncryptedSettingsSecrets(parsed: SettingsDiskSnapshot): Partial<AppSettingsV1> {
  const next = JSON.parse(JSON.stringify(parsed)) as Record<string, any>
  const encryptedSecrets = next.encryptedSecrets
  delete next.encryptedSecrets
  if (!encryptedSecrets || !canUseSafeStorage()) return next as Partial<AppSettingsV1>

  try {
    if (encryptedSecrets.providerApiKey) {
      next.provider ??= {}
      next.provider.apiKey = decryptSecret(encryptedSecrets.providerApiKey)
    }
    if (encryptedSecrets.providerProfileApiKeys && next.provider?.providers) {
      next.provider.providers = next.provider.providers.map((provider: Record<string, any>) => {
        const encrypted = encryptedSecrets.providerProfileApiKeys?.[provider.id]
        return encrypted ? { ...provider, apiKey: decryptSecret(encrypted) } : provider
      })
    }
    if (encryptedSecrets.kunApiKey) {
      next.agents ??= {}
      next.agents.kun ??= {}
      next.agents.kun.apiKey = decryptSecret(encryptedSecrets.kunApiKey)
    }
    if (encryptedSecrets.writeInlineCompletionApiKey) {
      next.write ??= {}
      next.write.inlineCompletion ??= {}
      next.write.inlineCompletion.apiKey = decryptSecret(encryptedSecrets.writeInlineCompletionApiKey)
    }
  } catch {
    // Keep the rest of the settings readable if OS keychain decryption fails.
  }
  return next as Partial<AppSettingsV1>
}

function serializeSettingsForDisk(settings: AppSettingsV1): string {
  return JSON.stringify(redactEncryptedSettingsSecrets(normalizeStoredSettings(settings)), null, 2)
}

export async function ensureWorkspaceRootExists(workspaceRoot: string): Promise<string> {
  const normalized = normalizeWorkspaceRoot(workspaceRoot)
  await mkdir(normalized, { recursive: true })
  return normalized
}

async function ensureWriteWorkspaceRootsExist(settings: AppSettingsV1): Promise<void> {
  for (const workspaceRoot of settings.write.workspaces) {
    if (!workspaceRoot) continue
    await mkdir(workspaceRoot, { recursive: true })
  }

  const welcomePath = join(settings.write.defaultWorkspaceRoot, 'welcome.md')
  try {
    await writeFile(welcomePath, WELCOME_MARKDOWN, { encoding: 'utf8', flag: 'wx' })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
  }
}

async function ensureClawChannelWorkspaceRootsExist(settings: AppSettingsV1): Promise<void> {
  for (const channel of settings.claw.channels) {
    const workspaceRoot = normalizeClawChannelWorkspaceRoot(channel)
    if (!workspaceRoot) continue
    await mkdir(workspaceRoot, { recursive: true })
    for (const conversation of channel.conversations) {
      const conversationWorkspaceRoot = normalizeClawConversationWorkspaceRoot(channel, conversation)
      if (!conversationWorkspaceRoot) continue
      await mkdir(conversationWorkspaceRoot, { recursive: true })
    }
  }
}

const defaultSettings = (): AppSettingsV1 => ({
  version: 1,
  locale: 'en',
  theme: 'system',
  uiFontScale: 'small',
  provider: defaultModelProviderSettings(),
  agents: {
    kun: defaultKunRuntimeSettings()
  },
  workspaceRoot: DEFAULT_WORKSPACE_ROOT,
  log: {
    enabled: true,
    retentionDays: 2
  },
  notifications: {
    turnComplete: true
  },
  showTechnicalMetrics: false,
  teacherProfile: normalizeTeacherProfileSettings(),
  teacherProjects: normalizeTeacherProjectSettings(),
  moduleContext: normalizeModuleContextSettings(),
  appBehavior: normalizeAppBehaviorSettings(),
  guiUpdate: {
    channel: DEFAULT_GUI_UPDATE_CHANNEL
  },
  write: defaultWriteSettings(),
  claw: defaultClawSettings(),
  schedule: defaultScheduleSettings()
})

function buildMergedSettings(parsed: Partial<AppSettingsV1>): AppSettingsV1 {
  const migrated = migrateLegacyAppSettings(parsed)
  const defaults = defaultSettings()
  return {
    ...defaults,
    ...migrated,
    provider: mergeModelProviderSettings(defaults.provider, migrated.provider),
    agents: kunSettingsEnvelope(
      mergeKunRuntimeSettings(getKunRuntimeSettings(defaults), migrated.agents?.kun)
    ),
    log: { ...defaults.log, ...migrated.log },
    notifications: { ...defaults.notifications, ...migrated.notifications },
    teacherProfile: normalizeTeacherProfileSettings({
      ...defaults.teacherProfile,
      ...migrated.teacherProfile
    }),
    teacherProjects: normalizeTeacherProjectSettings(migrated.teacherProjects),
    moduleContext: normalizeModuleContextSettings(migrated.moduleContext),
    appBehavior: normalizeAppBehaviorSettings({
      ...defaults.appBehavior,
      ...migrated.appBehavior
    }),
    write: mergeWriteSettings(defaults.write, migrated.write),
    claw: mergeClawSettings(defaults.claw, migrated.claw),
    schedule: mergeScheduleSettings(defaults.schedule, migrated.schedule),
    guiUpdate: { ...defaults.guiUpdate, ...migrated.guiUpdate }
  }
}

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null
}

async function loadDefaultSettings(): Promise<AppSettingsV1> {
  const defaults = normalizeStoredSettings(defaultSettings())
  await ensureWorkspaceRootExists(defaults.workspaceRoot)
  await ensureWriteWorkspaceRootsExist(defaults)
  await ensureClawChannelWorkspaceRootsExist(defaults)
  return defaults
}

async function writeInvalidSettingsBackup(path: string, raw: string): Promise<string | null> {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupPath = join(
    dirname(path),
    `${basename(path, '.json')}.invalid-${stamp}.json`
  )
  try {
    await writeFile(backupPath, raw, 'utf8')
    return backupPath
  } catch {
    return null
  }
}

export class JsonSettingsStore {
  private path: string
  private cache: AppSettingsV1 | null = null

  constructor(userDataPath: string) {
    this.path = join(userDataPath, 'deepseek-gui-settings.json')
  }

  async load(): Promise<AppSettingsV1> {
    if (this.cache) return this.cache

    let raw = ''
    try {
      raw = await readFile(this.path, 'utf8')
    } catch (error) {
      if (isErrnoException(error) && error.code === 'ENOENT') {
        this.cache = await loadDefaultSettings()
        return this.cache
      }
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to read settings file ${this.path}: ${message}`, { cause: error })
    }

    let parsed: Partial<AppSettingsV1>
    try {
      parsed = hydrateEncryptedSettingsSecrets(JSON.parse(raw) as SettingsDiskSnapshot)
    } catch (error) {
      if (error instanceof SyntaxError) {
        const backupPath = await writeInvalidSettingsBackup(this.path, raw)
        const defaults = await loadDefaultSettings()
        await this.save(defaults)
        if (backupPath) {
          console.warn(
            `[deepseek-gui] Invalid settings JSON was replaced with defaults. Backup: ${backupPath}`
          )
        } else {
          console.warn(
            `[deepseek-gui] Invalid settings JSON was replaced with defaults. Backup could not be written for ${this.path}.`
          )
        }
        return defaults
      }
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to parse settings file ${this.path}: ${message}`, { cause: error })
    }

    const normalized = normalizeStoredSettings(buildMergedSettings(parsed))
    await ensureWorkspaceRootExists(normalized.workspaceRoot)
    await ensureWriteWorkspaceRootsExist(normalized)
    await ensureClawChannelWorkspaceRootsExist(normalized)
    this.cache = normalized
    return this.cache
  }

  async save(data: AppSettingsV1): Promise<void> {
    const normalized = normalizeStoredSettings(data)
    await ensureWorkspaceRootExists(normalized.workspaceRoot)
    await ensureWriteWorkspaceRootsExist(normalized)
    await ensureClawChannelWorkspaceRootsExist(normalized)
    this.cache = normalized
    await mkdir(dirname(this.path), { recursive: true })
    await writeFile(this.path, serializeSettingsForDisk(normalized), 'utf8')
  }

  async patch(partial: AppSettingsPatch): Promise<AppSettingsV1> {
    const cur = await this.load()
    const { agents: agentsPatch, provider: providerPatch, ...restPatch } = partial
    const next = normalizeStoredSettings({
      ...applyKunRuntimePatch(cur, agentsPatch?.kun),
      ...restPatch,
      provider: mergeModelProviderSettings(cur.provider, providerPatch),
      log: { ...cur.log, ...(partial.log ?? {}) },
      notifications: { ...cur.notifications, ...(partial.notifications ?? {}) },
      teacherProfile: normalizeTeacherProfileSettings({
        ...cur.teacherProfile,
        ...(partial.teacherProfile ?? {})
      }),
      teacherProjects: normalizeTeacherProjectSettings(
        partial.teacherProjects ?? cur.teacherProjects
      ),
      moduleContext: normalizeModuleContextSettings({
        projects: {
          ...cur.moduleContext.projects,
          ...(partial.moduleContext?.projects ?? {})
        },
        recent: {
          ...cur.moduleContext.recent,
          ...(partial.moduleContext?.recent ?? {})
        }
      }),
      appBehavior: normalizeAppBehaviorSettings({
        ...cur.appBehavior,
        ...(partial.appBehavior ?? {})
      }),
      write: mergeWriteSettings(cur.write, partial.write),
      claw: mergeClawSettings(cur.claw, partial.claw),
      schedule: mergeScheduleSettings(cur.schedule, partial.schedule),
      guiUpdate: { ...cur.guiUpdate, ...(partial.guiUpdate ?? {}) }
    })
    await this.save(next)
    return next
  }
}

export function getRuntimeBaseUrl(port: number): string {
  return `http://127.0.0.1:${port}`
}

export function devServerHintUrl(): string | undefined {
  return process.env.ELECTRON_RENDERER_URL
}
