import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import PipelineFlowSettingsModal from '../../src/components/PipelineFlowSettingsModal'
import type { BackendPipelineFlow } from '../../src/types'

const createFlow = (overrides: Partial<BackendPipelineFlow> = {}): BackendPipelineFlow => ({
  id: 'flow_main',
  flow_name: 'Main workflow',
  created_at: '2026-03-01T10:00:00Z',
  updated_at: '2026-03-01T12:00:00Z',
  file_name: 'main_workflow.json',
  steps: [{ type: 'template', label: 'Step 1', command: 'echo 1' }],
  ...overrides,
})

const createProps = (flows: BackendPipelineFlow[]) => ({
  isOpen: true,
  flows,
  selectedFlowId: flows[0]?.id ?? null,
  isMutating: false,
  onClose: vi.fn(),
  onSwitchFlow: vi.fn(),
  onRenameFlow: vi.fn(async () => {}),
  onDeleteFlow: vi.fn(async () => {}),
})

describe('PipelineFlowSettingsModal', () => {
  it('renames workflow inline and saves by Enter', async () => {
    const flow = createFlow()
    const props = createProps([flow])

    render(<PipelineFlowSettingsModal {...props} />)

    fireEvent.click(
      screen.getByRole('button', { name: `Edit workflow name: ${flow.flow_name}` }),
    )
    const input = screen.getByDisplayValue(flow.flow_name)
    fireEvent.change(input, { target: { value: 'Renamed workflow' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => {
      expect(props.onRenameFlow).toHaveBeenCalledWith(flow.id, 'Renamed workflow')
    })
  })

  it('switches workflow and deletes after confirmation', async () => {
    const flow = createFlow({ id: 'flow_ops', flow_name: 'Ops workflow' })
    const props = createProps([flow])
    const confirmMock = vi.spyOn(window, 'confirm').mockReturnValue(true)

    render(<PipelineFlowSettingsModal {...props} selectedFlowId={null} />)

    fireEvent.click(screen.getByRole('button', { name: 'Open' }))
    expect(props.onSwitchFlow).toHaveBeenCalledWith(flow.id)

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await waitFor(() => {
      expect(props.onDeleteFlow).toHaveBeenCalledWith(flow.id)
    })

    confirmMock.mockRestore()
  })

  it('does not render when modal is closed', () => {
    const flow = createFlow()
    const props = createProps([flow])

    const { queryByRole } = render(
      <PipelineFlowSettingsModal {...props} isOpen={false} />,
    )

    expect(queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('shows empty-state when there are no saved flows', () => {
    const props = createProps([])
    render(<PipelineFlowSettingsModal {...props} />)

    expect(screen.getByText('No saved workflows yet.')).toBeInTheDocument()
  })

  it('validates empty rename value and handles escape cancel', async () => {
    const flow = createFlow()
    const props = createProps([flow])
    render(<PipelineFlowSettingsModal {...props} />)

    fireEvent.click(
      screen.getByRole('button', { name: `Edit workflow name: ${flow.flow_name}` }),
    )

    const input = screen.getByDisplayValue(flow.flow_name)
    fireEvent.change(input, { target: { value: '   ' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(await screen.findByText('Workflow name cannot be empty')).toBeInTheDocument()

    fireEvent.keyDown(input, { key: 'Escape' })
    expect(screen.queryByDisplayValue(flow.flow_name)).not.toBeInTheDocument()
  })

  it('does not call rename api when name is unchanged', () => {
    const flow = createFlow()
    const props = createProps([flow])
    render(<PipelineFlowSettingsModal {...props} />)

    fireEvent.click(
      screen.getByRole('button', { name: `Edit workflow name: ${flow.flow_name}` }),
    )
    fireEvent.keyDown(screen.getByDisplayValue(flow.flow_name), { key: 'Enter' })

    expect(props.onRenameFlow).not.toHaveBeenCalled()
  })

  it('shows fallback rename error when onRenameFlow throws non-Error', async () => {
    const flow = createFlow()
    const props = createProps([flow])
    props.onRenameFlow = vi.fn(async () => {
      throw 'rename failed'
    })
    render(<PipelineFlowSettingsModal {...props} />)

    fireEvent.click(
      screen.getByRole('button', { name: `Edit workflow name: ${flow.flow_name}` }),
    )
    fireEvent.change(screen.getByDisplayValue(flow.flow_name), {
      target: { value: 'Renamed' },
    })
    fireEvent.click(screen.getByRole('button', { name: '✓' }))

    expect(await screen.findByText('Failed to rename workflow')).toBeInTheDocument()
  })

  it('does not delete when confirmation is rejected', async () => {
    const flow = createFlow({ id: 'flow_decline', flow_name: 'Decline flow' })
    const props = createProps([flow])
    const confirmMock = vi.spyOn(window, 'confirm').mockReturnValue(false)

    render(<PipelineFlowSettingsModal {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    await waitFor(() => {
      expect(props.onDeleteFlow).not.toHaveBeenCalled()
    })
    confirmMock.mockRestore()
  })

  it('handles backdrop close and blocks close while mutating', () => {
    const flow = createFlow()
    const props = createProps([flow])
    const { container, rerender } = render(<PipelineFlowSettingsModal {...props} />)

    const backdrop = container.querySelector('.modalBackdrop')
    if (backdrop) {
      fireEvent.click(backdrop)
    }
    expect(props.onClose).toHaveBeenCalledTimes(1)

    rerender(<PipelineFlowSettingsModal {...props} isMutating />)
    const mutatingBackdrop = container.querySelector('.modalBackdrop')
    if (mutatingBackdrop) {
      fireEvent.click(mutatingBackdrop)
    }
    expect(props.onClose).toHaveBeenCalledTimes(1)
  })

  it('shows fallback delete error when onDeleteFlow throws non-Error', async () => {
    const flow = createFlow({ id: 'flow_delete_error', flow_name: 'Delete flow' })
    const props = createProps([flow])
    props.onDeleteFlow = vi.fn(async () => {
      throw 'raw delete error'
    })
    const confirmMock = vi.spyOn(window, 'confirm').mockReturnValue(true)

    render(<PipelineFlowSettingsModal {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    expect(await screen.findByText('Failed to delete workflow')).toBeInTheDocument()
    confirmMock.mockRestore()
  })

  it('uses Error.message when rename fails with Error', async () => {
    const flow = createFlow({ id: 'flow_rename_err' })
    const props = createProps([flow])
    props.onRenameFlow = vi.fn(async () => {
      throw new Error('Rename failed with explicit error')
    })

    render(<PipelineFlowSettingsModal {...props} />)
    fireEvent.click(
      screen.getByRole('button', { name: `Edit workflow name: ${flow.flow_name}` }),
    )
    fireEvent.change(screen.getByDisplayValue(flow.flow_name), {
      target: { value: 'Renamed value' },
    })
    fireEvent.click(screen.getByRole('button', { name: '✓' }))

    expect(
      await screen.findByText('Rename failed with explicit error'),
    ).toBeInTheDocument()
  })

  it('uses Error.message when delete fails with Error', async () => {
    const flow = createFlow({ id: 'flow_delete_err', flow_name: 'Delete error flow' })
    const props = createProps([flow])
    props.onDeleteFlow = vi.fn(async () => {
      throw new Error('Delete failed with explicit error')
    })
    const confirmMock = vi.spyOn(window, 'confirm').mockReturnValue(true)

    render(<PipelineFlowSettingsModal {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    expect(
      await screen.findByText('Delete failed with explicit error'),
    ).toBeInTheDocument()
    confirmMock.mockRestore()
  })

  it('blocks delete action when modal is mutating', async () => {
    const flow = createFlow({ id: 'flow_mutating' })
    const props = createProps([flow])
    const confirmMock = vi.spyOn(window, 'confirm').mockReturnValue(true)

    render(<PipelineFlowSettingsModal {...props} isMutating />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    await waitFor(() => {
      expect(props.onDeleteFlow).not.toHaveBeenCalled()
      expect(confirmMock).not.toHaveBeenCalled()
    })
    confirmMock.mockRestore()
  })
})
