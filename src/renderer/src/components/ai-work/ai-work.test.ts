import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import {
  AI_SIDE_PANEL_MAX_WIDTH,
  AI_SIDE_PANEL_MIN_WIDTH,
  AiSidePanel,
  clampAiSidePanelWidth
} from './AiSidePanel'
import { AiWorkExamples, AiWorkPage } from './AiWorkPage'
import { ArtifactTopBar } from './ArtifactTopBar'
import { artifactVersionSourceLabel } from './ArtifactVersionMenu'
import { IntentComposer, composerKeyAction } from './IntentComposer'

const noop = vi.fn()

describe('IntentComposer', () => {
  it('sends on Enter but not on Shift+Enter or while an input method is composing', () => {
    expect(composerKeyAction({ key: 'Enter', shiftKey: false })).toBe('submit')
    expect(composerKeyAction({ key: 'Enter', shiftKey: true })).toBeNull()
    expect(composerKeyAction({ key: 'Enter', shiftKey: false, isComposing: true })).toBeNull()
    expect(composerKeyAction({ key: 'a', shiftKey: false })).toBeNull()
  })

  it('shows materials as chips and offers stop while the AI is working', () => {
    const idle = renderToStaticMarkup(createElement(IntentComposer, {
      value: '',
      onChange: noop,
      onSubmit: noop,
      placeholder: '说说这节课要讲什么',
      attachments: [{ id: 'a', name: '第八章.pdf' }],
      onAddFiles: noop,
      onRemoveAttachment: noop
    }))
    const busy = renderToStaticMarkup(createElement(IntentComposer, {
      value: '改成两课时',
      onChange: noop,
      onSubmit: noop,
      placeholder: '',
      variant: 'panel',
      busy: true,
      onStop: noop
    }))

    expect(idle).toContain('placeholder="说说这节课要讲什么"')
    expect(idle).toContain('第八章.pdf')
    expect(idle).toContain('aria-label="移除 第八章.pdf"')
    expect(idle).toContain('添加材料')
    expect(idle).toContain('aria-label="发送"')
    expect(busy).toContain('aria-label="停止"')
    expect(busy).not.toContain('添加材料')
  })

  it('has no model, reasoning, command or Skill controls (§1.2.2)', () => {
    const html = renderToStaticMarkup(createElement(IntentComposer, {
      value: '', onChange: noop, onSubmit: noop, placeholder: '说一句想怎么改', variant: 'panel', onAddFiles: noop
    }))

    for (const term of ['deepseek', 'auto', '推理', '超高', 'Skills', '输入 /', '<select']) {
      expect(html, term).not.toContain(term)
    }
  })
})

describe('AiSidePanel', () => {
  it('keeps its width between 320 and 480px', () => {
    expect(clampAiSidePanelWidth(200)).toBe(AI_SIDE_PANEL_MIN_WIDTH)
    expect(clampAiSidePanelWidth(900)).toBe(AI_SIDE_PANEL_MAX_WIDTH)
    expect(clampAiSidePanelWidth(400.4)).toBe(400)
    expect(clampAiSidePanelWidth(Number.NaN)).toBe(360)
  })

  it('shows the latest change, self check, conversation and next steps above one input box', () => {
    const html = renderToStaticMarkup(createElement(AiSidePanel, {
      open: true,
      onOpenChange: noop,
      revision: '已修改案例导入，3 处变化',
      checks: 'AI 已自查：1 处建议',
      nextSteps: [{ id: 'ppt', label: '根据教案做课件', onSelect: noop }],
      composer: 'composer-slot',
      children: 'conversation-slot'
    }))

    expect(html).toContain('aria-label="修改结果"')
    expect(html).toContain('aria-label="AI 自查"')
    expect(html).toContain('conversation-slot')
    expect(html).toContain('根据教案做课件')
    expect(html.indexOf('conversation-slot')).toBeLessThan(html.indexOf('composer-slot'))
    expect(html).toContain('style="width:360px"')
  })

  it('collapses to a narrow button', () => {
    const html = renderToStaticMarkup(createElement(AiSidePanel, {
      open: false,
      onOpenChange: noop,
      composer: 'composer-slot',
      children: 'conversation-slot'
    }))

    expect(html).toContain('aria-label="展开 AI 助手"')
    expect(html).not.toContain('conversation-slot')
  })
})

describe('AiWorkPage', () => {
  it('shows only the page header and start content in the start state', () => {
    const html = renderToStaticMarkup(createElement(AiWorkPage, {
      module: 'syllabus',
      title: '教案',
      description: '一句话说明这节课，AI 先写出完整初稿。',
      state: 'start',
      start: 'start-slot',
      canvas: 'canvas-slot'
    }))

    expect(html).toContain('data-ai-work-state="start"')
    expect(html).toContain('<h1')
    expect(html).toContain('start-slot')
    expect(html).not.toContain('canvas-slot')
  })

  it('lays out the top bar, canvas and AI panel in the work state', () => {
    const html = renderToStaticMarkup(createElement(AiWorkPage, {
      module: 'syllabus',
      title: '教案',
      state: 'work',
      topBar: createElement(ArtifactTopBar, { title: '第八章 呼吸系统', stage: '初稿', artifactId: 'art_1' }),
      canvas: 'canvas-slot',
      sidePanel: 'panel-slot'
    }))

    expect(html).toContain('data-ai-work-state="work"')
    expect(html).toContain('第八章 呼吸系统')
    expect(html).toContain('未归档 · 初稿')
    expect(html).toContain('版本')
    expect(html.indexOf('canvas-slot')).toBeLessThan(html.indexOf('panel-slot'))
  })

  it('hides the version menu until the artifact is registered', () => {
    const html = renderToStaticMarkup(createElement(ArtifactTopBar, { title: '新教案' }))

    expect(html).not.toContain('版本')
  })

  it('offers at most three examples', () => {
    const html = renderToStaticMarkup(createElement(AiWorkExamples, {
      examples: ['一', '二', '三', '四'],
      onSelect: noop
    }))

    expect(html.match(/<button/g)).toHaveLength(3)
    expect(html).not.toContain('四')
  })
})

describe('artifact version labels', () => {
  it('names where each version came from in teacher words', () => {
    expect(artifactVersionSourceLabel('ai-generate')).toBe('AI 生成')
    expect(artifactVersionSourceLabel('ai-revise')).toBe('AI 修改')
    expect(artifactVersionSourceLabel('teacher-edit')).toBe('手动修改')
    expect(artifactVersionSourceLabel('restore')).toBe('恢复')
  })
})
