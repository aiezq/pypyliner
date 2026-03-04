import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const useWorkbenchTerminalsViewModelMock = vi.hoisted(() => vi.fn())
const useWorkbenchLayoutMock = vi.hoisted(() => vi.fn())
const usePinnedTerminalLayoutControllerMock = vi.hoisted(() => vi.fn())

vi.mock('../../../src/hooks/useWorkbenchTerminalsViewModel', () => ({
  useWorkbenchTerminalsViewModel: useWorkbenchTerminalsViewModelMock,
}))

vi.mock('../../../src/hooks/useWorkbenchLayout', () => ({
  useWorkbenchLayout: useWorkbenchLayoutMock,
}))

vi.mock('../../../src/hooks/usePinnedTerminalLayoutController', () => ({
  usePinnedTerminalLayoutController: usePinnedTerminalLayoutControllerMock,
}))

import { useWorkbenchLayoutFeature } from '../../../src/features/workbench/useWorkbenchLayoutFeature'

describe('useWorkbenchLayoutFeature', () => {
  it('combines terminal/layout/pinned controllers into ui state', () => {
    useWorkbenchTerminalsViewModelMock.mockReturnValue({
      visibleRunSessions: [{ id: 'session_1' }],
      terminalWindowMap: { terminal_1: {} },
      availableTerminalWindowIds: ['terminal_1'],
      effectivePinnedTerminalWindowIds: ['terminal_1'],
      effectiveRequestedMinimizedTerminalWindowIds: [],
      pinnedTerminalPanelKeys: ['terminal:terminal_1'],
      terminalInstancesCount: 1,
      requestMinimizeTerminalWindow: vi.fn(),
      consumeRequestedMinimizeTerminalWindow: vi.fn(),
      editingPinnedTerminalTitleId: null,
      startPinnedTerminalTitleEdit: vi.fn(),
      cancelPinnedTerminalTitleEdit: vi.fn(),
      savePinnedTerminalTitleEdit: vi.fn(),
    })

    useWorkbenchLayoutMock.mockReturnValue({
      visibleWorkbenchPanelOrder: ['flow', 'dock'],
      draggingWorkbenchPanel: null,
      dragOverWorkbenchPanel: null,
      workbenchPanelCollapsed: {},
      workbenchPanelWidths: {},
      workbenchPanelFullWidth: {},
      startWorkbenchPanelDrag: vi.fn(),
      onWorkbenchPanelDragOver: vi.fn(),
      onWorkbenchPanelDrop: vi.fn(),
      finishWorkbenchPanelDrag: vi.fn(),
      toggleWorkbenchPanelCollapse: vi.fn(),
      toggleWorkbenchPanelFullWidth: vi.fn(),
      startWorkbenchPanelResize: vi.fn(),
      removePanelFromLayout: vi.fn(),
      ensurePanelInLayout: vi.fn(),
    })

    usePinnedTerminalLayoutControllerMock.mockReturnValue({
      getWorkbenchPanelTitle: vi.fn(),
      getWorkbenchPanelDefaultWidth: vi.fn(() => 400),
      minimizePinnedTerminalWindow: vi.fn(),
      togglePinTerminalWindow: vi.fn(),
    })

    const { result } = renderHook(() =>
      useWorkbenchLayoutFeature({
        run: null,
        manualTerminals: [],
        pinnedTerminalWindowIds: [],
        setPinnedTerminalWindowIds: vi.fn(),
        requestedMinimizedTerminalWindowIds: [],
        setRequestedMinimizedTerminalWindowIds: vi.fn(),
        updateManualTitle: vi.fn(),
        renameManualTerminal: vi.fn(async () => {}),
      }),
    )

    expect(result.current.terminalInstancesCount).toBe(1)
    expect(result.current.shouldRenderTerminalWindowsLayer).toBe(true)
    expect(result.current.workbenchLayoutShellProps.visibleWorkbenchPanelOrder).toEqual([
      'flow',
      'dock',
    ])
    expect(result.current.terminalWindowsBaseProps.pinnedWindowIds).toEqual(['terminal_1'])
  })
})
