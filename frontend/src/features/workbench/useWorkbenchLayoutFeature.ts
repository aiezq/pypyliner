import type { Dispatch, SetStateAction } from 'react'
import type { WorkbenchLayoutViewProps } from '../../components/workbench/WorkbenchLayoutView'
import { usePinnedTerminalLayoutController } from '../../hooks/usePinnedTerminalLayoutController'
import { useWorkbenchLayout } from '../../hooks/useWorkbenchLayout'
import { useWorkbenchTerminalsViewModel } from '../../hooks/useWorkbenchTerminalsViewModel'
import type { ManualTerminal, RunState } from '../../types'

interface UseWorkbenchLayoutFeatureOptions {
  run: RunState | null
  manualTerminals: ManualTerminal[]
  pinnedTerminalWindowIds: string[]
  setPinnedTerminalWindowIds: Dispatch<SetStateAction<string[]>>
  requestedMinimizedTerminalWindowIds: string[]
  setRequestedMinimizedTerminalWindowIds: Dispatch<SetStateAction<string[]>>
  updateManualTitle: (terminalId: string, title: string) => void
  renameManualTerminal: (terminalId: string) => Promise<void>
}

export const useWorkbenchLayoutFeature = ({
  run,
  manualTerminals,
  pinnedTerminalWindowIds,
  setPinnedTerminalWindowIds,
  requestedMinimizedTerminalWindowIds,
  setRequestedMinimizedTerminalWindowIds,
  updateManualTitle,
  renameManualTerminal,
}: UseWorkbenchLayoutFeatureOptions) => {
  const {
    visibleRunSessions,
    terminalWindowMap,
    availableTerminalWindowIds,
    effectivePinnedTerminalWindowIds,
    effectiveRequestedMinimizedTerminalWindowIds,
    pinnedTerminalPanelKeys,
    terminalInstancesCount,
    requestMinimizeTerminalWindow,
    dismissRunSessionWindow,
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

  const workbenchLayoutShellProps: Omit<WorkbenchLayoutViewProps, 'panelContentProps'> = {
    visibleWorkbenchPanelOrder,
    draggingWorkbenchPanel,
    dragOverWorkbenchPanel,
    workbenchPanelCollapsed,
    workbenchPanelWidths,
    workbenchPanelFullWidth,
    getWorkbenchPanelTitle,
    getWorkbenchPanelDefaultWidth,
    startWorkbenchPanelDrag,
    onWorkbenchPanelDragOver,
    onWorkbenchPanelDrop,
    finishWorkbenchPanelDrag,
    toggleWorkbenchPanelCollapse,
    toggleWorkbenchPanelFullWidth,
    startWorkbenchPanelResize,
  }

  return {
    terminalInstancesCount,
    terminalWindowMap,
    editingPinnedTerminalTitleId,
    startPinnedTerminalTitleEdit,
    cancelPinnedTerminalTitleEdit,
    savePinnedTerminalTitleEdit,
    minimizePinnedTerminalWindow,
    togglePinTerminalWindow,
    workbenchLayoutShellProps,
    terminalWindowsBaseProps: {
      runSessions: visibleRunSessions,
      manualTerminals,
      pinnedWindowIds: effectivePinnedTerminalWindowIds,
      requestedMinimizedWindowIds: effectiveRequestedMinimizedTerminalWindowIds,
      onConsumeRequestedMinimizeWindow: consumeRequestedMinimizeTerminalWindow,
      onTogglePinWindow: togglePinTerminalWindow,
      onDismissRunSessionWindow: dismissRunSessionWindow,
    },
    shouldRenderTerminalWindowsLayer:
      visibleRunSessions.length > 0 || manualTerminals.length > 0,
  }
}
