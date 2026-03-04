import { Suspense, lazy, useState } from 'react'
import HeaderBar from './components/HeaderBar'
import { useHistoryFeature } from './features/history/useHistoryFeature'
import { useWorkbenchFeature } from './features/workbench/useWorkbenchFeature'
import { useUiStore } from './stores/uiStore'

type AppView = 'workbench' | 'history'

const CommandPackImportModal = lazy(() => import('./components/CommandPackImportModal'))
const HistoryPanel = lazy(() => import('./components/HistoryPanel'))
const PipelineFlowSettingsModal = lazy(
  () => import('./components/PipelineFlowSettingsModal'),
)
const TerminalWindowsLayer = lazy(() => import('./components/TerminalWindowsLayer'))
const WorkbenchLayoutView = lazy(() => import('./components/workbench/WorkbenchLayoutView'))

function App() {
  const pipelineName = useUiStore((state) => state.pipelineName)
  const setPipelineName = useUiStore((state) => state.setPipelineName)
  const isImportModalOpen = useUiStore((state) => state.isImportModalOpen)
  const openImportModal = useUiStore((state) => state.openImportModal)
  const closeImportModal = useUiStore((state) => state.closeImportModal)
  const [isFlowSettingsModalOpen, setIsFlowSettingsModalOpen] = useState(false)
  const [activeView, setActiveView] = useState<AppView>('workbench')

  const workbench = useWorkbenchFeature({
    pipelineName,
    setPipelineName,
  })

  const history = useHistoryFeature({
    isActive: activeView === 'history',
  })

  return (
    <div className="app">
      <HeaderBar
        isSocketConnected={workbench.isSocketConnected}
        terminalInstancesCount={workbench.terminalInstancesCount}
        onCreateManualTerminal={() => {
          void workbench.createManualTerminal()
        }}
        onOpenImportModal={openImportModal}
        onOpenFlowSettingsModal={() => setIsFlowSettingsModalOpen(true)}
      />

      {isImportModalOpen ? (
        <Suspense fallback={null}>
          <CommandPackImportModal
            isOpen={isImportModalOpen}
            onClose={closeImportModal}
            onImport={workbench.importJsonPack}
          />
        </Suspense>
      ) : null}

      {isFlowSettingsModalOpen ? (
        <Suspense fallback={null}>
          <PipelineFlowSettingsModal
            isOpen={isFlowSettingsModalOpen}
            flows={workbench.flowSettings.flows}
            selectedFlowId={workbench.flowSettings.selectedFlowId}
            isMutating={workbench.flowSettings.isMutating}
            onClose={() => setIsFlowSettingsModalOpen(false)}
            onSwitchFlow={workbench.flowSettings.onSwitchFlow}
            onRenameFlow={workbench.flowSettings.onRenameFlow}
            onDeleteFlow={workbench.flowSettings.onDeleteFlow}
          />
        </Suspense>
      ) : null}

      {workbench.errorBannerMessage ? (
        <p className="errorBanner">{workbench.errorBannerMessage}</p>
      ) : null}

      <div className="appTabs" role="tablist" aria-label="Main views">
        <button
          type="button"
          role="tab"
          aria-selected={activeView === 'workbench'}
          className={`appTabButton${activeView === 'workbench' ? ' appTabButton--active' : ''}`}
          onClick={() => setActiveView('workbench')}
        >
          Workbench
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

      {activeView === 'workbench' ? (
        <Suspense fallback={<p className="empty">Loading workbench...</p>}>
          <WorkbenchLayoutView {...workbench.workbenchLayoutProps} />
        </Suspense>
      ) : (
        <Suspense fallback={<p className="empty">Loading history...</p>}>
          <HistoryPanel
            runs={history.runs}
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
