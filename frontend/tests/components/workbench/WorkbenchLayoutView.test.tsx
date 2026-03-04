import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import WorkbenchLayoutView from '../../../src/components/workbench/WorkbenchLayoutView'
import {
  WORKBENCH_PANEL_DOCK,
  WORKBENCH_PANEL_FLOW,
} from '../../../src/hooks/useWorkbenchLayout'

vi.mock('../../../src/components/workbench/WorkbenchPanelContent', () => ({
  default: ({ panel }: { panel: string }) => <div data-testid={`panel-${panel}`} />,
}))

const createProps = () => ({
  visibleWorkbenchPanelOrder: [WORKBENCH_PANEL_FLOW, WORKBENCH_PANEL_DOCK],
  draggingWorkbenchPanel: null,
  dragOverWorkbenchPanel: null,
  workbenchPanelCollapsed: {
    [WORKBENCH_PANEL_FLOW]: false,
    [WORKBENCH_PANEL_DOCK]: false,
  },
  workbenchPanelWidths: {
    [WORKBENCH_PANEL_FLOW]: 860,
    [WORKBENCH_PANEL_DOCK]: 460,
  },
  workbenchPanelFullWidth: {
    [WORKBENCH_PANEL_FLOW]: false,
    [WORKBENCH_PANEL_DOCK]: false,
  },
  getWorkbenchPanelTitle: vi.fn((panel: string) =>
    panel === WORKBENCH_PANEL_FLOW ? 'Pipeline Flow' : 'Pipeline Dock',
  ),
  getWorkbenchPanelDefaultWidth: vi.fn(() => 500),
  startWorkbenchPanelDrag: vi.fn(),
  onWorkbenchPanelDragOver: vi.fn(),
  onWorkbenchPanelDrop: vi.fn(),
  finishWorkbenchPanelDrag: vi.fn(),
  toggleWorkbenchPanelCollapse: vi.fn(),
  toggleWorkbenchPanelFullWidth: vi.fn(),
  startWorkbenchPanelResize: vi.fn(),
  panelContentProps: {
    steps: [],
    packOptions: [],
    savedFlows: [],
    selectedSavedFlowId: null,
    pipelineName: 'Main',
    run: null,
    isRunning: false,
    isSavingFlow: false,
    onRunPipeline: vi.fn(async () => {}),
    onStopRun: vi.fn(async () => {}),
    onClearSteps: vi.fn(),
    onCreateStep: vi.fn(),
    onRemoveStep: vi.fn(),
    onUpdateStep: vi.fn(),
    onSaveStepToDock: vi.fn(async () => {}),
    onSwitchSavedFlow: vi.fn(),
    onPipelineNameChange: vi.fn(),
    onSaveFlow: vi.fn(async () => {}),
    onSaveFlowAsNew: vi.fn(async () => {}),
    onReorderSteps: vi.fn(),
    templates: [],
    packNamesById: {},
    packsCount: 0,
    isReloadingTemplates: false,
    onAddStepFromTemplate: vi.fn(),
    onUpdateTemplate: vi.fn(async () => {}),
    onReloadTemplates: vi.fn(async () => {}),
    onMoveTemplateToPack: vi.fn(async () => {}),
    onDeleteTemplate: vi.fn(async () => {}),
    terminalWindowMap: new Map(),
    editingPinnedTerminalTitleId: null,
    onTogglePinTerminalWindow: vi.fn(),
    onMinimizePinnedTerminalWindow: vi.fn(),
    onUpdateManualTitle: vi.fn(),
    onStartPinnedTerminalTitleEdit: vi.fn(),
    onCancelPinnedTerminalTitleEdit: vi.fn(),
    onSavePinnedTerminalTitleEdit: vi.fn(async () => {}),
    onStopManualTerminal: vi.fn(async () => {}),
    onRemoveManualTerminal: vi.fn(async () => {}),
    onUpdateManualCommand: vi.fn(),
    onAutocompleteManualCommand: vi.fn(async () => {}),
    onNavigateManualHistory: vi.fn(),
    onRunManualCommand: vi.fn(async () => {}),
    onClearManualTerminal: vi.fn(async () => {}),
    getCopyTailLineCount: vi.fn(() => 20),
    onUpdateCopyTailLineCount: vi.fn(),
    onCopyManualTerminalTail: vi.fn(async () => {}),
    isCopyTailRecentlyCopied: vi.fn(() => false),
  },
})

describe('WorkbenchLayoutView', () => {
  it('renders panels and triggers toolbar actions', () => {
    const props = createProps()
    render(<WorkbenchLayoutView {...props} />)

    expect(screen.getByTestId('panel-flow')).toBeInTheDocument()
    expect(screen.getByTestId('panel-dock')).toBeInTheDocument()

    const dragHandles = screen.getAllByTitle('Drag panel to reorder layout')
    fireEvent.dragStart(dragHandles[0])
    fireEvent.dragEnd(dragHandles[0])
    expect(props.startWorkbenchPanelDrag).toHaveBeenCalled()
    expect(props.finishWorkbenchPanelDrag).toHaveBeenCalled()

    fireEvent.click(screen.getAllByRole('button', { name: 'Collapse' })[0])
    fireEvent.click(screen.getAllByRole('button', { name: 'Full width' })[0])
    expect(props.toggleWorkbenchPanelCollapse).toHaveBeenCalledWith(WORKBENCH_PANEL_FLOW)
    expect(props.toggleWorkbenchPanelFullWidth).toHaveBeenCalledWith(WORKBENCH_PANEL_FLOW, 860)

    const resizeHandles = document.querySelectorAll('.workbenchSlotResizeHandle')
    fireEvent.mouseDown(resizeHandles[0] as Element)
    expect(props.startWorkbenchPanelResize).toHaveBeenCalledWith(
      WORKBENCH_PANEL_FLOW,
      expect.any(Object),
      860,
    )
  })

  it('shows collapsed placeholder and hides resize in full-width mode', () => {
    const props = createProps()
    props.visibleWorkbenchPanelOrder = [WORKBENCH_PANEL_FLOW]
    props.workbenchPanelCollapsed[WORKBENCH_PANEL_FLOW] = true
    props.workbenchPanelFullWidth[WORKBENCH_PANEL_FLOW] = true

    render(<WorkbenchLayoutView {...props} />)

    expect(screen.getByText('Collapsed')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Expand' })).toBeInTheDocument()
    expect(document.querySelector('.workbenchSlotResizeHandle')).toBeNull()
  })

  it('forwards drag-over and drop events to layout callbacks', () => {
    const props = createProps()
    render(<WorkbenchLayoutView {...props} />)

    const slot = document.querySelector('.workbenchSlot') as HTMLElement
    fireEvent.dragOver(slot)
    fireEvent.drop(slot)

    expect(props.onWorkbenchPanelDragOver).toHaveBeenCalled()
    expect(props.onWorkbenchPanelDrop).toHaveBeenCalled()
  })
})
