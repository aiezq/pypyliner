import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const useTerminalFeatureMock = vi.hoisted(() => vi.fn())
const usePipelineFeatureMock = vi.hoisted(() => vi.fn())
const useBackendStatusMessageMock = vi.hoisted(() => vi.fn())
const useWorkbenchLayoutFeatureMock = vi.hoisted(() => vi.fn())
const useWorkbenchPanelContentPropsMock = vi.hoisted(() => vi.fn())

vi.mock('../../../src/features/terminal/useTerminalFeature', () => ({
  useTerminalFeature: useTerminalFeatureMock,
}))

vi.mock('../../../src/features/pipeline/usePipelineFeature', () => ({
  usePipelineFeature: usePipelineFeatureMock,
}))

vi.mock('../../../src/hooks/useBackendStatusMessage', () => ({
  useBackendStatusMessage: useBackendStatusMessageMock,
}))

vi.mock('../../../src/features/workbench/useWorkbenchLayoutFeature', () => ({
  useWorkbenchLayoutFeature: useWorkbenchLayoutFeatureMock,
}))

vi.mock('../../../src/features/workbench/useWorkbenchPanelContentProps', () => ({
  useWorkbenchPanelContentProps: useWorkbenchPanelContentPropsMock,
}))

import { useWorkbenchFeature } from '../../../src/features/workbench/useWorkbenchFeature'

describe('useWorkbenchFeature', () => {
  it('builds full workbench state from composed feature modules', () => {
    const manual = {
      manualTerminals: [],
      getSocketEventContext: vi.fn(() => ({})),
      createManualTerminal: vi.fn(async () => {}),
      copyTailCopiedByTerminalId: { terminal_1: true },
      getCopyTailLineCount: vi.fn(() => 20),
      updateCopyTailLineCount: vi.fn(),
      copyManualTerminalTail: vi.fn(async () => {}),
      updateManualTitle: vi.fn(),
      renameManualTerminal: vi.fn(async () => {}),
      updateManualCommand: vi.fn(),
      navigateManualCommandHistory: vi.fn(),
      runManualCommand: vi.fn(async () => {}),
      autocompleteManualCommand: vi.fn(async () => {}),
      stopManualTerminal: vi.fn(async () => {}),
      clearManualTerminal: vi.fn(async () => {}),
      removeManualTerminal: vi.fn(async () => {}),
    }

    useTerminalFeatureMock.mockReturnValue({
      manual,
      pinnedTerminalWindowIds: [],
      setPinnedTerminalWindowIds: vi.fn(),
      requestedMinimizedTerminalWindowIds: [],
      setRequestedMinimizedTerminalWindowIds: vi.fn(),
    })

    usePipelineFeatureMock.mockReturnValue({
      catalog: {
        commandPacksQuery: { isError: false, data: { errors: [] } },
        pipelineFlowsQuery: { isError: false, data: { errors: [] } },
        savedPipelineFlows: [{ id: 'flow_1', flow_name: 'Flow #1' }],
        isFlowSettingsMutating: false,
      },
      pipelineFlow: {
        importJsonPack: vi.fn(async () => {}),
        effectiveSelectedPipelineFlowId: 'flow_1',
        switchPipelineFlow: vi.fn(),
        renamePipelineFlow: vi.fn(async () => {}),
        deletePipelineFlow: vi.fn(async () => {}),
      },
      runtime: {
        isSocketConnected: true,
        run: null,
      },
    })

    useBackendStatusMessageMock.mockReturnValue('status message')

    useWorkbenchLayoutFeatureMock.mockReturnValue({
      terminalInstancesCount: 3,
      workbenchLayoutShellProps: { visibleWorkbenchPanelOrder: ['flow'] },
      terminalWindowsBaseProps: { runSessions: [], manualTerminals: [] },
      shouldRenderTerminalWindowsLayer: true,
      terminalWindowMap: {},
      editingPinnedTerminalTitleId: null,
      startPinnedTerminalTitleEdit: vi.fn(),
      cancelPinnedTerminalTitleEdit: vi.fn(),
      savePinnedTerminalTitleEdit: vi.fn(),
      minimizePinnedTerminalWindow: vi.fn(),
      togglePinTerminalWindow: vi.fn(),
    })

    useWorkbenchPanelContentPropsMock.mockReturnValue({
      steps: [],
    })

    const { result } = renderHook(() =>
      useWorkbenchFeature({
        pipelineName: 'Main',
        setPipelineName: vi.fn(),
      }),
    )

    expect(result.current.isSocketConnected).toBe(true)
    expect(result.current.terminalInstancesCount).toBe(3)
    expect(result.current.errorBannerMessage).toBe('status message')
    expect(result.current.flowSettings.selectedFlowId).toBe('flow_1')
    expect(result.current.shouldRenderTerminalWindowsLayer).toBe(true)
    expect(result.current.workbenchLayoutProps.panelContentProps).toEqual({ steps: [] })
    expect(result.current.terminalWindowsLayerProps.isCopyTailRecentlyCopied('terminal_1')).toBe(
      true,
    )
    expect(result.current.terminalWindowsLayerProps.isCopyTailRecentlyCopied('terminal_2')).toBe(
      false,
    )

    result.current.flowSettings.onSwitchFlow('flow_2')
    expect(usePipelineFeatureMock.mock.results[0]?.value.pipelineFlow.switchPipelineFlow).toHaveBeenCalledWith(
      'flow_2',
    )

    void result.current.flowSettings.onRenameFlow('flow_1', 'Renamed')
    expect(usePipelineFeatureMock.mock.results[0]?.value.pipelineFlow.renamePipelineFlow).toHaveBeenCalledWith(
      'flow_1',
      'Renamed',
    )

    void result.current.flowSettings.onDeleteFlow('flow_1')
    expect(usePipelineFeatureMock.mock.results[0]?.value.pipelineFlow.deletePipelineFlow).toHaveBeenCalledWith(
      'flow_1',
    )

    void result.current.createManualTerminal()
    expect(manual.createManualTerminal).toHaveBeenCalledTimes(1)

    void result.current.importJsonPack({ content: '{"id":"pack"}', fileName: 'pack.json' })
    expect(usePipelineFeatureMock.mock.results[0]?.value.pipelineFlow.importJsonPack).toHaveBeenCalledWith(
      { content: '{"id":"pack"}', fileName: 'pack.json' },
    )

    result.current.terminalWindowsLayerProps.onCopyManualTerminalTail('terminal_1')
    result.current.terminalWindowsLayerProps.onRenameManualTerminal('terminal_1')
    result.current.terminalWindowsLayerProps.onRunManualCommand('terminal_1')
    result.current.terminalWindowsLayerProps.onAutocompleteManualCommand('terminal_1')
    result.current.terminalWindowsLayerProps.onStopManualTerminal('terminal_1')
    result.current.terminalWindowsLayerProps.onClearManualTerminal('terminal_1')
    result.current.terminalWindowsLayerProps.onRemoveManualTerminal('terminal_1')

    expect(manual.copyManualTerminalTail).toHaveBeenCalledWith('terminal_1')
    expect(manual.renameManualTerminal).toHaveBeenCalledWith('terminal_1')
    expect(manual.runManualCommand).toHaveBeenCalledWith('terminal_1')
    expect(manual.autocompleteManualCommand).toHaveBeenCalledWith('terminal_1')
    expect(manual.stopManualTerminal).toHaveBeenCalledWith('terminal_1')
    expect(manual.clearManualTerminal).toHaveBeenCalledWith('terminal_1')
    expect(manual.removeManualTerminal).toHaveBeenCalledWith('terminal_1')
  })
})
