import { useEffect, useState, type ReactElement } from 'react'
import { ArrowLeft } from 'lucide-react'
import {
  DOCUMENT_TEMPLATE_IDS,
  DOCUMENT_TEMPLATES,
  type DocumentMaterial,
  type DocumentTemplateId
} from '@shared/document-templates'
import { formatWorkspacePickerError } from '../../lib/format-workspace-picker-error'
import { useActiveProjectStore } from '../../lib/active-project'
import { openDocumentArtifact } from '../../lib/resume-artifact'
import type { ToolPrefill } from '../../lib/tool-request'
import { useWriteWorkspaceStore } from '../../write/write-workspace-store'
import { AiWorkExamples, AiWorkPage, AiWorkRecentArtifacts } from '../ai-work/AiWorkPage'
import { IntentComposer } from '../ai-work/IntentComposer'
import { WriteWorkspaceEmptyState } from '../write/WriteWorkspaceEmptyState'
import { extractResearchTaskFileText } from '../zhiyan/ZhiYanModulePages'

type LoadedMaterial = DocumentMaterial & { id: string }

async function fileToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  let binary = ''
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000))
  }
  return btoa(binary)
}

/** Reads dropped or picked materials as text; files that cannot be read are reported by name. */
export async function readDocumentMaterials(files: File[]): Promise<{ materials: LoadedMaterial[]; rejected: string[] }> {
  const materials: LoadedMaterial[] = []
  const rejected: string[] = []
  for (const file of files) {
    try {
      const extracted = await extractResearchTaskFileText({ name: file.name, dataBase64: await fileToBase64(file) })
      if (extracted.kind === 'unsupported' || !extracted.text.trim()) {
        rejected.push(file.name)
        continue
      }
      materials.push({ id: `${file.name}-${file.size}-${file.lastModified}`, name: file.name, text: extracted.text })
    } catch {
      rejected.push(file.name)
    }
  }
  return { materials, rejected }
}

/**
 * The start state of 文稿 (Task 1.4.2): choose a template, say in one sentence what to write and
 * add materials; the AI writes the first draft into a new document, which then opens for editing.
 */
export function DocumentStartView({ template, prefill }: { template: DocumentTemplateId; prefill?: ToolPrefill }): ReactElement {
  const workspaceRoot = useWriteWorkspaceStore((state) => state.workspaceRoot)
  const activeFilePath = useWriteWorkspaceStore((state) => state.activeFilePath)
  const loadWriteSettings = useWriteWorkspaceStore((state) => state.loadWriteSettings)
  const [selected, setSelected] = useState<DocumentTemplateId>(template)
  const [input, setInput] = useState(prefill?.text ?? '')
  const [materials, setMaterials] = useState<LoadedMaterial[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const current = DOCUMENT_TEMPLATES[selected]

  useEffect(() => {
    void loadWriteSettings()
  }, [loadWriteSettings])

  useEffect(() => setSelected(template), [template])

  // A request from the AI assistant fills the input box once per request.
  useEffect(() => {
    if (prefill) setInput(prefill.text)
  }, [prefill])

  const addFiles = async (files: File[]): Promise<void> => {
    const { materials: loaded, rejected } = await readDocumentMaterials(files)
    setMaterials((existing) => [...existing, ...loaded.filter((item) => !existing.some((known) => known.id === item.id))].slice(0, 10))
    setError(rejected.length > 0 ? `无法读取：${rejected.join('、')}。可以添加 PDF、Word、Excel、文本或 Markdown 文件。` : '')
  }

  const submit = async (): Promise<void> => {
    if (!workspaceRoot) return
    setBusy(true)
    setError('')
    try {
      const result = await window.dsGui.createDocument({
        workspaceRoot,
        template: selected,
        instruction: input.trim(),
        materials: materials.map(({ name, text }) => ({ name, text })),
        projectId: useActiveProjectStore.getState().projectId ?? undefined
      })
      if (!result.ok) {
        setError(result.message)
        return
      }
      const store = useWriteWorkspaceStore.getState()
      await store.refreshWorkspace(workspaceRoot)
      await store.openFile(workspaceRoot, result.path)
      store.closeDocumentStart()
      setInput('')
      setMaterials([])
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : '没能创建文稿，请稍后再试。')
    } finally {
      setBusy(false)
    }
  }

  const pickWorkspace = async (): Promise<void> => {
    try {
      const picked = await window.dsGui.pickWorkspaceDirectory()
      if (!picked.canceled && picked.path) await useWriteWorkspaceStore.getState().addWriteWorkspace(picked.path)
    } catch (pickError) {
      setError(formatWorkspacePickerError(pickError))
    }
  }

  if (!workspaceRoot) return <WriteWorkspaceEmptyState error={error} onPickWorkspace={() => void pickWorkspace()} />

  return (
    <AiWorkPage
      module="write"
      title="文稿"
      description="选一个模板，用一句话说明要写什么，AI 先写出初稿，之后可以逐节修改。"
      state="start"
      start={(
        <>
          {activeFilePath ? (
            <button
              type="button"
              onClick={() => useWriteWorkspaceStore.getState().closeDocumentStart()}
              className="mb-4 inline-flex items-center gap-1.5 text-small font-medium text-ds-muted hover:text-ds-ink"
            >
              <ArrowLeft className="h-4 w-4" strokeWidth={1.8} />
              回到正在编辑的文稿
            </button>
          ) : null}
          <div role="radiogroup" aria-label="模板" className="mb-3 flex flex-wrap gap-2">
            {DOCUMENT_TEMPLATE_IDS.map((id) => {
              const checked = id === selected
              return (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  onClick={() => setSelected(id)}
                  className={`rounded-lg border px-3 py-1.5 text-small font-semibold transition-colors ${
                    checked
                      ? 'border-accent bg-accent-soft text-accent-strong'
                      : 'border-ds-border bg-ds-card text-ds-text hover:bg-ds-hover'
                  }`}
                >
                  {DOCUMENT_TEMPLATES[id].label}
                </button>
              )
            })}
          </div>
          <p className="mb-3 text-small text-ds-muted">{current.description}</p>
          <IntentComposer
            value={input}
            onChange={setInput}
            onSubmit={() => void submit()}
            placeholder={current.placeholder}
            attachments={materials.map(({ id, name }) => ({ id, name }))}
            onAddFiles={(files) => void addFiles(files)}
            onRemoveAttachment={(id) => setMaterials((existing) => existing.filter((item) => item.id !== id))}
            busy={busy}
            autoFocus
            allowEmpty
          />
          {busy ? (
            <p role="status" className="mt-2 text-small text-ds-muted">
              正在写{current.draftStage}，大约需要一分钟……
            </p>
          ) : null}
          {error ? <p role="alert" className="mt-2 text-small text-ds-danger">{error}</p> : null}
          {!input.trim() && materials.length === 0 ? (
            <p className="mt-2 text-caption text-ds-muted">不写要求直接发送，会新建一份空白文稿。</p>
          ) : null}
          <AiWorkExamples examples={current.examples} onSelect={setInput} />
          <AiWorkRecentArtifacts
            toolId="write"
            onOpen={(artifact) => void openDocumentArtifact(artifact)}
          />
        </>
      )}
    />
  )
}
