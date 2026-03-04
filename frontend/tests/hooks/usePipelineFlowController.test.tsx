import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

const createIdMock = vi.hoisted(() => vi.fn())

vi.mock('../../src/lib/mappers', async () => {
  const actual = await vi.importActual<typeof import('../../src/lib/mappers')>(
    '../../src/lib/mappers',
  )
  return {
    ...actual,
    createId: createIdMock,
  }
})

import { usePipelineFlowController } from '../../src/hooks/usePipelineFlowController'

describe('usePipelineFlowController', () => {
  beforeEach(() => {
    createIdMock.mockReset()
    let sequence = 0
    createIdMock.mockImplementation(() => {
      sequence += 1
      return `step_generated_${sequence}`
    })
  })

  const createOptions = (overrides: Record<string, unknown> = {}) => ({
    initialSteps: [
      { id: 'step_a', type: 'template' as const, label: 'A', command: 'echo A' },
      { id: 'step_a', type: 'custom' as const, label: 'B', command: 'echo B' },
    ],
    pipelineName: 'Main',
    setPipelineName: vi.fn(),
    savedPipelineFlows: [
      {
        id: 'flow_1',
        flow_name: 'Saved flow',
        created_at: '2026-03-01T10:00:00Z',
        updated_at: '2026-03-01T10:00:00Z',
        file_name: 'saved.json',
        steps: [{ type: 'template' as const, label: 'S1', command: 'echo S1' }],
      },
    ],
    setBackendError: vi.fn(),
    createTemplateRequest: vi.fn(async () => ({ id: 'tpl_1', name: 'T', command: 'echo', description: '' })),
    updateTemplateRequest: vi.fn(async () => ({ id: 'tpl_1', name: 'T', command: 'echo', description: '' })),
    moveTemplateToPackRequest: vi.fn(async () => ({ id: 'tpl_1', name: 'T', command: 'echo', description: '' })),
    deleteTemplateRequest: vi.fn(async () => ({ deleted: true })),
    importJsonPackRequest: vi.fn(async () => ({})),
    createPipelineFlowRequest: vi.fn(async () => ({
      id: 'flow_new',
      flow_name: 'Created flow',
      created_at: '2026-03-01T10:00:00Z',
      updated_at: '2026-03-01T10:00:00Z',
      file_name: 'new.json',
      steps: [],
    })),
    updatePipelineFlowRequest: vi.fn(async ({ flowId }) => ({
      id: flowId,
      flow_name: 'Updated flow',
      created_at: '2026-03-01T10:00:00Z',
      updated_at: '2026-03-01T10:05:00Z',
      file_name: 'updated.json',
      steps: [],
    })),
    deletePipelineFlowRequest: vi.fn(async () => ({ deleted: true, flow_id: 'flow_1' })),
    ...overrides,
  })

  it('normalizes step ids and supports step operations', () => {
    const options = createOptions()
    const { result } = renderHook(() => usePipelineFlowController(options as never))

    expect(result.current.steps).toHaveLength(2)
    expect(result.current.steps[0]?.id).toBe('step_a')
    expect(result.current.steps[1]?.id).not.toBe('step_a')

    act(() => {
      result.current.addStepFromTemplate({
        id: 'tpl_1',
        name: 'Template step',
        command: 'echo tpl',
        description: '',
      })
    })
    expect(result.current.steps.at(-1)?.label).toBe('Template step')

    act(() => {
      result.current.createEmptyStep()
    })
    expect(result.current.steps.at(-1)?.type).toBe('custom')

    act(() => {
      result.current.updateStep('step_a', { label: 'A updated' })
      result.current.updateStep('step_a', { command: 'echo updated' })
      result.current.updateStep('step_a', {})
    })
    expect(result.current.steps.find((step) => step.id === 'step_a')?.label).toBe(
      'A updated',
    )

    const beforeReorder = result.current.steps.map((step) => step.id)
    act(() => {
      result.current.reorderStepByIndex(0, 1)
      result.current.reorderStepByIndex(1, 1)
      result.current.reorderStepByIndex(-1, 3)
    })
    const afterReorder = result.current.steps.map((step) => step.id)
    expect(afterReorder).not.toEqual(beforeReorder)

    act(() => {
      result.current.removeStep('step_a')
    })
    expect(result.current.steps.some((step) => step.id === 'step_a')).toBe(false)

    act(() => {
      result.current.clearSteps()
    })
    expect(result.current.steps).toEqual([])
  })

  it('wraps template request methods and surfaces errors', async () => {
    const setBackendError = vi.fn()
    const options = createOptions({
      setBackendError,
      createTemplateRequest: vi.fn(async () => {
        throw new Error('create template failed')
      }),
    })
    const { result } = renderHook(() => usePipelineFlowController(options as never))

    await expect(
      result.current.createTemplate({
        name: 'A',
        command: 'echo A',
        description: '',
      }),
    ).rejects.toThrow('create template failed')
    expect(setBackendError).toHaveBeenCalledWith('create template failed')
  })

  it('validates saveStepToDock and forwards valid payload', async () => {
    const createTemplateRequest = vi.fn(async () => ({
      id: 'tpl_1',
      name: 'A',
      command: 'echo A',
      description: '',
    }))
    const options = createOptions({
      initialSteps: [
        { id: 'step_1', type: 'template' as const, label: '  ', command: 'echo A' },
      ],
      createTemplateRequest,
    })
    const { result, rerender } = renderHook(() =>
      usePipelineFlowController(options as never),
    )

    await expect(result.current.saveStepToDock('missing', 'pack')).rejects.toThrow(
      'Step not found',
    )
    await expect(result.current.saveStepToDock('step_1', 'pack')).rejects.toThrow(
      'Step name cannot be empty',
    )

    rerender()
    act(() => {
      result.current.updateStep('step_1', { label: 'Step', command: '   ' })
    })
    await expect(result.current.saveStepToDock('step_1', 'pack')).rejects.toThrow(
      'Step command cannot be empty',
    )

    act(() => {
      result.current.updateStep('step_1', { command: 'echo A' })
    })
    await result.current.saveStepToDock('step_1', ' pack_id ')
    expect(createTemplateRequest).toHaveBeenCalledWith(
      expect.objectContaining({ pack_id: 'pack_id' }),
    )
  })

  it('switches/saves/renames/deletes pipeline flows', async () => {
    const setPipelineName = vi.fn()
    const setBackendError = vi.fn()
    const createPipelineFlowRequest = vi.fn(async () => ({
      id: 'flow_created',
      flow_name: 'Created',
      created_at: '2026-03-01T10:00:00Z',
      updated_at: '2026-03-01T10:00:00Z',
      file_name: 'created.json',
      steps: [],
    }))
    const updatePipelineFlowRequest = vi.fn(async ({ flowId, payload }) => ({
      id: flowId,
      flow_name: payload.flow_name,
      created_at: '2026-03-01T10:00:00Z',
      updated_at: '2026-03-01T10:10:00Z',
      file_name: 'updated.json',
      steps: payload.steps,
    }))
    const deletePipelineFlowRequest = vi.fn(async (flowId: string) => ({
      deleted: true,
      flow_id: flowId,
    }))

    const options = createOptions({
      setPipelineName,
      setBackendError,
      createPipelineFlowRequest,
      updatePipelineFlowRequest,
      deletePipelineFlowRequest,
    })
    const { result } = renderHook(() => usePipelineFlowController(options as never))

    act(() => {
      result.current.switchPipelineFlow('missing_flow')
    })
    expect(setBackendError).toHaveBeenCalledWith("Pipeline flow 'missing_flow' not found")

    act(() => {
      result.current.switchPipelineFlow('flow_1')
    })
    expect(setPipelineName).toHaveBeenCalledWith('Saved flow')
    expect(result.current.effectiveSelectedPipelineFlowId).toBe('flow_1')

    await result.current.savePipelineFlow()
    expect(updatePipelineFlowRequest).toHaveBeenCalledTimes(1)

    await result.current.savePipelineFlowAsNew()
    expect(createPipelineFlowRequest).toHaveBeenCalled()

    await result.current.renamePipelineFlow('flow_1', 'Renamed flow')
    expect(updatePipelineFlowRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        flowId: 'flow_1',
        payload: expect.objectContaining({ flow_name: 'Renamed flow' }),
      }),
    )

    await expect(result.current.renamePipelineFlow('missing', 'x')).rejects.toThrow(
      "Pipeline flow 'missing' not found",
    )

    await result.current.deletePipelineFlow('flow_1')
    expect(deletePipelineFlowRequest).toHaveBeenCalledWith('flow_1')
  })

  it('handles template/dlc wrappers and pipeline create branch', async () => {
    const setBackendError = vi.fn()
    const options = createOptions({ setBackendError })
    const { result } = renderHook(() => usePipelineFlowController(options as never))

    await result.current.updateTemplate('tpl_1', { name: 'New' })
    await result.current.moveTemplateToPack('tpl_1', 'ops')
    await result.current.deleteTemplate('tpl_1')
    await result.current.importJsonPack({ content: '{"pack":1}', fileName: 'pack.json' })

    expect(options.updateTemplateRequest).toHaveBeenCalledWith({
      templateId: 'tpl_1',
      payload: { name: 'New' },
    })
    expect(options.moveTemplateToPackRequest).toHaveBeenCalledWith({
      templateId: 'tpl_1',
      targetPackId: 'ops',
    })
    expect(options.deleteTemplateRequest).toHaveBeenCalledWith('tpl_1')
    expect(options.importJsonPackRequest).toHaveBeenCalledWith({
      content: '{"pack":1}',
      fileName: 'pack.json',
    })

    act(() => {
      result.current.switchPipelineFlow(null)
    })
    expect(result.current.effectiveSelectedPipelineFlowId).toBeNull()

    await result.current.savePipelineFlow()
    expect(options.createPipelineFlowRequest).toHaveBeenCalledTimes(1)
    expect(setBackendError).toHaveBeenLastCalledWith(null)
  })

  it('surfaces wrapper and flow save errors', async () => {
    const setBackendError = vi.fn()
    const options = createOptions({
      setBackendError,
      updateTemplateRequest: vi.fn(async () => {
        throw new Error('update template failed')
      }),
      moveTemplateToPackRequest: vi.fn(async () => {
        throw new Error('move template failed')
      }),
      deleteTemplateRequest: vi.fn(async () => {
        throw new Error('delete template failed')
      }),
      importJsonPackRequest: vi.fn(async () => {
        throw new Error('import failed')
      }),
      createPipelineFlowRequest: vi.fn(async () => {
        throw new Error('create flow failed')
      }),
      updatePipelineFlowRequest: vi.fn(async () => {
        throw new Error('update flow failed')
      }),
      deletePipelineFlowRequest: vi.fn(async () => {
        throw new Error('delete flow failed')
      }),
    })
    const { result } = renderHook(() => usePipelineFlowController(options as never))

    await expect(result.current.updateTemplate('tpl_1', { name: 'New' })).rejects.toThrow(
      'update template failed',
    )
    await expect(result.current.moveTemplateToPack('tpl_1', 'ops')).rejects.toThrow(
      'move template failed',
    )
    await expect(result.current.deleteTemplate('tpl_1')).rejects.toThrow(
      'delete template failed',
    )
    await expect(result.current.importJsonPack({ content: '{}' })).rejects.toThrow(
      'import failed',
    )

    await expect(result.current.savePipelineFlow()).rejects.toThrow('create flow failed')
    act(() => {
      result.current.switchPipelineFlow('flow_1')
    })
    await expect(result.current.savePipelineFlow()).rejects.toThrow('update flow failed')
    await expect(result.current.savePipelineFlowAsNew()).rejects.toThrow('create flow failed')
    await expect(result.current.renamePipelineFlow('flow_1', 'Renamed')).rejects.toThrow(
      'update flow failed',
    )
    await expect(result.current.deletePipelineFlow('flow_1')).rejects.toThrow(
      'delete flow failed',
    )
    expect(setBackendError).toHaveBeenCalled()
  })
})
