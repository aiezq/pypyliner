import {
  useEffect,
  useMemo,
  useState,
} from 'react'
import { useQuery } from '@tanstack/react-query'
import CommandPackImportModal from './components/CommandPackImportModal'
import HeaderBar from './components/HeaderBar'
import HistoryPanel from './components/HistoryPanel'
import PipelineFlowSettingsModal from './components/PipelineFlowSettingsModal'
import TerminalWindowsLayer from './components/TerminalWindowsLayer'
import WorkbenchLayoutView from './components/workbench/WorkbenchLayoutView'
import type { WorkbenchPanelBodyProps } from './components/workbench/WorkbenchPanelContent'
import { PIPELINE_OPEN_TERMINAL_COMMAND } from './data/templates'
import { useWorkbenchCatalog } from './hooks/useWorkbenchCatalog'
import {
  useWorkbenchLayout,
} from './hooks/useWorkbenchLayout'
import { useBackendStatusMessage } from './hooks/useBackendStatusMessage'
import { useManualTerminalController } from './hooks/useManualTerminalController'
import { usePinnedTerminalLayoutController } from './hooks/usePinnedTerminalLayoutController'
import { usePipelineFlowController } from './hooks/usePipelineFlowController'
import { useRunController } from './hooks/useRunController'
import { useWorkbenchTerminalsViewModel } from './hooks/useWorkbenchTerminalsViewModel'
import { apiRequest } from './lib/api'
import { BackendHistorySchema } from './lib/schemas'
import {
  createId,
  getErrorMessage,
  toRunState,
} from './lib/mappers'
import { useUiStore } from './stores/uiStore'
import type {
  BackendHistory,
} from './types'


type AppView = 'workbench' | 'history'

const WORKBENCH_PINNED_TERMINALS_STORAGE_KEY = 'operator_helper.pinned_terminals.v1'
const HISTORY_QUERY_KEY = ['history'] as const

const fetchHistory = async (): Promise<BackendHistory> => {
  const payload = await apiRequest<unknown>('/api/history')
  return BackendHistorySchema.parse(payload)
}

const readStoredPinnedTerminalWindowIds = (): string[] => {
  if (typeof window === 'undefined') {
    return []
  }
  try {
    const raw = window.localStorage.getItem(WORKBENCH_PINNED_TERMINALS_STORAGE_KEY)
    if (!raw) {
      return []
    }
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) {
      return []
    }
    return parsed
      .filter((item): item is string => typeof item === 'string')
      .filter((item) => item.length > 0)
  } catch {
    return []
  }
}

function App() {
  const pipelineName = useUiStore((state) => state.pipelineName)
  const setPipelineName = useUiStore((state) => state.setPipelineName)
  const isImportModalOpen = useUiStore((state) => state.isImportModalOpen)
  const openImportModal = useUiStore((state) => state.openImportModal)
  const closeImportModal = useUiStore((state) => state.closeImportModal)
  const [isFlowSettingsModalOpen, setIsFlowSettingsModalOpen] = useState(false)
  const defaultPipelineSteps = useMemo(
    () => [
      {
        id: createId('step'),
        type: 'template' as const,
        label: 'Open terminal shell',
        command: PIPELINE_OPEN_TERMINAL_COMMAND,
      },
    ],
    [],
  )
  const [activeView, setActiveView] = useState<AppView>('workbench')
  const [backendError, setBackendError] = useState<string | null>(null)
  const {
    manualTerminals,
    createManualTerminal,
    renameManualTerminal,
    runManualCommand,
    autocompleteManualCommand,
    stopManualTerminal,
    clearManualTerminal,
    removeManualTerminal,
    updateManualTitle,
    updateManualCommand,
    navigateManualCommandHistory,
    getCopyTailLineCount,
    updateCopyTailLineCount,
    copyManualTerminalTail,
    copyTailCopiedByTerminalId,
    getSocketEventContext,
  } = useManualTerminalController({
    setBackendError,
  })
  const [pinnedTerminalWindowIds, setPinnedTerminalWindowIds] = useState<string[]>(
    readStoredPinnedTerminalWindowIds(),
  )
  const [requestedMinimizedTerminalWindowIds, setRequestedMinimizedTerminalWindowIds] =
    useState<string[]>([])
  const {
    commandPacksQuery,
    pipelineFlowsQuery,
    templates,
    templatePacksCount,
    savedPipelineFlows,
    commandPackOptions,
    commandPackNamesById,
    savedPipelineFlowOptions,
    reloadCommandPacks,
    reloadPipelineFlows,
    createTemplate: createTemplateRequest,
    updateTemplate: updateTemplateRequest,
    moveTemplateToPack: moveTemplateToPackRequest,
    deleteTemplate: deleteTemplateRequest,
    importJsonPack: importJsonPackRequest,
    createPipelineFlow: createPipelineFlowRequest,
    updatePipelineFlow: updatePipelineFlowRequest,
    deletePipelineFlow: deletePipelineFlowRequest,
    isSavingFlow,
    isFlowSettingsMutating,
  } = useWorkbenchCatalog()

  const historyQuery = useQuery({
    queryKey: HISTORY_QUERY_KEY,
    queryFn: fetchHistory,
    enabled: activeView === 'history',
    refetchOnWindowFocus: false,
    refetchInterval: activeView === 'history' ? 2500 : false,
  })
  const {
    steps,
    clearSteps,
    addStepFromTemplate,
    createEmptyStep,
    updateStep,
    reorderStepByIndex,
    removeStep,
    effectiveSelectedPipelineFlowId,
    switchPipelineFlow,
    savePipelineFlow,
    savePipelineFlowAsNew,
    renamePipelineFlow,
    deletePipelineFlow,
    updateTemplate,
    moveTemplateToPack,
    deleteTemplate,
    importJsonPack,
    saveStepToDock,
  } = usePipelineFlowController({
    initialSteps: defaultPipelineSteps,
    pipelineName,
    setPipelineName,
    savedPipelineFlows,
    setBackendError,
    createTemplateRequest,
    updateTemplateRequest,
    moveTemplateToPackRequest,
    deleteTemplateRequest,
    importJsonPackRequest,
    createPipelineFlowRequest,
    updatePipelineFlowRequest,
    deletePipelineFlowRequest,
  })

  const {
    run,
    isRunning,
    isSocketConnected,
    executePipeline,
    stopRun,
  } = useRunController({
    pipelineName,
    steps,
    setBackendError,
    getSocketEventContext,
    reloadCommandPacks,
    reloadPipelineFlows,
  })

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }
    try {
      window.localStorage.setItem(
        WORKBENCH_PINNED_TERMINALS_STORAGE_KEY,
        JSON.stringify(pinnedTerminalWindowIds),
      )
    } catch {
      // Ignore storage errors.
    }
  }, [pinnedTerminalWindowIds])

  const errorBannerMessage = useBackendStatusMessage({
    backendError,
    commandPacksQuery,
    pipelineFlowsQuery,
  })

  const {
    visibleRunSessions,
    terminalWindowMap,
    availableTerminalWindowIds,
    effectivePinnedTerminalWindowIds,
    effectiveRequestedMinimizedTerminalWindowIds,
    pinnedTerminalPanelKeys,
    terminalInstancesCount,
    requestMinimizeTerminalWindow,
    consumeRequestedMinimizeTerminalWindow,
    editingPinnedTerminalTitleId,
    startPinnedTerminalTitleEdit,
    cancelPinnedTerminalTitleEdit,
    savePinnedTerminalTitleEdit,
  } = useWorkbenchTerminalsViewModel({
    run,
    manualTerminals,
    pinnedTerminalWindowIds,
    requestedMinimizedTerminalWindowIds,
    setRequestedMinimizedTerminalWindowIds,
    updateManualTitle,
    renameManualTerminal,
  })

  const {
    draggingWorkbenchPanel,
    dragOverWorkbenchPanel,
    workbenchPanelCollapsed,
    workbenchPanelWidths,
    workbenchPanelFullWidth,
    visibleWorkbenchPanelOrder,
    startWorkbenchPanelDrag,
    onWorkbenchPanelDragOver,
    onWorkbenchPanelDrop,
    finishWorkbenchPanelDrag,
    toggleWorkbenchPanelCollapse,
    startWorkbenchPanelResize,
    toggleWorkbenchPanelFullWidth,
    removePanelFromLayout,
    ensurePanelInLayout,
  } = useWorkbenchLayout({
    terminalPanelKeys: pinnedTerminalPanelKeys,
  })
  const {
    getWorkbenchPanelTitle,
    getWorkbenchPanelDefaultWidth,
    minimizePinnedTerminalWindow,
    togglePinTerminalWindow,
  } = usePinnedTerminalLayoutController({
    terminalWindowMap,
    availableTerminalWindowIds,
    effectivePinnedTerminalWindowIds,
    setPinnedTerminalWindowIds,
    removePanelFromLayout,
    ensurePanelInLayout,
    requestMinimizeTerminalWindow,
  })
  const workbenchPanelContentProps: WorkbenchPanelBodyProps = {
    steps,
    packOptions: commandPackOptions,
    savedFlows: savedPipelineFlowOptions,
    selectedSavedFlowId: effectiveSelectedPipelineFlowId,
    pipelineName,
    run,
    isRunning,
    isSavingFlow,
    onRunPipeline: executePipeline,
    onStopRun: stopRun,
    onClearSteps: clearSteps,
    onCreateStep: createEmptyStep,
    onRemoveStep: removeStep,
    onUpdateStep: updateStep,
    onSaveStepToDock: saveStepToDock,
    onSwitchSavedFlow: switchPipelineFlow,
    onPipelineNameChange: setPipelineName,
    onSaveFlow: savePipelineFlow,
    onSaveFlowAsNew: savePipelineFlowAsNew,
    onReorderSteps: reorderStepByIndex,
    templates,
    packNamesById: commandPackNamesById,
    packsCount: templatePacksCount,
    isReloadingTemplates: commandPacksQuery.isFetching,
    onAddStepFromTemplate: addStepFromTemplate,
    onUpdateTemplate: updateTemplate,
    onReloadTemplates: reloadCommandPacks,
    onMoveTemplateToPack: moveTemplateToPack,
    onDeleteTemplate: deleteTemplate,
    terminalWindowMap,
    editingPinnedTerminalTitleId,
    onTogglePinTerminalWindow: togglePinTerminalWindow,
    onMinimizePinnedTerminalWindow: minimizePinnedTerminalWindow,
    onUpdateManualTitle: updateManualTitle,
    onStartPinnedTerminalTitleEdit: startPinnedTerminalTitleEdit,
    onCancelPinnedTerminalTitleEdit: cancelPinnedTerminalTitleEdit,
    onSavePinnedTerminalTitleEdit: savePinnedTerminalTitleEdit,
    onStopManualTerminal: stopManualTerminal,
    onRemoveManualTerminal: removeManualTerminal,
    onUpdateManualCommand: updateManualCommand,
    onAutocompleteManualCommand: autocompleteManualCommand,
    onNavigateManualHistory: navigateManualCommandHistory,
    onRunManualCommand: runManualCommand,
    onClearManualTerminal: clearManualTerminal,
    getCopyTailLineCount,
    onUpdateCopyTailLineCount: updateCopyTailLineCount,
    onCopyManualTerminalTail: copyManualTerminalTail,
    isCopyTailRecentlyCopied: (terminalId) =>
      copyTailCopiedByTerminalId[terminalId] === true,
  }

  return (
    <div className="app">
      <HeaderBar
        isSocketConnected={isSocketConnected}
        terminalInstancesCount={terminalInstancesCount}
        onCreateManualTerminal={() => {
          void createManualTerminal()
        }}
        onOpenImportModal={openImportModal}
        onOpenFlowSettingsModal={() => setIsFlowSettingsModalOpen(true)}
      />

      <CommandPackImportModal
        isOpen={isImportModalOpen}
        onClose={closeImportModal}
        onImport={importJsonPack}
      />
      <PipelineFlowSettingsModal
        isOpen={isFlowSettingsModalOpen}
        flows={savedPipelineFlows}
        selectedFlowId={effectiveSelectedPipelineFlowId}
        isMutating={isFlowSettingsMutating}
        onClose={() => setIsFlowSettingsModalOpen(false)}
        onSwitchFlow={(flowId) => switchPipelineFlow(flowId)}
        onRenameFlow={renamePipelineFlow}
        onDeleteFlow={deletePipelineFlow}
      />

      {errorBannerMessage ? <p className="errorBanner">{errorBannerMessage}</p> : null}

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
        <WorkbenchLayoutView
          visibleWorkbenchPanelOrder={visibleWorkbenchPanelOrder}
          draggingWorkbenchPanel={draggingWorkbenchPanel}
          dragOverWorkbenchPanel={dragOverWorkbenchPanel}
          workbenchPanelCollapsed={workbenchPanelCollapsed}
          workbenchPanelWidths={workbenchPanelWidths}
          workbenchPanelFullWidth={workbenchPanelFullWidth}
          getWorkbenchPanelTitle={getWorkbenchPanelTitle}
          getWorkbenchPanelDefaultWidth={getWorkbenchPanelDefaultWidth}
          startWorkbenchPanelDrag={startWorkbenchPanelDrag}
          onWorkbenchPanelDragOver={onWorkbenchPanelDragOver}
          onWorkbenchPanelDrop={onWorkbenchPanelDrop}
          finishWorkbenchPanelDrag={finishWorkbenchPanelDrag}
          toggleWorkbenchPanelCollapse={toggleWorkbenchPanelCollapse}
          toggleWorkbenchPanelFullWidth={toggleWorkbenchPanelFullWidth}
          startWorkbenchPanelResize={startWorkbenchPanelResize}
          panelContentProps={workbenchPanelContentProps}
        />
      ) : (
        <HistoryPanel
          runs={(historyQuery.data?.runs ?? []).map(toRunState)}
          terminalHistory={historyQuery.data?.manual_terminal_history ?? []}
          isLoading={historyQuery.isLoading || historyQuery.isFetching}
          errorMessage={historyQuery.isError ? getErrorMessage(historyQuery.error) : null}
        />
      )}

      <TerminalWindowsLayer
        runSessions={visibleRunSessions}
        manualTerminals={manualTerminals}
        pinnedWindowIds={effectivePinnedTerminalWindowIds}
        requestedMinimizedWindowIds={effectiveRequestedMinimizedTerminalWindowIds}
        onConsumeRequestedMinimizeWindow={consumeRequestedMinimizeTerminalWindow}
        onTogglePinWindow={togglePinTerminalWindow}
        getCopyTailLineCount={getCopyTailLineCount}
        isCopyTailRecentlyCopied={(terminalId) =>
          copyTailCopiedByTerminalId[terminalId] === true
        }
        onUpdateCopyTailLineCount={updateCopyTailLineCount}
        onCopyManualTerminalTail={(terminalId) => {
          void copyManualTerminalTail(terminalId)
        }}
        onUpdateManualTitle={updateManualTitle}
        onRenameManualTerminal={(terminalId) => {
          void renameManualTerminal(terminalId)
        }}
        onUpdateManualCommand={updateManualCommand}
        onNavigateManualHistory={navigateManualCommandHistory}
        onRunManualCommand={(terminalId) => {
          void runManualCommand(terminalId)
        }}
        onAutocompleteManualCommand={(terminalId) => {
          void autocompleteManualCommand(terminalId)
        }}
        onStopManualTerminal={(terminalId) => {
          void stopManualTerminal(terminalId)
        }}
        onClearManualTerminal={(terminalId) => {
          void clearManualTerminal(terminalId)
        }}
        onRemoveManualTerminal={(terminalId) => {
          void removeManualTerminal(terminalId)
        }}
      />
    </div>
  )
}

export default App
