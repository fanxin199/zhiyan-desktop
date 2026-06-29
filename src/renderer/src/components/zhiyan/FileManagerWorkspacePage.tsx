import { useEffect, useMemo, useState, type MouseEvent as ReactMouseEvent, type ReactElement } from 'react'
import {
  ArrowUp,
  Bot,
  CheckSquare,
  File,
  FileCode2,
  FileImage,
  FileSpreadsheet,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  Loader2,
  RefreshCw,
  Search,
  Send,
  Sparkles,
  Trash2,
  X
} from 'lucide-react'
import type { WorkspaceEntry } from '@shared/workspace-file'
import { useChatStore } from '../../store/chat-store'

export type FileManagerModuleTarget = 'syllabus' | 'literature'

export type FileManagerModuleFile = {
  name: string
  path: string
}

type Props = {
  onStartChat: (
    prompt: string,
    options?: { workspaceRoot?: string; displayText?: string; inlineModule?: 'file-manager' }
  ) => void
  onUseFileInModule?: (target: FileManagerModuleTarget, file: FileManagerModuleFile) => void
  inlineConversation?: ReactElement
  showInlineConversation?: boolean
  className?: string
}

type FileCategory = 'all' | 'documents' | 'data' | 'images'
type SidePanelMode = 'preview' | 'ai'
type FileManagerAiTaskId = 'classify' | 'rename' | 'dedupe' | 'convert' | 'summarize'
type FileContextMenuState = { x: number; y: number; entry: WorkspaceEntry } | null

type PreviewState =
  | { kind: 'empty' }
  | { kind: 'loading' }
  | { kind: 'text'; content: string; truncated: boolean }
  | { kind: 'image'; dataUrl: string }
  | { kind: 'pdf'; pageCount: number; searchable: boolean; dataUrl?: string }
  | { kind: 'unsupported'; message: string }
  | { kind: 'error'; message: string }

const DOCUMENT_EXTENSIONS = new Set(['pdf', 'doc', 'docx', 'ppt', 'pptx', 'txt', 'md', 'rtf'])
const DATA_EXTENSIONS = new Set(['csv', 'tsv', 'xlsx', 'xls', 'h5ad', 'rds', 'json'])
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'])
const SYLLABUS_HANDOFF_EXTENSIONS = new Set(['pdf', 'doc', 'docx'])
const LITERATURE_HANDOFF_EXTENSIONS = new Set(['pdf', 'doc', 'docx', 'txt', 'md'])
const FILE_MANAGER_AI_TASKS: Array<{
  id: FileManagerAiTaskId
  label: string
  description: string
  defaultRequest: string
}> = [
  {
    id: 'classify',
    label: '分类整理',
    description: '按教学、科研、行政或主题建立整理方案',
    defaultRequest: '请按用途和主题为这些文件设计分类整理方案。'
  },
  {
    id: 'rename',
    label: '规范命名',
    description: '生成清晰、统一、可追溯的文件名',
    defaultRequest: '请为这些文件设计规范命名方案，保留原始含义并避免覆盖同名文件。'
  },
  {
    id: 'dedupe',
    label: '查找重复文件',
    description: '识别疑似重复、旧版和临时文件',
    defaultRequest: '请检查这些文件中可能重复、过时或命名相近的项目，并给出处理建议。'
  },
  {
    id: 'convert',
    label: '转换格式',
    description: '规划 Word、PDF、图片和表格的转换步骤',
    defaultRequest: '请判断这些文件适合转换成哪些格式，并列出转换前需要确认的事项。'
  },
  {
    id: 'summarize',
    label: '提取摘要',
    description: '为材料生成摘要、关键词和用途说明',
    defaultRequest: '请为这些文件生成简要摘要、关键词和建议用途。'
  }
]

function normalizePath(path: string): string {
  return path.replaceAll('\\', '/').replace(/\/+$/u, '')
}

function basename(path: string): string {
  return normalizePath(path).split('/').filter(Boolean).at(-1) ?? path
}

function parentDirectory(path: string, root: string): string | null {
  const normalizedPath = normalizePath(path)
  const normalizedRoot = normalizePath(root)
  if (normalizedPath === normalizedRoot) return null
  const parent = normalizedPath.slice(0, normalizedPath.lastIndexOf('/'))
  return parent && parent.length >= normalizedRoot.length ? parent : normalizedRoot
}

function joinPath(directory: string, name: string): string {
  const separator = directory.includes('\\') ? '\\' : '/'
  return `${directory.replace(/[\\/]$/u, '')}${separator}${name}`
}

function entryLine(entry: WorkspaceEntry, index: number): string {
  const kind = entry.type === 'directory' ? '文件夹' : (entry.ext || '文件').toUpperCase()
  return `${index + 1}. ${entry.name}（${kind}）：${entry.path}`
}

export function buildFileManagerAiPrompt({
  workspaceRoot,
  directory,
  taskLabel,
  userRequest,
  selectedFiles,
  visibleEntries
}: {
  workspaceRoot: string
  directory: string
  taskLabel: string
  userRequest: string
  selectedFiles: WorkspaceEntry[]
  visibleEntries: WorkspaceEntry[]
}): string {
  const scopedEntries = selectedFiles.length > 0
    ? selectedFiles
    : visibleEntries.slice(0, 80)
  const lines = [
    '你正在处理「文件管理」模块中的 AI 文件整理任务。',
    '',
    '## 任务类型',
    taskLabel,
    '',
    '## 当前文件夹',
    directory,
    '',
    '## 工作区根目录',
    workspaceRoot,
    '',
    '## 老师的整理需求',
    userRequest.trim() || '请根据当前文件夹内容给出清晰、稳妥的整理建议。',
    '',
    '## 操作安全要求',
    '1. 先生成整理方案，不要直接移动、删除、重命名、覆盖或转换任何文件。',
    '2. 方案必须列出每一步的影响范围：涉及哪些文件、目标文件夹或目标文件名、是否可能覆盖现有文件。',
    '3. 对移动、删除、重命名、覆盖、批量修改和格式转换，必须等待老师明确确认后再执行。',
    '4. 如果文件内容不足以判断用途，先提出需要预览或读取的文件清单，不要凭文件名武断分类。',
    '5. 输出要适合非技术背景老师阅读，避免命令行、脚本、代码等表述。',
    ''
  ]

  if (selectedFiles.length > 0) {
    lines.push('## 选定文件')
  } else {
    lines.push('## 当前可见文件')
  }

  if (scopedEntries.length === 0) {
    lines.push('当前范围内没有可见文件。')
  } else {
    scopedEntries.forEach((entry, index) => {
      lines.push(entryLine(entry, index))
    })
  }

  lines.push(
    '',
    '## 输出格式',
    '先用三段输出：',
    '1. 范围确认：说明你将处理哪些文件或文件夹。',
    '2. 整理方案：用表格列出建议动作、来源、目标、理由和风险。',
    '3. 待老师确认：列出需要老师点击确认或补充说明的问题。'
  )

  return lines.join('\n')
}

export function fileCategory(entry: WorkspaceEntry): FileCategory {
  if (entry.type === 'directory') return 'all'
  const ext = entry.ext.toLowerCase().replace(/^\./u, '')
  if (DOCUMENT_EXTENSIONS.has(ext)) return 'documents'
  if (DATA_EXTENSIONS.has(ext)) return 'data'
  if (IMAGE_EXTENSIONS.has(ext)) return 'images'
  return 'all'
}

export function fileManagerModuleHandoffAvailability(entry: WorkspaceEntry): Record<FileManagerModuleTarget, boolean> {
  if (entry.type !== 'file') return { syllabus: false, literature: false }
  const extension = entry.ext.toLowerCase().replace(/^\./u, '')
  return {
    syllabus: SYLLABUS_HANDOFF_EXTENSIONS.has(extension),
    literature: LITERATURE_HANDOFF_EXTENSIONS.has(extension)
  }
}

function iconForEntry(entry: WorkspaceEntry): ReactElement {
  if (entry.type === 'directory') return <Folder className="h-4 w-4 text-amber-500" strokeWidth={1.8} />
  const category = fileCategory(entry)
  if (category === 'images') return <FileImage className="h-4 w-4 text-emerald-600" strokeWidth={1.8} />
  if (category === 'data') return <FileSpreadsheet className="h-4 w-4 text-sky-600" strokeWidth={1.8} />
  if (entry.ext.toLowerCase() === 'pdf') return <FileText className="h-4 w-4 text-red-500" strokeWidth={1.8} />
  if (entry.ext.toLowerCase() === 'md' || entry.ext.toLowerCase() === 'txt') {
    return <FileCode2 className="h-4 w-4 text-accent" strokeWidth={1.8} />
  }
  return <File className="h-4 w-4 text-ds-faint" strokeWidth={1.8} />
}

export function FileManagerWorkspacePage({
  onStartChat,
  onUseFileInModule,
  inlineConversation,
  showInlineConversation = false,
  className = ''
}: Props): ReactElement {
  const defaultWorkspaceRoot = useChatStore((state) => state.workspaceRoot)
  const [workspaceRoot, setWorkspaceRoot] = useState(defaultWorkspaceRoot)
  const [directory, setDirectory] = useState(defaultWorkspaceRoot)
  const [entries, setEntries] = useState<WorkspaceEntry[]>([])
  const [selectedEntry, setSelectedEntry] = useState<WorkspaceEntry | null>(null)
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(() => new Set())
  const [preview, setPreview] = useState<PreviewState>({ kind: 'empty' })
  const [category, setCategory] = useState<FileCategory>('all')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [newFolderOpen, setNewFolderOpen] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [deletePending, setDeletePending] = useState(false)
  const [sidePanelMode, setSidePanelMode] = useState<SidePanelMode>('preview')
  const [aiTaskId, setAiTaskId] = useState<FileManagerAiTaskId>('classify')
  const [aiRequest, setAiRequest] = useState('')
  const [fileContextMenu, setFileContextMenu] = useState<FileContextMenuState>(null)

  const loadDirectory = async (targetDirectory = directory, targetRoot = workspaceRoot): Promise<void> => {
    if (!targetRoot.trim() || !window.dsGui?.listWorkspaceDirectory) return
    setLoading(true)
    setMessage('')
    try {
      const result = await window.dsGui.listWorkspaceDirectory({
        workspaceRoot: targetRoot,
        ...(targetDirectory ? { path: targetDirectory } : {})
      })
      if (!result.ok) {
        setMessage(result.message)
        return
      }
      setDirectory(result.root)
      setEntries(result.entries)
      setSelectedPaths(new Set())
      setSelectedEntry(null)
      setPreview({ kind: 'empty' })
      setDeletePending(false)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!workspaceRoot.trim() && defaultWorkspaceRoot.trim()) {
      setWorkspaceRoot(defaultWorkspaceRoot)
      setDirectory(defaultWorkspaceRoot)
    }
  }, [defaultWorkspaceRoot, workspaceRoot])

  useEffect(() => {
    if (workspaceRoot.trim()) void loadDirectory(directory || workspaceRoot, workspaceRoot)
    // Reload only when the active directory or chosen workspace changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceRoot, directory])

  useEffect(() => {
    if (!fileContextMenu) return undefined
    const close = (): void => setFileContextMenu(null)
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') close()
    }
    window.addEventListener('click', close)
    window.addEventListener('keydown', closeOnEscape)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('keydown', closeOnEscape)
      window.removeEventListener('resize', close)
    }
  }, [fileContextMenu])

  const visibleEntries = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return entries.filter((entry) => {
      const categoryMatches = category === 'all' || entry.type === 'directory' || fileCategory(entry) === category
      return categoryMatches && (!normalizedQuery || entry.name.toLowerCase().includes(normalizedQuery))
    })
  }, [category, entries, query])

  const selectedFiles = useMemo(
    () => entries.filter((entry) => entry.type === 'file' && selectedPaths.has(entry.path)),
    [entries, selectedPaths]
  )

  const selectEntry = async (entry: WorkspaceEntry): Promise<void> => {
    if (entry.type === 'directory') {
      setDirectory(entry.path)
      return
    }
    setSelectedEntry(entry)
    setPreview({ kind: 'loading' })
    setMessage('')
    try {
      const ext = entry.ext.toLowerCase()
      if (IMAGE_EXTENSIONS.has(ext)) {
        const result = await window.dsGui.readWorkspaceImage({ path: entry.path, workspaceRoot })
        setPreview(result.ok ? { kind: 'image', dataUrl: result.dataUrl } : { kind: 'error', message: result.message })
        return
      }
      if (ext === 'pdf') {
        const [result, binary] = await Promise.all([
          window.dsGui.inspectPdf(entry.path),
          window.dsGui.readFileBinary(entry.path)
        ])
        setPreview(result.ok
          ? {
              kind: 'pdf',
              pageCount: result.pageCount,
              searchable: result.searchable,
              ...(binary.ok && binary.size <= 20 * 1024 * 1024
                ? { dataUrl: `data:application/pdf;base64,${binary.data}` }
                : {})
            }
          : { kind: 'error', message: result.message })
        return
      }
      const result = await window.dsGui.readWorkspaceFile({ path: entry.path, workspaceRoot })
      setPreview(result.ok
        ? { kind: 'text', content: result.content, truncated: result.truncated }
        : { kind: 'unsupported', message: result.message })
    } catch (error) {
      setPreview({ kind: 'error', message: error instanceof Error ? error.message : String(error) })
    }
  }

  const chooseWorkspace = async (): Promise<void> => {
    if (!window.dsGui?.pickWorkspaceDirectory) return
    const picked = await window.dsGui.pickWorkspaceDirectory(workspaceRoot || undefined)
    if (!picked.canceled && picked.path) {
      setWorkspaceRoot(picked.path)
      setDirectory(picked.path)
    }
  }

  const createFolder = async (): Promise<void> => {
    const name = newFolderName.trim()
    if (!name || !workspaceRoot || !window.dsGui?.createWorkspaceDirectory) return
    const result = await window.dsGui.createWorkspaceDirectory({
      workspaceRoot,
      path: joinPath(directory, name)
    })
    if (!result.ok) {
      setMessage(result.message)
      return
    }
    setNewFolderName('')
    setNewFolderOpen(false)
    await loadDirectory()
  }

  const toggleFile = (path: string): void => {
    setSelectedPaths((current) => {
      const next = new Set(current)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
    setDeletePending(false)
  }

  const toggleAllFiles = (): void => {
    const files = visibleEntries.filter((entry) => entry.type === 'file')
    const allSelected = files.length > 0 && files.every((entry) => selectedPaths.has(entry.path))
    setSelectedPaths(allSelected ? new Set() : new Set(files.map((entry) => entry.path)))
    setDeletePending(false)
  }

  const deleteSelectedFiles = async (): Promise<void> => {
    if (!workspaceRoot || selectedFiles.length === 0 || !window.dsGui?.deleteWorkspaceEntry) return
    setLoading(true)
    const failed: string[] = []
    for (const entry of selectedFiles) {
      const result = await window.dsGui.deleteWorkspaceEntry({ workspaceRoot, path: entry.path })
      if (!result.ok) failed.push(`${entry.name}: ${result.message}`)
    }
    setLoading(false)
    setDeletePending(false)
    if (failed.length > 0) setMessage(failed.join('\n'))
    await loadDirectory()
  }

  const sendSelectedToAi = (): void => {
    if (!workspaceRoot || selectedFiles.length === 0) return
    onStartChat(
      [
        '请检查当前工作区中选定的文件，先概述每个文件的类型、内容结构和可执行的后续处理建议。',
        '',
        '## 选定文件',
        ...selectedFiles.map((entry, index) => `${index + 1}. ${entry.name}：${entry.path}`)
      ].join('\n'),
      {
        workspaceRoot,
        displayText: `文件管理：分析 ${selectedFiles.length} 个文件`
      }
    )
  }

  const sendAiOrganizationPlan = (): void => {
    if (!workspaceRoot) return
    const task = FILE_MANAGER_AI_TASKS.find((item) => item.id === aiTaskId) ?? FILE_MANAGER_AI_TASKS[0]
    const request = aiRequest.trim() || task.defaultRequest
    const prompt = buildFileManagerAiPrompt({
      workspaceRoot,
      directory,
      taskLabel: task.label,
      userRequest: request,
      selectedFiles,
      visibleEntries
    })
    onStartChat(prompt, {
      workspaceRoot,
      inlineModule: 'file-manager',
      displayText: `文件管理 · ${task.label}${selectedFiles.length > 0 ? `：${selectedFiles.length} 个文件` : '：当前文件夹'}`
    })
    setSidePanelMode('ai')
  }

  const openSelectedInSystem = (): void => {
    if (!selectedEntry || !window.dsGui?.openEditorPath) return
    void window.dsGui.openEditorPath({
      path: selectedEntry.path,
      workspaceRoot,
      editorId: 'system'
    }).then((result) => {
      if (!result.ok) setMessage(result.message ?? '无法打开文件。')
    })
  }

  const openFileContextMenu = (event: ReactMouseEvent, entry: WorkspaceEntry): void => {
    if (entry.type !== 'file') return
    event.preventDefault()
    setSelectedEntry(entry)
    setFileContextMenu({
      x: Math.min(event.clientX, window.innerWidth - 260),
      y: Math.min(event.clientY, window.innerHeight - 150),
      entry
    })
  }

  const handleContextFileInModule = (target: FileManagerModuleTarget): void => {
    if (!fileContextMenu || !onUseFileInModule) return
    onUseFileInModule(target, {
      name: fileContextMenu.entry.name,
      path: fileContextMenu.entry.path
    })
    setFileContextMenu(null)
  }

  const parent = workspaceRoot ? parentDirectory(directory, workspaceRoot) : null
  const allVisibleFilesSelected = visibleEntries.filter((entry) => entry.type === 'file').length > 0 &&
    visibleEntries.filter((entry) => entry.type === 'file').every((entry) => selectedPaths.has(entry.path))

  return (
    <div className={`flex h-full min-h-0 flex-col overflow-hidden bg-ds-main ${className}`}>
      <header className="shrink-0 border-b border-ds-border-muted bg-ds-card px-6 py-4 sm:px-8">
        <div className="mx-auto flex w-full max-w-[1440px] flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-[18px] font-semibold text-ds-text">
              <FolderOpen className="h-5 w-5 text-accent" strokeWidth={1.8} />
              文件管理
            </div>
            <p className="mt-1 truncate text-[12px] text-ds-muted" title={workspaceRoot || undefined}>
              {workspaceRoot || '请选择需要管理的项目文件夹'}
            </p>
          </div>
          <button type="button" onClick={() => void chooseWorkspace()} className="inline-flex items-center gap-2 rounded-lg border border-ds-border bg-ds-card px-3 py-2 text-[12.5px] font-semibold text-ds-text hover:bg-ds-hover">
            <FolderOpen className="h-4 w-4" strokeWidth={1.8} />
            选择文件夹
          </button>
          <button type="button" onClick={() => void loadDirectory()} disabled={!workspaceRoot || loading} className="ds-sidebar-toggle-button disabled:opacity-40" title="刷新文件列表" aria-label="刷新文件列表">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} strokeWidth={1.8} />
          </button>
        </div>
      </header>

      {!workspaceRoot ? (
        <div className="flex min-h-0 flex-1 items-center justify-center px-6">
          <div className="max-w-sm text-center">
            <FolderOpen className="mx-auto h-10 w-10 text-ds-faint" strokeWidth={1.5} />
            <h2 className="mt-4 text-[17px] font-semibold text-ds-text">选择项目文件夹</h2>
            <button type="button" onClick={() => void chooseWorkspace()} className="mt-5 inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-[13px] font-semibold text-white">
              <FolderOpen className="h-4 w-4" strokeWidth={1.8} />
              选择文件夹
            </button>
          </div>
        </div>
      ) : (
        <div className="mx-auto flex min-h-0 w-full max-w-[1440px] flex-1 flex-col px-4 py-4 sm:px-6">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => parent && setDirectory(parent)} disabled={!parent} className="ds-sidebar-toggle-button disabled:opacity-35" title="返回上级目录" aria-label="返回上级目录">
              <ArrowUp className="h-4 w-4" strokeWidth={1.8} />
            </button>
            <span className="min-w-0 flex-1 truncate text-[12px] text-ds-muted" title={directory}>{directory}</span>
            <button type="button" onClick={() => setNewFolderOpen((value) => !value)} className="inline-flex items-center gap-2 rounded-lg border border-ds-border bg-ds-card px-3 py-2 text-[12px] font-semibold text-ds-text hover:bg-ds-hover">
              <FolderPlus className="h-4 w-4" strokeWidth={1.8} />
              新建文件夹
            </button>
          </div>

          {newFolderOpen ? (
            <div className="mb-3 flex items-center gap-2 border-y border-ds-border-muted py-2">
              <input value={newFolderName} onChange={(event) => setNewFolderName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void createFolder() }} autoFocus placeholder="文件夹名称" className="min-w-0 flex-1 rounded-lg border border-ds-border bg-ds-card px-3 py-2 text-[12.5px] text-ds-text outline-none focus:border-accent" />
              <button type="button" onClick={() => void createFolder()} disabled={!newFolderName.trim()} className="rounded-lg bg-accent px-3 py-2 text-[12px] font-semibold text-white disabled:opacity-40">创建</button>
              <button type="button" onClick={() => setNewFolderOpen(false)} className="ds-sidebar-toggle-button" title="取消" aria-label="取消"><X className="h-4 w-4" /></button>
            </div>
          ) : null}

          {message ? <div className="mb-3 whitespace-pre-wrap border-l-2 border-red-500 bg-red-50 px-3 py-2 text-[12px] text-red-700 dark:bg-red-500/10 dark:text-red-200">{message}</div> : null}

          <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_400px]">
            <section className="flex min-h-0 flex-col border border-ds-border-muted bg-ds-card">
              <div className="flex flex-wrap items-center gap-2 border-b border-ds-border-muted px-3 py-2">
                {(['all', 'documents', 'data', 'images'] as FileCategory[]).map((item) => (
                  <button key={item} type="button" onClick={() => setCategory(item)} className={`rounded-md px-2.5 py-1.5 text-[12px] font-medium ${category === item ? 'bg-accent text-white' : 'text-ds-muted hover:bg-ds-hover hover:text-ds-text'}`}>
                    {{ all: '全部', documents: '文档', data: '数据', images: '图片' }[item]}
                  </button>
                ))}
                <label className="ml-auto flex min-w-[180px] flex-1 items-center gap-2 rounded-md bg-ds-main px-2.5 py-1.5 text-ds-muted sm:max-w-xs">
                  <Search className="h-3.5 w-3.5" strokeWidth={1.8} />
                  <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="筛选当前文件夹" className="min-w-0 flex-1 bg-transparent text-[12px] text-ds-text outline-none placeholder:text-ds-faint" />
                </label>
              </div>

              {selectedFiles.length > 0 ? (
                <div className="flex flex-wrap items-center gap-2 border-b border-accent/20 bg-accent/5 px-3 py-2 text-[12px] text-ds-text">
                  <span className="font-semibold">已选 {selectedFiles.length} 个文件</span>
                  <button type="button" onClick={sendSelectedToAi} className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-accent/30 bg-ds-card px-2.5 py-1.5 font-semibold text-accent hover:bg-accent/10"><Send className="h-3.5 w-3.5" />交给 AI 分析</button>
                  <button type="button" onClick={() => setDeletePending(true)} className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 font-semibold text-red-600 hover:bg-red-500/10"><Trash2 className="h-3.5 w-3.5" />删除</button>
                </div>
              ) : null}

              {deletePending ? (
                <div className="flex flex-wrap items-center gap-2 border-b border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700 dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-200">
                  <span className="font-semibold">将永久删除 {selectedFiles.length} 个文件。</span>
                  <button type="button" onClick={() => void deleteSelectedFiles()} className="rounded-md bg-red-600 px-2.5 py-1.5 font-semibold text-white">确认删除</button>
                  <button type="button" onClick={() => setDeletePending(false)} className="rounded-md px-2.5 py-1.5 font-semibold hover:bg-red-500/10">取消</button>
                </div>
              ) : null}

              <div className="min-h-0 flex-1 overflow-auto">
                <div className="grid min-w-[560px] grid-cols-[42px_minmax(220px,1fr)_100px] border-b border-ds-border-muted bg-ds-main px-3 py-2 text-[11px] font-semibold text-ds-faint">
                  <button type="button" onClick={toggleAllFiles} className="flex items-center justify-center" title="选择全部文件" aria-label="选择全部文件"><CheckSquare className={`h-4 w-4 ${allVisibleFilesSelected ? 'text-accent' : ''}`} /></button>
                  <span>名称</span><span>类型</span>
                </div>
                {loading ? <div className="flex items-center justify-center gap-2 py-12 text-[12.5px] text-ds-muted"><Loader2 className="h-4 w-4 animate-spin" />正在读取文件夹</div> : null}
                {!loading && visibleEntries.length === 0 ? <div className="py-12 text-center text-[12.5px] text-ds-muted">当前文件夹没有符合条件的文件</div> : null}
                {!loading && visibleEntries.map((entry) => {
                  const fileSelected = entry.type === 'file' && selectedPaths.has(entry.path)
                  const active = selectedEntry?.path === entry.path
                  return <div
                    key={entry.path}
                    onContextMenu={(event) => openFileContextMenu(event, entry)}
                    className={`grid min-w-[560px] grid-cols-[42px_minmax(220px,1fr)_100px] items-center border-b border-ds-border-muted/70 px-3 py-2 text-[12.5px] ${active ? 'bg-accent/10' : 'hover:bg-ds-hover'}`}
                  >
                    <div className="flex justify-center">{entry.type === 'file' ? <input type="checkbox" checked={fileSelected} onChange={() => toggleFile(entry.path)} aria-label={`选择 ${entry.name}`} /> : null}</div>
                    <button type="button" onClick={() => void selectEntry(entry)} className="flex min-w-0 items-center gap-2 text-left text-ds-text"><span className="shrink-0">{iconForEntry(entry)}</span><span className="truncate font-medium">{entry.name}</span></button>
                    <span className="truncate text-[11.5px] text-ds-muted">{entry.type === 'directory' ? '文件夹' : (entry.ext || '文件').toUpperCase()}</span>
                  </div>
                })}
              </div>
            </section>

            <aside className="flex min-h-0 flex-col border border-ds-border-muted bg-ds-card">
              <div className="flex min-h-12 items-center gap-2 border-b border-ds-border-muted px-3">
                <button
                  type="button"
                  onClick={() => setSidePanelMode('preview')}
                  className={`rounded-md px-2.5 py-1.5 text-[12px] font-semibold ${sidePanelMode === 'preview' ? 'bg-accent text-white' : 'text-ds-muted hover:bg-ds-hover hover:text-ds-text'}`}
                >
                  预览
                </button>
                <button
                  type="button"
                  onClick={() => setSidePanelMode('ai')}
                  className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] font-semibold ${sidePanelMode === 'ai' ? 'bg-accent text-white' : 'text-ds-muted hover:bg-ds-hover hover:text-ds-text'}`}
                >
                  <Bot className="h-3.5 w-3.5" strokeWidth={1.8} />
                  AI 整理
                </button>
                {sidePanelMode === 'preview' && selectedEntry ? (
                  <button type="button" onClick={openSelectedInSystem} className="ml-auto rounded-md border border-ds-border px-2 py-1 text-[11.5px] font-semibold text-ds-text hover:bg-ds-hover">系统打开</button>
                ) : null}
              </div>
              {sidePanelMode === 'preview' ? (
                <>
                  <div className="border-b border-ds-border-muted px-4 py-2">
                    <span className="block truncate text-[13px] font-semibold text-ds-text">{selectedEntry?.name ?? '文件预览'}</span>
                  </div>
                  <div className="min-h-0 flex-1 overflow-auto p-4">
                    {preview.kind === 'empty' ? <div className="flex h-full min-h-48 items-center justify-center text-center text-[12.5px] text-ds-muted">选择一个文件查看内容，或切换到 AI 整理。</div> : null}
                    {preview.kind === 'loading' ? <div className="flex h-full min-h-48 items-center justify-center gap-2 text-[12.5px] text-ds-muted"><Loader2 className="h-4 w-4 animate-spin" />正在加载预览</div> : null}
                    {preview.kind === 'image' ? <img src={preview.dataUrl} alt={selectedEntry?.name ?? ''} className="max-h-full w-full object-contain" /> : null}
                    {preview.kind === 'text' ? <><pre className="whitespace-pre-wrap break-words font-mono text-[11.5px] leading-5 text-ds-text">{preview.content}</pre>{preview.truncated ? <p className="mt-3 text-[11.5px] text-ds-muted">仅显示文件开头内容。</p> : null}</> : null}
                    {preview.kind === 'pdf' ? <div className="space-y-3 text-[12.5px] text-ds-muted"><div className="flex items-center gap-2"><FileText className="h-6 w-6 text-red-500" /><span>{preview.pageCount} 页{preview.searchable ? '，可检索文本' : '，扫描版或不可检索文本'}</span></div>{preview.dataUrl ? <iframe src={preview.dataUrl} title={selectedEntry?.name ?? 'PDF 预览'} className="h-[480px] w-full border border-ds-border-muted bg-white" /> : <p>文件过大，无法内嵌预览。可使用“系统打开”查看全文。</p>}</div> : null}
                    {preview.kind === 'unsupported' ? <div className="space-y-2 text-[12.5px] text-ds-muted"><File className="h-8 w-8 text-ds-faint" /><p>此格式暂不支持内嵌预览。</p><p>{preview.message}</p></div> : null}
                    {preview.kind === 'error' ? <div className="text-[12.5px] text-red-600">{preview.message}</div> : null}
                  </div>
                </>
              ) : (
                <div className="flex min-h-0 flex-1 flex-col">
                  <div className="space-y-4 border-b border-ds-border-muted p-4">
                    <div>
                      <div className="flex items-center gap-2 text-[13px] font-semibold text-ds-text">
                        <Sparkles className="h-4 w-4 text-accent" strokeWidth={1.8} />
                        AI 文件整理
                      </div>
                      <p className="mt-1 text-[12px] leading-5 text-ds-muted">
                        先让 AI 生成整理方案。移动、删除、重命名、覆盖和批量转换都需要你确认后才执行。
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {FILE_MANAGER_AI_TASKS.map((task) => (
                        <button
                          key={task.id}
                          type="button"
                          onClick={() => {
                            setAiTaskId(task.id)
                            if (!aiRequest.trim()) setAiRequest(task.defaultRequest)
                          }}
                          className={`rounded-lg border px-3 py-2 text-left ${aiTaskId === task.id ? 'border-accent bg-accent/10 text-ds-text' : 'border-ds-border-muted text-ds-muted hover:bg-ds-hover hover:text-ds-text'}`}
                        >
                          <span className="block text-[12.5px] font-semibold">{task.label}</span>
                          <span className="mt-1 block text-[11px] leading-4 text-ds-faint">{task.description}</span>
                        </button>
                      ))}
                    </div>
                    <textarea
                      value={aiRequest}
                      onChange={(event) => setAiRequest(event.target.value)}
                      placeholder="例如：帮我把这个文件夹按教学、科研、行政分类，并给出需要新建的文件夹和建议命名。"
                      className="min-h-28 w-full resize-y rounded-lg border border-ds-border bg-ds-main px-3 py-2 text-[12.5px] leading-5 text-ds-text outline-none placeholder:text-ds-faint focus:border-accent"
                    />
                    <div className="rounded-lg bg-ds-main px-3 py-2 text-[11.5px] leading-5 text-ds-muted">
                      当前范围：{selectedFiles.length > 0 ? `已选 ${selectedFiles.length} 个文件` : `当前文件夹 ${basename(directory) || directory}`}。
                    </div>
                    <button
                      type="button"
                      onClick={sendAiOrganizationPlan}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-[13px] font-semibold text-white hover:opacity-90"
                    >
                      <Send className="h-4 w-4" strokeWidth={1.8} />
                      生成整理方案
                    </button>
                  </div>
                  <div className="min-h-0 flex-1 overflow-auto p-3">
                    {showInlineConversation && inlineConversation ? (
                      inlineConversation
                    ) : (
                      <div className="flex h-full min-h-48 items-center justify-center text-center text-[12.5px] leading-6 text-ds-muted">
                        生成方案后，AI 的整理建议会显示在这里。
                      </div>
                    )}
                  </div>
                </div>
              )}
            </aside>
          </div>
        </div>
      )}
      {fileContextMenu ? (
        <div
          role="menu"
          aria-label="文件用途菜单"
          className="fixed z-50 w-56 overflow-hidden rounded-xl border border-ds-border bg-ds-card py-1.5 text-ui-body-sm shadow-xl"
          style={{ left: fileContextMenu.x, top: fileContextMenu.y }}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="border-b border-ds-border-muted px-3 py-2">
            <p className="truncate font-semibold text-ds-text">{fileContextMenu.entry.name}</p>
            <p className="mt-0.5 truncate text-ui-caption text-ds-muted">选择这个文件的用途</p>
          </div>
          <button
            type="button"
            role="menuitem"
            disabled={!fileManagerModuleHandoffAvailability(fileContextMenu.entry).syllabus}
            onClick={() => handleContextFileInModule('syllabus')}
            className="flex w-full items-center gap-2 px-3 py-2 text-left font-medium text-ds-text hover:bg-ds-hover disabled:cursor-not-allowed disabled:text-ds-faint disabled:hover:bg-transparent"
          >
            <FileText className="h-4 w-4 text-accent" strokeWidth={1.8} />
            用于生成教案
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={!fileManagerModuleHandoffAvailability(fileContextMenu.entry).literature}
            onClick={() => handleContextFileInModule('literature')}
            className="flex w-full items-center gap-2 px-3 py-2 text-left font-medium text-ds-text hover:bg-ds-hover disabled:cursor-not-allowed disabled:text-ds-faint disabled:hover:bg-transparent"
          >
            <Search className="h-4 w-4 text-accent" strokeWidth={1.8} />
            用于文献精读
          </button>
        </div>
      ) : null}
    </div>
  )
}
