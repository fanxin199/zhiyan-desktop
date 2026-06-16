import { Component, lazy, Suspense, useEffect, type ErrorInfo, type ReactNode } from 'react'
import { useChatStore } from './store/chat-store'
import { supportsDesktopTitleBar, WindowsTitleBar } from './components/WindowsTitleBar'

const Workbench = lazy(() =>
  import('./components/Workbench').then((module) => ({ default: module.Workbench }))
)
const SettingsView = lazy(() =>
  import('./components/SettingsView').then((module) => ({ default: module.SettingsView }))
)
const InitialSetupDialog = lazy(() =>
  import('./components/InitialSetupDialog').then((module) => ({
    default: module.InitialSetupDialog
  }))
)

function RouteFallback(): React.ReactElement {
  return <div className="h-full bg-ds-main" />
}

class RouteErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: unknown): { error: Error } {
    return { error: error instanceof Error ? error : new Error(String(error)) }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Route render failed', error, info.componentStack)
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children
    return (
      <div className="flex h-full min-h-0 items-center justify-center bg-ds-main px-6 text-ds-text">
        <div className="max-w-md rounded-xl border border-red-200 bg-red-50 p-5 text-left shadow-sm dark:border-red-500/30 dark:bg-red-500/10">
          <div className="text-[15px] font-semibold text-red-700 dark:text-red-200">页面渲染失败</div>
          <p className="mt-2 text-[13px] leading-relaxed text-red-700/80 dark:text-red-100/80">
            {this.state.error.message || '请返回工作台后重试。'}
          </p>
          <button
            type="button"
            className="mt-4 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-[13px] font-medium text-red-700 shadow-sm transition hover:bg-red-50 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-100 dark:hover:bg-red-500/20"
            onClick={() => this.setState({ error: null })}
          >
            重试
          </button>
        </div>
      </div>
    )
  }
}

export default function AppShell(): React.ReactElement {
  const route = useChatStore((s) => s.route)
  const boot = useChatStore((s) => s.boot)
  const initialSetupOpen = useChatStore((s) => s.initialSetupOpen)
  const platform = typeof window !== 'undefined' ? window.dsGui?.platform ?? 'unknown' : 'unknown'
  const hasDesktopTitleBar = supportsDesktopTitleBar(platform)

  useEffect(() => {
    let frame = 0
    const timer = window.setTimeout(() => {
      frame = window.requestAnimationFrame(() => {
        void boot()
      })
    }, 0)
    return () => {
      window.clearTimeout(timer)
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [boot])

  return (
    <div className={hasDesktopTitleBar ? 'ds-windows-app-frame flex h-full min-h-0 flex-col bg-ds-main' : 'flex h-full min-h-0 flex-col bg-transparent'}>
      {hasDesktopTitleBar ? <WindowsTitleBar platform={platform} /> : null}
      <div className="flex min-h-0 flex-1 flex-col">
        <RouteErrorBoundary key={route}>
          <Suspense fallback={<RouteFallback />}>
            {route === 'settings' ? <SettingsView /> : <Workbench />}
          </Suspense>
        </RouteErrorBoundary>
      </div>
      {initialSetupOpen ? (
        <Suspense fallback={null}>
          <InitialSetupDialog />
        </Suspense>
      ) : null}
    </div>
  )
}
