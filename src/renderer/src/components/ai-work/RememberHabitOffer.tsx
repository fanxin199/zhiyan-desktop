import { useState, type ReactElement } from 'react'
import { BookmarkPlus } from 'lucide-react'
import type { TeacherPreferenceV1 } from '@shared/preferences'
import { rendererRuntimeClient } from '../../agent/runtime-client'
import { useActiveProjectStore } from '../../lib/active-project'
import { browserStorage, type BrowserStorageLike } from '../../lib/browser-storage'

const RECENT_INSTRUCTIONS_KEY = 'zhiyan.recentInstructions.v1'
const RECENT_PER_TOOL = 20
const EXPLICIT_HABIT = /以后|今后|往后|每次都|一律|总是/u
const LEADING_HABIT_WORDS = /^(请|麻烦)?\s*(以后|今后|往后)?\s*(都|每次都?|一律|总是)?\s*[，,、:：]?\s*/u

export type HabitSuggestion = { text: string; source: TeacherPreferenceV1['source'] }

function comparable(text: string): string {
  return text.replace(/[\s，,。.！!？?、；;：:“”"'‘’]/gu, '').toLowerCase()
}

/**
 * A habit worth remembering in a change request (Task 3.3.2): said as “以后都…/一律…”, or the same
 * change asked for before with this tool. Null for an ordinary one-off change.
 */
export function habitFromInstruction(instruction: string, earlier: string[]): HabitSuggestion | null {
  const text = instruction.trim()
  if (text.length < 4) return null
  if (EXPLICIT_HABIT.test(text)) {
    const cleaned = text.replace(LEADING_HABIT_WORDS, '').trim() || text
    return { text: cleaned.slice(0, 300), source: 'explicit' }
  }
  const key = comparable(text)
  return earlier.some((item) => comparable(item) === key) ? { text: text.slice(0, 300), source: 'suggested' } : null
}

/** Records a change request for a tool and returns the ones asked before it. */
export function rememberInstruction(toolId: string, instruction: string, storage: BrowserStorageLike | null = browserStorage()): string[] {
  let all: Record<string, string[]> = {}
  try {
    all = JSON.parse(storage?.getItem(RECENT_INSTRUCTIONS_KEY) ?? '{}') as Record<string, string[]>
  } catch {
    all = {}
  }
  const earlier = Array.isArray(all[toolId]) ? all[toolId] : []
  try {
    storage?.setItem(RECENT_INSTRUCTIONS_KEY, JSON.stringify({ ...all, [toolId]: [instruction, ...earlier].slice(0, RECENT_PER_TOOL) }))
  } catch {
    // Forgetting history only means a repeat goes unnoticed.
  }
  return earlier
}

async function saveHabit(suggestion: HabitSuggestion, scope: TeacherPreferenceV1['scope'], toolId: string, projectId: string | null): Promise<void> {
  const settings = await rendererRuntimeClient.getSettings({ forceRefresh: true })
  const existing = settings.preferences ?? []
  if (existing.some((preference) => comparable(preference.text) === comparable(suggestion.text))) return
  const preference: TeacherPreferenceV1 = {
    id: `pref-${Date.now().toString(36)}`,
    text: suggestion.text,
    scope,
    ...(scope === 'tool' ? { toolId } : {}),
    ...(scope === 'project' && projectId ? { projectId } : {}),
    source: suggestion.source,
    createdAt: new Date().toISOString()
  }
  await rendererRuntimeClient.setSettings({ preferences: [preference, ...existing] })
}

/**
 * Watches a tool's change requests and, when one looks like a habit, offers “记住这个习惯？” with
 * where it should apply (Task 3.3.2).
 */
export function useHabitOffer(toolId: string, toolLabel: string): { consider: (instruction: string) => void; offer: ReactElement | null } {
  const [suggestion, setSuggestion] = useState<HabitSuggestion | null>(null)
  const [saved, setSaved] = useState('')
  const projectId = useActiveProjectStore((state) => state.projectId)

  const consider = (instruction: string): void => {
    const earlier = rememberInstruction(toolId, instruction)
    setSaved('')
    setSuggestion(habitFromInstruction(instruction, earlier))
  }

  const remember = async (scope: TeacherPreferenceV1['scope']): Promise<void> => {
    if (!suggestion) return
    await saveHabit(suggestion, scope, toolId, projectId)
    setSaved(`已记住：${suggestion.text}。可以在“设置 › 我的偏好”里修改或删除。`)
    setSuggestion(null)
  }

  const offer = suggestion ? (
    <div role="status" className="rounded-xl border border-accent/30 bg-accent/[0.045] px-3 py-2 text-small text-ds-text">
      <p className="flex items-start gap-1.5">
        <BookmarkPlus className="mt-0.5 h-4 w-4 shrink-0 text-accent" strokeWidth={1.8} />
        <span>记住这个习惯？“{suggestion.text}”</span>
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5 text-caption">
        <button type="button" onClick={() => void remember('tool')} className="rounded-md bg-accent px-2 py-0.5 font-semibold text-white">记住，用于{toolLabel}</button>
        <button type="button" onClick={() => void remember('global')} className="rounded-md border border-ds-border px-2 py-0.5 text-ds-text hover:bg-ds-hover">所有工具都这样</button>
        {projectId ? (
          <button type="button" onClick={() => void remember('project')} className="rounded-md border border-ds-border px-2 py-0.5 text-ds-text hover:bg-ds-hover">只用于这个项目</button>
        ) : null}
        <button type="button" onClick={() => setSuggestion(null)} className="rounded-md px-2 py-0.5 text-ds-muted hover:bg-ds-hover">不用</button>
      </div>
    </div>
  ) : saved ? <p role="status" className="text-caption text-ds-muted">{saved}</p> : null

  return { consider, offer }
}
