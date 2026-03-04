import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import TerminalWindowsLayer from '../../src/components/TerminalWindowsLayer'

const hookMock = vi.hoisted(() => vi.fn())

vi.mock('../../src/hooks/useFloatingTerminalWindowsController', async () => {
  const actual = await vi.importActual<
    typeof import('../../src/hooks/useFloatingTerminalWindowsController')
  >('../../src/hooks/useFloatingTerminalWindowsController')
  return {
    ...actual,
    useFloatingTerminalWindowsController: hookMock,
  }
})

vi.mock('../../src/components/terminal-windows/FloatingTerminalWindow', () => ({
  default: ({
    windowItem,
    onBringToFront,
    onBeginDrag,
    onBeginResize,
    onTogglePin,
    onMinimize,
    onStartManualTitleEdit,
    onCancelManualTitleEdit,
    onSaveManualTitleEdit,
  }: {
    windowItem: { windowId: string }
    onBringToFront: () => void
    onBeginDrag: (event: unknown) => void
    onBeginResize: (direction: 'n', event: unknown) => void
    onTogglePin: () => void
    onMinimize: () => void
    onStartManualTitleEdit: (terminalId: string, currentTitle: string) => void
    onCancelManualTitleEdit: (terminalId: string, originalTitle: string) => void
    onSaveManualTitleEdit: (terminalId: string) => void
  }) => (
    <div data-testid={`floating-window-${windowItem.windowId}`}>
      <button type="button" onClick={onBringToFront}>
        bring
      </button>
      <button
        type="button"
        onClick={() => onBeginDrag({})}
      >
        drag
      </button>
      <button
        type="button"
        onClick={() => onBeginResize('n', {})}
      >
        resize
      </button>
      <button type="button" onClick={onTogglePin}>
        pin
      </button>
      <button type="button" onClick={onMinimize}>
        minimize
      </button>
      <button type="button" onClick={() => onStartManualTitleEdit('t1', 'Title')}>
        start-title
      </button>
      <button type="button" onClick={() => onCancelManualTitleEdit('t1', 'Title')}>
        cancel-title
      </button>
      <button type="button" onClick={() => onSaveManualTitleEdit('t1')}>
        save-title
      </button>
    </div>
  ),
}))

vi.mock('../../src/components/terminal-windows/TerminalWindowsDock', () => ({
  default: ({
    windows,
    onRestoreWindow,
  }: {
    windows: Array<{ windowId: string }>
    onRestoreWindow: (windowId: string) => void
  }) => (
    <div data-testid="terminal-dock">
      {windows.map((item) => (
        <button key={item.windowId} type="button" onClick={() => onRestoreWindow(item.windowId)}>
          {item.windowId}
        </button>
      ))}
    </div>
  ),
}))

const baseProps = () => ({
  runSessions: [],
  manualTerminals: [],
  pinnedWindowIds: [],
  requestedMinimizedWindowIds: [],
  onConsumeRequestedMinimizeWindow: vi.fn(),
  onTogglePinWindow: vi.fn(),
  getCopyTailLineCount: vi.fn(() => 20),
  isCopyTailRecentlyCopied: vi.fn(() => false),
  onUpdateCopyTailLineCount: vi.fn(),
  onCopyManualTerminalTail: vi.fn(),
  onUpdateManualTitle: vi.fn(),
  onRenameManualTerminal: vi.fn(),
  onUpdateManualCommand: vi.fn(),
  onNavigateManualHistory: vi.fn(),
  onRunManualCommand: vi.fn(),
  onAutocompleteManualCommand: vi.fn(),
  onStopManualTerminal: vi.fn(),
  onClearManualTerminal: vi.fn(),
  onRemoveManualTerminal: vi.fn(),
})

describe('TerminalWindowsLayer', () => {
  beforeEach(() => {
    hookMock.mockReset()
  })

  it('returns null when no windows are available', () => {
    hookMock.mockReturnValue({
      windows: [],
      visibleWindows: [],
      minimizedWindowsList: [],
      editingManualTitleId: null,
      bringToFront: vi.fn(),
      beginWindowDrag: vi.fn(),
      beginWindowResize: vi.fn(),
      minimizeWindow: vi.fn(),
      restoreWindow: vi.fn(),
      startManualTitleEdit: vi.fn(),
      cancelManualTitleEdit: vi.fn(),
      saveManualTitleEdit: vi.fn(),
      getWindowFrame: vi.fn(),
      getWindowZIndex: vi.fn(),
    })

    const { container } = render(<TerminalWindowsLayer {...baseProps()} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders visible floating windows and dock restore actions', () => {
    const bringToFront = vi.fn()
    const minimizeWindow = vi.fn()
    const restoreWindow = vi.fn()
    const beginWindowDrag = vi.fn()
    const beginWindowResize = vi.fn()
    const startManualTitleEdit = vi.fn()
    const cancelManualTitleEdit = vi.fn()
    const saveManualTitleEdit = vi.fn()
    hookMock.mockReturnValue({
      windows: [{ windowId: 'run:1' }],
      visibleWindows: [{ windowId: 'run:1' }],
      minimizedWindowsList: [{ windowId: 'manual:1' }],
      editingManualTitleId: null,
      bringToFront,
      beginWindowDrag,
      beginWindowResize,
      minimizeWindow,
      restoreWindow,
      startManualTitleEdit,
      cancelManualTitleEdit,
      saveManualTitleEdit,
      getWindowFrame: vi.fn(() => ({ x: 0, y: 0, width: 100, height: 100 })),
      getWindowZIndex: vi.fn(() => 5),
    })

    const props = baseProps()
    render(<TerminalWindowsLayer {...props} />)

    expect(screen.getByTestId('floating-window-run:1')).toBeInTheDocument()
    fireEvent.click(screen.getByText('bring'))
    fireEvent.click(screen.getByText('drag'))
    fireEvent.click(screen.getByText('resize'))
    fireEvent.click(screen.getByText('pin'))
    fireEvent.click(screen.getByText('minimize'))
    fireEvent.click(screen.getByText('start-title'))
    fireEvent.click(screen.getByText('cancel-title'))
    fireEvent.click(screen.getByText('save-title'))
    expect(bringToFront).toHaveBeenCalledWith('run:1')
    expect(beginWindowDrag).toHaveBeenCalledWith('run:1', expect.anything())
    expect(beginWindowResize).toHaveBeenCalledWith('run:1', 'n', expect.anything())
    expect(props.onTogglePinWindow).toHaveBeenCalledWith('run:1')
    expect(minimizeWindow).toHaveBeenCalledWith('run:1')
    expect(startManualTitleEdit).toHaveBeenCalledWith('t1', 'Title')
    expect(cancelManualTitleEdit).toHaveBeenCalledWith('t1', 'Title')
    expect(saveManualTitleEdit).toHaveBeenCalledWith('t1')

    fireEvent.click(screen.getByRole('button', { name: 'manual:1' }))
    expect(restoreWindow).toHaveBeenCalledWith('manual:1')
  })
})
