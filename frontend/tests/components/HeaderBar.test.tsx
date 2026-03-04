import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import HeaderBar from '../../src/components/HeaderBar'

describe('HeaderBar', () => {
  it('renders counters and actions for connected state', () => {
    const onCreateManualTerminal = vi.fn()
    const onOpenImportModal = vi.fn()
    const onOpenFlowSettingsModal = vi.fn()

    render(
      <HeaderBar
        isSocketConnected
        terminalInstancesCount={4}
        onCreateManualTerminal={onCreateManualTerminal}
        onOpenImportModal={onOpenImportModal}
        onOpenFlowSettingsModal={onOpenFlowSettingsModal}
      />,
    )

    expect(screen.getByText('Terminals 4')).toBeInTheDocument()
    expect(screen.getByText('API connected')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'New terminal' }))
    fireEvent.click(screen.getByRole('button', { name: 'Import JSON DLC' }))
    fireEvent.click(screen.getByRole('button', { name: 'Workflow settings' }))

    expect(onCreateManualTerminal).toHaveBeenCalledTimes(1)
    expect(onOpenImportModal).toHaveBeenCalledTimes(1)
    expect(onOpenFlowSettingsModal).toHaveBeenCalledTimes(1)
  })

  it('shows reconnecting badge when socket is disconnected', () => {
    render(
      <HeaderBar
        isSocketConnected={false}
        terminalInstancesCount={1}
        onCreateManualTerminal={vi.fn()}
        onOpenImportModal={vi.fn()}
        onOpenFlowSettingsModal={vi.fn()}
      />,
    )

    expect(screen.getByText('API reconnecting')).toBeInTheDocument()
  })
})
