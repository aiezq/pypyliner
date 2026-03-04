import { describe, expect, it, vi } from 'vitest'
import { useWorkbenchPanelContentProps } from '../../../src/features/workbench/useWorkbenchPanelContentProps'

describe('useWorkbenchPanelContentProps', () => {
  it('maps feature layers into WorkbenchPanelBodyProps shape', () => {
    const setPipelineName = vi.fn()
    const pipelineFeature = {
      catalog: {
        commandPackOptions: [{ id: 'flow_drafts', name: 'Flow Drafts' }],
        savedPipelineFlowOptions: [{ id: 'flow_1', name: 'Flow #1' }],
        isSavingFlow: false,
        templates: [],
        commandPackNamesById: { flow_drafts: 'Flow Drafts' },
        templatePacksCount: 1,
        commandPacksQuery: { isFetching: false },
        reloadCommandPacks: vi.fn(async () => {}),
      },
      pipelineFlow: {
        steps: [],
        effectiveSelectedPipelineFlowId: null,
        clearSteps: vi.fn(),
        createEmptyStep: vi.fn(),
        removeStep: vi.fn(),
        updateStep: vi.fn(),
        saveStepToDock: vi.fn(async () => {}),
        switchPipelineFlow: vi.fn(),
        savePipelineFlow: vi.fn(async () => {}),
        savePipelineFlowAsNew: vi.fn(async () => {}),
        reorderStepByIndex: vi.fn(),
        addStepFromTemplate: vi.fn(),
        updateTemplate: vi.fn(async () => {}),
        moveTemplateToPack: vi.fn(async () => {}),
        deleteTemplate: vi.fn(async () => {}),
        importJsonPack: vi.fn(async () => {}),
      },
      runtime: {
        run: null,
        isRunning: false,
        executePipeline: vi.fn(async () => {}),
        stopRun: vi.fn(async () => {}),
      },
    }
    const terminalFeature = {
      manual: {
        updateManualTitle: vi.fn(),
        stopManualTerminal: vi.fn(async () => {}),
        removeManualTerminal: vi.fn(async () => {}),
        updateManualCommand: vi.fn(),
        autocompleteManualCommand: vi.fn(async () => {}),
        navigateManualCommandHistory: vi.fn(),
        runManualCommand: vi.fn(async () => {}),
        clearManualTerminal: vi.fn(async () => {}),
        getCopyTailLineCount: vi.fn(() => 20),
        updateCopyTailLineCount: vi.fn(),
        copyManualTerminalTail: vi.fn(async () => {}),
        copyTailCopiedByTerminalId: { terminal_1: true },
      },
    }
    const layoutFeature = {
      terminalWindowMap: {},
      editingPinnedTerminalTitleId: null,
      togglePinTerminalWindow: vi.fn(),
      minimizePinnedTerminalWindow: vi.fn(),
      terminalWindowsBaseProps: {
        onDismissRunSessionWindow: vi.fn(),
      },
      startPinnedTerminalTitleEdit: vi.fn(),
      cancelPinnedTerminalTitleEdit: vi.fn(),
      savePinnedTerminalTitleEdit: vi.fn(),
    }

    const result = useWorkbenchPanelContentProps({
      pipelineName: 'Main',
      setPipelineName,
      pipelineFeature: pipelineFeature as never,
      terminalFeature: terminalFeature as never,
      layoutFeature: layoutFeature as never,
    })

    expect(result.pipelineName).toBe('Main')
    expect(result.onPipelineNameChange).toBe(setPipelineName)
    expect(result.onRunPipeline).toBe(pipelineFeature.runtime.executePipeline)
    expect(result.onReloadTemplates).toBe(pipelineFeature.catalog.reloadCommandPacks)
    expect(result.onUpdateManualCommand).toBe(terminalFeature.manual.updateManualCommand)
    expect(result.onTogglePinTerminalWindow).toBe(layoutFeature.togglePinTerminalWindow)
    expect(result.onDismissRunSessionWindow).toBe(
      layoutFeature.terminalWindowsBaseProps.onDismissRunSessionWindow,
    )
    expect(result.isCopyTailRecentlyCopied('terminal_1')).toBe(true)
    expect(result.isCopyTailRecentlyCopied('terminal_2')).toBe(false)
  })
})
