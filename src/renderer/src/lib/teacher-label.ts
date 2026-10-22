import type { TeacherProfileSettingsV1 } from '@shared/app-settings'

export function teacherLabel(profile: Pick<TeacherProfileSettingsV1, 'name'> | undefined): string {
  const name = profile?.name?.trim() ?? ''
  if (!name) return '老师'
  return /(老师|教授|博士|医生|主任)$/u.test(name) ? name : `${name}老师`
}
