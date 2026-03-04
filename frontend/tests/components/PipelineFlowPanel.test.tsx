import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import PipelineFlowPanel from '../../src/components/PipelineFlowPanel'
import type { PipelineStep, RunState } from '../../src/types'

const createStep = (overrides: Partial<PipelineStep> = {}): PipelineStep => ({
  id: 'step_1',
  type: 'template',
  label: 'List directory',
  command: 'ls -la',
  ...overrides,
})

const createBaseProps = (steps: PipelineStep[]) => ({
  steps,
  packOptions: [
    { id: 'flow_drafts', name: 'Flow Drafts' },
    { id: 'ops', name: 'Ops Pack' },
  ],
  savedFlows: [{ id: 'flow_saved_1', name: 'Saved flow #1' }],
  selectedSavedFlowId: null,
  pipelineName: 'Default pipeline',
  run: null,
  isRunning: false,
  onRunPipeline: vi.fn(),
  onStopRun: vi.fn(),
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
})

const createRun = (overrides: Partial<RunState> = {}): RunState => ({
  id: 'run_1',
  pipelineName: 'Default pipeline',
  status: 'running',
  startedAt: '2026-03-01T10:00:00Z',
  finishedAt: null,
  logFilePath: '/tmp/run_1.log',
  sessions: [],
  ...overrides,
})

describe('PipelineFlowPanel', () => {
  it('triggers run/create/clear actions when toolbar buttons are clicked', () => {
    const props = createBaseProps([createStep()])
    render(<PipelineFlowPanel {...props} />)

    fireEvent.click(screen.getByRole('button', { name: 'Run' }))
    fireEvent.click(screen.getByRole('button', { name: 'New step' }))
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))

    expect(props.onRunPipeline).toHaveBeenCalledTimes(1)
    expect(props.onCreateStep).toHaveBeenCalledTimes(1)
    expect(props.onClearSteps).toHaveBeenCalledTimes(1)
  })

  it('keeps run and clear disabled when there are no steps', () => {
    const props = createBaseProps([])
    render(<PipelineFlowPanel {...props} />)

    expect(screen.getByRole('button', { name: 'Run' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Clear' })).toBeDisabled()
  })

  it('updates flow selection and pipeline name fields', () => {
    const props = createBaseProps([createStep()])
    render(<PipelineFlowPanel {...props} />)

    fireEvent.change(screen.getByLabelText('Saved flow'), {
      target: { value: 'flow_saved_1' },
    })
    fireEvent.change(screen.getByLabelText('Flow name'), {
      target: { value: 'Ops pipeline' },
    })

    expect(props.onSwitchSavedFlow).toHaveBeenCalledWith('flow_saved_1')
    expect(props.onPipelineNameChange).toHaveBeenCalledWith('Ops pipeline')
  })

  it('saves flow and save-as-new from toolbar', async () => {
    const props = createBaseProps([createStep()])
    render(<PipelineFlowPanel {...props} />)

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save as new' }))

    await waitFor(() => {
      expect(props.onSaveFlow).toHaveBeenCalledTimes(1)
      expect(props.onSaveFlowAsNew).toHaveBeenCalledTimes(1)
    })
  })

  it('renders run metadata when run is provided', () => {
    const props = createBaseProps([createStep()])
    render(<PipelineFlowPanel {...props} run={createRun()} />)

    expect(screen.getByText('Run:')).toBeInTheDocument()
    expect(screen.getByText('run_1')).toBeInTheDocument()
    expect(screen.getByText('/tmp/run_1.log')).toBeInTheDocument()
  })

  it('edits step name inline and saves by Enter', () => {
    const step = createStep({ id: 'step_name', label: 'Before name' })
    const props = createBaseProps([step])
    render(<PipelineFlowPanel {...props} />)

    fireEvent.click(
      screen.getByRole('button', { name: `Edit step name: ${step.label}` }),
    )

    const input = screen.getByDisplayValue('Before name')
    fireEvent.change(input, { target: { value: 'After name' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(props.onUpdateStep).toHaveBeenCalledWith('step_name', {
      label: 'After name',
    })
  })

  it('edits command and cancels by Escape', () => {
    const step = createStep({ id: 'step_cmd', label: 'Command step', command: 'pwd' })
    const props = createBaseProps([step])
    render(<PipelineFlowPanel {...props} />)

    fireEvent.click(
      screen.getByRole('button', { name: `Edit step command: ${step.label}` }),
    )

    const input = screen.getByDisplayValue('pwd')
    fireEvent.change(input, { target: { value: 'ls -la' } })
    fireEvent.keyDown(input, { key: 'Escape' })

    expect(props.onUpdateStep).not.toHaveBeenCalled()
    expect(screen.queryByDisplayValue('ls -la')).not.toBeInTheDocument()
  })

  it('shows validation error when trying to save empty edited value', () => {
    const step = createStep({ id: 'step_empty', label: 'Editable step' })
    const props = createBaseProps([step])
    render(<PipelineFlowPanel {...props} />)

    fireEvent.click(
      screen.getByRole('button', { name: `Edit step name: ${step.label}` }),
    )
    const input = screen.getByDisplayValue(step.label)
    fireEvent.change(input, { target: { value: '   ' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(screen.getByText('Value cannot be empty')).toBeInTheDocument()
    expect(props.onUpdateStep).not.toHaveBeenCalled()
  })

  it('saves step to selected existing pack', async () => {
    const step = createStep({ id: 'step_save_existing' })
    const props = createBaseProps([step])
    render(<PipelineFlowPanel {...props} />)

    fireEvent.change(screen.getByLabelText('Save pack'), {
      target: { value: 'ops' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save to dock' }))

    await waitFor(() => {
      expect(props.onSaveStepToDock).toHaveBeenCalledWith('step_save_existing', 'ops')
    })
  })

  it('saves step to new pack id when New pack is selected', async () => {
    const step = createStep({ id: 'step_save_new_pack' })
    const props = createBaseProps([step])
    render(<PipelineFlowPanel {...props} />)

    fireEvent.change(screen.getByLabelText('Save pack'), {
      target: { value: '__new_pack__' },
    })
    fireEvent.change(screen.getByPlaceholderText('new_pack_id'), {
      target: { value: 'new_pack_custom' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save to dock' }))

    await waitFor(() => {
      expect(props.onSaveStepToDock).toHaveBeenCalledWith(
        'step_save_new_pack',
        'new_pack_custom',
      )
    })
  })

  it('shows error when New pack selected but pack id is empty', async () => {
    const step = createStep({ id: 'step_save_error' })
    const props = createBaseProps([step])
    render(<PipelineFlowPanel {...props} />)

    fireEvent.change(screen.getByLabelText('Save pack'), {
      target: { value: '__new_pack__' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save to dock' }))

    expect(screen.getByText('Pack id cannot be empty')).toBeInTheDocument()
    await waitFor(() => {
      expect(props.onSaveStepToDock).not.toHaveBeenCalled()
    })
  })

  it('renders flow error banner when save flow fails', async () => {
    const props = createBaseProps([createStep()])
    props.onSaveFlow = vi.fn(async () => {
      throw new Error('Save failed from backend')
    })

    render(<PipelineFlowPanel {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Save failed from backend')).toBeInTheDocument()
  })

  it('disables actions while pipeline is running and enables stop', () => {
    const props = createBaseProps([createStep()])
    render(<PipelineFlowPanel {...props} isRunning />)

    expect(screen.getByRole('button', { name: 'Running…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'New step' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Clear' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Stop' })).toBeEnabled()
  })

  it('triggers stop and remove actions', () => {
    const step = createStep({ id: 'step_remove' })
    const props = createBaseProps([step])
    render(<PipelineFlowPanel {...props} isRunning />)

    fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
    expect(props.onStopRun).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    expect(props.onRemoveStep).toHaveBeenCalledWith('step_remove')
  })

  it('switches saved flow back to unsaved mode', () => {
    const props = createBaseProps([createStep()])
    render(<PipelineFlowPanel {...props} selectedSavedFlowId="flow_saved_1" />)

    fireEvent.change(screen.getByLabelText('Saved flow'), {
      target: { value: '' },
    })
    expect(props.onSwitchSavedFlow).toHaveBeenCalledWith(null)
  })

  it('shows fallback flow errors when save handlers throw non-Error', async () => {
    const props = createBaseProps([createStep()])
    props.onSaveFlow = vi.fn(async () => {
      throw 'save flow raw error'
    })
    props.onSaveFlowAsNew = vi.fn(async () => {
      throw 'save as raw error'
    })

    render(<PipelineFlowPanel {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Failed to save pipeline flow')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Save as new' }))
    expect(await screen.findByText('Failed to save pipeline flow')).toBeInTheDocument()
  })

  it('shows saveStep fallback error when save to dock throws non-Error', async () => {
    const step = createStep({ id: 'step_save_fail' })
    const props = createBaseProps([step])
    props.onSaveStepToDock = vi.fn(async () => {
      throw 'raw save step error'
    })
    render(<PipelineFlowPanel {...props} />)

    fireEvent.click(screen.getByRole('button', { name: 'Save to dock' }))
    expect(await screen.findByText('Failed to save step to dock')).toBeInTheDocument()
  })

  it('shows saving state in toolbar when isSavingFlow=true', () => {
    const props = createBaseProps([createStep()])
    render(<PipelineFlowPanel {...props} isSavingFlow />)

    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Save as new' })).toBeDisabled()
  })

  it('renders custom-step hint label', () => {
    const customStep = createStep({ id: 'step_custom', type: 'custom', label: 'Custom' })
    const props = createBaseProps([customStep])
    render(<PipelineFlowPanel {...props} />)

    expect(screen.getByText('Custom step')).toBeInTheDocument()
  })

  it('saves edited step command via Enter', () => {
    const step = createStep({ id: 'step_cmd_save', label: 'Command save', command: 'pwd' })
    const props = createBaseProps([step])
    render(<PipelineFlowPanel {...props} />)

    fireEvent.click(
      screen.getByRole('button', { name: `Edit step command: ${step.label}` }),
    )
    const input = screen.getByDisplayValue('pwd')
    fireEvent.change(input, { target: { value: 'ls -la' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(props.onUpdateStep).toHaveBeenCalledWith('step_cmd_save', {
      command: 'ls -la',
    })
  })

  it('prevents concurrent save-to-dock requests while one save is in progress', async () => {
    const resolvers: Array<() => void> = []
    const stepA = createStep({ id: 'step_a' })
    const stepB = createStep({ id: 'step_b', label: 'Second step' })
    const props = createBaseProps([stepA, stepB])
    props.onSaveStepToDock = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolvers.push(resolve)
        }),
    )

    render(<PipelineFlowPanel {...props} />)
    const saveButtons = screen.getAllByRole('button', { name: 'Save to dock' })
    fireEvent.click(saveButtons[0])
    fireEvent.click(saveButtons[1])

    expect(props.onSaveStepToDock).toHaveBeenCalledTimes(1)
    expect(props.onSaveStepToDock).toHaveBeenCalledWith('step_a', 'flow_drafts')
    resolvers.forEach((resolve) => resolve())
  })

  it('shows Error.message when save-to-dock fails with Error', async () => {
    const step = createStep({ id: 'step_error_message' })
    const props = createBaseProps([step])
    props.onSaveStepToDock = vi.fn(async () => {
      throw new Error('Step save failed with explicit error')
    })

    render(<PipelineFlowPanel {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Save to dock' }))

    expect(
      await screen.findByText('Step save failed with explicit error'),
    ).toBeInTheDocument()
  })

  it('shows Error.message when save-as-new fails with Error', async () => {
    const props = createBaseProps([createStep()])
    props.onSaveFlowAsNew = vi.fn(async () => {
      throw new Error('Save as new explicit error')
    })
    render(<PipelineFlowPanel {...props} />)

    fireEvent.click(screen.getByRole('button', { name: 'Save as new' }))
    expect(await screen.findByText('Save as new explicit error')).toBeInTheDocument()
  })

  it('normalizes save pack selection when pack options change', () => {
    const props = createBaseProps([createStep()])
    const { rerender } = render(<PipelineFlowPanel {...props} />)

    fireEvent.change(screen.getByLabelText('Save pack'), {
      target: { value: 'ops' },
    })

    rerender(
      <PipelineFlowPanel
        {...props}
        packOptions={[{ id: 'flow_drafts', name: 'Flow Drafts' }]}
      />,
    )
    expect(screen.getByLabelText('Save pack')).toHaveValue('flow_drafts')

    rerender(
      <PipelineFlowPanel
        {...props}
        packOptions={[
          { id: 'pack_first', name: 'First Pack' },
          { id: 'pack_second', name: 'Second Pack' },
        ]}
      />,
    )
    expect(screen.getByLabelText('Save pack')).toHaveValue('pack_first')

    rerender(<PipelineFlowPanel {...props} packOptions={[]} />)
    expect(screen.getByLabelText('Save pack')).toHaveValue('__new_pack__')
  })
})
