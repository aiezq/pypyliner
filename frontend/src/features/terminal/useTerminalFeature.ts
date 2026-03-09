import { useState, type Dispatch, type SetStateAction } from 'react'
import { useManualTerminalController } from '../../hooks/useManualTerminalController'

interface UseTerminalFeatureOptions {
  setBackendError: Dispatch<SetStateAction<string | null>>
}

export const useTerminalFeature = ({ setBackendError }: UseTerminalFeatureOptions) => {
  const manual = useManualTerminalController({
    setBackendError,
  })

  const [requestedMinimizedTerminalWindowIds, setRequestedMinimizedTerminalWindowIds] =
    useState<string[]>([])

  return {
    manual,
    requestedMinimizedTerminalWindowIds,
    setRequestedMinimizedTerminalWindowIds,
  }
}
