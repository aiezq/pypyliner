import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import FloatingTerminalWindow from '../../../src/components/terminal-windows/FloatingTerminalWindow'
import type {
  ResizeDirection,
  TerminalWindowDescriptor,
  TerminalWindowFrame,
} from '../../../src/hooks/useFloatingTerminalWindowsController'
import { I18nProvider } from '../../../src/i18n/I18nProvider'

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
        terminalType: 'local',
        promptUser: 'operator',
        promptCwd: '~',
        isSequence: false,
        status: 'running',
        exitCode: null,
        draftCommand: 'pwd',
        sshConnectionName: null,
        sshHost: null,
        sshUsername: null,
        lines: [],
      },
    }

    render(
      <I18nProvider>
        <FloatingTerminalWindow
          {...props}
          editingManualTitleId="terminal_1"
          windowItem={windowItem}
        />
      </I18nProvider>,
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

      ; (panelProps.onUpdateTitleDraft as (value: string) => void)('New title')
      ; (panelProps.onStartTitleEdit as () => void)()
      ; (panelProps.onCancelTitleEdit as () => void)()
      ; (panelProps.onSaveTitleEdit as () => void)()

    expect(props.onUpdateManualTitle).toHaveBeenCalledWith('terminal_1', 'New title')
    expect(props.onStartManualTitleEdit).toHaveBeenCalledWith('terminal_1', 'Manual #1')
    expect(props.onCancelManualTitleEdit).toHaveBeenCalledWith('terminal_1', 'Manual #1')
    expect(props.onSaveManualTitleEdit).toHaveBeenCalledWith('terminal_1')

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
        terminalType: 'local',
        promptUser: 'operator',
        promptCwd: '~',
        isSequence: false,
        status: 'success',
        exitCode: 0,
        draftCommand: '',
        sshConnectionName: null,
        sshHost: null,
        sshUsername: null,
        lines: [],
      },
    }

    render(
      <I18nProvider>
        <FloatingTerminalWindow {...props} windowItem={windowItem} />
      </I18nProvider>,
    )

    expect(screen.getByTitle('Stop terminal')).toBeDisabled()
  })
})
