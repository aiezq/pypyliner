import { useState } from 'react'
import type { TerminalWindowsLayerProps } from '../../components/TerminalWindowsLayer'
import { useTerminalFeature } from '../terminal/useTerminalFeature'
import { useWorkbenchLayoutFeature } from './useWorkbenchLayoutFeature'

interface WorkbenchFeatureState {
  isSocketConnected: boolean
  terminalInstancesCount: number
  createManualTerminal: () => Promise<void>
  errorBannerMessage: string | null
  shouldRenderTerminalWindowsLayer: boolean
  terminalWindowsLayerProps: TerminalWindowsLayerProps
}

export const useWorkbenchFeature = (): WorkbenchFeatureState => {
  const [backendError, setBackendError] = useState<string | null>(null)

  const terminalFeature = useTerminalFeature({
    setBackendError,
  })

  const layoutFeature = useWorkbenchLayoutFeature({
    manualTerminals: terminalFeature.manual.manualTerminals,
    requestedMinimizedTerminalWindowIds: terminalFeature.requestedMinimizedTerminalWindowIds,
    setRequestedMinimizedTerminalWindowIds: terminalFeature.setRequestedMinimizedTerminalWindowIds,
    updateManualTitle: terminalFeature.manual.updateManualTitle,
    renameManualTerminal: terminalFeature.manual.renameManualTerminal,
  })

  const terminalWindowsLayerProps: TerminalWindowsLayerProps = {
    ...layoutFeature.terminalWindowsBaseProps,
    onUpdateManualTitle: terminalFeature.manual.updateManualTitle,
    onRenameManualTerminal: (terminalId) => {
      void terminalFeature.manual.renameManualTerminal(terminalId)
    },
    onStopManualTerminal: (terminalId) => {
      void terminalFeature.manual.stopManualTerminal(terminalId)
    },
    onRemoveManualTerminal: (terminalId) => {
      void terminalFeature.manual.removeManualTerminal(terminalId)
    },
  }

  return {
    isSocketConnected: true,
    terminalInstancesCount: layoutFeature.terminalInstancesCount,
    createManualTerminal: terminalFeature.manual.createManualTerminal,
    errorBannerMessage: backendError,
    shouldRenderTerminalWindowsLayer: layoutFeature.shouldRenderTerminalWindowsLayer,
    terminalWindowsLayerProps,
  }
}
