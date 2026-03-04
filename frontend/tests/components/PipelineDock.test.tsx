import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import PipelineDock from '../../src/components/PipelineDock'
import type { CommandTemplate } from '../../src/types'

const createTemplate = (overrides: Partial<CommandTemplate> = {}): CommandTemplate => ({
  id: 'core:list_dir',
  name: 'List directory',
  command: 'ls -la',
  description: 'List files in current directory',
  ...overrides,
})

const createProps = (templates: CommandTemplate[]) => ({
  pipelineName: 'Main flow',
  stepsCount: 3,
  templates,
  packNamesById: {
    core: 'Core Pack',
    flow_drafts: 'Flow Drafts',
    ops: 'Ops Pack',
  },
  packsCount: 3,
  isReloadingTemplates: false,
  onPipelineNameChange: vi.fn(),
  onAddStepFromTemplate: vi.fn(),
  onUpdateTemplate: vi.fn(async () => {}),
  onReloadTemplates: vi.fn(async () => {}),
  onMoveTemplateToPack: vi.fn(async () => {}),
  onDeleteTemplate: vi.fn(async () => {}),
})

describe('PipelineDock', () => {
  it('splits templates by draft/prepared and forwards add-step action', () => {
    const draft = createTemplate({
      id: 'flow_drafts:tmp_1',
      name: 'Draft command',
      command: 'echo draft',
    })
    const prepared = createTemplate({
      id: 'core:ls',
      name: 'List directory',
    })
    const props = createProps([draft, prepared])

    render(<PipelineDock {...props} />)

    expect(screen.getByText('Flow drafts (1)')).toBeInTheDocument()
    expect(screen.getByText('Prepared commands (1)')).toBeInTheDocument()

    fireEvent.click(screen.getAllByRole('button', { name: 'Add step' })[1])
    expect(props.onAddStepFromTemplate).toHaveBeenCalledWith(prepared)
  })

  it('updates template name inline on Enter', async () => {
    const template = createTemplate()
    const props = createProps([template])

    render(<PipelineDock {...props} />)

    fireEvent.click(
      screen.getByRole('button', { name: `Edit template name: ${template.name}` }),
    )

    const editInput = screen.getByDisplayValue(template.name)
    fireEvent.change(editInput, { target: { value: 'List all files' } })
    fireEvent.keyDown(editInput, { key: 'Enter' })

    await waitFor(() => {
      expect(props.onUpdateTemplate).toHaveBeenCalledWith(template.id, {
        name: 'List all files',
      })
    })
  })

  it('moves template to another pack and allows deleting template', async () => {
    const template = createTemplate({ id: 'ops:cleanup', name: 'Cleanup' })
    const props = createProps([template])

    render(<PipelineDock {...props} />)

    fireEvent.click(screen.getByRole('button', { name: '↔' }))
    fireEvent.click(screen.getByRole('button', { name: 'Core Pack' }))

    await waitFor(() => {
      expect(props.onMoveTemplateToPack).toHaveBeenCalledWith(template.id, 'core')
    })

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    await waitFor(() => {
      expect(props.onDeleteTemplate).toHaveBeenCalledWith(template.id)
    })
  })

  it('updates pipeline name and reloads packs', async () => {
    const props = createProps([createTemplate()])
    render(<PipelineDock {...props} />)

    fireEvent.change(screen.getByPlaceholderText('Pipeline name'), {
      target: { value: 'Renamed pipeline' },
    })
    expect(props.onPipelineNameChange).toHaveBeenCalledWith('Renamed pipeline')

    fireEvent.click(screen.getByRole('button', { name: 'Reload packs' }))
    await waitFor(() => {
      expect(props.onReloadTemplates).toHaveBeenCalledTimes(1)
    })
  })

  it('edits template command field and saves with check button', async () => {
    const template = createTemplate({ id: 'core:edit_command', name: 'Edit command' })
    const props = createProps([template])
    render(<PipelineDock {...props} />)

    fireEvent.click(
      screen.getByRole('button', { name: `Edit template command: ${template.name}` }),
    )

    const commandInput = screen.getByDisplayValue('ls -la')
    fireEvent.change(commandInput, { target: { value: 'pwd' } })
    fireEvent.click(screen.getByRole('button', { name: '✓' }))

    await waitFor(() => {
      expect(props.onUpdateTemplate).toHaveBeenCalledWith(template.id, {
        command: 'pwd',
      })
    })
  })

  it('shows validation error for empty edited template value', async () => {
    const template = createTemplate({ id: 'core:empty', name: 'Empty value' })
    const props = createProps([template])
    render(<PipelineDock {...props} />)

    fireEvent.click(
      screen.getByRole('button', { name: `Edit template name: ${template.name}` }),
    )
    const input = screen.getByDisplayValue(template.name)
    fireEvent.change(input, { target: { value: '   ' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(await screen.findByText('Value cannot be empty')).toBeInTheDocument()
    expect(props.onUpdateTemplate).not.toHaveBeenCalled()
  })

  it('handles fallback errors for update/move/delete operations', async () => {
    const template = createTemplate({ id: 'ops:error_case', name: 'Error case' })
    const props = createProps([template])
    props.onUpdateTemplate = vi.fn(async () => {
      throw 'raw update error'
    })
    props.onMoveTemplateToPack = vi.fn(async () => {
      throw 'raw move error'
    })
    props.onDeleteTemplate = vi.fn(async () => {
      throw 'raw delete error'
    })

    render(<PipelineDock {...props} />)

    fireEvent.click(
      screen.getByRole('button', { name: `Edit template name: ${template.name}` }),
    )
    fireEvent.change(screen.getByDisplayValue(template.name), {
      target: { value: 'Any name' },
    })
    fireEvent.click(screen.getByRole('button', { name: '✓' }))
    expect(await screen.findByText('Failed to save template')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '↔' }))
    fireEvent.change(screen.getByPlaceholderText('target_pack_id'), {
      target: { value: '   ' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Move' }))
    expect(await screen.findByText('Target pack id cannot be empty')).toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText('target_pack_id'), {
      target: { value: 'new_pack' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Move' }))
    expect(await screen.findByText('Failed to move template')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(await screen.findByText('Failed to delete template')).toBeInTheDocument()
  })

  it('supports closing move panel by escape and shows unknown pack fallback', () => {
    const template = createTemplate({
      id: 'invalid_template_id',
      name: 'No pack prefix',
    })
    const props = createProps([template])
    render(<PipelineDock {...props} />)

    expect(screen.getByText('Unknown pack')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '↔' }))
    const moveInput = screen.getByPlaceholderText('target_pack_id')
    fireEvent.keyDown(moveInput, { key: 'Escape' })

    expect(screen.queryByPlaceholderText('target_pack_id')).not.toBeInTheDocument()
  })

  it('handles Error.message for update/move/delete operations', async () => {
    const template = createTemplate({ id: 'ops:error_msg_case', name: 'Error message case' })
    const props = createProps([template])
    props.onUpdateTemplate = vi.fn(async () => {
      throw new Error('Update failed with Error')
    })
    props.onMoveTemplateToPack = vi.fn(async () => {
      throw new Error('Move failed with Error')
    })
    props.onDeleteTemplate = vi.fn(async () => {
      throw new Error('Delete failed with Error')
    })

    render(<PipelineDock {...props} />)

    fireEvent.click(
      screen.getByRole('button', { name: `Edit template name: ${template.name}` }),
    )
    fireEvent.change(screen.getByDisplayValue(template.name), {
      target: { value: 'Changed' },
    })
    fireEvent.keyDown(screen.getByDisplayValue('Changed'), { key: 'Enter' })
    expect(await screen.findByText('Update failed with Error')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '↔' }))
    fireEvent.change(screen.getByPlaceholderText('target_pack_id'), {
      target: { value: 'next_pack' },
    })
    fireEvent.keyDown(screen.getByPlaceholderText('target_pack_id'), { key: 'Enter' })
    expect(await screen.findByText('Move failed with Error')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(await screen.findByText('Delete failed with Error')).toBeInTheDocument()
  })

  it('cancels editing by Escape and closes edit after deleting edited template', async () => {
    const template = createTemplate({ id: 'ops:cancel_delete', name: 'Cancel delete' })
    const props = createProps([template])
    render(<PipelineDock {...props} />)

    fireEvent.click(
      screen.getByRole('button', { name: `Edit template name: ${template.name}` }),
    )
    const input = screen.getByDisplayValue(template.name)
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(screen.queryByDisplayValue(template.name)).not.toBeInTheDocument()

    fireEvent.click(
      screen.getByRole('button', { name: `Edit template name: ${template.name}` }),
    )
    expect(screen.getByDisplayValue(template.name)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    await waitFor(() => {
      expect(props.onDeleteTemplate).toHaveBeenCalledWith(template.id)
    })
    expect(screen.queryByDisplayValue(template.name)).not.toBeInTheDocument()
  })

  it('prevents concurrent move and delete actions while one operation is in progress', async () => {
    const resolveMove: Array<() => void> = []
    const resolveDelete: Array<() => void> = []
    const templates = [
      createTemplate({ id: 'ops:first', name: 'First' }),
      createTemplate({ id: 'ops:second', name: 'Second' }),
    ]
    const props = createProps(templates)
    props.onMoveTemplateToPack = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveMove.push(resolve)
        }),
    )
    props.onDeleteTemplate = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveDelete.push(resolve)
        }),
    )

    render(<PipelineDock {...props} />)

    const moveButtons = screen.getAllByRole('button', { name: '↔' })
    fireEvent.click(moveButtons[0])
    fireEvent.change(screen.getByPlaceholderText('target_pack_id'), {
      target: { value: 'pack_a' },
    })
    fireEvent.keyDown(screen.getByPlaceholderText('target_pack_id'), { key: 'Enter' })

    fireEvent.click(moveButtons[1])
    fireEvent.change(screen.getByPlaceholderText('target_pack_id'), {
      target: { value: 'pack_b' },
    })
    fireEvent.keyDown(screen.getByPlaceholderText('target_pack_id'), { key: 'Enter' })

    expect(props.onMoveTemplateToPack).toHaveBeenCalledTimes(1)
    resolveMove.forEach((resolve) => resolve())

    const deleteButtons = screen.getAllByRole('button', { name: 'Delete' })
    fireEvent.click(deleteButtons[0])
    fireEvent.click(deleteButtons[1])
    expect(props.onDeleteTemplate).toHaveBeenCalledTimes(1)
    resolveDelete.forEach((resolve) => resolve())
  })

  it('swallows reload errors through internal catch block', async () => {
    const props = createProps([createTemplate()])
    props.onReloadTemplates = vi.fn(async () => {
      throw new Error('reload failed')
    })

    render(<PipelineDock {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Reload packs' }))

    await waitFor(() => {
      expect(props.onReloadTemplates).toHaveBeenCalledTimes(1)
    })
    expect(screen.getByRole('button', { name: 'Reload packs' })).toBeInTheDocument()
  })
})
