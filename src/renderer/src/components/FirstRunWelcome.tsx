import { useState, type ReactElement } from 'react'
import { BookOpen, Loader2, MessageSquareText } from 'lucide-react'
import { formatWorkspacePickerError } from '../lib/format-workspace-picker-error'
import { useChatStore } from '../store/chat-store'
import { useWriteWorkspaceStore } from '../write/write-workspace-store'

/** The workspace the examples go in: the open one, or one the teacher picks now. */
async function exampleWorkspaceRoot(): Promise<string | null> {
  const current = useWriteWorkspaceStore.getState().workspaceRoot
  if (current) return current
  const picked = await window.dsGui.pickWorkspaceDirectory()
  if (picked.canceled || !picked.path) return null
  await useWriteWorkspaceStore.getState().addWriteWorkspace(picked.path)
  return useWriteWorkspaceStore.getState().workspaceRoot || null
}

/**
 * After the API key is set (Task 4.2.1): look at the example course and topic first, or start with
 * one sentence on the home page.
 */
export function FirstRunWelcome({ onDone }: { onDone: () => void }): ReactElement {
  const [installing, setInstalling] = useState(false)
  const [error, setError] = useState('')

  const showExamples = async (): Promise<void> => {
    setInstalling(true)
    setError('')
    try {
      const workspaceRoot = await exampleWorkspaceRoot()
      if (!workspaceRoot) return
      await window.dsGui.installExampleProjects(workspaceRoot)
      await useChatStore.getState().reloadUiSettings()
      onDone()
      useChatStore.getState().setRoute('courses')
    } catch (installError) {
      setError(formatWorkspacePickerError(installError))
    } finally {
      setInstalling(false)
    }
  }

  const start = (): void => {
    onDone()
    useChatStore.getState().setRoute('dashboard')
  }

  const choiceClass = 'flex w-full items-start gap-3 rounded-xl border border-ds-border bg-ds-card px-4 py-4 text-left transition hover:border-accent hover:bg-ds-hover disabled:opacity-60'
  return (
    <div className="space-y-4 px-5 py-6 sm:px-7" data-testid="first-run-welcome">
      <div>
        <h2 id="initial-setup-title" className="text-title font-semibold text-ds-ink">设置完成，从哪里开始？</h2>
        <p className="mt-2 text-body leading-6 text-ds-muted">可以先看看一门示例课程和一个示例课题里 AI 做好的成果，也可以直接说一句要做什么。</p>
      </div>
      <button type="button" onClick={() => void showExamples()} disabled={installing} className={choiceClass}>
        {installing ? <Loader2 className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-accent-strong" /> : <BookOpen className="mt-0.5 h-5 w-5 shrink-0 text-accent-strong" strokeWidth={1.8} />}
        <span>
          <span className="block text-heading font-semibold text-ds-ink">看看示例</span>
          <span className="mt-0.5 block text-small leading-5 text-ds-muted">医学免疫学的教案和随堂题、一个肿瘤免疫课题的文献报告和立项依据提纲，放进你的文件夹，可以随意修改或删除。</span>
        </span>
      </button>
      <button type="button" onClick={start} disabled={installing} className={choiceClass}>
        <MessageSquareText className="mt-0.5 h-5 w-5 shrink-0 text-accent-strong" strokeWidth={1.8} />
        <span>
          <span className="block text-heading font-semibold text-ds-ink">一句话开始</span>
          <span className="mt-0.5 block text-small leading-5 text-ds-muted">例如“帮我写生理学第八章呼吸系统的教案，2 学时”。</span>
        </span>
      </button>
      {error ? <p role="alert" className="text-small text-ds-danger">{error}</p> : null}
    </div>
  )
}
