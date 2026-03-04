import { useState } from 'react'
import type { TerminalWindowsLayerProps } from '../../components/TerminalWindowsLayer'
import type { WorkbenchLayoutViewProps } from '../../components/workbench/WorkbenchLayoutView'
import { useBackendStatusMessage } from '../../hooks/useBackendStatusMessage'
import { usePipelineFeature } from '../pipeline/usePipelineFeature'
import { useTerminalFeature } from '../terminal/useTerminalFeature'
import { useWorkbenchLayoutFeature } from './useWorkbenchLayoutFeature'
import { useWorkbenchPanelContentProps } from './useWorkbenchPanelContentProps'

interface UseWorkbenchFeatureOptions {
  pipelineName: string
  setPipelineName: (name: string) => void
}

interface FlowSettingsFeatureState {
  flows: ReturnType<typeof usePipelineFeature>['catalog']['savedPipelineFlows']
  selectedFlowId: string | null
  isMutating: boolean
  onSwitchFlow: (flowId: string) => void
  onRenameFlow: (flowId: string, nextName: string) => Promise<void>
  onDeleteFlow: (flowId: string) => Promise<void>
}

interface WorkbenchFeatureState {
  isSocketConnected: boolean
  terminalInstancesCount: number
  createManualTerminal: () => Promise<void>
  importJsonPack: (payload: { content: string; fileName?: string }) => Promise<void>
  flowSettings: FlowSettingsFeatureState
  errorBannerMessage: string | null
  workbenchLayoutProps: WorkbenchLayoutViewProps
  shouldRenderTerminalWindowsLayer: boolean
  terminalWindowsLayerProps: TerminalWindowsLayerProps
}

export const useWorkbenchFeature = ({
  pipelineName,
  setPipelineName,
}: UseWorkbenchFeatureOptions): WorkbenchFeatureState => {
  const [backendError, setBackendError] = useState<string | null>(null)

  const terminalFeature = useTerminalFeature({
    setBackendError,
  })
  const pipelineFeature = usePipelineFeature({
    pipelineName,
    setPipelineName,
    setBackendError,
    getSocketEventContext: terminalFeature.manual.getSocketEventContext,
  })

  const {
    catalog,
    pipelineFlow,
    runtime,
  } = pipelineFeature
  const {
    manual,
    pinnedTerminalWindowIds,
    setPinnedTerminalWindowIds,
    requestedMinimizedTerminalWindowIds,
    setRequestedMinimizedTerminalWindowIds,
  } = terminalFeature

  const errorBannerMessage = useBackendStatusMessage({
    backendError,
    commandPacksQuery: catalog.commandPacksQuery,
    pipelineFlowsQuery: catalog.pipelineFlowsQuery,
  })

  const layoutFeature = useWorkbenchLayoutFeature({
    run: runtime.run,
    manualTerminals: manual.manualTerminals,
    pinnedTerminalWindowIds,
    setPinnedTerminalWindowIds,
    requestedMinimizedTerminalWindowIds,
    setRequestedMinimizedTerminalWindowIds,
    updateManualTitle: manual.updateManualTitle,
    renameManualTerminal: manual.renameManualTerminal,
  })

  const workbenchPanelContentProps = useWorkbenchPanelContentProps({
    pipelineName,
    setPipelineName,
    pipelineFeature,
    terminalFeature,
    layoutFeature,
  })

  const workbenchLayoutProps: WorkbenchLayoutViewProps = {
    ...layoutFeature.workbenchLayoutShellProps,
    panelContentProps: workbenchPanelContentProps,
  }

  const terminalWindowsLayerProps: TerminalWindowsLayerProps = {
    ...layoutFeature.terminalWindowsBaseProps,
    getCopyTailLineCount: manual.getCopyTailLineCount,
    isCopyTailRecentlyCopied: (terminalId) =>
      manual.copyTailCopiedByTerminalId[terminalId] === true,
    onUpdateCopyTailLineCount: manual.updateCopyTailLineCount,
    onCopyManualTerminalTail: (terminalId) => {
      void manual.copyManualTerminalTail(terminalId)
    },
    onUpdateManualTitle: manual.updateManualTitle,
    onRenameManualTerminal: (terminalId) => {
      void manual.renameManualTerminal(terminalId)
    },
    onUpdateManualCommand: manual.updateManualCommand,
    onNavigateManualHistory: manual.navigateManualCommandHistory,
    onRunManualCommand: (terminalId) => {
      void manual.runManualCommand(terminalId)
    },
    onAutocompleteManualCommand: (terminalId) => {
      void manual.autocompleteManualCommand(terminalId)
    },
    onStopManualTerminal: (terminalId) => {
      void manual.stopManualTerminal(terminalId)
    },
    onClearManualTerminal: (terminalId) => {
      void manual.clearManualTerminal(terminalId)
    },
    onRemoveManualTerminal: (terminalId) => {
      void manual.removeManualTerminal(terminalId)
    },
  }

  return {
    isSocketConnected: runtime.isSocketConnected,
    terminalInstancesCount: layoutFeature.terminalInstancesCount,
    createManualTerminal: manual.createManualTerminal,
    importJsonPack: pipelineFlow.importJsonPack,
    flowSettings: {
      flows: catalog.savedPipelineFlows,
      selectedFlowId: pipelineFlow.effectiveSelectedPipelineFlowId,
      isMutating: catalog.isFlowSettingsMutating,
      onSwitchFlow: (flowId) => pipelineFlow.switchPipelineFlow(flowId),
      onRenameFlow: pipelineFlow.renamePipelineFlow,
      onDeleteFlow: pipelineFlow.deletePipelineFlow,
    },
    errorBannerMessage,
    workbenchLayoutProps,
    shouldRenderTerminalWindowsLayer: layoutFeature.shouldRenderTerminalWindowsLayer,
    terminalWindowsLayerProps,
  }
}
