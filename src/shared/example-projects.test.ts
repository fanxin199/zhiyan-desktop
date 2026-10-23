import { describe, expect, it } from 'vitest'
import { EXAMPLE_NOTE, EXAMPLE_PROJECTS } from './example-projects'
import { normalizeProjectBrief } from './project'
import { citedIdentifiers, localSelfCheck } from './self-check'

describe('EXAMPLE_PROJECTS', () => {
  it('has one course and one topic, each with finished results marked as examples', () => {
    expect(EXAMPLE_PROJECTS.map((project) => project.type)).toEqual(['teaching', 'research'])
    for (const project of EXAMPLE_PROJECTS) {
      expect(normalizeProjectBrief(project.type, project.brief)).toEqual(project.brief)
      expect(project.artifacts.length).toBeGreaterThanOrEqual(2)
      for (const artifact of project.artifacts) expect(artifact.markdown).toContain(EXAMPLE_NOTE)
    }
  })

  it('passes its own self-check and cites no real identifiers', () => {
    for (const artifact of EXAMPLE_PROJECTS.flatMap((project) => project.artifacts)) {
      expect(localSelfCheck(artifact.kind, artifact.markdown, artifact.title)).toEqual([])
      expect(citedIdentifiers(artifact.markdown)).toEqual([])
    }
  })
})
