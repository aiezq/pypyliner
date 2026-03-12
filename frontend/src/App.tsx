import { Suspense, lazy, useEffect, useState } from 'react'
import HeaderBar from './components/HeaderBar'
import SequenceRuntimeStrip from './components/SequenceRuntimeStrip'
import { GraphEditor, useGraphStore } from './graph'
import { useHistoryFeature } from './features/history/useHistoryFeature'
import { useWorkbenchFeature } from './features/workbench/useWorkbenchFeature'
import { useI18n } from './i18n/I18nProvider'

type AppView = 'graph' | 'history'

const HistoryPanel = lazy(() => import('./components/HistoryPanel'))
const TerminalWindowsLayer = lazy(() => import('./components/TerminalWindowsLayer'))
const LocalAiPanel = lazy(() => import('./features/ai/LocalAiPanel'))

function App() {
  const { messages } = useI18n()
  const [activeView, setActiveView] = useState<AppView>('graph')
  const [isLocalAiOpen, setIsLocalAiOpen] = useState(false)

  const workbench = useWorkbenchFeature()

  const history = useHistoryFeature({
    isActive: activeView === 'history',
  })

  const syncTerminalRuntime = useGraphStore((s) => s.syncTerminalRuntime)
  const syncSequenceRuntime = useGraphStore((s) => s.syncSequenceRuntime)

  useEffect(() => {
    syncTerminalRuntime(workbench.terminalWindowsLayerProps.manualTerminals)
  }, [syncTerminalRuntime, workbench.terminalWindowsLayerProps.manualTerminals])

  useEffect(() => {
    syncSequenceRuntime(workbench.sequenceExecutions)
  }, [syncSequenceRuntime, workbench.sequenceExecutions])

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
        onCreateManualTerminal={() => {
          void workbench.createManualTerminal()
        }}
      />

      {workbench.errorBannerMessage ? (
        <p className="errorBanner">{workbench.errorBannerMessage}</p>
      ) : null}

      <SequenceRuntimeStrip sequences={workbench.sequenceExecutions} />

      <div className="appTabsRow">
        <div className="appTabs" role="tablist" aria-label={messages.app.mainViews}>
          <button
            type="button"
            role="tab"
            aria-selected={activeView === 'graph'}
            className={`appTabButton${activeView === 'graph' ? ' appTabButton--active' : ''}`}
            onClick={() => setActiveView('graph')}
          >
            {messages.app.graphEditor}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeView === 'history'}
            className={`appTabButton${activeView === 'history' ? ' appTabButton--active' : ''}`}
            onClick={() => setActiveView('history')}
          >
            {messages.app.history}
          </button>
        </div>
        <div className="appQuickActions">
          <button
            type="button"
            className="appTabButton"
            onClick={() => setIsLocalAiOpen(true)}
          >
            {messages.app.openLocalAi}
          </button>
        </div>
      </div>

      {activeView === 'graph' ? (
        <GraphEditor />
      ) : (
        <Suspense fallback={<p className="empty">{messages.app.loadingHistory}</p>}>
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
          aria-label={messages.app.localAiPanelLabel}
          onClick={(event) => event.stopPropagation()}
        >
            <Suspense fallback={<p className="empty">{messages.app.loadingLocalAi}</p>}>
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
