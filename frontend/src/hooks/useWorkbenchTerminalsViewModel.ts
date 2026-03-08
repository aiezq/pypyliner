import {
  useMemo,
  type Dispatch,
  type SetStateAction,
} from 'react'
import type { ManualTerminal } from '../types'

export interface WorkbenchManualWindowItem {
  windowId: string
  kind: 'manual'
  manualTerminal: ManualTerminal
}

export type WorkbenchTerminalWindowItem = WorkbenchManualWindowItem

interface UseWorkbenchTerminalsViewModelOptions {
  manualTerminals: ManualTerminal[]
  requestedMinimizedTerminalWindowIds: string[]
  setRequestedMinimizedTerminalWindowIds: Dispatch<SetStateAction<string[]>>
  updateManualTitle: (terminalId: string, title: string) => void
  renameManualTerminal: (terminalId: string) => Promise<void>
}

export const useWorkbenchTerminalsViewModel = ({
  manualTerminals,
  requestedMinimizedTerminalWindowIds,
  setRequestedMinimizedTerminalWindowIds,
}: UseWorkbenchTerminalsViewModelOptions) => {
  const terminalWindowItems = useMemo(
    (): WorkbenchTerminalWindowItem[] => [
      ...manualTerminals.map((terminal): WorkbenchTerminalWindowItem => ({
        windowId: `manual:${terminal.id}`,
        kind: 'manual',
        manualTerminal: terminal,
      })),
    ],
    [manualTerminals],
  )

  const availableTerminalWindowIds = useMemo(
    () => new Set(terminalWindowItems.map((item) => item.windowId)),
    [terminalWindowItems],
  )

  const effectiveRequestedMinimizedTerminalWindowIds = useMemo(
    () =>
      requestedMinimizedTerminalWindowIds.filter((windowId) =>
        availableTerminalWindowIds.has(windowId),
      ),
    [availableTerminalWindowIds, requestedMinimizedTerminalWindowIds],
  )

  const terminalInstancesCount = manualTerminals.length

  const consumeRequestedMinimizeTerminalWindow = (windowId: string): void => {
    setRequestedMinimizedTerminalWindowIds((prev) =>
      prev.filter((id) => id !== windowId),
    )
  }

  return {
    terminalWindowItems,
    availableTerminalWindowIds,
    effectiveRequestedMinimizedTerminalWindowIds,
    terminalInstancesCount,
    consumeRequestedMinimizeTerminalWindow,
  }
}
