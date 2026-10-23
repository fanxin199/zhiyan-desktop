import { describe, expect, it } from 'vitest'
import {
  ZHIYAN_MODULE_REGISTRY,
  ZHIYAN_MODULE_ROUTE_IDS,
  ZHIYAN_MODULE_SECTIONS,
  findZhiYanModuleByLabel,
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
      'courses',
      'topics',
      'syllabus',
      'ppt-gen',
      'textbook',
      'quiz',
      'write',
      'paper-polish',
      'literature',
      'review-writing',
      'grant-writing',
      'bioinformatics',
      'chat',
      'file-manager'
    ])
    expect(isZhiYanModuleRoute('bioinformatics')).toBe(true)
    expect(isZhiYanModuleRoute('settings')).toBe(false)
  })

  it('keeps section, task, search, icon, and capability metadata complete', () => {
    expect(ZHIYAN_MODULE_SECTIONS.map((section) => section.label)).toEqual(['教学', '科研', null])
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
    // The final navigation (§4.1): tools are reached from 首页 and the project pages.
    expect(getZhiYanSidebarModules().map((module) => module.id)).toEqual([
      'dashboard',
      'courses',
      'topics',
      'file-manager'
    ])
    expect(getZhiYanSidebarModules().map((module) => module.sidebarLabel)).toEqual([
      '首页',
      '我的课程',
      '我的课题',
      '文件库'
    ])
    expect(getZhiYanDashboardModules('teaching').map((module) => module.dashboard?.title)).toEqual([
      '教案',
      '课件',
      '教材',
      '随堂题'
    ])
    expect(getZhiYanDashboardModules('research').map((module) => module.id)).toEqual([
      'write',
      'literature',
      'bioinformatics'
    ])
    // The AI assistant panel replaces the AI 对话 page.
    expect(getZhiYanDashboardModules('capabilities')).toEqual([])
  })

  it('still recognises the names modules had before Task 1.6.1', () => {
    expect(findZhiYanModuleByLabel('文献阅读')?.id).toBe('literature')
    expect(findZhiYanModuleByLabel('文献')?.id).toBe('literature')
    expect(findZhiYanModuleByLabel('智能教案')?.id).toBe('syllabus')
    expect(findZhiYanModuleByLabel('文件管理')?.id).toBe('file-manager')
    expect(findZhiYanModuleByLabel('不存在')).toBeUndefined()
  })
})
