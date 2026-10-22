import type { AiMode } from '@shared/app-settings'

/** The reasoning effort sent with a message for the AI mode chosen in settings. */
export function aiModeReasoningEffort(mode: AiMode): string {
  return mode === 'fast' ? 'off' : 'max'
}
