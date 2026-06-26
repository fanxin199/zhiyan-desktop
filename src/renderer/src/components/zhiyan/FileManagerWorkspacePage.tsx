import { useEffect, useMemo, useState, type ReactElement } from 'react'
import {
  ArrowUp,
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
  Trash2,
  X
} from 'lucide-react'
import type { WorkspaceEntry } from '@shared/workspace-file'
import { useChatStore } from '../../store/chat-store'

type Props = {
  onStartChat: (prompt: string, options?: { workspaceRoot?: string; displayText?: string }) => void
  className?: string
}

type FileCategory = 'all' | 'documents' | 'data' | 'images'

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

export function fileCategory(entry: WorkspaceEntry): FileCategory {
  if (entry.type === 'directory') return 'all'
  const ext = entry.ext.toLowerCase().replace(/^\./u, '')
  if (DOCUMENT_EXTENSIONS.has(ext)) return 'documents'
  if (DATA_EXTENSIONS.has(ext)) return 'data'
  if (IMAGE_EXTENSIONS.has(ext)) return 'images'
  return 'all'
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

export function FileManagerWorkspacePage({ onStartChat, className = '' }: Props): ReactElement {
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

          <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
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
                  return <div key={entry.path} className={`grid min-w-[560px] grid-cols-[42px_minmax(220px,1fr)_100px] items-center border-b border-ds-border-muted/70 px-3 py-2 text-[12.5px] ${active ? 'bg-accent/8' : 'hover:bg-ds-hover'}`}>
                    <div className="flex justify-center">{entry.type === 'file' ? <input type="checkbox" checked={fileSelected} onChange={() => toggleFile(entry.path)} aria-label={`选择 ${entry.name}`} /> : null}</div>
                    <button type="button" onClick={() => void selectEntry(entry)} className="flex min-w-0 items-center gap-2 text-left text-ds-text"><span className="shrink-0">{iconForEntry(entry)}</span><span className="truncate font-medium">{entry.name}</span></button>
                    <span className="truncate text-[11.5px] text-ds-muted">{entry.type === 'directory' ? '文件夹' : (entry.ext || '文件').toUpperCase()}</span>
                  </div>
                })}
              </div>
            </section>

            <aside className="flex min-h-0 flex-col border border-ds-border-muted bg-ds-card">
              <div className="flex min-h-12 items-center justify-between gap-2 border-b border-ds-border-muted px-4">
                <span className="min-w-0 truncate text-[13px] font-semibold text-ds-text">{selectedEntry?.name ?? '文件预览'}</span>
                {selectedEntry ? <button type="button" onClick={openSelectedInSystem} className="rounded-md border border-ds-border px-2 py-1 text-[11.5px] font-semibold text-ds-text hover:bg-ds-hover">系统打开</button> : null}
              </div>
              <div className="min-h-0 flex-1 overflow-auto p-4">
                {preview.kind === 'empty' ? <div className="flex h-full min-h-48 items-center justify-center text-center text-[12.5px] text-ds-muted">选择一个文件查看内容</div> : null}
                {preview.kind === 'loading' ? <div className="flex h-full min-h-48 items-center justify-center gap-2 text-[12.5px] text-ds-muted"><Loader2 className="h-4 w-4 animate-spin" />正在加载预览</div> : null}
                {preview.kind === 'image' ? <img src={preview.dataUrl} alt={selectedEntry?.name ?? ''} className="max-h-full w-full object-contain" /> : null}
                {preview.kind === 'text' ? <><pre className="whitespace-pre-wrap break-words font-mono text-[11.5px] leading-5 text-ds-text">{preview.content}</pre>{preview.truncated ? <p className="mt-3 text-[11.5px] text-ds-muted">仅显示文件开头内容。</p> : null}</> : null}
                {preview.kind === 'pdf' ? <div className="space-y-3 text-[12.5px] text-ds-muted"><div className="flex items-center gap-2"><FileText className="h-6 w-6 text-red-500" /><span>{preview.pageCount} 页{preview.searchable ? '，可检索文本' : '，扫描版或不可检索文本'}</span></div>{preview.dataUrl ? <iframe src={preview.dataUrl} title={selectedEntry?.name ?? 'PDF 预览'} className="h-[480px] w-full border border-ds-border-muted bg-white" /> : <p>文件过大，无法内嵌预览。可使用“系统打开”查看全文。</p>}</div> : null}
                {preview.kind === 'unsupported' ? <div className="space-y-2 text-[12.5px] text-ds-muted"><File className="h-8 w-8 text-ds-faint" /><p>此格式暂不支持内嵌预览。</p><p>{preview.message}</p></div> : null}
                {preview.kind === 'error' ? <div className="text-[12.5px] text-red-600">{preview.message}</div> : null}
              </div>
            </aside>
          </div>
        </div>
      )}
    </div>
  )
}
