import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it } from 'vitest'
import i18n from '../../i18n'
import { MessageTimelineEmptyHero } from './message-timeline-empty'

function renderHero(options: {
  ready?: boolean
  hasWorkspace?: boolean
} = {}): string {
  return renderToStaticMarkup(
    createElement(MessageTimelineEmptyHero, {
      ready: options.ready ?? true,
      hasWorkspace: options.hasWorkspace ?? true,
      onPickWorkspace: () => undefined,
      onRetry: () => undefined,
      onOpenSettings: () => undefined
    })
  )
}

describe('MessageTimeline initial heatmap empty hero routing', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
  })

  it('shows the Kun heatmap for eligible initial chat states', () => {
    const html = renderHero()

    expect(html).toContain('data-testid="usage-insights-toggle"')
    expect(html).toContain('Overview')
    expect(html).toContain('Models')
    expect(html).not.toContain('ds-runtime-wake-stage')
    expect(html).not.toContain('Start a new conversation')
  })

  it('keeps offline and missing-workspace states gated away from the heatmap', () => {
    const offlineHtml = renderHero({ ready: false })
    expect(offlineHtml).toContain('ZhiYan Assistant is waking the local agent')
    expect(offlineHtml).toContain('ds-runtime-wake-logo')
    expect(offlineHtml).toContain('ds-work-logo')
    expect(renderHero({ hasWorkspace: false })).toContain('Choose working directory')
  })
})
