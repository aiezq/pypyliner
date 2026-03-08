import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import {
  toManualTerminal,
  toTerminalLine,
  upsertManualTerminal,
} from './mappers'
import type { RuntimeSocketEvent } from './schemas'
import type { ManualTerminal } from '../types'

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

interface ApplyRuntimeSocketEventContext {
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

export const applyRuntimeSocketEvent = (
  event: RuntimeSocketEvent,
  context: ApplyRuntimeSocketEventContext,
): void => {
  const {
    setManualTerminals,
    manualCommandHistoryRef,
    storedManualHistoryRef,
    manualCompletionCycleRef,
    setCopyTailLineCountsByTerminalId,
    setCopyTailCopiedByTerminalId,
    copyTailResetTimeoutByTerminalIdRef,
    pruneAndPersistStoredHistory,
  } = context

  switch (event.type) {
    case 'snapshot': {
      const data = event.data
      const terminals = data.manual_terminals.map(toManualTerminal)
      setManualTerminals((prev) => {
        // Preserve frontend-only draftCommand when snapshot replaces state
        const draftMap = new Map(prev.map((t) => [t.id, t.draftCommand]))
        return terminals.map((t) => ({
          ...t,
          draftCommand: draftMap.get(t.id) ?? t.draftCommand,
        }))
      })

      const nextHistory: Record<string, TerminalCommandHistory> = {}
      const nextCycles: Record<string, TerminalCompletionCycle> = {}
      for (const terminal of terminals) {
        const existing = manualCommandHistoryRef.current[terminal.id]
        const storedEntries = storedManualHistoryRef.current[terminal.id] ?? []
        nextHistory[terminal.id] = existing
          ? existing
          : {
              entries: storedEntries,
              pointer: -1,
              scratch: '',
            }
        const existingCycle = manualCompletionCycleRef.current[terminal.id]
        if (existingCycle) {
          nextCycles[terminal.id] = existingCycle
        }
      }
      manualCommandHistoryRef.current = nextHistory
      manualCompletionCycleRef.current = nextCycles
      pruneAndPersistStoredHistory(nextHistory)
      break
    }

    case 'terminal_created': {
      const data = event.data
      const terminal = toManualTerminal(data.terminal)
      setManualTerminals((prev) => upsertManualTerminal(prev, terminal))
      if (!(terminal.id in manualCommandHistoryRef.current)) {
        const storedEntries = storedManualHistoryRef.current[terminal.id] ?? []
        manualCommandHistoryRef.current = {
          ...manualCommandHistoryRef.current,
          [terminal.id]: {
            entries: storedEntries,
            pointer: -1,
            scratch: '',
          },
        }
      }
      break
    }
    case 'terminal_updated': {
      const data = event.data
      const terminal = toManualTerminal(data.terminal)
      setManualTerminals((prev) => upsertManualTerminal(prev, terminal))
      if (!(terminal.id in manualCommandHistoryRef.current)) {
        const storedEntries = storedManualHistoryRef.current[terminal.id] ?? []
        manualCommandHistoryRef.current = {
          ...manualCommandHistoryRef.current,
          [terminal.id]: {
            entries: storedEntries,
            pointer: -1,
            scratch: '',
          },
        }
      }
      break
    }
    case 'terminal_status': {
      const data = event.data
      setManualTerminals((prev) =>
        prev.map((terminal) =>
          terminal.id === data.terminal_id
            ? {
                ...terminal,
                status: data.status,
                exitCode: data.exit_code,
              }
            : terminal,
        ),
      )
      break
    }
    case 'terminal_line': {
      const data = event.data
      const nextLine = toTerminalLine(data.line)
      setManualTerminals((prev) =>
        prev.map((terminal) =>
          terminal.id === data.terminal_id
            ? {
                ...terminal,
                lines: [...terminal.lines, nextLine],
              }
            : terminal,
        ),
      )
      break
    }
    case 'terminal_closed': {
      const data = event.data
      setManualTerminals((prev) =>
        prev.filter((terminal) => terminal.id !== data.terminal_id),
      )
      const nextHistory = { ...manualCommandHistoryRef.current }
      delete nextHistory[data.terminal_id]
      manualCommandHistoryRef.current = nextHistory
      const nextCycles = { ...manualCompletionCycleRef.current }
      delete nextCycles[data.terminal_id]
      manualCompletionCycleRef.current = nextCycles
      setCopyTailLineCountsByTerminalId((prev) => {
        const next = { ...prev }
        delete next[data.terminal_id]
        return next
      })
      setCopyTailCopiedByTerminalId((prev) => {
        const next = { ...prev }
        delete next[data.terminal_id]
        return next
      })
      const copyResetTimeout = copyTailResetTimeoutByTerminalIdRef.current[data.terminal_id]
      if (copyResetTimeout !== undefined) {
        window.clearTimeout(copyResetTimeout)
        const nextCopyTimeoutMap = { ...copyTailResetTimeoutByTerminalIdRef.current }
        delete nextCopyTimeoutMap[data.terminal_id]
        copyTailResetTimeoutByTerminalIdRef.current = nextCopyTimeoutMap
      }
      pruneAndPersistStoredHistory(nextHistory)
      break
    }
    default:
      break
  }
}
