import { describe, expect, it } from 'vitest'
import {
  filePickPayloadSchema,
  isSafeOpenExternalUrl,
  runtimeRequestPayloadSchema,
  settingsPatchSchema,
  shellOpenExternalUrlSchema,
  skillListPayloadSchema,
  sseStartPayloadSchema,
  workspaceDirectoryCreatePayloadSchema,
  workspaceDirectoryTargetPayloadSchema,
  workspaceEntryDeletePayloadSchema,
  workspaceEntryRenamePayloadSchema,
  workspaceFileWritePayloadSchema,
  writeExportPayloadSchema,
  writeRichClipboardPayloadSchema,
  writeInlineCompletionPayloadSchema
} from './app-ipc-schemas'

describe('app-ipc-schemas', () => {
  it('normalizes runtime request paths', () => {
    const payload = runtimeRequestPayloadSchema.parse({
      path: 'v1/threads?limit=1',
      method: 'GET'
    })

    expect(payload.path).toBe('/v1/threads?limit=1')
  })

  it('accepts the Kun runtime info endpoint', () => {
    const payload = runtimeRequestPayloadSchema.parse({
      path: '/v1/runtime/info',
      method: 'GET'
    })

    expect(payload.path).toBe('/v1/runtime/info')
  })

  it('accepts the Kun runtime tool diagnostics endpoint', () => {
    const payload = runtimeRequestPayloadSchema.parse({
      path: '/v1/runtime/tools',
      method: 'GET'
    })

    expect(payload.path).toBe('/v1/runtime/tools')
  })

  it('accepts the Kun skills endpoint', () => {
    const payload = runtimeRequestPayloadSchema.parse({
      path: '/v1/skills',
      method: 'GET'
    })

    expect(payload.path).toBe('/v1/skills')
  })

  it('accepts Kun attachment and memory endpoints', () => {
    expect(runtimeRequestPayloadSchema.parse({
      path: '/v1/attachments',
      method: 'POST',
      body: '{}'
    }).path).toBe('/v1/attachments')
    expect(runtimeRequestPayloadSchema.parse({
      path: '/v1/attachments/att_1/content?thread_id=thr_1',
      method: 'GET'
    }).path).toBe('/v1/attachments/att_1/content?thread_id=thr_1')
    expect(runtimeRequestPayloadSchema.parse({
      path: '/v1/memory',
      method: 'POST',
      body: '{}'
    }).path).toBe('/v1/memory')
    expect(runtimeRequestPayloadSchema.parse({
      path: '/v1/memory/mem_1',
      method: 'PATCH',
      body: '{}'
    }).path).toBe('/v1/memory/mem_1')
  })

  it('accepts skill list payloads with an optional workspace root', () => {
    expect(skillListPayloadSchema.parse({
      workspaceRoot: ' /tmp/workspace '
    })).toEqual({ workspaceRoot: '/tmp/workspace' })
    expect(skillListPayloadSchema.parse({})).toEqual({})
  })

  it('validates file picker filters before opening native dialogs', () => {
    expect(filePickPayloadSchema.parse({
      defaultPath: ' /tmp/source.pdf ',
      filters: [{ name: 'PDF / Word', extensions: ['pdf', 'docx'] }]
    })).toEqual({
      defaultPath: '/tmp/source.pdf',
      filters: [{ name: 'PDF / Word', extensions: ['pdf', 'docx'] }]
    })

    expect(() =>
      filePickPayloadSchema.parse({
        filters: [{ name: 'Bad', extensions: ['../../secret'] }]
      })
    ).toThrow(/Invalid file extension/)
    expect(() =>
      filePickPayloadSchema.parse({
        filters: [{ name: 'Bad', extensions: [] }]
      })
    ).toThrow()
    expect(() =>
      filePickPayloadSchema.parse({
        filters: [{ name: 'Bad', extensions: ['pdf'] }],
        unexpected: true
      })
    ).toThrow(/Unrecognized key/)
  })

  it('rejects external URLs with executable schemes or embedded credentials', () => {
    expect(shellOpenExternalUrlSchema.parse('https://pubmed.ncbi.nlm.nih.gov/')).toBe(
      'https://pubmed.ncbi.nlm.nih.gov/'
    )
    expect(shellOpenExternalUrlSchema.parse('mailto:teacher@example.edu')).toBe(
      'mailto:teacher@example.edu'
    )
    expect(() => shellOpenExternalUrlSchema.parse('javascript:alert(1)')).toThrow()
    expect(() => shellOpenExternalUrlSchema.parse('https://user:password@example.com/')).toThrow()
  })

  it('accepts Kun thread goal endpoints', () => {
    expect(runtimeRequestPayloadSchema.parse({
      path: '/v1/threads/thr_1/goal',
      method: 'GET'
    }).path).toBe('/v1/threads/thr_1/goal')
    expect(runtimeRequestPayloadSchema.parse({
      path: '/v1/threads/thr_1/goal',
      method: 'POST',
      body: '{}'
    }).path).toBe('/v1/threads/thr_1/goal')
    expect(runtimeRequestPayloadSchema.parse({
      path: '/v1/threads/thr_1/goal',
      method: 'DELETE'
    }).path).toBe('/v1/threads/thr_1/goal')
  })

  it('accepts the Kun thread review endpoint', () => {
    expect(runtimeRequestPayloadSchema.parse({
      path: '/v1/threads/thr_1/review',
      method: 'POST',
      body: '{"target":{"kind":"uncommittedChanges"}}'
    }).path).toBe('/v1/threads/thr_1/review')
  })

  it('rejects runtime request paths outside the modeled Kun API surface', () => {
    expect(() =>
      runtimeRequestPayloadSchema.parse({
        path: '/v1/runtime/secrets',
        method: 'GET'
      })
    ).toThrow(/runtime request path is not allowed/)
  })

  it('rejects runtime request methods that do not match the modeled endpoint', () => {
    expect(() =>
      runtimeRequestPayloadSchema.parse({
        path: '/v1/usage',
        method: 'POST'
      })
    ).toThrow(/runtime request path is not allowed/)
  })

  it('accepts a valid settings patch for kun and write settings', () => {
    const payload = settingsPatchSchema.parse({
      theme: 'dark',
      agents: {
        kun: {
          port: 9000,
          model: 'deepseek-chat',
          tokenEconomy: {
            enabled: true,
            compressToolResults: false,
            historyHygiene: {
              maxToolResultTokens: 4000
            }
          }
        }
      },
      write: {
        inlineCompletion: {
          model: 'deepseek-v4-pro',
          maxTokens: 128
        }
      }
    })

    expect(payload.agents?.kun?.port).toBe(9000)
    expect(payload.agents?.kun?.tokenEconomy?.enabled).toBe(true)
    expect(payload.agents?.kun?.tokenEconomy?.historyHygiene?.maxToolResultTokens).toBe(4000)
    expect(payload.write?.inlineCompletion?.model).toBe('deepseek-v4-pro')
  })

  it('accepts schedule settings patches and task payloads', () => {
    const payload = settingsPatchSchema.parse({
      schedule: {
        enabled: true,
        keepAwake: true,
        defaultWorkspaceRoot: '/tmp/schedule',
        model: 'deepseek-v4-flash',
        mode: 'plan',
        promptPrefix: 'Use the project checklist.',
        skills: {
          defaultNames: ['review'],
          extraDirs: ['/tmp/skills']
        },
        internal: {
          port: 9788,
          secret: 'secret'
        },
        tasks: [{
          id: 'task-1',
          title: 'Daily review',
          enabled: true,
          prompt: 'Review the repo',
          workspaceRoot: '/tmp/schedule',
          model: 'auto',
          reasoningEffort: 'high',
          mode: 'agent',
          schedule: {
            kind: 'daily',
            everyMinutes: 60,
            timeOfDay: '09:30',
            atTime: ''
          },
          lastStatus: 'idle'
        }]
      }
    })

    expect(payload.schedule?.internal?.port).toBe(9788)
    expect(payload.schedule?.tasks?.[0]?.schedule?.kind).toBe('daily')
    expect(payload.schedule?.tasks?.[0]?.reasoningEffort).toBe('high')
  })

  it('accepts teacher project context settings patches', () => {
    const payload = settingsPatchSchema.parse({
      teacherProjects: [{
        id: 'project-1',
        name: '免疫学课件2026',
        type: 'teaching',
        workspacePath: 'J:/courses/immunology',
        lastUsedAt: '2026-06-29T00:00:00.000Z',
        summary: '本科医学免疫学课件项目'
      }]
    })

    expect(payload.teacherProjects?.[0]?.id).toBe('project-1')
    expect(payload.teacherProjects?.[0]?.type).toBe('teaching')
  })

  it('accepts cross-module context settings patches', () => {
    const payload = settingsPatchSchema.parse({
      moduleContext: {
        projects: {
          'project-1': {
            syllabus: {
              courseName: 'Immunology',
              topic: 'B cells',
              hours: '2',
              students: 'undergraduates',
              major: 'clinical medicine',
              updatedAt: '2026-06-29T00:00:00.000Z'
            },
            writingBlueprint: {
              sourceModule: 'paper-polish',
              taskLabel: 'Blueprint',
              userInput: 'Write a TLS review blueprint.',
              fileNames: ['paper.pdf'],
              displayText: 'Research writing · Blueprint',
              updatedAt: '2026-06-29T00:00:00.000Z'
            }
          }
        },
        recent: {
          syllabusProjectId: 'project-1',
          writingBlueprintProjectId: 'project-1'
        }
      }
    })

    expect(payload.moduleContext?.projects?.['project-1']?.syllabus?.topic).toBe('B cells')
    expect(payload.moduleContext?.recent?.writingBlueprintProjectId).toBe('project-1')
  })

  it('strips legacy settings keys before validating settings patches', () => {
    const payload = settingsPatchSchema.parse({
      locale: 'zh',
      reasonix: { model: 'legacy-reasoner' },
      quickChat: { enabled: true },
      agents: {
        kun: {
          port: 9001
        },
        reasonix: {
          model: 'legacy-reasoner'
        },
        quickChat: {
          enabled: true
        }
      }
    })

    expect(payload.locale).toBe('zh')
    expect(payload.agents?.kun?.port).toBe(9001)
    expect('reasonix' in payload).toBe(false)
    expect('quickChat' in payload).toBe(false)
    expect('reasonix' in (payload.agents ?? {})).toBe(false)
    expect('quickChat' in (payload.agents ?? {})).toBe(false)
  })

  it('rejects unknown settings patch fields', () => {
    expect(() =>
      settingsPatchSchema.parse({
        agents: {
          kun: {
            mysteryFlag: true
          }
        }
      })
    ).toThrow(/Unrecognized key/)
  })

  it('rejects unknown schedule patch fields', () => {
    expect(() =>
      settingsPatchSchema.parse({
        schedule: {
          tasks: [{
            id: 'task-1',
            prompt: 'Run',
            schedule: { kind: 'manual' },
            legacyClawOnlyField: true
          }]
        }
      })
    ).toThrow(/Unrecognized key/)
  })

  it('allows only safe external URL protocols', () => {
    expect(isSafeOpenExternalUrl('https://deepseek.com')).toBe(true)
    expect(isSafeOpenExternalUrl('http://127.0.0.1:5173')).toBe(true)
    expect(isSafeOpenExternalUrl('mailto:zhongxingyuemail@gmail.com')).toBe(true)
    expect(isSafeOpenExternalUrl('javascript:alert(1)')).toBe(false)
    expect(isSafeOpenExternalUrl('file:///tmp/test')).toBe(false)
    expect(() => shellOpenExternalUrlSchema.parse('javascript:alert(1)')).toThrow(
      /Only credential-free http, https, and mailto URLs are allowed/
    )
  })

  it('rejects invalid SSE payloads', () => {
    expect(() =>
      sseStartPayloadSchema.parse({
        threadId: 'thread-1',
        sinceSeq: -1
      })
    ).toThrow()
  })

  it('accepts workspace directory payloads without a child path', () => {
    const payload = workspaceDirectoryTargetPayloadSchema.parse({
      workspaceRoot: '/tmp/workspace'
    })

    expect(payload.workspaceRoot).toBe('/tmp/workspace')
    expect(payload.path).toBeUndefined()
  })

  it('accepts workspace directory create payloads', () => {
    const payload = workspaceDirectoryCreatePayloadSchema.parse({
      workspaceRoot: '/tmp/workspace',
      path: 'notes'
    })

    expect(payload.path).toBe('notes')
  })

  it('accepts workspace rename payloads', () => {
    const payload = workspaceEntryRenamePayloadSchema.parse({
      workspaceRoot: '/tmp/workspace',
      path: '/tmp/workspace/draft.md',
      newName: 'final.md'
    })

    expect(payload.newName).toBe('final.md')
  })

  it('accepts workspace delete payloads', () => {
    const payload = workspaceEntryDeletePayloadSchema.parse({
      workspaceRoot: '/tmp/workspace',
      path: '/tmp/workspace/draft.md'
    })

    expect(payload.path).toBe('/tmp/workspace/draft.md')
  })

  it('accepts structured inline completion payloads', () => {
    const payload = writeInlineCompletionPayloadSchema.parse({
      prefix: '## Heading\n\nSome intro',
      suffix: '',
      mode: 'edit',
      workspaceRoot: '/tmp/workspace',
      currentFilePath: '/tmp/workspace/notes.md',
      cursor: {
        line: 3,
        column: 10
      },
      context: {
        language: 'markdown',
        currentLinePrefix: 'Some intro',
        currentLineSuffix: '',
        previousLine: '',
        previousNonEmptyLine: '## Heading',
        nextLine: '',
        indentation: '',
        signals: {
          list: false,
          quote: false,
          heading: false,
          table: false,
          atLineEnd: true,
          endsWithSentencePunctuation: false,
          previousLineEndsWithSentencePunctuation: false,
          prefersNewLineCompletion: false,
          paragraphBreakOpportunity: false
        }
      },
      policy: {
        name: 'precision-inline-v2',
        instruction: 'Return only the inserted text.',
        acceptanceCriteria: ['Keep it short.'],
        rejectionCriteria: ['Do not ramble.']
      },
      preview: {
        local: 'Some intro',
        documentTail: '## Heading Some intro'
      },
      editCandidate: {
        kind: 'paragraph',
        from: 12,
        to: 22,
        startLine: 3,
        startColumn: 1,
        endLine: 3,
        endColumn: 10,
        original: 'Some intro',
        selectedText: 'Some'
      },
      recentEdits: [{
        source: 'user',
        ageMs: 1_200,
        filePath: '/tmp/workspace/notes.md',
        from: 12,
        to: 16,
        deletedText: 'Old',
        insertedText: 'Some',
        beforeContext: '',
        afterContext: ' intro'
      }],
      model: 'deepseek-v4-pro'
    })

    expect(payload.model).toBe('deepseek-v4-pro')
    expect(payload.mode).toBe('edit')
    expect(payload.workspaceRoot).toBe('/tmp/workspace')
    expect(payload.cursor.line).toBe(3)
    expect(payload.editCandidate?.kind).toBe('paragraph')
    expect(payload.recentEdits?.[0].insertedText).toBe('Some')
  })

  it('accepts write export payloads', () => {
    const payload = writeExportPayloadSchema.parse({
      path: '/tmp/workspace/draft.md',
      workspaceRoot: '/tmp/workspace',
      format: 'docx',
      content: '# Draft'
    })

    expect(payload.path).toBe('/tmp/workspace/draft.md')
    expect(payload.format).toBe('docx')
    expect(payload.content).toBe('# Draft')
  })

  it('requires a workspace root for workspace writes', () => {
    expect(() => workspaceFileWritePayloadSchema.parse({
      path: '/tmp/workspace/draft.md',
      content: '# Draft'
    })).toThrow()
  })

  it('accepts write rich clipboard payloads', () => {
    const payload = writeRichClipboardPayloadSchema.parse({
      path: '/tmp/workspace/draft.md',
      workspaceRoot: '/tmp/workspace',
      content: '# Draft'
    })

    expect(payload.path).toBe('/tmp/workspace/draft.md')
    expect(payload.content).toBe('# Draft')
  })
})
