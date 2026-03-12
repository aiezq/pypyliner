import { useState } from 'react'
import type { TerminalWindowsLayerProps } from '../../components/TerminalWindowsLayer'
import { useTerminalFeature } from '../terminal/useTerminalFeature'
import { useWorkbenchLayoutFeature } from './useWorkbenchLayoutFeature'
import type { SequenceExecutionViewModel } from '../../types'

interface WorkbenchFeatureState {
  isSocketConnected: boolean
  terminalInstancesCount: number
  createManualTerminal: () => Promise<void>
  errorBannerMessage: string | null
  sequenceExecutions: SequenceExecutionViewModel[]
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
    getCopyTailLineCount: terminalFeature.manual.getCopyTailLineCount,
    isCopyTailRecentlyCopied: terminalFeature.manual.isCopyTailRecentlyCopied,
    onUpdateCopyTailLineCount: terminalFeature.manual.updateCopyTailLineCount,
    onCopyManualTerminalTail: (terminalId) => {
      void terminalFeature.manual.copyManualTerminalTail(terminalId)
    },
    onUpdateManualTitle: terminalFeature.manual.updateManualTitle,
    onRenameManualTerminal: (terminalId) => {
      void terminalFeature.manual.renameManualTerminal(terminalId)
    },
    onUpdateManualCommand: terminalFeature.manual.updateManualCommand,
    onNavigateManualHistory: terminalFeature.manual.navigateManualCommandHistory,
    onRunManualCommand: (terminalId) => {
      void terminalFeature.manual.runManualCommand(terminalId)
    },
    onAutocompleteManualCommand: (terminalId) => {
      void terminalFeature.manual.autocompleteManualCommand(terminalId)
    },
    onStopManualTerminal: (terminalId) => {
      void terminalFeature.manual.stopManualTerminal(terminalId)
    },
    onClearManualTerminal: (terminalId) => {
      void terminalFeature.manual.clearManualTerminal(terminalId)
    },
    onRemoveManualTerminal: (terminalId) => {
      void terminalFeature.manual.removeManualTerminal(terminalId)
    },
  }

  return {
    isSocketConnected: terminalFeature.isSocketConnected,
    terminalInstancesCount: layoutFeature.terminalInstancesCount,
    createManualTerminal: terminalFeature.manual.createManualTerminal,
    errorBannerMessage: backendError,
    sequenceExecutions: terminalFeature.sequenceExecutions,
    shouldRenderTerminalWindowsLayer: layoutFeature.shouldRenderTerminalWindowsLayer,
    terminalWindowsLayerProps,
  }
}
