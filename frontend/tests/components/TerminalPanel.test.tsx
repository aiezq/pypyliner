import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import TerminalPanel from '../../src/components/TerminalPanel'
import type { ManualTerminal, TerminalSession } from '../../src/types'

const createManualTerminal = (overrides: Partial<ManualTerminal> = {}): ManualTerminal => ({
  id: 'terminal_1',
  title: 'Terminal #1',
  titleDraft: 'Terminal #1',
  promptUser: 'operator',
  promptCwd: '~',
  status: 'running',
  exitCode: null,
  draftCommand: 'ls -la',
  lines: [],
  ...overrides,
})

const createRunSession = (
  overrides: Partial<TerminalSession> = {},
): TerminalSession => ({
  id: 'session_1',
  stepId: 'step_1',
  title: 'Run terminal #1',
  command: 'echo run',
  status: 'running',
  exitCode: null,
  lines: [
    {
      id: 'line_1',
      stream: 'out',
      text: 'line',
      createdAt: '2026-03-01T10:00:00Z',
    },
  ],
  ...overrides,
})

describe('TerminalPanel', () => {
  it('handles keyboard shortcuts and command execution for manual terminal', () => {
    const onRunCommand = vi.fn()
    const onAutocompleteCommand = vi.fn()
    const onNavigateHistory = vi.fn()
    const onClearTerminal = vi.fn()

    render(
      <TerminalPanel
        variant="floating"
        kind="manual"
        terminal={createManualTerminal()}
        isEditingTitle={false}
        controls={null}
        onUpdateTitleDraft={vi.fn()}
        onStartTitleEdit={vi.fn()}
        onCancelTitleEdit={vi.fn()}
        onSaveTitleEdit={vi.fn()}
        onUpdateCommand={vi.fn()}
        onAutocompleteCommand={onAutocompleteCommand}
        onNavigateHistory={onNavigateHistory}
        onRunCommand={onRunCommand}
        onClearTerminal={onClearTerminal}
        copyTailLineCount={20}
        onUpdateCopyTailLineCount={vi.fn()}
        onCopyTail={vi.fn()}
        isCopyTailRecentlyCopied={false}
      />,
    )

    const input = screen.getByPlaceholderText('Type command, e.g. ls -la /opt/app')
    fireEvent.keyDown(input, { key: 'Tab' })
    fireEvent.keyDown(input, { key: 'ArrowUp' })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onAutocompleteCommand).toHaveBeenCalledTimes(1)
    expect(onNavigateHistory).toHaveBeenCalledWith('up', 'ls -la')
    expect(onRunCommand).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByLabelText('Clear output'))
    expect(onClearTerminal).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByLabelText('Send command'))
    expect(onRunCommand).toHaveBeenCalledTimes(2)
  })

  it('does not run command on Enter when draft is empty', () => {
    const onRunCommand = vi.fn()

    render(
      <TerminalPanel
        variant="pinned"
        kind="manual"
        terminal={createManualTerminal({ draftCommand: '   ' })}
        isEditingTitle={false}
        controls={null}
        onUpdateTitleDraft={vi.fn()}
        onStartTitleEdit={vi.fn()}
        onCancelTitleEdit={vi.fn()}
        onSaveTitleEdit={vi.fn()}
        onUpdateCommand={vi.fn()}
        onAutocompleteCommand={vi.fn()}
        onNavigateHistory={vi.fn()}
        onRunCommand={onRunCommand}
        onClearTerminal={vi.fn()}
        copyTailLineCount={20}
        onUpdateCopyTailLineCount={vi.fn()}
        onCopyTail={vi.fn()}
        isCopyTailRecentlyCopied={false}
      />,
    )

    const input = screen.getByPlaceholderText('Type command, e.g. ls -la /opt/app')
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onRunCommand).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Send command')).toBeDisabled()
  })

  it('renders run terminal variant for floating and pinned modes', () => {
    const session = createRunSession({ exitCode: 0 })

    const { rerender } = render(
      <TerminalPanel
        variant="floating"
        kind="run"
        session={session}
        controls={<button type="button">X</button>}
        titleHint="run hint"
      />,
    )

    expect(screen.getByText('Run terminal #1')).toBeInTheDocument()
    expect(screen.getByText('run hint')).toBeInTheDocument()
    expect(screen.getByText('exit: 0')).toBeInTheDocument()
    expect(screen.getByText('echo run')).toBeInTheDocument()

    rerender(
      <TerminalPanel
        variant="pinned"
        kind="run"
        session={session}
        controls={<button type="button">Y</button>}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Run terminal #1' })).toBeInTheDocument()
  })

  it('supports floating title editing interactions and footer actions', () => {
    const onUpdateTitleDraft = vi.fn()
    const onStartTitleEdit = vi.fn()
    const onCancelTitleEdit = vi.fn()
    const onSaveTitleEdit = vi.fn()
    const onUpdateCommand = vi.fn()
    const onUpdateCopyTailLineCount = vi.fn()
    const onCopyTail = vi.fn()

    render(
      <TerminalPanel
        variant="floating"
        kind="manual"
        terminal={createManualTerminal({
          title: 'Floating terminal',
          titleDraft: 'Floating terminal',
          draftCommand: 'echo 1',
        })}
        isEditingTitle={false}
        controls={<button type="button">C</button>}
        titleHint="floating hint"
        onUpdateTitleDraft={onUpdateTitleDraft}
        onStartTitleEdit={onStartTitleEdit}
        onCancelTitleEdit={onCancelTitleEdit}
        onSaveTitleEdit={onSaveTitleEdit}
        onUpdateCommand={onUpdateCommand}
        onAutocompleteCommand={vi.fn()}
        onNavigateHistory={vi.fn()}
        onRunCommand={vi.fn()}
        onClearTerminal={vi.fn()}
        copyTailLineCount={10}
        onUpdateCopyTailLineCount={onUpdateCopyTailLineCount}
        onCopyTail={onCopyTail}
        isCopyTailRecentlyCopied
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Edit terminal name: Floating terminal' }))
    expect(onStartTitleEdit).toHaveBeenCalledTimes(1)
    expect(screen.getByText('floating hint')).toBeInTheDocument()

    fireEvent.change(
      screen.getByPlaceholderText('Type command, e.g. ls -la /opt/app'),
      { target: { value: 'echo 2' } },
    )
    expect(onUpdateCommand).toHaveBeenCalledWith('echo 2')

    fireEvent.change(screen.getByTitle('Number of lines to copy'), {
      target: { value: '25' },
    })
    expect(onUpdateCopyTailLineCount).toHaveBeenCalledWith('25')

    fireEvent.click(screen.getByRole('button', { name: 'Copied' }))
    expect(onCopyTail).toHaveBeenCalledTimes(1)
  })

  it('handles floating editing title save/cancel keyboard and save button state', () => {
    const onUpdateTitleDraft = vi.fn()
    const onCancelTitleEdit = vi.fn()
    const onSaveTitleEdit = vi.fn()

    const { rerender } = render(
      <TerminalPanel
        variant="floating"
        kind="manual"
        terminal={createManualTerminal({
          title: 'Terminal A',
          titleDraft: 'Terminal A',
        })}
        isEditingTitle
        controls={null}
        onUpdateTitleDraft={onUpdateTitleDraft}
        onStartTitleEdit={vi.fn()}
        onCancelTitleEdit={onCancelTitleEdit}
        onSaveTitleEdit={onSaveTitleEdit}
        onUpdateCommand={vi.fn()}
        onAutocompleteCommand={vi.fn()}
        onNavigateHistory={vi.fn()}
        onRunCommand={vi.fn()}
        onClearTerminal={vi.fn()}
        copyTailLineCount={20}
        onUpdateCopyTailLineCount={vi.fn()}
        onCopyTail={vi.fn()}
        isCopyTailRecentlyCopied={false}
      />,
    )

    const titleInput = screen.getByPlaceholderText('Terminal name')
    fireEvent.change(titleInput, { target: { value: 'Terminal B' } })
    expect(onUpdateTitleDraft).toHaveBeenCalledWith('Terminal B')

    fireEvent.keyDown(titleInput, { key: 'Escape' })
    expect(onCancelTitleEdit).toHaveBeenCalledTimes(1)

    fireEvent.keyDown(titleInput, { key: 'Enter' })
    expect(onSaveTitleEdit).toHaveBeenCalledTimes(1)

    const saveButton = screen.getByRole('button', { name: '✓' })
    expect(saveButton).toBeDisabled()

    rerender(
      <TerminalPanel
        variant="floating"
        kind="manual"
        terminal={createManualTerminal({
          title: 'Terminal A',
          titleDraft: 'Terminal B',
        })}
        isEditingTitle
        controls={null}
        onUpdateTitleDraft={onUpdateTitleDraft}
        onStartTitleEdit={vi.fn()}
        onCancelTitleEdit={onCancelTitleEdit}
        onSaveTitleEdit={onSaveTitleEdit}
        onUpdateCommand={vi.fn()}
        onAutocompleteCommand={vi.fn()}
        onNavigateHistory={vi.fn()}
        onRunCommand={vi.fn()}
        onClearTerminal={vi.fn()}
        copyTailLineCount={20}
        onUpdateCopyTailLineCount={vi.fn()}
        onCopyTail={vi.fn()}
        isCopyTailRecentlyCopied={false}
      />,
    )

    expect(screen.getByRole('button', { name: '✓' })).toBeEnabled()
  })

  it('handles pinned title editing and history navigation down', () => {
    const onNavigateHistory = vi.fn()
    const onSaveTitleEdit = vi.fn()
    const onCancelTitleEdit = vi.fn()

    render(
      <TerminalPanel
        variant="pinned"
        kind="manual"
        terminal={createManualTerminal({
          title: 'Pinned terminal',
          titleDraft: 'Pinned terminal',
          draftCommand: 'pwd',
        })}
        isEditingTitle
        controls={null}
        onUpdateTitleDraft={vi.fn()}
        onStartTitleEdit={vi.fn()}
        onCancelTitleEdit={onCancelTitleEdit}
        onSaveTitleEdit={onSaveTitleEdit}
        onUpdateCommand={vi.fn()}
        onAutocompleteCommand={vi.fn()}
        onNavigateHistory={onNavigateHistory}
        onRunCommand={vi.fn()}
        onClearTerminal={vi.fn()}
        copyTailLineCount={20}
        onUpdateCopyTailLineCount={vi.fn()}
        onCopyTail={vi.fn()}
        isCopyTailRecentlyCopied={false}
      />,
    )

    const titleInput = screen.getByPlaceholderText('Terminal name')
    fireEvent.keyDown(titleInput, { key: 'Enter' })
    fireEvent.keyDown(titleInput, { key: 'Escape' })
    expect(onSaveTitleEdit).toHaveBeenCalledTimes(1)
    expect(onCancelTitleEdit).toHaveBeenCalledTimes(1)

    const commandInput = screen.getByPlaceholderText('Type command, e.g. ls -la /opt/app')
    fireEvent.keyDown(commandInput, { key: 'ArrowDown' })
    expect(onNavigateHistory).toHaveBeenCalledWith('down', 'pwd')
  })

  it('ignores Enter while IME composing', () => {
    const onRunCommand = vi.fn()
    render(
      <TerminalPanel
        variant="floating"
        kind="manual"
        terminal={createManualTerminal({ draftCommand: 'echo composing' })}
        isEditingTitle={false}
        controls={null}
        onUpdateTitleDraft={vi.fn()}
        onStartTitleEdit={vi.fn()}
        onCancelTitleEdit={vi.fn()}
        onSaveTitleEdit={vi.fn()}
        onUpdateCommand={vi.fn()}
        onAutocompleteCommand={vi.fn()}
        onNavigateHistory={vi.fn()}
        onRunCommand={onRunCommand}
        onClearTerminal={vi.fn()}
        copyTailLineCount={20}
        onUpdateCopyTailLineCount={vi.fn()}
        onCopyTail={vi.fn()}
        isCopyTailRecentlyCopied={false}
      />,
    )

    const input = screen.getByPlaceholderText('Type command, e.g. ls -la /opt/app')
    const nativeEvent = new KeyboardEvent('keydown', { key: 'Enter' })
    Object.defineProperty(nativeEvent, 'isComposing', { value: true })
    fireEvent.keyDown(input, nativeEvent)

    expect(onRunCommand).not.toHaveBeenCalled()
  })

  it('does not propagate mouse down from floating title edit controls', () => {
    const onHeaderMouseDown = vi.fn()
    const onSaveTitleEdit = vi.fn()

    const { rerender } = render(
      <TerminalPanel
        variant="floating"
        kind="manual"
        terminal={createManualTerminal({
          title: 'Mouse terminal',
          titleDraft: 'Mouse terminal renamed',
        })}
        isEditingTitle
        controls={null}
        onHeaderMouseDown={onHeaderMouseDown}
        onUpdateTitleDraft={vi.fn()}
        onStartTitleEdit={vi.fn()}
        onCancelTitleEdit={vi.fn()}
        onSaveTitleEdit={onSaveTitleEdit}
        onUpdateCommand={vi.fn()}
        onAutocompleteCommand={vi.fn()}
        onNavigateHistory={vi.fn()}
        onRunCommand={vi.fn()}
        onClearTerminal={vi.fn()}
        copyTailLineCount={20}
        onUpdateCopyTailLineCount={vi.fn()}
        onCopyTail={vi.fn()}
        isCopyTailRecentlyCopied={false}
      />,
    )

    fireEvent.mouseDown(screen.getByPlaceholderText('Terminal name'))
    fireEvent.mouseDown(screen.getByRole('button', { name: '✓' }))
    expect(onHeaderMouseDown).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: '✓' }))
    expect(onSaveTitleEdit).toHaveBeenCalledTimes(1)

    rerender(
      <TerminalPanel
        variant="floating"
        kind="manual"
        terminal={createManualTerminal({
          title: 'Mouse terminal',
          titleDraft: 'Mouse terminal',
        })}
        isEditingTitle={false}
        controls={null}
        onHeaderMouseDown={onHeaderMouseDown}
        onUpdateTitleDraft={vi.fn()}
        onStartTitleEdit={vi.fn()}
        onCancelTitleEdit={vi.fn()}
        onSaveTitleEdit={vi.fn()}
        onUpdateCommand={vi.fn()}
        onAutocompleteCommand={vi.fn()}
        onNavigateHistory={vi.fn()}
        onRunCommand={vi.fn()}
        onClearTerminal={vi.fn()}
        copyTailLineCount={20}
        onUpdateCopyTailLineCount={vi.fn()}
        onCopyTail={vi.fn()}
        isCopyTailRecentlyCopied={false}
      />,
    )

    fireEvent.mouseDown(screen.getByRole('button', { name: 'Edit terminal name: Mouse terminal' }))
    expect(onHeaderMouseDown).not.toHaveBeenCalled()
  })

  it('updates pinned title draft input value on change', () => {
    const onUpdateTitleDraft = vi.fn()
    render(
      <TerminalPanel
        variant="pinned"
        kind="manual"
        terminal={createManualTerminal({
          title: 'Pinned change',
          titleDraft: 'Pinned change',
        })}
        isEditingTitle
        controls={null}
        onUpdateTitleDraft={onUpdateTitleDraft}
        onStartTitleEdit={vi.fn()}
        onCancelTitleEdit={vi.fn()}
        onSaveTitleEdit={vi.fn()}
        onUpdateCommand={vi.fn()}
        onAutocompleteCommand={vi.fn()}
        onNavigateHistory={vi.fn()}
        onRunCommand={vi.fn()}
        onClearTerminal={vi.fn()}
        copyTailLineCount={20}
        onUpdateCopyTailLineCount={vi.fn()}
        onCopyTail={vi.fn()}
        isCopyTailRecentlyCopied={false}
      />,
    )

    fireEvent.change(screen.getByPlaceholderText('Terminal name'), {
      target: { value: 'Pinned changed' },
    })
    expect(onUpdateTitleDraft).toHaveBeenCalledWith('Pinned changed')
  })
})
