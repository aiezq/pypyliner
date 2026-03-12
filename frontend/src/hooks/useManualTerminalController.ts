import { useCallback, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'
import { apiRequest } from '../lib/api'
import type { BackendLine, BackendTerminal, BackendTerminalCommand } from '../lib/schemas'
import { getErrorMessage } from '../lib/mappers'
import type { ManualTerminal } from '../types'
import {
  buildCurrentCommandLabel,
  isBackendSessionId,
  toManualTerminal,
  toQueueCommand,
  toTerminalLine,
  type TerminalHistoryDirection,
} from './manualTerminalMappers'
import {
  useManualTerminalHistory,
  type ManualCommandHistoryState,
  type ManualCompletionCycleState,
} from './useManualTerminalHistory'

export type { TerminalHistoryDirection } from './manualTerminalMappers'

interface ManualTerminalSocketContext {
  setManualTerminals: Dispatch<SetStateAction<ManualTerminal[]>>
  manualCommandHistoryRef: MutableRefObject<Record<string, ManualCommandHistoryState>>
  storedManualHistoryRef: MutableRefObject<Record<string, string[]>>
  manualCompletionCycleRef: MutableRefObject<Record<string, ManualCompletionCycleState>>
  setCopyTailLineCountsByTerminalId: Dispatch<SetStateAction<Record<string, number>>>
  setCopyTailCopiedByTerminalId: Dispatch<SetStateAction<Record<string, boolean>>>
  copyTailResetTimeoutByTerminalIdRef: MutableRefObject<Record<string, number>>
  pruneAndPersistStoredHistory: (_historyMap: Record<string, ManualCommandHistoryState>) => void
  applyTerminalSnapshot: (terminals: BackendTerminal[]) => void
  upsertTerminalSession: (terminal: BackendTerminal, options?: { draftCommand?: string }) => void
  removeTerminalSession: (terminalSessionId: string) => void
  updateTerminalStatus: (
    update: {
      terminal_session_id: string
      status: ManualTerminal['status']
      current_command_index: number | null
      current_command_id: string | null
      exit_code: number | null
      started_at: string | null
      finished_at: string | null
      stdin_enabled: boolean
    },
  ) => void
  appendTerminalLine: (terminalSessionId: string, line: BackendLine) => void
  replaceTerminalQueue: (
    terminalSessionId: string,
    queue: BackendTerminalCommand[],
    currentCommandIndex: number | null,
  ) => void
  updateTerminalCommand: (
    terminalSessionId: string,
    command: BackendTerminalCommand,
    currentCommandIndex: number | null,
  ) => void
}

interface UseManualTerminalControllerOptions {
  setBackendError: Dispatch<SetStateAction<string | null>>
}

export const useManualTerminalController = ({
  setBackendError,
}: UseManualTerminalControllerOptions) => {
  const [manualTerminals, setManualTerminals] = useState<ManualTerminal[]>([])
  const [copyTailLineCountsByTerminalId, setCopyTailLineCountsByTerminalId] = useState<
    Record<string, number>
  >({})
  const [copyTailCopiedByTerminalId, setCopyTailCopiedByTerminalId] = useState<
    Record<string, boolean>
  >({})
  const copyTailResetTimeoutByTerminalIdRef = useRef<Record<string, number>>({})
  const {
    manualCommandHistoryRef,
    storedManualHistoryRef,
    manualCompletionCycleRef,
    pruneAndPersistStoredHistory,
    ensureHistoryState,
    persistHistoryEntries,
    resetCommandNavigationState,
  } = useManualTerminalHistory()
  const titleOverridesByTerminalIdRef = useRef<Record<string, string>>({})
  const dismissedBackendTerminalIdsRef = useRef<Set<string>>(new Set())

  const applyTerminalSnapshot = useCallback(
    (terminals: BackendTerminal[]): void => {
      setManualTerminals((prev) => {
        const existingById = new Map(prev.map((terminal) => [terminal.id, terminal]))
        return terminals
          .filter((terminal) => !dismissedBackendTerminalIdsRef.current.has(terminal.id))
          .map((terminal) =>
            toManualTerminal(
              terminal,
              titleOverridesByTerminalIdRef.current,
              existingById.get(terminal.id),
            ),
          )
      })
    },
    [],
  )

  const upsertTerminalSession = useCallback(
    (terminal: BackendTerminal, options?: { draftCommand?: string }): void => {
      if (dismissedBackendTerminalIdsRef.current.has(terminal.id)) {
        return
      }

      setManualTerminals((prev) => {
        const existingIndex = prev.findIndex((item) => item.id === terminal.id)
        const nextTerminal = toManualTerminal(
          terminal,
          titleOverridesByTerminalIdRef.current,
          existingIndex >= 0 ? prev[existingIndex] : undefined,
          options,
        )
        if (existingIndex < 0) {
          return [nextTerminal, ...prev]
        }
        return prev.map((item, index) => (index === existingIndex ? nextTerminal : item))
      })
    },
    [],
  )

  const updateTerminalStatus = useCallback(
    ({
      terminal_session_id,
      status,
      current_command_index,
      current_command_id,
      exit_code,
      started_at,
      finished_at,
      stdin_enabled,
    }: {
      terminal_session_id: string
      status: ManualTerminal['status']
      current_command_index: number | null
      current_command_id: string | null
      exit_code: number | null
      started_at: string | null
      finished_at: string | null
      stdin_enabled: boolean
    }): void => {
      setManualTerminals((prev) =>
        prev.map((terminal) => {
          if (terminal.id !== terminal_session_id) {
            return terminal
          }
          const queue = terminal.queue ?? []
          return {
            ...terminal,
            status,
            exitCode: exit_code,
            startedAt: started_at,
            finishedAt: finished_at,
            currentCommandIndex: current_command_index,
            currentCommandId: current_command_id,
            currentCommandLabel: buildCurrentCommandLabel(queue, current_command_id, current_command_index),
            stdinEnabled: stdin_enabled,
          }
        }),
      )
    },
    [],
  )

  const appendTerminalLine = useCallback((terminalSessionId: string, line: BackendLine): void => {
    setManualTerminals((prev) =>
      prev.map((terminal) =>
        terminal.id === terminalSessionId
          ? {
              ...terminal,
              lines: [...terminal.lines, toTerminalLine(line)],
            }
          : terminal,
      ),
    )
  }, [])

  const removeTerminalSession = useCallback((terminalSessionId: string): void => {
    delete manualCompletionCycleRef.current[terminalSessionId]
    delete manualCommandHistoryRef.current[terminalSessionId]
    const timeoutId = copyTailResetTimeoutByTerminalIdRef.current[terminalSessionId]
    if (timeoutId !== undefined) {
      window.clearTimeout(timeoutId)
      delete copyTailResetTimeoutByTerminalIdRef.current[terminalSessionId]
    }
    setManualTerminals((prev) => prev.filter((terminal) => terminal.id !== terminalSessionId))
    setCopyTailCopiedByTerminalId((prev) => {
      if (!(terminalSessionId in prev)) {
        return prev
      }
      const { [terminalSessionId]: _removed, ...rest } = prev
      return rest
    })
    setCopyTailLineCountsByTerminalId((prev) => {
      if (!(terminalSessionId in prev)) {
        return prev
      }
      const { [terminalSessionId]: _removed, ...rest } = prev
      return rest
    })
  }, [])

  const replaceTerminalQueue = useCallback(
    (
      terminalSessionId: string,
      queue: BackendTerminalCommand[],
      currentCommandIndex: number | null,
    ): void => {
      setManualTerminals((prev) =>
        prev.map((terminal) => {
          if (terminal.id !== terminalSessionId) {
            return terminal
          }
          const nextQueue = queue.map(toQueueCommand)
          return {
            ...terminal,
            queue: nextQueue,
            currentCommandIndex,
            currentCommandLabel: buildCurrentCommandLabel(
              nextQueue,
              terminal.currentCommandId,
              currentCommandIndex,
            ),
          }
        }),
      )
    },
    [],
  )

  const updateTerminalCommand = useCallback(
    (
      terminalSessionId: string,
      command: BackendTerminalCommand,
      currentCommandIndex: number | null,
    ): void => {
      setManualTerminals((prev) =>
        prev.map((terminal) => {
          if (terminal.id !== terminalSessionId) {
            return terminal
          }
          const prevQueue = terminal.queue ?? []
          const nextCommand = toQueueCommand(command)
          const existingIndex = prevQueue.findIndex((item) => item.id === nextCommand.id)
          const nextQueue =
            existingIndex >= 0
              ? prevQueue.map((item, index) => (index === existingIndex ? nextCommand : item))
              : [...prevQueue, nextCommand]

          return {
            ...terminal,
            queue: nextQueue,
            currentCommandIndex,
            currentCommandId: command.status === 'running' ? command.id : terminal.currentCommandId,
            currentCommandLabel: buildCurrentCommandLabel(
              nextQueue,
              command.status === 'running' ? command.id : terminal.currentCommandId,
              currentCommandIndex,
            ),
          }
        }),
      )
    },
    [],
  )

  const createManualTerminal = async (): Promise<void> => {
    try {
      const response = await apiRequest<BackendTerminal>('/api/terminals', {
        method: 'POST',
        body: JSON.stringify({
          title: `Terminal #${manualTerminals.length + 1}`,
          terminal_type: 'local',
        }),
      })
      upsertTerminalSession(response)
      setBackendError(null)
    } catch (error) {
      setBackendError(getErrorMessage(error))
    }
  }

  const renameManualTerminal = async (terminalId: string): Promise<void> => {
    setManualTerminals((prev) =>
      prev.map((terminal) => {
        if (terminal.id !== terminalId) {
          return terminal
        }

        const title = terminal.titleDraft.trim()
        if (!title) {
          return terminal
        }

        titleOverridesByTerminalIdRef.current[terminalId] = title

        return {
          ...terminal,
          title,
          titleDraft: title,
        }
      }),
    )
    setBackendError(null)
  }

  const updateManualTitle = (terminalId: string, title: string): void => {
    setManualTerminals((prev) =>
      prev.map((terminal) =>
        terminal.id === terminalId ? { ...terminal, titleDraft: title } : terminal,
      ),
    )
  }

  const updateManualCommand = (terminalId: string, command: string): void => {
    resetCommandNavigationState(terminalId)
    setManualTerminals((prev) =>
      prev.map((terminal) =>
        terminal.id === terminalId ? { ...terminal, draftCommand: command } : terminal,
      ),
    )
  }

  const navigateManualCommandHistory = (
    terminalId: string,
    direction: TerminalHistoryDirection,
    currentDraft: string,
  ): void => {
    const state = ensureHistoryState(terminalId)
    if (state.entries.length === 0) {
      return
    }

    let nextDraft = currentDraft
    if (direction === 'up') {
      if (state.cursor === null) {
        state.draft = currentDraft
        state.cursor = state.entries.length - 1
      } else {
        state.cursor = Math.max(0, state.cursor - 1)
      }
      nextDraft = state.entries[state.cursor] ?? currentDraft
    } else {
      if (state.cursor === null) {
        return
      }

      if (state.cursor >= state.entries.length - 1) {
        state.cursor = null
        nextDraft = state.draft
      } else {
        state.cursor += 1
        nextDraft = state.entries[state.cursor] ?? state.draft
      }
    }

    delete manualCompletionCycleRef.current[terminalId]
    setManualTerminals((prev) =>
      prev.map((terminal) =>
        terminal.id === terminalId ? { ...terminal, draftCommand: nextDraft } : terminal,
      ),
    )
  }

  const runManualCommand = async (terminalId: string): Promise<void> => {
    const terminal = manualTerminals.find((item) => item.id === terminalId)
    const command = terminal?.draftCommand.trim() ?? ''
    if (!command) {
      setBackendError(null)
      return
    }

    try {
      if (isBackendSessionId(terminalId)) {
        setManualTerminals((prev) =>
          prev.map((item) =>
            item.id === terminalId
              ? {
                  ...item,
                  draftCommand: '',
                }
              : item,
          ),
        )
        const response = await apiRequest<BackendTerminal>(
          `/api/terminals/${terminalId}/commands`,
          {
            method: 'POST',
            body: JSON.stringify({
              command,
            }),
          },
        )
        const historyState = ensureHistoryState(terminalId)
        const nextEntries =
          historyState.entries[historyState.entries.length - 1] === command
            ? historyState.entries
            : [...historyState.entries, command]
        persistHistoryEntries(terminalId, nextEntries)
        resetCommandNavigationState(terminalId)
        upsertTerminalSession(response, { draftCommand: '' })
      }
      setBackendError(null)
    } catch (error) {
      setManualTerminals((prev) =>
        prev.map((item) =>
          item.id === terminalId && !item.draftCommand
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
    const draft = terminal?.draftCommand ?? ''
    const prefix = draft.trim()
    const historyState = ensureHistoryState(terminalId)
    const matches = [...historyState.entries]
      .reverse()
      .filter((entry, index, entries) => {
        if (prefix.length > 0 && !entry.startsWith(prefix)) {
          return false
        }
        return entries.indexOf(entry) === index
      })

    if (matches.length === 0) {
      setBackendError(null)
      return
    }

    const cycle = manualCompletionCycleRef.current[terminalId]
    const nextMatchIndex =
      cycle && cycle.prefix === prefix ? (cycle.matchIndex + 1) % matches.length : 0
    manualCompletionCycleRef.current[terminalId] = {
      prefix,
      matchIndex: nextMatchIndex,
    }
    const nextCommand = matches[nextMatchIndex] ?? draft
    setManualTerminals((prev) =>
      prev.map((item) =>
        item.id === terminalId
          ? {
              ...item,
              draftCommand: nextCommand,
            }
          : item,
      ),
    )
    setBackendError(null)
  }

  const stopManualTerminal = async (terminalId: string): Promise<void> => {
    try {
      if (isBackendSessionId(terminalId)) {
        const response = await apiRequest<BackendTerminal>(`/api/terminals/${terminalId}/stop`, {
          method: 'POST',
        })
        upsertTerminalSession(response)
      } else {
        setManualTerminals((prev) =>
          prev.map((terminal) =>
            terminal.id === terminalId
              ? {
                  ...terminal,
                  status: 'stopped',
                }
              : terminal,
          ),
        )
      }
      setBackendError(null)
    } catch (error) {
      setBackendError(getErrorMessage(error))
    }
  }

  const clearManualTerminal = async (terminalId: string): Promise<void> => {
    try {
      if (isBackendSessionId(terminalId)) {
        const response = await apiRequest<BackendTerminal>(`/api/terminals/${terminalId}/clear`, {
          method: 'POST',
        })
        upsertTerminalSession(response)
      } else {
        setManualTerminals((prev) =>
          prev.map((terminal) =>
            terminal.id === terminalId
              ? {
                  ...terminal,
                  lines: [],
                  exitCode: null,
                  status: 'idle',
                }
              : terminal,
          ),
        )
      }
      setBackendError(null)
    } catch (error) {
      setBackendError(getErrorMessage(error))
    }
  }

  const removeManualTerminal = async (terminalId: string): Promise<void> => {
    const terminal = manualTerminals.find((item) => item.id === terminalId)
    if (!terminal) {
      return
    }

    if (isBackendSessionId(terminalId)) {
      dismissedBackendTerminalIdsRef.current.add(terminalId)
      setManualTerminals((prev) => prev.filter((item) => item.id !== terminalId))

      try {
        await apiRequest<void>(`/api/terminals/${terminalId}`, {
          method: 'DELETE',
        })
        setBackendError(null)
      } catch (error) {
        dismissedBackendTerminalIdsRef.current.delete(terminalId)
        setManualTerminals((prev) => [terminal, ...prev.filter((item) => item.id !== terminalId)])
        setBackendError(getErrorMessage(error))
      }
      return
    }

    setManualTerminals((prev) => prev.filter((terminal) => terminal.id !== terminalId))
    setBackendError(null)
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

  const isCopyTailRecentlyCopied = (terminalId: string): boolean =>
    copyTailCopiedByTerminalId[terminalId] === true

  const copyManualTerminalTail = async (terminalId: string): Promise<void> => {
    const terminal = manualTerminals.find((item) => item.id === terminalId)
    if (!terminal) {
      return
    }

    try {
      await navigator.clipboard.writeText(
        terminal.lines
          .slice(-getCopyTailLineCount(terminalId))
          .map((line) => line.text)
          .join('\n'),
      )
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
      applyTerminalSnapshot,
      upsertTerminalSession,
      removeTerminalSession: (terminalSessionId: string) => {
        dismissedBackendTerminalIdsRef.current.delete(terminalSessionId)
        removeTerminalSession(terminalSessionId)
      },
      updateTerminalStatus,
      appendTerminalLine,
      replaceTerminalQueue,
      updateTerminalCommand,
    }),
    [
      appendTerminalLine,
      applyTerminalSnapshot,
      pruneAndPersistStoredHistory,
      replaceTerminalQueue,
      removeTerminalSession,
      updateTerminalCommand,
      updateTerminalStatus,
      upsertTerminalSession,
    ],
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
    isCopyTailRecentlyCopied,
    updateCopyTailLineCount,
    copyManualTerminalTail,
    copyTailCopiedByTerminalId,
    getSocketEventContext,
  }
}
