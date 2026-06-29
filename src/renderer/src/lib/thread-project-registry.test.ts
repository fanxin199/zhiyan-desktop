import { describe, expect, it } from 'vitest'
import type { TeacherProjectSettingsV1 } from '@shared/app-settings'
import type { NormalizedThread } from '../agent/types'
import {
  emptyThreadProjectRegistry,
  enrichThreadsWithProjectIds,
  forgetThreadProject,
  hydrateThreadProjectRegistry,
  markThreadProject,
  readThreadProjectRegistry,
  saveThreadProjectRegistry,
  upsertTeacherProject
} from './thread-project-registry'

class MemoryStorage {
  private values = new Map<string, string>()

  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value)
  }
}

function thread(id: string): NormalizedThread {
  return {
    id,
    title: id,
    updatedAt: '2026-06-29T00:00:00.000Z',
    model: 'auto',
    mode: 'agent',
    workspace: 'J:\\courses'
  }
}

describe('thread-project-registry', () => {
  it('persists and restores thread project bindings', () => {
    const storage = new MemoryStorage()
    const registry = markThreadProject(
      'thread-1',
      'project-syllabus',
      emptyThreadProjectRegistry()
    )

    saveThreadProjectRegistry(registry, storage)
    const restored = readThreadProjectRegistry(storage)

    expect(restored.bindings['thread-1']).toEqual({
      projectId: 'project-syllabus'
    })
  })

  it('enriches refreshed runtime threads with project ids and drops missing threads', () => {
    const registry = markThreadProject(
      'missing-thread',
      'old-project',
      markThreadProject('thread-1', 'project-syllabus', emptyThreadProjectRegistry())
    )
    const hydrated = hydrateThreadProjectRegistry([thread('thread-1')], registry)
    const enriched = enrichThreadsWithProjectIds([thread('thread-1')], hydrated)

    expect(hydrated.bindings['missing-thread']).toBeUndefined()
    expect(enriched[0]?.projectId).toBe('project-syllabus')
  })

  it('forgets deleted thread bindings', () => {
    const registry = markThreadProject('thread-1', 'project-syllabus')

    expect(forgetThreadProject('thread-1', registry).bindings['thread-1']).toBeUndefined()
  })
})

describe('upsertTeacherProject', () => {
  it('creates stable topic projects and refreshes matching entries', () => {
    const first = upsertTeacherProject([], {
      moduleId: 'syllabus',
      name: '移植免疫',
      type: 'teaching',
      workspacePath: 'J:\\old',
      now: '2026-06-01T00:00:00.000Z'
    }).project
    const existing: TeacherProjectSettingsV1[] = [first]

    const { project, projects } = upsertTeacherProject(existing, {
      moduleId: 'syllabus',
      name: '移植免疫',
      type: 'teaching',
      workspacePath: 'J:\\courses',
      now: '2026-06-29T00:00:00.000Z'
    })

    expect(project).toEqual({
      id: first.id,
      name: '移植免疫',
      type: 'teaching',
      workspacePath: 'J:\\courses',
      lastUsedAt: '2026-06-29T00:00:00.000Z'
    })
    expect(project.id).toMatch(/^teacher-project:syllabus:/u)
    expect(projects).toHaveLength(1)
  })

  it('keeps different topics as separate projects', () => {
    const first = upsertTeacherProject([], {
      moduleId: 'syllabus',
      name: '移植免疫',
      type: 'teaching'
    })
    const second = upsertTeacherProject(first.projects, {
      moduleId: 'syllabus',
      name: '肿瘤免疫',
      type: 'teaching'
    })

    expect(second.projects.map((project) => project.name)).toEqual(['肿瘤免疫', '移植免疫'])
    expect(new Set(second.projects.map((project) => project.id))).toHaveProperty('size', 2)
  })
})
