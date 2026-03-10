import { useCallback, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'
import type { ManualTerminal } from '../types'

export type TerminalHistoryDirection = 'up' | 'down'

interface ManualTerminalSocketContext {
  setManualTerminals: Dispatch<SetStateAction<ManualTerminal[]>>
  manualCommandHistoryRef: MutableRefObject<Record<string, { entries: string[] }>>
  storedManualHistoryRef: MutableRefObject<Record<string, string[]>>
  manualCompletionCycleRef: MutableRefObject<Record<string, never>>
  setCopyTailLineCountsByTerminalId: Dispatch<SetStateAction<Record<string, number>>>
  setCopyTailCopiedByTerminalId: Dispatch<SetStateAction<Record<string, boolean>>>
  copyTailResetTimeoutByTerminalIdRef: MutableRefObject<Record<string, number>>
  pruneAndPersistStoredHistory: (_historyMap: Record<string, { entries: string[] }>) => void
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
})

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
  const manualCommandHistoryRef = useRef<Record<string, { entries: string[] }>>({})
  const storedManualHistoryRef = useRef<Record<string, string[]>>({})
  const manualCompletionCycleRef = useRef<Record<string, never>>({})

  const pruneAndPersistStoredHistory = useCallback((): void => {}, [])

  const createManualTerminal = async (): Promise<void> => {
    setManualTerminals((prev) => [...prev, createPlaceholderTerminal(prev.length + 1)])
    setBackendError(null)
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
    setManualTerminals((prev) =>
      prev.map((terminal) =>
        terminal.id === terminalId ? { ...terminal, draftCommand: command } : terminal,
      ),
    )
  }

  const navigateManualCommandHistory = (
    _terminalId: string,
    _direction: TerminalHistoryDirection,
    _currentDraft: string,
  ): void => {}

  const runManualCommand = async (_terminalId: string): Promise<void> => {
    setBackendError(null)
  }

  const autocompleteManualCommand = async (_terminalId: string): Promise<void> => {
    setBackendError(null)
  }

  const stopManualTerminal = async (terminalId: string): Promise<void> => {
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
    setBackendError(null)
  }

  const clearManualTerminal = async (terminalId: string): Promise<void> => {
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
    setBackendError(null)
  }

  const removeManualTerminal = async (terminalId: string): Promise<void> => {
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
