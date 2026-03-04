import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { PipelineStep } from '../../src/types'

vi.mock('@hello-pangea/dnd', () => {
  const dragProvided = {
    innerRef: () => undefined,
    draggableProps: { style: {} },
    dragHandleProps: {},
  }

  return {
    DragDropContext: ({
      children,
      onDragEnd,
    }: {
      children: React.ReactNode
      onDragEnd: (result: {
        source: { index: number }
        destination: { index: number } | null
      }) => void
    }) => (
      <div>
        <button
          type="button"
          onClick={() => onDragEnd({ source: { index: 0 }, destination: { index: 1 } })}
        >
          Mock drop reorder
        </button>
        <button
          type="button"
          onClick={() => onDragEnd({ source: { index: 0 }, destination: null })}
        >
          Mock drop cancel
        </button>
        {children}
      </div>
    ),
    Droppable: ({
      children,
      renderClone,
    }: {
      children: (
        provided: {
          innerRef: (node: HTMLElement | null) => void
          droppableProps: Record<string, never>
          placeholder: React.ReactNode
        },
        snapshot: { isDraggingOver: boolean },
      ) => React.ReactNode
      renderClone?: (
        provided: typeof dragProvided,
        snapshot: { isDragging: boolean },
        rubric: {
          draggableId: string
          source: { index: number }
          type: string
        },
      ) => React.ReactNode
    }) => (
      <div>
        <div data-testid="clone-found">
          {renderClone?.(
            dragProvided,
            { isDragging: true },
            {
              draggableId: 'step_1',
              source: { index: 0 },
              type: 'DEFAULT',
            },
          )}
        </div>
        <div data-testid="clone-missing">
          {renderClone?.(
            dragProvided,
            { isDragging: true },
            {
              draggableId: 'missing_step',
              source: { index: 99 },
              type: 'DEFAULT',
            },
          )}
        </div>
        {children(
          {
            innerRef: () => undefined,
            droppableProps: {},
            placeholder: <div data-testid="dnd-placeholder" />,
          },
          { isDraggingOver: false },
        )}
      </div>
    ),
    Draggable: ({
      children,
    }: {
      children: (
        provided: typeof dragProvided,
        snapshot: { isDragging: boolean },
      ) => React.ReactNode
    }) => <>{children(dragProvided, { isDragging: false })}</>,
  }
})

import PipelineFlowPanel from '../../src/components/PipelineFlowPanel'

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

describe('PipelineFlowPanel DnD and scroll behavior', () => {
  it('handles drop reorder and ignores canceled drop', () => {
    const props = createBaseProps([createStep(), createStep({ id: 'step_2' })])
    render(<PipelineFlowPanel {...props} />)

    fireEvent.click(screen.getByRole('button', { name: 'Mock drop reorder' }))
    fireEvent.click(screen.getByRole('button', { name: 'Mock drop cancel' }))

    expect(props.onReorderSteps).toHaveBeenCalledTimes(1)
    expect(props.onReorderSteps).toHaveBeenCalledWith(0, 1)
  })

  it('renders clone for found step and returns null for missing clone step', () => {
    const props = createBaseProps([createStep()])
    render(<PipelineFlowPanel {...props} />)

    expect(screen.getByTestId('clone-found')).toHaveTextContent('List directory')
    expect(screen.getByTestId('clone-missing')).toBeEmptyDOMElement()
  })

  it('enables scroll buttons and scrolls both directions', async () => {
    const props = createBaseProps([createStep(), createStep({ id: 'step_2' })])
    render(<PipelineFlowPanel {...props} />)

    const pipelineFlow = document.querySelector('.pipelineFlow') as HTMLDivElement | null
    expect(pipelineFlow).toBeInTheDocument()
    if (!pipelineFlow) {
      return
    }

    const scrollBySpy = vi.fn()
    Object.defineProperty(pipelineFlow, 'clientWidth', {
      configurable: true,
      value: 120,
    })
    Object.defineProperty(pipelineFlow, 'scrollWidth', {
      configurable: true,
      value: 640,
    })
    Object.defineProperty(pipelineFlow, 'scrollLeft', {
      configurable: true,
      value: 60,
      writable: true,
    })
    Object.defineProperty(pipelineFlow, 'scrollBy', {
      configurable: true,
      value: scrollBySpy,
    })

    fireEvent.scroll(pipelineFlow)
    fireEvent(window, new Event('resize'))

    const leftButton = screen.getByLabelText('Scroll pipeline flow left')
    const rightButton = screen.getByLabelText('Scroll pipeline flow right')

    await waitFor(() => {
      expect(leftButton).toBeEnabled()
      expect(rightButton).toBeEnabled()
    })

    fireEvent.click(leftButton)
    fireEvent.click(rightButton)

    expect(scrollBySpy).toHaveBeenNthCalledWith(1, {
      left: -320,
      behavior: 'smooth',
    })
    expect(scrollBySpy).toHaveBeenNthCalledWith(2, {
      left: 320,
      behavior: 'smooth',
    })
  })
})
