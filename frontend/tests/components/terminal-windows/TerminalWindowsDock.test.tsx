import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import TerminalWindowsDock from '../../../src/components/terminal-windows/TerminalWindowsDock'
import type { TerminalWindowDescriptor } from '../../../src/hooks/useFloatingTerminalWindowsController'

describe('TerminalWindowsDock', () => {
  it('does not render when dock is empty', () => {
    const { container } = render(
      <TerminalWindowsDock windows={[]} onRestoreWindow={vi.fn()} />,
    )

    expect(container.firstChild).toBeNull()
  })

  it('renders minimized windows and restores selected window', () => {
    const onRestoreWindow = vi.fn()
    const windows: TerminalWindowDescriptor[] = [
      {
        windowId: 'manual:1',
        kind: 'manual',
        terminal: {
          id: '1',
          title: 'Manual #1',
          titleDraft: 'Manual #1',
          terminalType: 'local',
          promptUser: 'user',
          promptCwd: '~',
          isSequence: false,
          status: 'idle',
          exitCode: null,
          draftCommand: '',
          sshConnectionName: null,
          sshHost: null,
          sshUsername: null,
          lines: [],
        },
      },
    ]

    render(<TerminalWindowsDock windows={windows} onRestoreWindow={onRestoreWindow} />)

    expect(screen.getByLabelText('Minimized terminals dock')).toBeInTheDocument()
    expect(screen.getByText('Manual #1')).toBeInTheDocument()
    expect(screen.getByText('M')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Manual #1/i }))
    expect(onRestoreWindow).toHaveBeenCalledWith('manual:1')
  })
})
