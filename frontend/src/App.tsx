import { Suspense, lazy, useEffect, useState } from 'react'
import HeaderBar from './components/HeaderBar'
import { GraphEditor, useGraphStore } from './graph'
import { useHistoryFeature } from './features/history/useHistoryFeature'
import { useWorkbenchFeature } from './features/workbench/useWorkbenchFeature'
import type { SessionStatus } from './types'

type AppView = 'graph' | 'history'

const HistoryPanel = lazy(() => import('./components/HistoryPanel'))
const TerminalWindowsLayer = lazy(() => import('./components/TerminalWindowsLayer'))
const LocalAiPanel = lazy(() => import('./features/ai/LocalAiPanel'))

function App() {
  const [activeView, setActiveView] = useState<AppView>('graph')
  const [isLocalAiOpen, setIsLocalAiOpen] = useState(false)

  const workbench = useWorkbenchFeature()

  const history = useHistoryFeature({
    isActive: activeView === 'history',
  })

  const setActiveTerminalIds = useGraphStore((s) => s.setActiveTerminalIds)
  const setTerminalStatuses = useGraphStore((s) => s.setTerminalStatuses)

  useEffect(() => {
    const terminals = workbench.terminalWindowsLayerProps.manualTerminals
    setActiveTerminalIds(terminals.map(t => t.id))

    const statuses: Record<string, SessionStatus> = {}
    terminals.forEach(t => {
      statuses[t.id] = t.status
    })
    setTerminalStatuses(statuses)
  }, [workbench.terminalWindowsLayerProps.manualTerminals, setActiveTerminalIds, setTerminalStatuses])

  useEffect(() => {
    if (!isLocalAiOpen) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsLocalAiOpen(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isLocalAiOpen])

  return (
    <div className="app">
      <HeaderBar
        isSocketConnected={workbench.isSocketConnected}
        terminalInstancesCount={workbench.terminalInstancesCount}
        onOpenLocalAi={() => setIsLocalAiOpen(true)}
        onCreateManualTerminal={() => {
          void workbench.createManualTerminal()
        }}
      />

      {workbench.errorBannerMessage ? (
        <p className="errorBanner">{workbench.errorBannerMessage}</p>
      ) : null}

      <div className="appTabsRow">
        <div className="appTabs" role="tablist" aria-label="Main views">
          <button
            type="button"
            role="tab"
            aria-selected={activeView === 'graph'}
            className={`appTabButton${activeView === 'graph' ? ' appTabButton--active' : ''}`}
            onClick={() => setActiveView('graph')}
          >
            Graph Editor
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeView === 'history'}
            className={`appTabButton${activeView === 'history' ? ' appTabButton--active' : ''}`}
            onClick={() => setActiveView('history')}
          >
            History
          </button>
        </div>
        <div className="appQuickActions">
          <button
            type="button"
            className="appTabButton"
            onClick={() => setIsLocalAiOpen(true)}
          >
            Open Local AI
          </button>
        </div>
      </div>

      {activeView === 'graph' ? (
        <GraphEditor />
      ) : (
        <Suspense fallback={<p className="empty">Loading history...</p>}>
          <HistoryPanel
            terminalHistory={history.terminalHistory}
            isLoading={history.isLoading}
            errorMessage={history.errorMessage}
          />
        </Suspense>
      )}

      {isLocalAiOpen ? (
        <div
          className="appOverlay"
          role="presentation"
          onClick={() => setIsLocalAiOpen(false)}
        >
          <div
            className="appOverlayPanel"
            role="dialog"
            aria-modal="true"
            aria-label="Local AI panel"
            onClick={(event) => event.stopPropagation()}
          >
            <Suspense fallback={<p className="empty">Loading Local AI...</p>}>
              <LocalAiPanel
                onClose={() => setIsLocalAiOpen(false)}
                onImportComplete={() => {
                  setIsLocalAiOpen(false)
                  setActiveView('graph')
                }}
              />
            </Suspense>
          </div>
        </div>
      ) : null}

      {workbench.shouldRenderTerminalWindowsLayer ? (
        <Suspense fallback={null}>
          <TerminalWindowsLayer {...workbench.terminalWindowsLayerProps} />
        </Suspense>
      ) : null}
    </div>
  )
}

export default App
