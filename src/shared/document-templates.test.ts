import { describe, expect, it } from 'vitest'
import {
  DOCUMENT_TEMPLATE_IDS,
  DOCUMENT_TEMPLATES,
  documentCreateInputSchema,
  documentTemplateForModule
} from './document-templates'

describe('document templates', () => {
  it('opens the old paper, review and grant pages as templates of 文稿', () => {
    expect(documentTemplateForModule('paper-polish')).toBe('paper')
    expect(documentTemplateForModule('review-writing')).toBe('review')
    expect(documentTemplateForModule('grant-writing')).toBe('grant')
    expect(documentTemplateForModule('literature')).toBeNull()
    expect(documentTemplateForModule('write')).toBeNull()
  })

  it('gives every template a label, at most three examples, rules and a first-draft instruction', () => {
    for (const id of DOCUMENT_TEMPLATE_IDS) {
      const template = DOCUMENT_TEMPLATES[id]
      expect(template.id).toBe(id)
      expect(template.label.trim()).not.toBe('')
      expect(template.examples.length).toBeGreaterThan(0)
      expect(template.examples.length).toBeLessThanOrEqual(3)
      expect(template.constraints.some((rule) => rule.includes('不得编造'))).toBe(true)
      expect(template.draftInstruction).toContain('Markdown')
    }
    expect(DOCUMENT_TEMPLATES.grant.draftInstruction).toContain('技术路线')
  })

  it('accepts a blank document without instruction or materials', () => {
    expect(documentCreateInputSchema.parse({ workspaceRoot: '/write', template: 'blank', instruction: '', materials: [] }))
      .toMatchObject({ template: 'blank' })
    expect(() => documentCreateInputSchema.parse({ workspaceRoot: '/write', template: 'poem', instruction: '', materials: [] }))
      .toThrow()
  })
})
