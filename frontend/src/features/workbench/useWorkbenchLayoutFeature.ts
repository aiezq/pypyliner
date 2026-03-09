import type { Dispatch, SetStateAction } from 'react'
import { useWorkbenchTerminalsViewModel } from '../../hooks/useWorkbenchTerminalsViewModel'
import type { ManualTerminal } from '../../types'

interface UseWorkbenchLayoutFeatureOptions {
  manualTerminals: ManualTerminal[]
  requestedMinimizedTerminalWindowIds: string[]
  setRequestedMinimizedTerminalWindowIds: Dispatch<SetStateAction<string[]>>
  updateManualTitle: (terminalId: string, title: string) => void
  renameManualTerminal: (terminalId: string) => Promise<void>
}

export const useWorkbenchLayoutFeature = ({
  manualTerminals,
  requestedMinimizedTerminalWindowIds,
  setRequestedMinimizedTerminalWindowIds,
  updateManualTitle,
  renameManualTerminal,
}: UseWorkbenchLayoutFeatureOptions) => {
  const {
    effectiveRequestedMinimizedTerminalWindowIds,
    terminalInstancesCount,
    consumeRequestedMinimizeTerminalWindow,
  } = useWorkbenchTerminalsViewModel({
    manualTerminals,
    requestedMinimizedTerminalWindowIds,
    setRequestedMinimizedTerminalWindowIds,
    updateManualTitle,
    renameManualTerminal,
  })

  return {
    terminalInstancesCount,
    terminalWindowsBaseProps: {
      manualTerminals,
      requestedMinimizedWindowIds: effectiveRequestedMinimizedTerminalWindowIds,
      onConsumeRequestedMinimizeWindow: consumeRequestedMinimizeTerminalWindow,
    },
    shouldRenderTerminalWindowsLayer: manualTerminals.length > 0,
  }
}
