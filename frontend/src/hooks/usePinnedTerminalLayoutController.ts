import type { Dispatch, SetStateAction } from 'react'
import {
  MIN_WORKBENCH_PANEL_WIDTH,
  WORKBENCH_PANEL_DOCK,
  WORKBENCH_PANEL_FLOW,
  toTerminalWorkbenchPanelKey,
  toWorkbenchTerminalWindowId,
  type WorkbenchPanelKey,
} from './useWorkbenchLayout'
import type { WorkbenchTerminalWindowItem } from './useWorkbenchTerminalsViewModel'

interface UsePinnedTerminalLayoutControllerOptions {
  terminalWindowMap: Map<string, WorkbenchTerminalWindowItem>
  availableTerminalWindowIds: Set<string>
  effectivePinnedTerminalWindowIds: string[]
  setPinnedTerminalWindowIds: Dispatch<SetStateAction<string[]>>
  removePanelFromLayout: (panel: WorkbenchPanelKey) => void
  ensurePanelInLayout: (panel: WorkbenchPanelKey, defaultWidth: number) => void
  requestMinimizeTerminalWindow: (windowId: string) => void
}

export const usePinnedTerminalLayoutController = ({
  terminalWindowMap,
  availableTerminalWindowIds,
  effectivePinnedTerminalWindowIds,
  setPinnedTerminalWindowIds,
  removePanelFromLayout,
  ensurePanelInLayout,
  requestMinimizeTerminalWindow,
}: UsePinnedTerminalLayoutControllerOptions) => {
  const getWorkbenchPanelTitle = (panel: WorkbenchPanelKey): string => {
    if (panel === WORKBENCH_PANEL_FLOW) {
      return 'Pipeline Flow'
    }
    if (panel === WORKBENCH_PANEL_DOCK) {
      return 'Pipeline Dock'
    }
    const terminalWindowId = toWorkbenchTerminalWindowId(panel)
    if (!terminalWindowId) {
      return 'Window'
    }
    const windowItem = terminalWindowMap.get(terminalWindowId)
    if (!windowItem) {
      return 'Terminal'
    }
    if (windowItem.kind === 'run') {
      return windowItem.runSession?.title ?? 'Pipeline terminal'
    }
    return windowItem.manualTerminal?.title ?? 'Manual terminal'
  }

  const getWorkbenchPanelDefaultWidth = (panel: WorkbenchPanelKey): number => {
    if (panel === WORKBENCH_PANEL_FLOW) {
      return 860
    }
    if (panel === WORKBENCH_PANEL_DOCK) {
      return 460
    }
    const terminalWindowId = toWorkbenchTerminalWindowId(panel)
    if (!terminalWindowId) {
      return MIN_WORKBENCH_PANEL_WIDTH
    }
    const windowItem = terminalWindowMap.get(terminalWindowId)
    if (!windowItem) {
      return 640
    }
    return windowItem.kind === 'manual' ? 940 : 640
  }

  const unpinTerminalWindow = (windowId: string): void => {
    const panelKey = toTerminalWorkbenchPanelKey(windowId)
    setPinnedTerminalWindowIds((prev) => prev.filter((id) => id !== windowId))
    removePanelFromLayout(panelKey)
  }

  const minimizePinnedTerminalWindow = (windowId: string): void => {
    if (!availableTerminalWindowIds.has(windowId)) {
      return
    }
    unpinTerminalWindow(windowId)
    requestMinimizeTerminalWindow(windowId)
  }

  const togglePinTerminalWindow = (windowId: string): void => {
    if (!availableTerminalWindowIds.has(windowId)) {
      return
    }
    const panelKey = toTerminalWorkbenchPanelKey(windowId)
    if (effectivePinnedTerminalWindowIds.includes(windowId)) {
      unpinTerminalWindow(windowId)
      return
    }

    setPinnedTerminalWindowIds((prev) => [...prev, windowId])
    ensurePanelInLayout(panelKey, getWorkbenchPanelDefaultWidth(panelKey))
  }

  return {
    getWorkbenchPanelTitle,
    getWorkbenchPanelDefaultWidth,
    minimizePinnedTerminalWindow,
    togglePinTerminalWindow,
  }
}
