import { useCallback, useState } from 'react'
import type { TerminalWindowsLayerProps } from '../../components/TerminalWindowsLayer'
import { useTerminalFeature } from '../terminal/useTerminalFeature'
import { useWorkbenchLayoutFeature } from './useWorkbenchLayoutFeature'
import { useRuntimeSocket } from '../../hooks/useRuntimeSocket'
import { applyRuntimeSocketEvent } from '../../lib/runtimeSocketEvents'
import type { RuntimeSocketEvent } from '../../lib/schemas'
import { getErrorMessage } from '../../lib/mappers'

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

  const applySocketEvent = useCallback((event: RuntimeSocketEvent): void => {
    applyRuntimeSocketEvent(event, {
      ...terminalFeature.manual.getSocketEventContext(),
    })
  }, [terminalFeature.manual])

  const onRuntimeSocketOpenError = useCallback((error: unknown): void => {
    setBackendError(getErrorMessage(error))
  }, [setBackendError])

  const onRuntimeSocketErrorMessage = useCallback((message: string): void => {
    setBackendError(message)
  }, [setBackendError])

  const { isSocketConnected } = useRuntimeSocket({
    onEvent: applySocketEvent,
    onOpen: async () => { setBackendError(null) },
    onOpenError: onRuntimeSocketOpenError,
    onErrorMessage: onRuntimeSocketErrorMessage,
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
    isCopyTailRecentlyCopied: (terminalId) =>
      terminalFeature.manual.copyTailCopiedByTerminalId[terminalId] === true,
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
    isSocketConnected,
    terminalInstancesCount: layoutFeature.terminalInstancesCount,
    createManualTerminal: terminalFeature.manual.createManualTerminal,
    errorBannerMessage: backendError,
    shouldRenderTerminalWindowsLayer: layoutFeature.shouldRenderTerminalWindowsLayer,
    terminalWindowsLayerProps,
  }
}
