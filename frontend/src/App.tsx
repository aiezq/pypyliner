import { Suspense, lazy, useState, useEffect } from 'react'
import HeaderBar from './components/HeaderBar'
import { GraphEditor, useGraphStore } from './graph'
import { useHistoryFeature } from './features/history/useHistoryFeature'
import { useWorkbenchFeature } from './features/workbench/useWorkbenchFeature'
import type { SessionStatus } from './types'

type AppView = 'graph' | 'history'

const HistoryPanel = lazy(() => import('./components/HistoryPanel'))
const TerminalWindowsLayer = lazy(() => import('./components/TerminalWindowsLayer'))

function App() {
  const [activeView, setActiveView] = useState<AppView>('graph')

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

  return (
    <div className="app">
      <HeaderBar
        isSocketConnected={workbench.isSocketConnected}
        terminalInstancesCount={workbench.terminalInstancesCount}
        onCreateManualTerminal={() => {
          void workbench.createManualTerminal()
        }}
      />

      {workbench.errorBannerMessage ? (
        <p className="errorBanner">{workbench.errorBannerMessage}</p>
      ) : null}

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

      {workbench.shouldRenderTerminalWindowsLayer ? (
        <Suspense fallback={null}>
          <TerminalWindowsLayer {...workbench.terminalWindowsLayerProps} />
        </Suspense>
      ) : null}
    </div>
  )
}

export default App
