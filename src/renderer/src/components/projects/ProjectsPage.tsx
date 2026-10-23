import { useCallback, useEffect, useState, type ReactElement } from 'react'
import { ArrowLeft, ArrowRight, FileText, FolderOpen, Plus } from 'lucide-react'
import type { TeacherProjectSettingsV1, TeacherProjectTypeV1 } from '@shared/app-settings'
import type { ArtifactListItem } from '@shared/artifact'
import { PROJECT_BRIEF_FIELDS, PROJECT_TYPE_LABELS } from '@shared/project'
import type { WorkspaceEntry } from '@shared/workspace-file'
import { rendererRuntimeClient } from '../../agent/runtime-client'
import { formatRelativeTime } from '../../lib/format-relative-time'
import { formatWorkspacePickerError } from '../../lib/format-workspace-picker-error'
import { projectNextSteps, useActiveProjectStore } from '../../lib/active-project'
import { ARTIFACT_KIND_LABELS } from '../../lib/resume-artifact'
import type { ToolRequest } from '../../lib/tool-request'
import { useWriteWorkspaceStore } from '../../write/write-workspace-store'
import { PageColumn, PageHeader } from '../zhiyan/PageHeader'
import { ResizableTextArea } from '../zhiyan/ResizableTextArea'
import { WriteWorkspaceEmptyState } from '../write/WriteWorkspaceEmptyState'

const fieldClass =
  'w-full rounded-lg border border-ds-border bg-ds-card px-3 py-2 text-small text-ds-text outline-none focus:border-accent'

type ProjectsPageProps = {
  type: TeacherProjectTypeV1
  /** Opens a result where it was left, as 继续上次的工作 does. */
  onOpenArtifact: (artifact: ArtifactListItem) => void
  /** Opens a tool with its request filled in, for the project's next steps. */
  onOpenTool: (request: ToolRequest, text: string) => void
  className?: string
}

/** The teacher's own projects of one type, not yet archived, latest first. */
export function teacherProjectsOf(projects: TeacherProjectSettingsV1[], type: TeacherProjectTypeV1): TeacherProjectSettingsV1[] {
  return projects
    .filter((project) => project.origin === 'teacher' && project.type === type && !project.archived)
    .sort((left, right) => right.lastUsedAt.localeCompare(left.lastUsedAt))
}

function BriefForm({
  type,
  value,
  onChange
}: {
  type: TeacherProjectTypeV1
  value: Record<string, string>
  onChange: (value: Record<string, string>) => void
}): ReactElement {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {PROJECT_BRIEF_FIELDS[type].map((field) => (
        <label key={field.key} className={field.multiline ? 'md:col-span-2' : ''}>
          <span className="mb-1 block text-caption font-semibold text-ds-muted">{field.label}</span>
          {field.multiline ? (
            <ResizableTextArea
              value={value[field.key] ?? ''}
              onChange={(event) => onChange({ ...value, [field.key]: event.target.value })}
              rows={2}
              placeholder={field.hint}
              className={fieldClass}
            />
          ) : (
            <input
              value={value[field.key] ?? ''}
              onChange={(event) => onChange({ ...value, [field.key]: event.target.value })}
              placeholder={field.hint}
              className={fieldClass}
            />
          )}
        </label>
      ))}
    </div>
  )
}

function ArtifactRow({
  artifact,
  onOpen,
  action
}: {
  artifact: ArtifactListItem
  onOpen: () => void
  action?: ReactElement
}): ReactElement {
  return (
    <li className="flex items-center gap-3 px-3 py-2.5">
      <FileText className="h-4 w-4 shrink-0 text-ds-muted" strokeWidth={1.8} />
      <button
        type="button"
        onClick={onOpen}
        disabled={!artifact.available}
        title={artifact.available ? undefined : '文件已被移走或删除'}
        className="min-w-0 flex-1 text-left disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span className="block truncate text-small font-semibold text-ds-text">{artifact.title}</span>
        <span className="block text-caption text-ds-muted">
          {[ARTIFACT_KIND_LABELS[artifact.kind], artifact.stage, formatRelativeTime(artifact.updatedAt, 'zh-CN')].filter(Boolean).join(' · ')}
        </span>
      </button>
      {action}
    </li>
  )
}

/**
 * 我的课程 / 我的课题 (Task 3.1.3): the teacher's projects, results not yet in a project, and one
 * project at a time with its key points, results, next steps and files.
 */
export function ProjectsPage({ type, onOpenArtifact, onOpenTool, className = '' }: ProjectsPageProps): ReactElement {
  const workspaceRoot = useWriteWorkspaceStore((state) => state.workspaceRoot)
  const loadWriteSettings = useWriteWorkspaceStore((state) => state.loadWriteSettings)
  const typeLabel = PROJECT_TYPE_LABELS[type]
  const [projects, setProjects] = useState<TeacherProjectSettingsV1[]>([])
  const [allProjects, setAllProjects] = useState<TeacherProjectSettingsV1[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [editing, setEditing] = useState<Record<string, string> | null>(null)
  const [artifacts, setArtifacts] = useState<ArtifactListItem[]>([])
  const [unfiled, setUnfiled] = useState<ArtifactListItem[]>([])
  const [files, setFiles] = useState<WorkspaceEntry[]>([])
  const [message, setMessage] = useState('')
  const selected = projects.find((project) => project.id === selectedId) ?? null

  const refresh = useCallback(async (): Promise<void> => {
    const settings = await rendererRuntimeClient.getSettings({ forceRefresh: true })
    setAllProjects(settings.teacherProjects.filter((project) => project.origin === 'teacher' && !project.archived))
    setProjects(teacherProjectsOf(settings.teacherProjects, type))
    setUnfiled(await window.dsGui.listArtifacts({ projectId: null, limit: 50 }))
  }, [type])

  useEffect(() => {
    void loadWriteSettings()
    void refresh().catch(() => undefined)
  }, [loadWriteSettings, refresh])

  useEffect(() => {
    if (!selected) return
    let active = true
    void window.dsGui.listArtifacts({ projectId: selected.id }).then((items) => { if (active) setArtifacts(items) })
    if (selected.directory && selected.workspacePath) {
      void window.dsGui.listWorkspaceDirectory({ path: selected.directory, workspaceRoot: selected.workspacePath })
        .then((result) => { if (active) setFiles(result.ok ? result.entries : []) })
        .catch(() => undefined)
    }
    return () => { active = false }
  }, [selected])

  const create = async (): Promise<void> => {
    if (!workspaceRoot) return
    try {
      const project = await window.dsGui.createProject({ type, brief: draft, workspaceRoot })
      setCreating(false)
      setDraft({})
      await refresh()
      setSelectedId(project.id)
    } catch (createError) {
      setMessage(createError instanceof Error ? createError.message : `没能新建${typeLabel}。`)
    }
  }

  const saveBrief = async (): Promise<void> => {
    if (!selected || !editing) return
    await window.dsGui.updateProject({ id: selected.id, brief: editing })
    setEditing(null)
    setMessage('要点已保存，之后在这个项目里生成的内容都会按新的要点来写。')
    await refresh()
  }

  const fileInto = async (artifact: ArtifactListItem, projectId: string | null): Promise<void> => {
    await window.dsGui.updateArtifact({ id: artifact.id, projectId })
    await refresh()
    if (selected) setArtifacts(await window.dsGui.listArtifacts({ projectId: selected.id }))
  }

  const adopt = async (): Promise<void> => {
    if (!workspaceRoot) return
    try {
      const { added } = await window.dsGui.adoptExistingFiles(workspaceRoot)
      setMessage(added > 0 ? `已把写作空间中的 ${added} 份文稿和课件登记为未归档，原文件没有移动。` : '写作空间里没有新的文稿或课件。')
      await refresh()
    } catch (adoptError) {
      setMessage(formatWorkspacePickerError(adoptError))
    }
  }

  const startStep = (request: ToolRequest, text: string): void => {
    if (selected) useActiveProjectStore.getState().setProjectId(selected.id)
    onOpenTool(request, text)
  }

  const pickWorkspace = async (): Promise<void> => {
    try {
      const picked = await window.dsGui.pickWorkspaceDirectory()
      if (!picked.canceled && picked.path) await useWriteWorkspaceStore.getState().addWriteWorkspace(picked.path)
    } catch (pickError) {
      setMessage(formatWorkspacePickerError(pickError))
    }
  }

  if (!workspaceRoot) return <WriteWorkspaceEmptyState error={message} onPickWorkspace={() => void pickWorkspace()} />

  const module = type === 'teaching' ? 'courses' : 'topics'

  if (selected) {
    const steps = projectNextSteps(selected, artifacts)
    return (
      <div className={`h-full overflow-y-auto bg-ds-main ${className}`}>
        <PageColumn width="work" className="py-8">
          <button
            type="button"
            onClick={() => {
              setSelectedId(null)
              setEditing(null)
            }}
            className="mb-3 inline-flex items-center gap-1.5 text-small text-ds-muted hover:text-ds-ink"
          >
            <ArrowLeft className="h-4 w-4" strokeWidth={1.8} />
            全部{typeLabel}
          </button>
          <PageHeader module={module} title={selected.name} description={`${typeLabel} · ${artifacts.length} 份成果`} />
          {message ? <p role="status" className="mb-4 text-small text-ds-muted">{message}</p> : null}
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="space-y-5">
              <section className="rounded-xl border border-ds-border-muted bg-ds-card p-5" aria-label="项目要点">
                <div className="mb-3 flex items-center gap-2">
                  <h2 className="min-w-0 flex-1 text-heading font-semibold text-ds-text">项目要点</h2>
                  {editing ? (
                    <>
                      <button type="button" onClick={() => setEditing(null)} className="rounded-lg px-2.5 py-1 text-small text-ds-muted hover:bg-ds-hover">取消</button>
                      <button type="button" onClick={() => void saveBrief()} className="rounded-lg bg-accent px-3 py-1 text-small font-semibold text-white">保存</button>
                    </>
                  ) : (
                    <button type="button" onClick={() => setEditing(selected.brief ?? {})} className="rounded-lg border border-ds-border px-2.5 py-1 text-small text-ds-text hover:bg-ds-hover">修改</button>
                  )}
                </div>
                {editing ? (
                  <BriefForm type={type} value={editing} onChange={setEditing} />
                ) : (
                  <dl className="grid gap-x-6 gap-y-2 text-small md:grid-cols-2">
                    {PROJECT_BRIEF_FIELDS[type].map((field) => (
                      <div key={field.key} className={field.multiline ? 'md:col-span-2' : ''}>
                        <dt className="text-caption text-ds-muted">{field.label}</dt>
                        <dd className="whitespace-pre-wrap text-ds-text">{selected.brief?.[field.key] || <span className="text-ds-faint">未填写</span>}</dd>
                      </div>
                    ))}
                  </dl>
                )}
                <p className="mt-3 text-caption text-ds-muted">要点会带入这个项目里之后生成的教案、课件、文稿等内容。</p>
              </section>

              <section className="rounded-xl border border-ds-border-muted bg-ds-card" aria-label="成果清单">
                <h2 className="border-b border-ds-border-muted px-5 py-3 text-heading font-semibold text-ds-text">成果</h2>
                {artifacts.length === 0 ? (
                  <p className="px-5 py-4 text-small text-ds-muted">还没有成果。可以从右侧的下一步开始，或把未归档的成果归入这里。</p>
                ) : (
                  <ul className="divide-y divide-ds-border-muted">
                    {artifacts.map((artifact) => (
                      <ArtifactRow
                        key={artifact.id}
                        artifact={artifact}
                        onOpen={() => onOpenArtifact(artifact)}
                        action={(
                          <button type="button" onClick={() => void fileInto(artifact, null)} className="shrink-0 text-caption text-ds-muted hover:text-ds-ink">
                            移出
                          </button>
                        )}
                      />
                    ))}
                  </ul>
                )}
              </section>
            </div>

            <aside className="space-y-5">
              <section className="rounded-xl border border-ds-border-muted bg-ds-card p-4" aria-label="下一步">
                <h2 className="mb-2 text-small font-semibold text-ds-text">下一步</h2>
                {steps.length === 0 ? (
                  <p className="text-caption text-ds-muted">常用的成果都齐了。</p>
                ) : (
                  <ul className="space-y-2">
                    {steps.map((step) => (
                      <li key={step.id}>
                        <button
                          type="button"
                          onClick={() => startStep(step.request, step.text)}
                          className="group flex w-full items-center gap-2 rounded-lg border border-accent/20 bg-accent/[0.045] px-3 py-2 text-left text-small font-semibold text-ds-text hover:border-accent/40"
                        >
                          <span className="min-w-0 flex-1">{step.label}</span>
                          <ArrowRight className="h-4 w-4 shrink-0 text-ds-faint group-hover:text-accent" strokeWidth={1.8} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="rounded-xl border border-ds-border-muted bg-ds-card p-4" aria-label="项目文件">
                <h2 className="mb-1 flex items-center gap-1.5 text-small font-semibold text-ds-text">
                  <FolderOpen className="h-4 w-4 text-ds-muted" strokeWidth={1.8} />
                  项目文件
                </h2>
                {selected.directory ? <p className="mb-2 break-all text-caption text-ds-faint">{selected.directory}</p> : null}
                {files.length === 0 ? (
                  <p className="text-caption text-ds-muted">文件夹里还没有文件。</p>
                ) : (
                  <ul className="space-y-1 text-small text-ds-text">
                    {files.map((entry) => <li key={entry.path} className="truncate">{entry.type === 'directory' ? `${entry.name}/` : entry.name}</li>)}
                  </ul>
                )}
              </section>
            </aside>
          </div>
        </PageColumn>
      </div>
    )
  }

  return (
    <div className={`h-full overflow-y-auto bg-ds-main ${className}`}>
      <PageColumn width="work" className="py-8">
        <PageHeader
          module={module}
          title={`我的${typeLabel}`}
          description={type === 'teaching'
            ? '每门课的每一章是一个项目：要点写一次，教案、课件、教材都按它来写。'
            : '每个课题是一个项目：题目、科学问题和关键术语写一次，文献、文稿和数据分析都按它来。'}
        />
        {message ? <p role="status" className="mb-4 text-small text-ds-muted">{message}</p> : null}

        {creating ? (
          <section className="mb-5 rounded-xl border border-accent bg-ds-card p-5" aria-label={`新建${typeLabel}`}>
            <h2 className="mb-3 text-heading font-semibold text-ds-text">新建{typeLabel}</h2>
            <BriefForm type={type} value={draft} onChange={setDraft} />
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setCreating(false)} className="rounded-lg px-3 py-1.5 text-small text-ds-muted hover:bg-ds-hover">取消</button>
              <button type="button" onClick={() => void create()} className="rounded-lg bg-accent px-4 py-1.5 text-small font-semibold text-white">新建</button>
            </div>
          </section>
        ) : (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="mb-5 inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-small font-semibold text-white"
          >
            <Plus className="h-4 w-4" strokeWidth={1.8} />
            新建{typeLabel}
          </button>
        )}

        {projects.length === 0 && !creating ? (
          <p className="mb-6 rounded-xl border border-dashed border-ds-border px-5 py-6 text-center text-small text-ds-muted">
            还没有{typeLabel}。新建一个，把要点写一次，之后的成果都会按它来写。
          </p>
        ) : (
          <ul className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label={`我的${typeLabel}`}>
            {projects.map((project) => (
              <li key={project.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(project.id)}
                  className="flex w-full flex-col items-start gap-1 rounded-xl border border-ds-border-muted bg-ds-card px-4 py-3 text-left hover:border-accent/30 hover:bg-ds-hover"
                >
                  <span className="w-full truncate text-body font-semibold text-ds-text">{project.name}</span>
                  <span className="w-full truncate text-caption text-ds-muted">
                    {type === 'teaching'
                      ? [project.brief?.audience, project.brief?.hours].filter(Boolean).join(' · ') || '未填写对象与学时'
                      : project.brief?.target || project.brief?.question || '未填写科学问题'}
                  </span>
                  <span className="text-caption text-ds-faint">{formatRelativeTime(project.lastUsedAt, 'zh-CN')}</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <section className="rounded-xl border border-ds-border-muted bg-ds-card" aria-label="未归档">
          <div className="flex flex-wrap items-center gap-2 border-b border-ds-border-muted px-5 py-3">
            <h2 className="min-w-0 flex-1 text-heading font-semibold text-ds-text">未归档的成果</h2>
            <button type="button" onClick={() => void adopt()} className="rounded-lg border border-ds-border px-2.5 py-1 text-caption text-ds-text hover:bg-ds-hover">
              登记写作空间里已有的文稿和课件
            </button>
          </div>
          {unfiled.length === 0 ? (
            <p className="px-5 py-4 text-small text-ds-muted">没有未归档的成果。</p>
          ) : (
            <ul className="divide-y divide-ds-border-muted">
              {unfiled.map((artifact) => (
                <ArtifactRow
                  key={artifact.id}
                  artifact={artifact}
                  onOpen={() => onOpenArtifact(artifact)}
                  action={allProjects.length > 0 ? (
                    <select
                      aria-label={`把“${artifact.title}”归入`}
                      value=""
                      onChange={(event) => { if (event.target.value) void fileInto(artifact, event.target.value) }}
                      className="shrink-0 rounded-md border border-ds-border bg-ds-card px-2 py-1 text-caption text-ds-text"
                    >
                      <option value="">归入…</option>
                      {allProjects.map((project) => (
                        <option key={project.id} value={project.id}>{`${PROJECT_TYPE_LABELS[project.type]} · ${project.name}`}</option>
                      ))}
                    </select>
                  ) : undefined}
                />
              ))}
            </ul>
          )}
        </section>
      </PageColumn>
    </div>
  )
}
