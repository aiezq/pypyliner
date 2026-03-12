import { useCallback, useRef, type MutableRefObject } from 'react'

export interface ManualCommandHistoryState {
  entries: string[]
  cursor: number | null
  draft: string
}

export interface ManualCompletionCycleState {
  prefix: string
  matchIndex: number
}

const MANUAL_TERMINAL_HISTORY_STORAGE_KEY = 'operator_helper.manual_terminal_history.v1'
const MAX_MANUAL_HISTORY_ENTRIES = 200

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
            entries.filter(
              (entry): entry is string =>
                typeof entry === 'string' && entry.trim().length > 0,
            ),
          ],
        ]
      }),
    )
  } catch {
    return {}
  }
}

interface UseManualTerminalHistoryResult {
  manualCommandHistoryRef: MutableRefObject<Record<string, ManualCommandHistoryState>>
  storedManualHistoryRef: MutableRefObject<Record<string, string[]>>
  manualCompletionCycleRef: MutableRefObject<Record<string, ManualCompletionCycleState>>
  pruneAndPersistStoredHistory: (
    historyMap: Record<string, ManualCommandHistoryState>,
  ) => void
  ensureHistoryState: (terminalId: string) => ManualCommandHistoryState
  persistHistoryEntries: (terminalId: string, entries: string[]) => void
  resetCommandNavigationState: (terminalId: string) => void
}

export const useManualTerminalHistory = (): UseManualTerminalHistoryResult => {
  const manualCommandHistoryRef = useRef<Record<string, ManualCommandHistoryState>>({})
  const storedManualHistoryRef = useRef<Record<string, string[]>>(loadStoredHistory())
  const manualCompletionCycleRef = useRef<Record<string, ManualCompletionCycleState>>({})

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

  return {
    manualCommandHistoryRef,
    storedManualHistoryRef,
    manualCompletionCycleRef,
    pruneAndPersistStoredHistory,
    ensureHistoryState,
    persistHistoryEntries,
    resetCommandNavigationState,
  }
}
