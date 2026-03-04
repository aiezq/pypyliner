import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import { useManualTerminalController } from '../../hooks/useManualTerminalController'

const WORKBENCH_PINNED_TERMINALS_STORAGE_KEY = 'operator_helper.pinned_terminals.v1'

const readStoredPinnedTerminalWindowIds = (): string[] => {
  if (typeof window === 'undefined') {
    return []
  }
  try {
    const raw = window.localStorage.getItem(WORKBENCH_PINNED_TERMINALS_STORAGE_KEY)
    if (!raw) {
      return []
    }
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) {
      return []
    }
    return parsed
      .filter((item): item is string => typeof item === 'string')
      .filter((item) => item.length > 0)
  } catch {
    return []
  }
}

interface UseTerminalFeatureOptions {
  setBackendError: Dispatch<SetStateAction<string | null>>
}

export const useTerminalFeature = ({ setBackendError }: UseTerminalFeatureOptions) => {
  const manual = useManualTerminalController({
    setBackendError,
  })

  const [pinnedTerminalWindowIds, setPinnedTerminalWindowIds] = useState<string[]>(
    readStoredPinnedTerminalWindowIds(),
  )
  const [requestedMinimizedTerminalWindowIds, setRequestedMinimizedTerminalWindowIds] =
    useState<string[]>([])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }
    try {
      window.localStorage.setItem(
        WORKBENCH_PINNED_TERMINALS_STORAGE_KEY,
        JSON.stringify(pinnedTerminalWindowIds),
      )
    } catch {
      // Ignore storage errors.
    }
  }, [pinnedTerminalWindowIds])

  return {
    manual,
    pinnedTerminalWindowIds,
    setPinnedTerminalWindowIds,
    requestedMinimizedTerminalWindowIds,
    setRequestedMinimizedTerminalWindowIds,
  }
}
