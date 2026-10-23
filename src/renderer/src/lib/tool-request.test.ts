import { describe, expect, it } from 'vitest'
import { detectToolRequest } from './tool-request'

describe('detectToolRequest', () => {
  it('sends requests for a deliverable to the tool that makes it', () => {
    expect(detectToolRequest('帮我写一份第八章呼吸系统的教案')).toMatchObject({ moduleId: 'syllabus' })
    expect(detectToolRequest('根据这章教材做一套课件，45 分钟')).toMatchObject({ moduleId: 'ppt-gen' })
    expect(detectToolRequest('帮我编写免疫学教材的第三章')).toMatchObject({ moduleId: 'textbook' })
    expect(detectToolRequest('帮我起草国自然面上项目申请书，题目是骨重建')).toMatchObject({ moduleId: 'write', template: 'grant' })
    expect(detectToolRequest('写一篇细胞衰老与纤维化的综述')).toMatchObject({ moduleId: 'write', template: 'review' })
    expect(detectToolRequest('帮我写论文的 Discussion 部分')).toMatchObject({ moduleId: 'write', template: 'paper' })
    expect(detectToolRequest('精读这篇关于 TLS 的论文')).toMatchObject({ moduleId: 'literature' })
    expect(detectToolRequest('用我的差异基因表画火山图')).toMatchObject({ moduleId: 'bioinformatics' })
    expect(detectToolRequest('写一份本学期教学工作总结')).toMatchObject({ moduleId: 'write', template: 'blank' })
  })

  it('keeps questions and everything else in the conversation', () => {
    expect(detectToolRequest('什么是教学设计？')).toBeNull()
    expect(detectToolRequest('课件一般多少页合适？')).toBeNull()
    expect(detectToolRequest('解释一下 B 细胞的类别转换')).toBeNull()
    expect(detectToolRequest('国自然一般几月截止')).toBeNull()
    expect(detectToolRequest('')).toBeNull()
  })
})
