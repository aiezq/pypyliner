import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import FloatingTerminalWindow from '../../../src/components/terminal-windows/FloatingTerminalWindow'
import type {
  ResizeDirection,
  TerminalWindowDescriptor,
  TerminalWindowFrame,
} from '../../../src/hooks/useFloatingTerminalWindowsController'

const terminalPanelMock = vi.hoisted(() => vi.fn())

vi.mock('../../../src/components/TerminalPanel', () => ({
  default: (props: { controls?: ReactNode }) => {
    terminalPanelMock(props)
    return <div data-testid="terminal-panel">{props.controls}</div>
  },
}))

const baseFrame: TerminalWindowFrame = {
  x: 10,
  y: 20,
  width: 640,
  height: 320,
}

const baseProps = () => ({
  frame: baseFrame,
  zIndex: 10,
  editingManualTitleId: null,
  onBringToFront: vi.fn(),
  onBeginDrag: vi.fn(),
  onBeginResize: vi.fn<(direction: ResizeDirection) => void>(),
  onMinimize: vi.fn(),
  getCopyTailLineCount: vi.fn(() => 20),
  isCopyTailRecentlyCopied: vi.fn(() => false),
  onUpdateCopyTailLineCount: vi.fn(),
  onCopyManualTerminalTail: vi.fn(),
  onUpdateManualTitle: vi.fn(),
  onStartManualTitleEdit: vi.fn(),
  onCancelManualTitleEdit: vi.fn(),
  onSaveManualTitleEdit: vi.fn(),
  onUpdateManualCommand: vi.fn(),
  onNavigateManualHistory: vi.fn(),
  onRunManualCommand: vi.fn(),
  onAutocompleteManualCommand: vi.fn(),
  onStopManualTerminal: vi.fn(),
  onClearManualTerminal: vi.fn(),
  onRemoveManualTerminal: vi.fn(),
})

describe('FloatingTerminalWindow', () => {
  beforeEach(() => {
    terminalPanelMock.mockClear()
  })



  it('renders manual window and forwards terminal-specific actions', () => {
    const props = baseProps()
    const windowItem: TerminalWindowDescriptor = {
      windowId: 'manual:1',
      kind: 'manual',
      terminal: {
        id: 'terminal_1',
        title: 'Manual #1',
        titleDraft: 'Manual #1',
        promptUser: 'operator',
        promptCwd: '~',
        isSequence: false,
        status: 'running',
        exitCode: null,
        draftCommand: 'pwd',
        lines: [],
      },
    }

    render(
      <FloatingTerminalWindow
        {...props}
        editingManualTitleId="terminal_1"
        windowItem={windowItem}
      />,
    )

    fireEvent.click(screen.getByTitle('Stop terminal'))
    fireEvent.click(screen.getByTitle('Close terminal'))
    fireEvent.mouseDown(screen.getByTitle('Minimize'))
    fireEvent.mouseDown(screen.getByTitle('Stop terminal'))
    fireEvent.mouseDown(screen.getByTitle('Close terminal'))

    expect(props.onStopManualTerminal).toHaveBeenCalledWith('terminal_1')
    expect(props.onRemoveManualTerminal).toHaveBeenCalledWith('terminal_1')

    const panelProps = terminalPanelMock.mock.calls[0]?.[0] as Record<string, unknown>
    expect(panelProps.kind).toBe('manual')
    expect(panelProps.isEditingTitle).toBe(true)
    expect(typeof panelProps.onUpdateTitleDraft).toBe('function')
    expect(panelProps.copyTailLineCount).toBe(20)
    expect(panelProps.isCopyTailRecentlyCopied).toBe(false)

      ; (panelProps.onUpdateTitleDraft as (value: string) => void)('New title')
      ; (panelProps.onStartTitleEdit as () => void)()
      ; (panelProps.onCancelTitleEdit as () => void)()
      ; (panelProps.onSaveTitleEdit as () => void)()
      ; (panelProps.onUpdateCommand as (value: string) => void)('ls')
      ; (panelProps.onAutocompleteCommand as () => void)()
      ; (panelProps.onNavigateHistory as (dir: 'up' | 'down', draft: string) => void)(
        'up',
        '',
      )
      ; (panelProps.onRunCommand as () => void)()
      ; (panelProps.onClearTerminal as () => void)()
      ; (panelProps.onUpdateCopyTailLineCount as (value: string) => void)('25')
      ; (panelProps.onCopyTail as () => void)()

    expect(props.onUpdateManualTitle).toHaveBeenCalledWith('terminal_1', 'New title')
    expect(props.onStartManualTitleEdit).toHaveBeenCalledWith('terminal_1', 'Manual #1')
    expect(props.onCancelManualTitleEdit).toHaveBeenCalledWith('terminal_1', 'Manual #1')
    expect(props.onSaveManualTitleEdit).toHaveBeenCalledWith('terminal_1')
    expect(props.onUpdateManualCommand).toHaveBeenCalledWith('terminal_1', 'ls')
    expect(props.onAutocompleteManualCommand).toHaveBeenCalledWith('terminal_1')
    expect(props.onNavigateManualHistory).toHaveBeenCalledWith('terminal_1', 'up', '')
    expect(props.onRunManualCommand).toHaveBeenCalledWith('terminal_1')
    expect(props.onClearManualTerminal).toHaveBeenCalledWith('terminal_1')
    expect(props.onUpdateCopyTailLineCount).toHaveBeenCalledWith('terminal_1', '25')
    expect(props.onCopyManualTerminalTail).toHaveBeenCalledWith('terminal_1')

    const resizeHandles = document.querySelectorAll('.resizeHandle')
    fireEvent.mouseDown(resizeHandles[resizeHandles.length - 1] as Element)
    expect(props.onBeginResize).toHaveBeenCalled()
  })

  it('disables stop button when manual terminal is not running', () => {
    const props = baseProps()
    const windowItem: TerminalWindowDescriptor = {
      windowId: 'manual:2',
      kind: 'manual',
      terminal: {
        id: 'terminal_2',
        title: 'Manual #2',
        titleDraft: 'Manual #2',
        promptUser: 'operator',
        promptCwd: '~',
        isSequence: false,
        status: 'success',
        exitCode: 0,
        draftCommand: '',
        lines: [],
      },
    }

    render(<FloatingTerminalWindow {...props} windowItem={windowItem} />)

    expect(screen.getByTitle('Stop terminal')).toBeDisabled()
  })
})
