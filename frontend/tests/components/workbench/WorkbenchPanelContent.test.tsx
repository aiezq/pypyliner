import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import WorkbenchPanelContent from '../../../src/components/workbench/WorkbenchPanelContent'
import {
  WORKBENCH_PANEL_DOCK,
  WORKBENCH_PANEL_FLOW,
  toTerminalWorkbenchPanelKey,
} from '../../../src/hooks/useWorkbenchLayout'
import type { ManualTerminal } from '../../../src/types'
import type { WorkbenchTerminalWindowItem } from '../../../src/hooks/useWorkbenchTerminalsViewModel'

const pipelineFlowPanelMock = vi.hoisted(() => vi.fn())
const pipelineDockMock = vi.hoisted(() => vi.fn())
const terminalPanelMock = vi.hoisted(() => vi.fn())

vi.mock('../../../src/components/PipelineFlowPanel', () => ({
  default: (props: unknown) => {
    pipelineFlowPanelMock(props)
    return <div data-testid="pipeline-flow-panel" />
  },
}))

vi.mock('../../../src/components/PipelineDock', () => ({
  default: (props: unknown) => {
    pipelineDockMock(props)
    return <div data-testid="pipeline-dock-panel" />
  },
}))

vi.mock('../../../src/components/TerminalPanel', () => ({
  default: (props: unknown) => {
    terminalPanelMock(props)
    return <div data-testid="terminal-panel" />
  },
}))

const manualTerminal: ManualTerminal = {
  id: 'manual_1',
  title: 'Manual #1',
  titleDraft: 'Manual #1',
  promptUser: 'operator',
  promptCwd: '~',
  status: 'running',
  exitCode: null,
  draftCommand: 'pwd',
  lines: [],
}

const runWindow: WorkbenchTerminalWindowItem = {
  windowId: 'run:run_1',
  kind: 'run',
  runSession: {
    id: 'run_1',
    stepId: 'step_1',
    title: 'Run #1',
    command: 'echo ok',
    status: 'success',
    exitCode: 0,
    lines: [],
  },
}

const manualWindow: WorkbenchTerminalWindowItem = {
  windowId: 'manual:manual_1',
  kind: 'manual',
  manualTerminal,
}

const createProps = () => ({
  panel: WORKBENCH_PANEL_FLOW,
  steps: [{ id: 'step_1', type: 'template' as const, label: 'Step 1', command: 'echo 1' }],
  packOptions: [{ id: 'core', name: 'Core' }],
  savedFlows: [{ id: 'flow_1', name: 'Main' }],
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
  terminalWindowMap: new Map<string, WorkbenchTerminalWindowItem>(),
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
})

describe('WorkbenchPanelContent', () => {
  beforeEach(() => {
    pipelineFlowPanelMock.mockClear()
    pipelineDockMock.mockClear()
    terminalPanelMock.mockClear()
  })

  it('renders flow panel and dock panel branches', () => {
    const props = createProps()
    const { rerender } = render(<WorkbenchPanelContent {...props} panel={WORKBENCH_PANEL_FLOW} />)
    expect(screen.getByTestId('pipeline-flow-panel')).toBeInTheDocument()
    expect(pipelineFlowPanelMock).toHaveBeenCalled()

    rerender(<WorkbenchPanelContent {...props} panel={WORKBENCH_PANEL_DOCK} />)
    expect(screen.getByTestId('pipeline-dock-panel')).toBeInTheDocument()
    expect(pipelineDockMock).toHaveBeenCalled()
  })

  it('renders fallback states for unknown/missing terminal panels', () => {
    const props = createProps()
    const { rerender } = render(<WorkbenchPanelContent {...props} panel="unknown" />)
    expect(screen.getByText('Unknown panel')).toBeInTheDocument()

    rerender(
      <WorkbenchPanelContent
        {...props}
        panel={toTerminalWorkbenchPanelKey('manual:does_not_exist')}
      />,
    )
    expect(screen.getByText('Terminal is no longer available.')).toBeInTheDocument()
  })

  it('renders pinned run terminal and unpins through control', () => {
    const props = createProps()
    props.terminalWindowMap = new Map([[runWindow.windowId, runWindow]])

    render(
      <WorkbenchPanelContent
        {...props}
        panel={toTerminalWorkbenchPanelKey(runWindow.windowId)}
      />,
    )

    expect(screen.getByTestId('terminal-panel')).toBeInTheDocument()
    const panelProps = terminalPanelMock.mock.calls[0]?.[0] as Record<string, unknown>
    expect(panelProps.kind).toBe('run')

    const controls = panelProps.controls as ReactElement
    render(controls)
    fireEvent.click(screen.getByTitle('Unpin from workflow'))
    expect(props.onTogglePinTerminalWindow).toHaveBeenCalledWith(runWindow.windowId)
  })

  it('renders pinned manual terminal and wires terminal actions', () => {
    const props = createProps()
    props.terminalWindowMap = new Map([[manualWindow.windowId, manualWindow]])
    props.editingPinnedTerminalTitleId = manualTerminal.id

    render(
      <WorkbenchPanelContent
        {...props}
        panel={toTerminalWorkbenchPanelKey(manualWindow.windowId)}
      />,
    )

    const panelProps = terminalPanelMock.mock.calls[0]?.[0] as Record<string, unknown>
    expect(panelProps.kind).toBe('manual')
    expect(panelProps.isEditingTitle).toBe(true)
    expect(panelProps.copyTailLineCount).toBe(20)
    expect(panelProps.isCopyTailRecentlyCopied).toBe(false)

    ;(panelProps.onUpdateTitleDraft as (title: string) => void)('New pinned title')
    ;(panelProps.onStartTitleEdit as () => void)()
    ;(panelProps.onCancelTitleEdit as () => void)()
    void (panelProps.onSaveTitleEdit as () => Promise<void> | void)()
    ;(panelProps.onUpdateCommand as (command: string) => void)('pwd')
    void (panelProps.onAutocompleteCommand as () => Promise<void> | void)()
    ;(panelProps.onNavigateHistory as (
      direction: 'up' | 'down',
      currentDraft: string,
    ) => void)('down', 'ls')
    void (panelProps.onRunCommand as () => Promise<void> | void)()
    void (panelProps.onClearTerminal as () => Promise<void> | void)()
    ;(panelProps.onUpdateCopyTailLineCount as (rawValue: string) => void)('55')
    void (panelProps.onCopyTail as () => Promise<void> | void)()

    expect(props.onUpdateManualTitle).toHaveBeenCalledWith(manualTerminal.id, 'New pinned title')
    expect(props.onStartPinnedTerminalTitleEdit).toHaveBeenCalledWith(manualTerminal)
    expect(props.onCancelPinnedTerminalTitleEdit).toHaveBeenCalledWith(manualTerminal)
    expect(props.onSavePinnedTerminalTitleEdit).toHaveBeenCalledWith(manualTerminal)
    expect(props.onUpdateManualCommand).toHaveBeenCalledWith(manualTerminal.id, 'pwd')
    expect(props.onAutocompleteManualCommand).toHaveBeenCalledWith(manualTerminal.id)
    expect(props.onNavigateManualHistory).toHaveBeenCalledWith(manualTerminal.id, 'down', 'ls')
    expect(props.onRunManualCommand).toHaveBeenCalledWith(manualTerminal.id)
    expect(props.onClearManualTerminal).toHaveBeenCalledWith(manualTerminal.id)
    expect(props.onUpdateCopyTailLineCount).toHaveBeenCalledWith(manualTerminal.id, '55')
    expect(props.onCopyManualTerminalTail).toHaveBeenCalledWith(manualTerminal.id)

    const controls = panelProps.controls as ReactElement
    render(controls)
    fireEvent.click(screen.getByTitle('Minimize to dock'))
    fireEvent.click(screen.getByTitle('Stop terminal'))
    fireEvent.click(screen.getByTitle('Close terminal'))

    expect(props.onMinimizePinnedTerminalWindow).toHaveBeenCalledWith(manualWindow.windowId)
    expect(props.onStopManualTerminal).toHaveBeenCalledWith(manualTerminal.id)
    expect(props.onRemoveManualTerminal).toHaveBeenCalledWith(manualTerminal.id)
  })

  it('shows unavailable text when terminal window item type is unsupported', () => {
    const props = createProps()
    props.terminalWindowMap = new Map([
      [
        'run:without_data',
        {
          windowId: 'run:without_data',
          kind: 'run',
          runSession: undefined,
        },
      ],
    ]) as unknown as Map<string, WorkbenchTerminalWindowItem>

    render(
      <WorkbenchPanelContent
        {...props}
        panel={toTerminalWorkbenchPanelKey('run:without_data')}
      />,
    )

    expect(screen.getByText('Terminal is unavailable.')).toBeInTheDocument()
  })
})
