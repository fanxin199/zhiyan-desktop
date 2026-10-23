import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { NormalizedThread } from '../../agent/types'
import { buildAssistantPrompt, describeAssistantContext } from '../../lib/assistant-context'
import { useAssistantStore } from '../../lib/assistant-store'
import { assistantPageContext } from '../Workbench'
import { AssistantDrawer, assistantConversationList } from './AssistantDrawer'

function thread(id: string, title: string, updatedAt: string, extra: Partial<NormalizedThread> = {}): NormalizedThread {
  return { id, title, updatedAt, model: 'auto', mode: 'agent', workspace: 'C:\\workspace', ...extra }
}

function drawerProps(overrides: Partial<Parameters<typeof AssistantDrawer>[0]> = {}): Parameters<typeof AssistantDrawer>[0] {
  return {
    open: true,
    onClose: vi.fn(),
    contextLabel: '文稿 · 第八章教案',
    threads: [],
    activeThreadId: null,
    blocks: [],
    liveReasoning: '',
    liveAssistant: '',
    runtimeConnection: 'ready',
    busy: false,
    onSend: vi.fn(() => null),
    handOffs: [],
    onDismissHandOff: vi.fn(),
    onNewConversation: vi.fn(),
    onSelectThread: vi.fn(),
    onInterrupt: vi.fn(),
    onRetryConnection: vi.fn(),
    onOpenSettings: vi.fn(),
    ...overrides
  }
}

describe('AI assistant context', () => {
  it('names the page and the document being edited', () => {
    expect(assistantPageContext('syllabus', null)).toEqual({ page: '教案' })
    expect(assistantPageContext('write', 'C:\\write\\第八章 教案.md')).toEqual({
      page: '文稿',
      artifact: { kind: '文稿', title: '第八章 教案' }
    })
    expect(assistantPageContext('plugins', null)).toEqual({ page: '工作台' })
    expect(describeAssistantContext(assistantPageContext('write', '/write/综述.md'))).toBe('文稿 · 综述')
  })

  it('puts the page before the teacher’s words in the prompt', () => {
    const prompt = buildAssistantPrompt('这段导入还能怎么改？', { page: '文稿', artifact: { kind: '文稿', title: '第八章教案' } })

    expect(prompt.split('\n')).toEqual([
      '[老师当前所在页面] 文稿',
      '[正在处理的文稿] 第八章教案',
      '如果老师的问题与当前页面或正在处理的内容有关，请结合它回答。',
      '',
      '这段导入还能怎么改？'
    ])
  })
})

describe('AssistantDrawer', () => {
  it('lists conversations with readable names, latest first, and hides empty ones', () => {
    const list = assistantConversationList([
      thread('old', '帮我设计一节翻转课堂', '2026-10-20T08:00:00.000Z'),
      thread('empty', '新会话', '2026-10-23T08:00:00.000Z'),
      thread('write', 'Write Assistant', '2026-10-22T08:00:00.000Z'),
      thread('gone', '已归档', '2026-10-23T09:00:00.000Z', { archived: true })
    ])

    expect(list.map((item) => [item.thread.id, item.title])).toEqual([
      ['write', '写作助手对话'],
      ['old', '帮我设计一节翻转课堂']
    ])
  })

  it('opens over the page with the context it will use and one input box', () => {
    const html = renderToStaticMarkup(createElement(AssistantDrawer, drawerProps()))

    expect(html).toContain('data-testid="assistant-drawer"')
    expect(html).toContain('将参考：文稿 · 第八章教案')
    expect(html).toContain('全部对话')
    expect(html).toContain('新对话')
    expect(html.match(/data-testid="intent-composer"/g)).toHaveLength(1)
  })

  it('renders nothing while closed', () => {
    expect(renderToStaticMarkup(createElement(AssistantDrawer, drawerProps({ open: false })))).toBe('')
  })

  it('says which tool took a request and offers to answer in the chat instead', () => {
    const html = renderToStaticMarkup(createElement(AssistantDrawer, drawerProps({
      handOffs: [{ id: 1, text: '帮我写一份第八章教案', request: { moduleId: 'syllabus', label: '智能教案' } }]
    })))

    expect(html).toContain('已打开「智能教案」，并填好了你的要求')
    expect(html).toContain('改为在对话里回答')
  })
})

describe('requests handed from the assistant to a tool', () => {
  it('are kept outside the page, which is rebuilt when the tool opens', () => {
    const store = useAssistantStore.getState()
    store.handOff({ moduleId: 'syllabus', label: '智能教案' }, '帮我写一份第八章教案')

    const { prefill, handOffs } = useAssistantStore.getState()
    expect(prefill).toMatchObject({ moduleId: 'syllabus', text: '帮我写一份第八章教案' })
    expect(handOffs).toHaveLength(1)

    store.dismissHandOff(handOffs[0].id)
    store.clearPrefill()
    expect(useAssistantStore.getState()).toMatchObject({ prefill: null, handOffs: [] })
  })

  it('fill the input box of the tool page', async () => {
    const { LiteratureReportPage } = await import('../literature/LiteratureReportPage')
    const { DocumentStartView } = await import('../documents/DocumentStartView')
    const { useWriteWorkspaceStore } = await import('../../write/write-workspace-store')
    const initial = useWriteWorkspaceStore.getInitialState()
    const workspaceRoot = initial.workspaceRoot
    initial.workspaceRoot = '/write'
    try {
      expect(renderToStaticMarkup(createElement(LiteratureReportPage, { prefill: { id: 2, text: '精读这篇 TLS 论文' } })))
        .toContain('精读这篇 TLS 论文')
      expect(renderToStaticMarkup(createElement(DocumentStartView, { template: 'grant', prefill: { id: 3, text: '起草国自然申请书' } })))
        .toContain('起草国自然申请书')
    } finally {
      initial.workspaceRoot = workspaceRoot
    }
  })
})
