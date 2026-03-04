import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import {
  toManualTerminal,
  toRunState,
  toTerminalLine,
  upsertManualTerminal,
} from './mappers'
import { BackendSnapshotSchema } from './schemas'
import type {
  BackendLine,
  BackendManualTerminal,
  BackendRun,
  ManualTerminal,
  RunState,
  RunStatus,
  SessionStatus,
  SocketEvent,
} from '../types'

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
  setBackendError: Dispatch<SetStateAction<string | null>>
  setRun: Dispatch<SetStateAction<RunState | null>>
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
  event: SocketEvent,
  context: ApplyRuntimeSocketEventContext,
): void => {
  const {
    setBackendError,
    setRun,
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
      const parsedSnapshot = BackendSnapshotSchema.safeParse(event.data)
      if (!parsedSnapshot.success) {
        setBackendError('Failed to parse snapshot payload')
        break
      }
      const data = parsedSnapshot.data
      const latestRun = data.runs
        .map(toRunState)
        .sort((left, right) => Date.parse(right.startedAt) - Date.parse(left.startedAt))[0]
      setRun(latestRun ?? null)
      const terminals = data.manual_terminals.map(toManualTerminal)
      setManualTerminals(terminals)

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
    case 'run_created': {
      const data = event.data as { run: BackendRun }
      const nextRun = toRunState(data.run)
      setRun(nextRun)
      break
    }
    case 'run_status': {
      const data = event.data as {
        run_id: string
        status: RunStatus
        finished_at: string | null
      }
      setRun((prev) => {
        if (!prev || prev.id !== data.run_id) {
          return prev
        }
        return {
          ...prev,
          status: data.status,
          finishedAt: data.finished_at,
        }
      })
      break
    }
    case 'run_session_status': {
      const data = event.data as {
        run_id: string
        session_id: string
        status: SessionStatus
        exit_code: number | null
      }
      setRun((prev) => {
        if (!prev || prev.id !== data.run_id) {
          return prev
        }
        return {
          ...prev,
          sessions: prev.sessions.map((session) =>
            session.id === data.session_id
              ? {
                  ...session,
                  status: data.status,
                  exitCode: data.exit_code,
                }
              : session,
          ),
        }
      })
      break
    }
    case 'run_session_line': {
      const data = event.data as {
        run_id: string
        session_id: string
        line: BackendLine
      }
      const nextLine = toTerminalLine(data.line)
      setRun((prev) => {
        if (!prev || prev.id !== data.run_id) {
          return prev
        }
        return {
          ...prev,
          sessions: prev.sessions.map((session) =>
            session.id === data.session_id
              ? {
                  ...session,
                  lines: [...session.lines, nextLine],
                }
              : session,
          ),
        }
      })
      break
    }
    case 'terminal_created': {
      const data = event.data as { terminal: BackendManualTerminal }
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
      const data = event.data as { terminal: BackendManualTerminal }
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
      const data = event.data as {
        terminal_id: string
        status: SessionStatus
        exit_code: number | null
      }
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
      const data = event.data as {
        terminal_id: string
        line: BackendLine
      }
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
      const data = event.data as { terminal_id: string }
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
