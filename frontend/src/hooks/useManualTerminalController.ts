import { useCallback, useEffect, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'
import { apiRequest } from '../lib/api'
import { getErrorMessage, toManualTerminal, upsertManualTerminal } from '../lib/mappers'
import type {
  BackendManualTerminal,
  BackendTerminalCompletion,
  ManualTerminal,
} from '../types'

export type TerminalHistoryDirection = 'up' | 'down'

interface TerminalCommandHistory {
  entries: string[]
  pointer: number
  scratch: string
}

interface TerminalCompletionCycle {
  baseCommand: string
  nextIndex: number
  lastAppliedCommand: string
}

interface ManualTerminalSocketContext {
  setManualTerminals: Dispatch<SetStateAction<ManualTerminal[]>>
  manualCommandHistoryRef: MutableRefObject<Record<string, TerminalCommandHistory>>
  storedManualHistoryRef: MutableRefObject<Record<string, string[]>>
  manualCompletionCycleRef: MutableRefObject<Record<string, TerminalCompletionCycle>>
  setCopyTailLineCountsByTerminalId: Dispatch<SetStateAction<Record<string, number>>>
  setCopyTailCopiedByTerminalId: Dispatch<SetStateAction<Record<string, boolean>>>
  copyTailResetTimeoutByTerminalIdRef: MutableRefObject<Record<string, number>>
  pruneAndPersistStoredHistory: (
    historyMap: Record<string, TerminalCommandHistory>,
  ) => void
}

interface UseManualTerminalControllerOptions {
  setBackendError: Dispatch<SetStateAction<string | null>>
}

const MANUAL_HISTORY_STORAGE_KEY = 'operator_helper.manual_terminal_history.v1'

const createEmptyCommandHistory = (): TerminalCommandHistory => ({
  entries: [],
  pointer: -1,
  scratch: '',
})

const readStoredManualHistory = (): Record<string, string[]> => {
  if (typeof window === 'undefined') {
    return {}
  }
  try {
    const raw = window.localStorage.getItem(MANUAL_HISTORY_STORAGE_KEY)
    if (!raw) {
      return {}
    }
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {}
    }

    const result: Record<string, string[]> = {}
    for (const [terminalId, value] of Object.entries(parsed)) {
      if (Array.isArray(value)) {
        const commands = value
          .filter((item): item is string => typeof item === 'string')
          .filter((item) => item.trim().length > 0)
          .slice(-500)
        result[terminalId] = commands
      }
    }
    return result
  } catch {
    return {}
  }
}

const writeStoredManualHistory = (history: Record<string, string[]>): void => {
  if (typeof window === 'undefined') {
    return
  }
  try {
    window.localStorage.setItem(MANUAL_HISTORY_STORAGE_KEY, JSON.stringify(history))
  } catch {
    // Ignore storage errors (quota/private mode).
  }
}

export const useManualTerminalController = ({
  setBackendError,
}: UseManualTerminalControllerOptions) => {
  const [manualTerminals, setManualTerminals] = useState<ManualTerminal[]>([])
  const storedManualHistoryRef = useRef<Record<string, string[]>>(readStoredManualHistory())
  const manualCommandHistoryRef = useRef<Record<string, TerminalCommandHistory>>({})
  const manualCompletionCycleRef = useRef<Record<string, TerminalCompletionCycle>>({})
  const [copyTailLineCountsByTerminalId, setCopyTailLineCountsByTerminalId] = useState<
    Record<string, number>
  >({})
  const [copyTailCopiedByTerminalId, setCopyTailCopiedByTerminalId] = useState<
    Record<string, boolean>
  >({})
  const copyTailResetTimeoutByTerminalIdRef = useRef<Record<string, number>>({})

  const pruneAndPersistStoredHistory = useCallback(
    (historyMap: Record<string, TerminalCommandHistory>): void => {
      const nextStoredHistory: Record<string, string[]> = {}
      for (const [terminalId, history] of Object.entries(historyMap)) {
        if (history.entries.length > 0) {
          nextStoredHistory[terminalId] = history.entries
        }
      }
      storedManualHistoryRef.current = nextStoredHistory
      writeStoredManualHistory(nextStoredHistory)
    },
    [],
  )

  useEffect(
    () => () => {
      for (const timeoutId of Object.values(copyTailResetTimeoutByTerminalIdRef.current)) {
        window.clearTimeout(timeoutId)
      }
      copyTailResetTimeoutByTerminalIdRef.current = {}
    },
    [],
  )

  const updateManualCommand = (terminalId: string, command: string): void => {
    setManualTerminals((prev) =>
      prev.map((terminal) =>
        terminal.id === terminalId ? { ...terminal, draftCommand: command } : terminal,
      ),
    )
    const current = manualCommandHistoryRef.current[terminalId]
    if (current) {
      manualCommandHistoryRef.current = {
        ...manualCommandHistoryRef.current,
        [terminalId]: {
          ...current,
          pointer: -1,
          scratch: '',
        },
      }
    }

    if (terminalId in manualCompletionCycleRef.current) {
      const nextCycles = { ...manualCompletionCycleRef.current }
      delete nextCycles[terminalId]
      manualCompletionCycleRef.current = nextCycles
    }
  }

  const navigateManualCommandHistory = (
    terminalId: string,
    direction: TerminalHistoryDirection,
    currentDraft: string,
  ): void => {
    const currentMap = manualCommandHistoryRef.current
    const current = currentMap[terminalId]
    const history = current ?? createEmptyCommandHistory()
    if (!current) {
      manualCommandHistoryRef.current = {
        ...currentMap,
        [terminalId]: history,
      }
    }
    if (history.entries.length === 0) {
      return
    }

    let nextDraft: string | null = null
    let nextPointer = history.pointer
    let nextScratch = history.scratch
    if (direction === 'up') {
      if (history.pointer === -1) {
        nextScratch = currentDraft
        nextPointer = history.entries.length - 1
      } else if (history.pointer > 0) {
        nextPointer = history.pointer - 1
      }
      nextDraft = history.entries[nextPointer] ?? ''
    } else {
      if (history.pointer === -1) {
        return
      }
      if (history.pointer < history.entries.length - 1) {
        nextPointer = history.pointer + 1
        nextDraft = history.entries[nextPointer] ?? ''
      } else {
        nextPointer = -1
        nextDraft = history.scratch
      }
    }

    manualCommandHistoryRef.current = {
      ...manualCommandHistoryRef.current,
      [terminalId]: {
        entries: history.entries,
        pointer: nextPointer,
        scratch: nextScratch,
      },
    }

    if (nextDraft !== null) {
      setManualTerminals((prev) =>
        prev.map((terminal) =>
          terminal.id === terminalId
            ? { ...terminal, draftCommand: nextDraft ?? terminal.draftCommand }
            : terminal,
        ),
      )
    }
  }

  const updateManualTitle = (terminalId: string, title: string): void => {
    setManualTerminals((prev) =>
      prev.map((terminal) =>
        terminal.id === terminalId ? { ...terminal, titleDraft: title } : terminal,
      ),
    )
  }

  const createManualTerminal = async (): Promise<void> => {
    try {
      const createdTerminal = await apiRequest<BackendManualTerminal>('/api/terminals', {
        method: 'POST',
        body: JSON.stringify({}),
      })
      setManualTerminals((prev) =>
        upsertManualTerminal(prev, toManualTerminal(createdTerminal)),
      )
      setBackendError(null)
    } catch (error) {
      setBackendError(getErrorMessage(error))
    }
  }

  const renameManualTerminal = async (terminalId: string): Promise<void> => {
    const terminal = manualTerminals.find((item) => item.id === terminalId)
    if (!terminal) {
      return
    }

    const title = terminal.titleDraft.trim()
    if (!title || title === terminal.title) {
      return
    }

    try {
      const updatedTerminal = await apiRequest<BackendManualTerminal>(
        `/api/terminals/${terminalId}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ title }),
        },
      )
      setManualTerminals((prev) =>
        upsertManualTerminal(prev, toManualTerminal(updatedTerminal)),
      )
      setBackendError(null)
    } catch (error) {
      setBackendError(getErrorMessage(error))
    }
  }

  const runManualCommand = async (terminalId: string): Promise<void> => {
    const terminal = manualTerminals.find((item) => item.id === terminalId)
    if (!terminal) {
      return
    }

    const command = terminal.draftCommand.trim()
    if (!command) {
      return
    }

    const currentHistory =
      manualCommandHistoryRef.current[terminalId] ?? createEmptyCommandHistory()
    manualCommandHistoryRef.current = {
      ...manualCommandHistoryRef.current,
      [terminalId]: {
        entries: [...currentHistory.entries, command],
        pointer: -1,
        scratch: '',
      },
    }
    storedManualHistoryRef.current = {
      ...storedManualHistoryRef.current,
      [terminalId]: manualCommandHistoryRef.current[terminalId].entries,
    }
    writeStoredManualHistory(storedManualHistoryRef.current)

    setManualTerminals((prev) =>
      prev.map((item) =>
        item.id === terminalId
          ? {
              ...item,
              draftCommand: '',
              status: 'running',
              exitCode: null,
            }
          : item,
      ),
    )
    const nextCycles = { ...manualCompletionCycleRef.current }
    delete nextCycles[terminalId]
    manualCompletionCycleRef.current = nextCycles

    try {
      await apiRequest<BackendManualTerminal>(`/api/terminals/${terminalId}/run`, {
        method: 'POST',
        body: JSON.stringify({ command }),
      })
      setBackendError(null)
    } catch (error) {
      setManualTerminals((prev) =>
        prev.map((item) =>
          item.id === terminalId
            ? {
                ...item,
                draftCommand: command,
              }
            : item,
        ),
      )
      setBackendError(getErrorMessage(error))
    }
  }

  const autocompleteManualCommand = async (terminalId: string): Promise<void> => {
    const terminal = manualTerminals.find((item) => item.id === terminalId)
    if (!terminal) {
      return
    }

    const cycle = manualCompletionCycleRef.current[terminalId]
    const shouldContinueCycle =
      cycle !== undefined && terminal.draftCommand === cycle.lastAppliedCommand
    const baseCommand = shouldContinueCycle ? cycle.baseCommand : terminal.draftCommand
    const cycleIndex = shouldContinueCycle ? cycle.nextIndex : 0

    try {
      const completion = await apiRequest<BackendTerminalCompletion>(
        `/api/terminals/${terminalId}/complete`,
        {
          method: 'POST',
          body: JSON.stringify({
            command: terminal.draftCommand,
            base_command: baseCommand,
            cycle_index: cycleIndex,
          }),
        },
      )
      if (completion.matches.length === 0) {
        const nextCycles = { ...manualCompletionCycleRef.current }
        delete nextCycles[terminalId]
        manualCompletionCycleRef.current = nextCycles
        return
      }

      const nextIndex = (cycleIndex + 1) % completion.matches.length
      manualCompletionCycleRef.current = {
        ...manualCompletionCycleRef.current,
        [terminalId]: {
          baseCommand: completion.base_command,
          nextIndex,
          lastAppliedCommand: completion.completed_command,
        },
      }

      if (completion.completed_command === terminal.draftCommand) {
        return
      }
      setManualTerminals((prev) =>
        prev.map((item) =>
          item.id === terminalId
            ? {
                ...item,
                draftCommand: completion.completed_command,
              }
            : item,
        ),
      )
      setBackendError(null)
    } catch (error) {
      const nextCycles = { ...manualCompletionCycleRef.current }
      delete nextCycles[terminalId]
      manualCompletionCycleRef.current = nextCycles
      setBackendError(getErrorMessage(error))
    }
  }

  const stopManualTerminal = async (terminalId: string): Promise<void> => {
    try {
      const updatedTerminal = await apiRequest<BackendManualTerminal>(
        `/api/terminals/${terminalId}/stop`,
        {
          method: 'POST',
        },
      )
      setManualTerminals((prev) =>
        upsertManualTerminal(prev, toManualTerminal(updatedTerminal)),
      )
      setBackendError(null)
    } catch (error) {
      setBackendError(getErrorMessage(error))
    }
  }

  const clearManualTerminal = async (terminalId: string): Promise<void> => {
    try {
      const updatedTerminal = await apiRequest<BackendManualTerminal>(
        `/api/terminals/${terminalId}/clear`,
        {
          method: 'POST',
        },
      )
      setManualTerminals((prev) =>
        upsertManualTerminal(prev, toManualTerminal(updatedTerminal)),
      )
      setBackendError(null)
    } catch (error) {
      setBackendError(getErrorMessage(error))
    }
  }

  const removeManualTerminal = async (terminalId: string): Promise<void> => {
    try {
      await apiRequest<{ deleted: boolean; terminal_id: string }>(
        `/api/terminals/${terminalId}`,
        {
          method: 'DELETE',
        },
      )
      setManualTerminals((prev) =>
        prev.filter((terminal) => terminal.id !== terminalId),
      )
      const nextHistory = { ...manualCommandHistoryRef.current }
      delete nextHistory[terminalId]
      manualCommandHistoryRef.current = nextHistory
      const nextCycles = { ...manualCompletionCycleRef.current }
      delete nextCycles[terminalId]
      manualCompletionCycleRef.current = nextCycles
      setCopyTailLineCountsByTerminalId((prev) => {
        const next = { ...prev }
        delete next[terminalId]
        return next
      })
      setCopyTailCopiedByTerminalId((prev) => {
        const next = { ...prev }
        delete next[terminalId]
        return next
      })
      const copyResetTimeout = copyTailResetTimeoutByTerminalIdRef.current[terminalId]
      if (copyResetTimeout !== undefined) {
        window.clearTimeout(copyResetTimeout)
        const nextCopyTimeoutMap = { ...copyTailResetTimeoutByTerminalIdRef.current }
        delete nextCopyTimeoutMap[terminalId]
        copyTailResetTimeoutByTerminalIdRef.current = nextCopyTimeoutMap
      }
      pruneAndPersistStoredHistory(nextHistory)
      setBackendError(null)
    } catch (error) {
      setBackendError(getErrorMessage(error))
    }
  }

  const getCopyTailLineCount = (terminalId: string): number => {
    const raw = copyTailLineCountsByTerminalId[terminalId]
    if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 1) {
      return 20
    }
    return Math.max(1, Math.min(5000, Math.round(raw)))
  }

  const updateCopyTailLineCount = (terminalId: string, rawValue: string): void => {
    const parsed = Number.parseInt(rawValue, 10)
    const normalized = Number.isFinite(parsed)
      ? Math.max(1, Math.min(5000, parsed))
      : 20
    setCopyTailLineCountsByTerminalId((prev) => ({
      ...prev,
      [terminalId]: normalized,
    }))
  }

  const copyManualTerminalTail = async (terminalId: string): Promise<void> => {
    const terminal = manualTerminals.find((item) => item.id === terminalId)
    if (!terminal) {
      return
    }
    const count = getCopyTailLineCount(terminalId)
    const text = terminal.lines
      .slice(-count)
      .map((line) => line.text)
      .join('\n')

    try {
      await navigator.clipboard.writeText(text)
      setCopyTailCopiedByTerminalId((prev) => ({
        ...prev,
        [terminalId]: true,
      }))
      const previousTimeout = copyTailResetTimeoutByTerminalIdRef.current[terminalId]
      if (previousTimeout !== undefined) {
        window.clearTimeout(previousTimeout)
      }
      copyTailResetTimeoutByTerminalIdRef.current[terminalId] = window.setTimeout(() => {
        setCopyTailCopiedByTerminalId((prev) => ({
          ...prev,
          [terminalId]: false,
        }))
      }, 1400)
      setBackendError(null)
    } catch {
      setBackendError('Failed to copy terminal output to clipboard')
    }
  }

  const getSocketEventContext = useCallback(
    (): ManualTerminalSocketContext => ({
      setManualTerminals,
      manualCommandHistoryRef,
      storedManualHistoryRef,
      manualCompletionCycleRef,
      setCopyTailLineCountsByTerminalId,
      setCopyTailCopiedByTerminalId,
      copyTailResetTimeoutByTerminalIdRef,
      pruneAndPersistStoredHistory,
    }),
    [pruneAndPersistStoredHistory],
  )

  return {
    manualTerminals,
    setManualTerminals,
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
  }
}
