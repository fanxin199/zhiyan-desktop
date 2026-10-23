import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { SettingRow, Toggle } from './settings-controls'

describe('Toggle', () => {
  it('is named by the title of its setting row', () => {
    const html = renderToStaticMarkup(createElement(SettingRow, {
      title: '完成时通知',
      control: createElement(Toggle, { checked: true, onChange: vi.fn() })
    }))
    const labelledBy = /aria-labelledby="([^"]+)"/u.exec(html)?.[1]
    expect(labelledBy).toBeTruthy()
    expect(html).toContain(`id="${labelledBy}"`)
  })
})
