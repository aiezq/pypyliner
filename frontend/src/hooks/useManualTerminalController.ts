import { useCallback, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'
import { apiRequest } from '../lib/api'
import type { BackendLine, BackendTerminal, BackendTerminalCommand } from '../lib/schemas'
import { getErrorMessage } from '../lib/mappers'
import type { ManualTerminal, TerminalLine, TerminalQueueCommand } from '../types'

export type TerminalHistoryDirection = 'up' | 'down'

const MANUAL_TERMINAL_HISTORY_STORAGE_KEY = 'operator_helper.manual_terminal_history.v1'
const MAX_MANUAL_HISTORY_ENTRIES = 200

interface ManualCommandHistoryState {
  entries: string[]
  cursor: number | null
  draft: string
}

interface ManualCompletionCycleState {
  prefix: string
  matchIndex: number
}

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

const createPlaceholderTerminal = (index: number): ManualTerminal => ({
  id: `terminal_ui_${crypto.randomUUID()}`,
  title: `Terminal #${index}`,
  titleDraft: `Terminal #${index}`,
  terminalType: 'local',
  promptUser: 'ui',
  promptCwd: '~',
  isSequence: false,
  status: 'idle',
  exitCode: null,
  draftCommand: '',
  sshConnectionName: null,
  sshHost: null,
  sshUsername: null,
  lines: [],
  isBackendSession: false,
  terminalNodeId: null,
  sequenceId: null,
  createdAt: null,
  startedAt: null,
  finishedAt: null,
  currentCommandIndex: null,
  currentCommandId: null,
  currentCommandLabel: null,
  queue: [],
  stdinEnabled: false,
})

const toTerminalLine = (line: BackendLine): TerminalLine => ({
  id: line.id,
  stream: line.stream,
  text: line.text,
  createdAt: line.created_at,
})

const toQueueCommand = (command: BackendTerminalCommand): TerminalQueueCommand => ({
  id: command.id,
  nodeId: command.node_id,
  label: command.label,
  originalCommand: command.original_command,
  resolvedCommand: command.resolved_command,
  status: command.status,
  startedAt: command.started_at,
  finishedAt: command.finished_at,
  exitCode: command.exit_code,
})

const buildCurrentCommandLabel = (
  queue: TerminalQueueCommand[],
  currentCommandId: string | null | undefined,
  currentCommandIndex: number | null | undefined,
): string | null => {
  if (currentCommandId) {
    return queue.find((item) => item.id === currentCommandId)?.label ?? null
  }
  if (typeof currentCommandIndex === 'number' && currentCommandIndex >= 0 && currentCommandIndex < queue.length) {
    return queue[currentCommandIndex]?.label ?? null
  }
  const running = queue.find((item) => item.status === 'running')
  return running?.label ?? null
}

const isBackendSessionId = (terminalId: string): boolean => terminalId.startsWith('term_')

const loadStoredHistory = (): Record<string, string[]> => {
  if (typeof window === 'undefined') {
    return {}
  }

  try {
    const raw = window.localStorage.getItem(MANUAL_TERMINAL_HISTORY_STORAGE_KEY)
    if (!raw) {
      return {}
    }
    const parsed = JSON.parse(raw) as Record<string, unknown>
    return Object.fromEntries(
      Object.entries(parsed).flatMap(([terminalId, entries]) => {
        if (!Array.isArray(entries)) {
          return []
        }
        return [
          [
            terminalId,
            entries.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0),
          ],
        ]
      }),
    )
  } catch {
    return {}
  }
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
  const manualCommandHistoryRef = useRef<Record<string, ManualCommandHistoryState>>({})
  const storedManualHistoryRef = useRef<Record<string, string[]>>(loadStoredHistory())
  const manualCompletionCycleRef = useRef<Record<string, ManualCompletionCycleState>>({})
  const titleOverridesByTerminalIdRef = useRef<Record<string, string>>({})
  const dismissedBackendTerminalIdsRef = useRef<Set<string>>(new Set())

  const pruneAndPersistStoredHistory = useCallback(
    (historyMap: Record<string, ManualCommandHistoryState>): void => {
      const nextStoredHistory = Object.fromEntries(
        Object.entries(historyMap)
          .map(([terminalId, state]) => [
            terminalId,
            state.entries
              .map((entry) => entry.trim())
              .filter((entry) => entry.length > 0)
              .slice(-MAX_MANUAL_HISTORY_ENTRIES),
          ])
          .filter(([, entries]) => entries.length > 0),
      )

      storedManualHistoryRef.current = nextStoredHistory

      if (typeof window === 'undefined') {
        return
      }

      try {
        window.localStorage.setItem(
          MANUAL_TERMINAL_HISTORY_STORAGE_KEY,
          JSON.stringify(nextStoredHistory),
        )
      } catch {
        // Ignore storage write failures and keep in-memory history usable.
      }
    },
    [],
  )

  const ensureHistoryState = useCallback((terminalId: string): ManualCommandHistoryState => {
    const existing = manualCommandHistoryRef.current[terminalId]
    if (existing) {
      return existing
    }

    const nextState: ManualCommandHistoryState = {
      entries: [...(storedManualHistoryRef.current[terminalId] ?? [])],
      cursor: null,
      draft: '',
    }
    manualCommandHistoryRef.current[terminalId] = nextState
    return nextState
  }, [])

  const persistHistoryEntries = useCallback(
    (terminalId: string, entries: string[]): void => {
      const state = ensureHistoryState(terminalId)
      state.entries = entries.slice(-MAX_MANUAL_HISTORY_ENTRIES)
      pruneAndPersistStoredHistory(manualCommandHistoryRef.current)
    },
    [ensureHistoryState, pruneAndPersistStoredHistory],
  )

  const resetCommandNavigationState = useCallback((terminalId: string): void => {
    const state = ensureHistoryState(terminalId)
    state.cursor = null
    state.draft = ''
    delete manualCompletionCycleRef.current[terminalId]
  }, [ensureHistoryState])

  const toManualTerminal = useCallback(
    (
      terminal: BackendTerminal,
      existing?: ManualTerminal,
      options?: { draftCommand?: string },
    ): ManualTerminal => {
      const queue = terminal.queue.map(toQueueCommand)
      const title = titleOverridesByTerminalIdRef.current[terminal.id] ?? terminal.title
      const titleDraft =
        existing && existing.titleDraft !== existing.title ? existing.titleDraft : title

      return {
        id: terminal.id,
        title,
        titleDraft,
        terminalType: terminal.terminal_type,
        promptUser:
          terminal.terminal_type === 'ssh'
            ? terminal.ssh_username ?? 'ssh'
            : terminal.sequence_id
              ? 'sequence'
              : 'local',
        promptCwd:
          terminal.terminal_type === 'ssh'
            ? terminal.ssh_host ?? '~'
            : terminal.sequence_id
              ? 'queue'
              : '~',
        isSequence: terminal.sequence_id !== null,
        status: terminal.status,
        exitCode: terminal.exit_code,
        draftCommand: options?.draftCommand ?? existing?.draftCommand ?? '',
        sshConnectionName: terminal.ssh_connection_name,
        sshHost: terminal.ssh_host,
        sshUsername: terminal.ssh_username,
        lines: terminal.lines.map(toTerminalLine),
        isBackendSession: true,
        terminalNodeId: terminal.terminal_node_id,
        sequenceId: terminal.sequence_id,
        createdAt: terminal.created_at,
        startedAt: terminal.started_at,
        finishedAt: terminal.finished_at,
        currentCommandIndex: terminal.current_command_index,
        currentCommandId: terminal.current_command_id,
        currentCommandLabel: buildCurrentCommandLabel(
          queue,
          terminal.current_command_id,
          terminal.current_command_index,
        ),
        queue,
        stdinEnabled: terminal.stdin_enabled,
      }
    },
    [],
  )

  const applyTerminalSnapshot = useCallback(
    (terminals: BackendTerminal[]): void => {
      setManualTerminals((prev) => {
        const uiOnly = prev.filter((terminal) => terminal.isBackendSession !== true)
        const existingById = new Map(prev.map((terminal) => [terminal.id, terminal]))
        const backendTerminals = terminals
          .filter((terminal) => !dismissedBackendTerminalIdsRef.current.has(terminal.id))
          .map((terminal) => toManualTerminal(terminal, existingById.get(terminal.id)))
        return [...backendTerminals, ...uiOnly]
      })
    },
    [toManualTerminal],
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
          existingIndex >= 0 ? prev[existingIndex] : undefined,
          options,
        )
        if (existingIndex < 0) {
          return [nextTerminal, ...prev]
        }
        return prev.map((item, index) => (index === existingIndex ? nextTerminal : item))
      })
    },
    [toManualTerminal],
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
          title: `Terminal #${manualTerminals.filter((item) => item.isBackendSession !== true).length + 1}`,
          terminal_type: 'local',
        }),
      })
      upsertTerminalSession(response)
      setBackendError(null)
    } catch (error) {
      setManualTerminals((prev) => [...prev, createPlaceholderTerminal(prev.length + 1)])
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
