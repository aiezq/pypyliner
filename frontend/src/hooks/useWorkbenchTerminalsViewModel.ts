import { useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import { isPipelineOpenTerminalCommand } from '../lib/mappers'
import { toTerminalWorkbenchPanelKey } from './useWorkbenchLayout'
import type { ManualTerminal, RunState } from '../types'

export interface WorkbenchRunWindowItem {
  windowId: string
  kind: 'run'
  runSession: RunState['sessions'][number]
}

export interface WorkbenchManualWindowItem {
  windowId: string
  kind: 'manual'
  manualTerminal: ManualTerminal
}

export type WorkbenchTerminalWindowItem =
  | WorkbenchRunWindowItem
  | WorkbenchManualWindowItem

interface UseWorkbenchTerminalsViewModelOptions {
  run: RunState | null
  manualTerminals: ManualTerminal[]
  pinnedTerminalWindowIds: string[]
  requestedMinimizedTerminalWindowIds: string[]
  setRequestedMinimizedTerminalWindowIds: Dispatch<SetStateAction<string[]>>
  updateManualTitle: (terminalId: string, title: string) => void
  renameManualTerminal: (terminalId: string) => Promise<void>
}

export const useWorkbenchTerminalsViewModel = ({
  run,
  manualTerminals,
  pinnedTerminalWindowIds,
  requestedMinimizedTerminalWindowIds,
  setRequestedMinimizedTerminalWindowIds,
  updateManualTitle,
  renameManualTerminal,
}: UseWorkbenchTerminalsViewModelOptions) => {
  const [editingPinnedTerminalTitleId, setEditingPinnedTerminalTitleId] = useState<
    string | null
  >(null)

  const visibleRunSessions = useMemo(
    () =>
      run?.sessions.filter(
        (session) => !isPipelineOpenTerminalCommand(session.command),
      ) ?? [],
    [run],
  )

  const terminalWindowItems = useMemo(
    (): WorkbenchTerminalWindowItem[] => [
      ...visibleRunSessions.map((session): WorkbenchTerminalWindowItem => ({
        windowId: `run:${session.id}`,
        kind: 'run',
        runSession: session,
      })),
      ...manualTerminals.map((terminal): WorkbenchTerminalWindowItem => ({
        windowId: `manual:${terminal.id}`,
        kind: 'manual',
        manualTerminal: terminal,
      })),
    ],
    [manualTerminals, visibleRunSessions],
  )

  const terminalWindowMap = useMemo(() => {
    const map = new Map<string, WorkbenchTerminalWindowItem>()
    for (const item of terminalWindowItems) {
      map.set(item.windowId, item)
    }
    return map
  }, [terminalWindowItems])

  const availableTerminalWindowIds = useMemo(
    () => new Set(terminalWindowItems.map((item) => item.windowId)),
    [terminalWindowItems],
  )

  const effectivePinnedTerminalWindowIds = useMemo(
    () =>
      pinnedTerminalWindowIds.filter((windowId) =>
        availableTerminalWindowIds.has(windowId),
      ),
    [availableTerminalWindowIds, pinnedTerminalWindowIds],
  )

  const effectiveRequestedMinimizedTerminalWindowIds = useMemo(
    () =>
      requestedMinimizedTerminalWindowIds.filter((windowId) =>
        availableTerminalWindowIds.has(windowId),
      ),
    [availableTerminalWindowIds, requestedMinimizedTerminalWindowIds],
  )

  const pinnedTerminalPanelKeys = effectivePinnedTerminalWindowIds.map((windowId) =>
    toTerminalWorkbenchPanelKey(windowId),
  )

  const terminalInstancesCount = visibleRunSessions.length + manualTerminals.length

  const requestMinimizeTerminalWindow = (windowId: string): void => {
    setRequestedMinimizedTerminalWindowIds((prev) =>
      prev.includes(windowId) ? prev : [...prev, windowId],
    )
  }

  const consumeRequestedMinimizeTerminalWindow = (windowId: string): void => {
    setRequestedMinimizedTerminalWindowIds((prev) =>
      prev.filter((id) => id !== windowId),
    )
  }

  const startPinnedTerminalTitleEdit = (terminal: ManualTerminal): void => {
    updateManualTitle(terminal.id, terminal.titleDraft || terminal.title)
    setEditingPinnedTerminalTitleId(terminal.id)
  }

  const cancelPinnedTerminalTitleEdit = (terminal: ManualTerminal): void => {
    updateManualTitle(terminal.id, terminal.title)
    setEditingPinnedTerminalTitleId((prev) => (prev === terminal.id ? null : prev))
  }

  const savePinnedTerminalTitleEdit = async (
    terminal: ManualTerminal,
  ): Promise<void> => {
    await renameManualTerminal(terminal.id)
    setEditingPinnedTerminalTitleId((prev) => (prev === terminal.id ? null : prev))
  }

  return {
    visibleRunSessions,
    terminalWindowItems,
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
  }
}
