import type { TeacherProjectSettingsV1, TeacherProjectTypeV1 } from '@shared/app-settings'
import type { NormalizedThread } from '../agent/types'
import { browserStorage, type BrowserStorageLike } from './browser-storage'

export type ThreadProjectRecord = {
  projectId: string
}

export type ThreadProjectRegistry = {
  version: 1
  bindings: Record<string, ThreadProjectRecord>
}

export type TeacherProjectUpsertInput = {
  moduleId: string
  name: string
  type: TeacherProjectTypeV1
  workspacePath?: string
  summary?: string
  now?: string
}

const THREAD_PROJECT_REGISTRY_KEY = 'deepseekgui.threadProjects.v1'
const MAX_THREAD_PROJECT_REGISTRY_ENTRIES = 500

export function emptyThreadProjectRegistry(): ThreadProjectRegistry {
  return { version: 1, bindings: {} }
}

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function trimEntries(bindings: ThreadProjectRegistry['bindings']): ThreadProjectRegistry['bindings'] {
  return Object.fromEntries(Object.entries(bindings).slice(-MAX_THREAD_PROJECT_REGISTRY_ENTRIES))
}

export function normalizeThreadProjectRegistry(raw: unknown): ThreadProjectRegistry {
  if (!raw || typeof raw !== 'object') return emptyThreadProjectRegistry()
  const source = raw as { bindings?: unknown }
  if (!source.bindings || typeof source.bindings !== 'object') return emptyThreadProjectRegistry()

  const bindings: ThreadProjectRegistry['bindings'] = {}
  for (const [threadIdKey, value] of Object.entries(source.bindings as Record<string, unknown>)) {
    if (!value || typeof value !== 'object') continue
    const threadId = normalizeString(threadIdKey)
    const projectId = normalizeString((value as Record<string, unknown>).projectId)
    if (!threadId || !projectId) continue
    delete bindings[threadId]
    bindings[threadId] = { projectId }
  }

  return { version: 1, bindings: trimEntries(bindings) }
}

export function readThreadProjectRegistry(
  storage: BrowserStorageLike | null = browserStorage()
): ThreadProjectRegistry {
  if (!storage) return emptyThreadProjectRegistry()
  try {
    const raw = storage.getItem(THREAD_PROJECT_REGISTRY_KEY)
    return normalizeThreadProjectRegistry(raw ? JSON.parse(raw) : null)
  } catch {
    return emptyThreadProjectRegistry()
  }
}

export function saveThreadProjectRegistry(
  registry: ThreadProjectRegistry,
  storage: BrowserStorageLike | null = browserStorage()
): void {
  if (!storage) return
  try {
    storage.setItem(THREAD_PROJECT_REGISTRY_KEY, JSON.stringify(normalizeThreadProjectRegistry(registry)))
  } catch {
    /* ignore storage failures */
  }
}

function hashProjectKey(value: string): string {
  let hash = 5381
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) + hash + value.charCodeAt(index)) >>> 0
  }
  return hash.toString(36)
}

export function stableTeacherProjectId(moduleId: string, name: string): string {
  const moduleKey = normalizeString(moduleId).toLowerCase() || 'module'
  const nameKey = normalizeString(name).toLowerCase() || 'untitled'
  return `teacher-project:${moduleKey}:${hashProjectKey(nameKey)}`
}

export function markThreadProject(
  threadId: string,
  projectId: string,
  registry: ThreadProjectRegistry = readThreadProjectRegistry()
): ThreadProjectRegistry {
  const id = normalizeString(threadId)
  const targetProjectId = normalizeString(projectId)
  if (!id || !targetProjectId) return registry
  const bindings = { ...registry.bindings }
  delete bindings[id]
  return normalizeThreadProjectRegistry({
    version: 1,
    bindings: {
      ...bindings,
      [id]: { projectId: targetProjectId }
    }
  })
}

export function forgetThreadProject(
  threadId: string,
  registry: ThreadProjectRegistry = readThreadProjectRegistry()
): ThreadProjectRegistry {
  const id = normalizeString(threadId)
  if (!id || !registry.bindings[id]) return registry
  const bindings = { ...registry.bindings }
  delete bindings[id]
  return normalizeThreadProjectRegistry({ version: 1, bindings })
}

export function hydrateThreadProjectRegistry(
  threads: NormalizedThread[],
  registry: ThreadProjectRegistry = readThreadProjectRegistry()
): ThreadProjectRegistry {
  const normalized = normalizeThreadProjectRegistry(registry)
  const ids = new Set(threads.map((thread) => thread.id).filter(Boolean))
  const bindings: ThreadProjectRegistry['bindings'] = {}
  for (const thread of threads) {
    const projectId = normalizeString(thread.projectId) || normalized.bindings[thread.id]?.projectId
    if (ids.has(thread.id) && projectId) bindings[thread.id] = { projectId }
  }
  return normalizeThreadProjectRegistry({ version: 1, bindings })
}

export function enrichThreadsWithProjectIds(
  threads: NormalizedThread[],
  registry: ThreadProjectRegistry = readThreadProjectRegistry()
): NormalizedThread[] {
  const normalized = normalizeThreadProjectRegistry(registry)
  return threads.map((thread) => {
    const projectId = normalizeString(thread.projectId) || normalized.bindings[thread.id]?.projectId
    return projectId ? { ...thread, projectId } : thread
  })
}

export function upsertTeacherProject(
  projects: TeacherProjectSettingsV1[],
  input: TeacherProjectUpsertInput
): { project: TeacherProjectSettingsV1; projects: TeacherProjectSettingsV1[] } {
  const name = normalizeString(input.name) || '未命名项目'
  const id = stableTeacherProjectId(input.moduleId, name)
  const workspacePath = normalizeString(input.workspacePath)
  const summary = normalizeString(input.summary)
  const lastUsedAt = normalizeString(input.now) || new Date().toISOString()
  const project: TeacherProjectSettingsV1 = {
    id,
    name,
    type: input.type === 'research' ? 'research' : 'teaching',
    ...(workspacePath ? { workspacePath } : {}),
    lastUsedAt,
    ...(summary ? { summary } : {})
  }
  return {
    project,
    projects: [project, ...projects.filter((item) => item.id !== id)].slice(0, 200)
  }
}
