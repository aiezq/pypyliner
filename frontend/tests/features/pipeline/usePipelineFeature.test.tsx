import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PIPELINE_OPEN_TERMINAL_COMMAND } from '../../../src/data/templates'

const useWorkbenchCatalogMock = vi.hoisted(() => vi.fn())
const usePipelineFlowControllerMock = vi.hoisted(() => vi.fn())
const useRunControllerMock = vi.hoisted(() => vi.fn())
const createIdMock = vi.hoisted(() => vi.fn())

vi.mock('../../../src/hooks/useWorkbenchCatalog', () => ({
  useWorkbenchCatalog: useWorkbenchCatalogMock,
}))

vi.mock('../../../src/hooks/usePipelineFlowController', () => ({
  usePipelineFlowController: usePipelineFlowControllerMock,
}))

vi.mock('../../../src/hooks/useRunController', () => ({
  useRunController: useRunControllerMock,
}))

vi.mock('../../../src/lib/mappers', async () => {
  const actual = await vi.importActual<typeof import('../../../src/lib/mappers')>(
    '../../../src/lib/mappers',
  )
  return {
    ...actual,
    createId: createIdMock,
  }
})

import { usePipelineFeature } from '../../../src/features/pipeline/usePipelineFeature'

describe('usePipelineFeature', () => {
  it('wires catalog + pipeline flow + runtime controllers', () => {
    createIdMock.mockReturnValue('step_generated')
    const catalog = {
      savedPipelineFlows: [],
      createTemplate: vi.fn(),
      updateTemplate: vi.fn(),
      moveTemplateToPack: vi.fn(),
      deleteTemplate: vi.fn(),
      importJsonPack: vi.fn(),
      createPipelineFlow: vi.fn(),
      updatePipelineFlow: vi.fn(),
      deletePipelineFlow: vi.fn(),
      reloadCommandPacks: vi.fn(async () => {}),
      reloadPipelineFlows: vi.fn(async () => {}),
    }
    useWorkbenchCatalogMock.mockReturnValue(catalog)

    const pipelineFlow = { steps: [{ id: 'step_generated', type: 'template', label: 'Open terminal shell', command: PIPELINE_OPEN_TERMINAL_COMMAND }] }
    usePipelineFlowControllerMock.mockReturnValue(pipelineFlow)

    const runtime = { run: null, isRunning: false, isSocketConnected: true }
    useRunControllerMock.mockReturnValue(runtime)

    const setPipelineName = vi.fn()
    const setBackendError = vi.fn()
    const getSocketEventContext = vi.fn(() => ({}))

    const { result } = renderHook(() =>
      usePipelineFeature({
        pipelineName: 'Main',
        setPipelineName,
        setBackendError,
        getSocketEventContext,
      }),
    )

    expect(usePipelineFlowControllerMock).toHaveBeenCalledWith(
      expect.objectContaining({
        initialSteps: [
          {
            id: 'step_generated',
            type: 'template',
            label: 'Open terminal shell',
            command: PIPELINE_OPEN_TERMINAL_COMMAND,
          },
        ],
        pipelineName: 'Main',
        setPipelineName,
      }),
    )
    expect(useRunControllerMock).toHaveBeenCalledWith(
      expect.objectContaining({
        pipelineName: 'Main',
        steps: pipelineFlow.steps,
      }),
    )

    expect(result.current).toEqual({
      catalog,
      pipelineFlow,
      runtime,
    })
  })
})
