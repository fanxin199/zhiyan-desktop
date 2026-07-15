import { describe, expect, it } from 'vitest'
import {
  ZHIYAN_MODULE_REGISTRY,
  ZHIYAN_MODULE_ROUTE_IDS,
  ZHIYAN_MODULE_SECTIONS,
  getZhiYanDashboardModules,
  getZhiYanModule,
  getZhiYanSidebarModules,
  isZhiYanModuleRoute
} from './zhiyan-module-registry'

describe('ZhiYan module registry', () => {
  it('defines every direct teacher route exactly once', () => {
    expect(new Set(ZHIYAN_MODULE_ROUTE_IDS).size).toBe(ZHIYAN_MODULE_ROUTE_IDS.length)
    expect(ZHIYAN_MODULE_ROUTE_IDS).toEqual([
      'dashboard',
      'syllabus',
      'ppt-gen',
      'textbook',
      'paper-polish',
      'literature',
      'review-writing',
      'grant-writing',
      'bioinformatics',
      'write',
      'chat',
      'file-manager'
    ])
    expect(isZhiYanModuleRoute('bioinformatics')).toBe(true)
    expect(isZhiYanModuleRoute('settings')).toBe(false)
  })

  it('keeps section, task, search, icon, and capability metadata complete', () => {
    expect(ZHIYAN_MODULE_SECTIONS.map((section) => section.label)).toEqual(['教学', '科研', '能力中心'])
    for (const module of ZHIYAN_MODULE_REGISTRY) {
      expect(module.sidebarLabel.trim()).not.toBe('')
      expect(module.taskDescription.trim()).not.toBe('')
      expect(module.keywords.length).toBeGreaterThan(0)
      expect(module.requiredCapabilities.length).toBeGreaterThan(0)
      expect(module.icon).toBeTypeOf('object')
    }
    expect(getZhiYanModule('bioinformatics')?.requiredCapabilities).toEqual([
      'ai',
      'workspace-files',
      'python-base',
      'python-bioinformatics'
    ])
  })

  it('derives sidebar and dashboard collections from the same definitions', () => {
    expect(getZhiYanSidebarModules().map((module) => module.id)).toEqual(ZHIYAN_MODULE_ROUTE_IDS)
    expect(getZhiYanDashboardModules('teaching').map((module) => module.dashboard?.title)).toEqual([
      '智能教案',
      '制作课件 PPT',
      '教材编写'
    ])
    expect(getZhiYanDashboardModules('research').map((module) => module.id)).toEqual([
      'paper-polish',
      'literature',
      'review-writing',
      'grant-writing',
      'bioinformatics'
    ])
    expect(getZhiYanDashboardModules('capabilities').map((module) => module.id)).toEqual(['write', 'chat'])
  })
})
