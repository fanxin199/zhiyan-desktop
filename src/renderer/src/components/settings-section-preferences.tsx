import { useState, type ReactElement } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import type { AppSettingsV1 } from '@shared/app-settings'
import type { TeacherPreferenceV1 } from '@shared/preferences'
import { PROJECT_TYPE_LABELS } from '@shared/project'
import { getZhiYanModule, isZhiYanModuleRoute } from './zhiyan/zhiyan-module-registry'

/** Tools a habit can be limited to. */
export const PREFERENCE_TOOL_IDS = ['syllabus', 'ppt-gen', 'textbook', 'write', 'literature', 'bioinformatics'] as const

/** Where a habit applies, as the teacher reads it: “全部工具”, “课件”, “课程 · 生理学”. */
export function preferenceScopeLabel(preference: TeacherPreferenceV1, projects: AppSettingsV1['teacherProjects']): string {
  if (preference.scope === 'tool' && preference.toolId) {
    return isZhiYanModuleRoute(preference.toolId) ? getZhiYanModule(preference.toolId)?.sidebarLabel ?? preference.toolId : preference.toolId
  }
  if (preference.scope === 'project') {
    const project = projects.find((item) => item.id === preference.projectId)
    return project ? `${PROJECT_TYPE_LABELS[project.type]} · ${project.name}` : '已删除的项目'
  }
  return '全部工具'
}

type PreferencesSectionProps = {
  form: Pick<AppSettingsV1, 'preferences' | 'teacherProjects'>
  update: (patch: Partial<AppSettingsV1>) => void
}

/**
 * 我的偏好 (Task 3.3.2): every remembered habit with where it applies; each can be edited, limited to
 * a tool or deleted, and new ones added. Changes apply to the next generation.
 */
export function PreferencesSettingsSection({ form, update }: PreferencesSectionProps): ReactElement {
  const preferences = form.preferences ?? []
  const [draft, setDraft] = useState('')
  const [draftTool, setDraftTool] = useState('')

  const save = (next: TeacherPreferenceV1[]): void => update({ preferences: next })
  const change = (id: string, patch: Partial<TeacherPreferenceV1>): void =>
    save(preferences.map((preference) => preference.id === id ? { ...preference, ...patch } : preference))

  const add = (): void => {
    const text = draft.trim()
    if (!text) return
    const preference: TeacherPreferenceV1 = {
      id: `pref-${Date.now().toString(36)}`,
      text: text.slice(0, 300),
      scope: draftTool ? 'tool' : 'global',
      ...(draftTool ? { toolId: draftTool } : {}),
      source: 'explicit',
      createdAt: new Date().toISOString()
    }
    save([preference, ...preferences])
    setDraft('')
    setDraftTool('')
  }

  return (
    <section className="space-y-4" aria-label="我的偏好">
      <div>
        <h2 className="text-heading font-semibold text-ds-text">我的偏好</h2>
        <p className="mt-1 text-small text-ds-muted">
          AI 生成和修改时会遵守这些习惯。在 AI 栏说“以后都……”，或同样的修改说过两次，智研助手会问你要不要记住。
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-ds-border-muted bg-ds-card p-3">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) add() }}
          placeholder="例如：课件每页不超过 5 行"
          className="min-w-[12rem] flex-1 rounded-lg border border-ds-border bg-ds-card px-3 py-1.5 text-small text-ds-text outline-none focus:border-accent"
        />
        <select
          value={draftTool}
          onChange={(event) => setDraftTool(event.target.value)}
          aria-label="适用于"
          className="rounded-lg border border-ds-border bg-ds-card px-2 py-1.5 text-small text-ds-text"
        >
          <option value="">全部工具</option>
          {PREFERENCE_TOOL_IDS.map((toolId) => <option key={toolId} value={toolId}>{getZhiYanModule(toolId)?.sidebarLabel}</option>)}
        </select>
        <button type="button" onClick={add} className="inline-flex items-center gap-1 rounded-lg bg-accent px-3 py-1.5 text-small font-semibold text-white">
          <Plus className="h-4 w-4" strokeWidth={1.8} />
          添加
        </button>
      </div>

      {preferences.length === 0 ? (
        <p className="text-small text-ds-muted">还没有记住的习惯。</p>
      ) : (
        <ul className="divide-y divide-ds-border-muted rounded-xl border border-ds-border-muted bg-ds-card">
          {preferences.map((preference) => (
            <li key={preference.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
              <input
                value={preference.text}
                onChange={(event) => change(preference.id, { text: event.target.value })}
                aria-label="习惯"
                className="min-w-[12rem] flex-1 rounded-md border border-transparent bg-transparent px-2 py-1 text-small text-ds-text outline-none hover:border-ds-border focus:border-accent"
              />
              <span className="shrink-0 text-caption text-ds-muted">{preferenceScopeLabel(preference, form.teacherProjects)}</span>
              {preference.source === 'suggested' ? <span className="shrink-0 rounded bg-ds-subtle px-1 text-caption text-ds-muted">发现的</span> : null}
              <button
                type="button"
                onClick={() => save(preferences.filter((item) => item.id !== preference.id))}
                className="shrink-0 rounded-md p-1 text-ds-muted hover:bg-ds-danger-soft hover:text-ds-danger"
                aria-label={`删除“${preference.text}”`}
              >
                <Trash2 className="h-4 w-4" strokeWidth={1.8} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
