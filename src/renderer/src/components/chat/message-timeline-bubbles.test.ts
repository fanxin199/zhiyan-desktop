import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { ChatBlock } from '../../agent/types'
import { composeWritePrompt } from '../../write/quoted-selection'
import { MessageBubble } from './message-timeline-bubbles'

const writePrompt = composeWritePrompt('方向A', [], {
  workspaceRoot: 'C:/Users/teacher/.zhiyan/write_workspace',
  activeFilePath: 'C:/Users/teacher/.zhiyan/write_workspace/welcome.md'
})

function userBlock(extra: Partial<Extract<ChatBlock, { kind: 'user' }>> = {}): ChatBlock {
  return { kind: 'user', id: 'u-1', text: writePrompt, ...extra }
}

describe('user message bubble', () => {
  it('shows only the teacher’s words from a writing assistant message on any page', () => {
    for (const block of [userBlock(), userBlock({ meta: { displayText: writePrompt } })]) {
      const html = renderToStaticMarkup(createElement(MessageBubble, { block }))

      expect(html).toContain('方向A')
      expect(html).not.toContain('request_user_input')
      expect(html).not.toContain('C:/Users/teacher')
    }
  })
})
