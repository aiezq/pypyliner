import type { WorkbenchPanelBodyProps } from '../../components/workbench/WorkbenchPanelContent'
import type { usePipelineFeature } from '../pipeline/usePipelineFeature'
import type { useTerminalFeature } from '../terminal/useTerminalFeature'
import type { useWorkbenchLayoutFeature } from './useWorkbenchLayoutFeature'

interface UseWorkbenchPanelContentPropsOptions {
  pipelineName: string
  setPipelineName: (name: string) => void
  pipelineFeature: ReturnType<typeof usePipelineFeature>
  terminalFeature: ReturnType<typeof useTerminalFeature>
  layoutFeature: ReturnType<typeof useWorkbenchLayoutFeature>
}

export const useWorkbenchPanelContentProps = ({
  pipelineName,
  setPipelineName,
  pipelineFeature,
  terminalFeature,
  layoutFeature,
}: UseWorkbenchPanelContentPropsOptions): WorkbenchPanelBodyProps => {
  const {
    catalog,
    pipelineFlow,
    runtime,
  } = pipelineFeature
  const { manual } = terminalFeature

  return {
    steps: pipelineFlow.steps,
    packOptions: catalog.commandPackOptions,
    savedFlows: catalog.savedPipelineFlowOptions,
    selectedSavedFlowId: pipelineFlow.effectiveSelectedPipelineFlowId,
    pipelineName,
    run: runtime.run,
    isRunning: runtime.isRunning,
    isSavingFlow: catalog.isSavingFlow,
    onRunPipeline: runtime.executePipeline,
    onStopRun: runtime.stopRun,
    onClearSteps: pipelineFlow.clearSteps,
    onCreateStep: pipelineFlow.createEmptyStep,
    onRemoveStep: pipelineFlow.removeStep,
    onUpdateStep: pipelineFlow.updateStep,
    onSaveStepToDock: pipelineFlow.saveStepToDock,
    onSwitchSavedFlow: pipelineFlow.switchPipelineFlow,
    onPipelineNameChange: setPipelineName,
    onSaveFlow: pipelineFlow.savePipelineFlow,
    onSaveFlowAsNew: pipelineFlow.savePipelineFlowAsNew,
    onReorderSteps: pipelineFlow.reorderStepByIndex,
    templates: catalog.templates,
    packNamesById: catalog.commandPackNamesById,
    packsCount: catalog.templatePacksCount,
    isReloadingTemplates: catalog.commandPacksQuery.isFetching,
    onAddStepFromTemplate: pipelineFlow.addStepFromTemplate,
    onUpdateTemplate: pipelineFlow.updateTemplate,
    onReloadTemplates: catalog.reloadCommandPacks,
    onMoveTemplateToPack: pipelineFlow.moveTemplateToPack,
    onDeleteTemplate: pipelineFlow.deleteTemplate,
    terminalWindowMap: layoutFeature.terminalWindowMap,
    editingPinnedTerminalTitleId: layoutFeature.editingPinnedTerminalTitleId,
    onTogglePinTerminalWindow: layoutFeature.togglePinTerminalWindow,
    onDismissRunSessionWindow: layoutFeature.terminalWindowsBaseProps.onDismissRunSessionWindow,
    onMinimizePinnedTerminalWindow: layoutFeature.minimizePinnedTerminalWindow,
    onUpdateManualTitle: manual.updateManualTitle,
    onStartPinnedTerminalTitleEdit: layoutFeature.startPinnedTerminalTitleEdit,
    onCancelPinnedTerminalTitleEdit: layoutFeature.cancelPinnedTerminalTitleEdit,
    onSavePinnedTerminalTitleEdit: layoutFeature.savePinnedTerminalTitleEdit,
    onStopManualTerminal: manual.stopManualTerminal,
    onRemoveManualTerminal: manual.removeManualTerminal,
    onUpdateManualCommand: manual.updateManualCommand,
    onAutocompleteManualCommand: manual.autocompleteManualCommand,
    onNavigateManualHistory: manual.navigateManualCommandHistory,
    onRunManualCommand: manual.runManualCommand,
    onClearManualTerminal: manual.clearManualTerminal,
    getCopyTailLineCount: manual.getCopyTailLineCount,
    onUpdateCopyTailLineCount: manual.updateCopyTailLineCount,
    onCopyManualTerminalTail: manual.copyManualTerminalTail,
    isCopyTailRecentlyCopied: (terminalId) =>
      manual.copyTailCopiedByTerminalId[terminalId] === true,
  }
}
