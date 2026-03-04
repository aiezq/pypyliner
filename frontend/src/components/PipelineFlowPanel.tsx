import {
  DragDropContext,
  Draggable,
  Droppable,
  type DraggableProvided,
  type DraggableRubric,
  type DraggableStateSnapshot,
  type DropResult,
} from '@hello-pangea/dnd'
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { formatTime } from '../lib/mappers'
import type { PipelineStep, RunState } from '../types'


type StepEditableField = 'label' | 'command'
const NEW_PACK_OPTION_VALUE = '__new_pack__'
const DEFAULT_SAVE_PACK_ID = 'flow_drafts'

interface PackOption {
  id: string
  name: string
}

interface SavedFlowOption {
  id: string
  name: string
}

interface PipelineFlowPanelProps {
  steps: PipelineStep[]
  packOptions: PackOption[]
  savedFlows: SavedFlowOption[]
  selectedSavedFlowId: string | null
  pipelineName: string
  run: RunState | null
  isRunning: boolean
  isSavingFlow?: boolean
  onRunPipeline: () => void
  onStopRun: () => void
  onClearSteps: () => void
  onCreateStep: () => void
  onRemoveStep: (stepId: string) => void
  onUpdateStep: (stepId: string, payload: { label?: string; command?: string }) => void
  onSaveStepToDock: (stepId: string, targetPackId: string) => Promise<void>
  onSwitchSavedFlow: (flowId: string | null) => void
  onPipelineNameChange: (name: string) => void
  onSaveFlow: () => Promise<void>
  onSaveFlowAsNew: () => Promise<void>
  onReorderSteps: (fromIndex: number, toIndex: number) => void
}

function PipelineFlowPanel({
  steps,
  packOptions,
  savedFlows,
  selectedSavedFlowId,
  pipelineName,
  run,
  isRunning,
  isSavingFlow = false,
  onRunPipeline,
  onStopRun,
  onClearSteps,
  onCreateStep,
  onRemoveStep,
  onUpdateStep,
  onSaveStepToDock,
  onSwitchSavedFlow,
  onPipelineNameChange,
  onSaveFlow,
  onSaveFlowAsNew,
  onReorderSteps,
}: PipelineFlowPanelProps) {
  const [canScrollFlowLeft, setCanScrollFlowLeft] = useState(false)
  const [canScrollFlowRight, setCanScrollFlowRight] = useState(false)
  const [editingStepId, setEditingStepId] = useState<string | null>(null)
  const [editingField, setEditingField] = useState<StepEditableField | null>(null)
  const [editingValue, setEditingValue] = useState('')
  const [savingStepId, setSavingStepId] = useState<string | null>(null)
  const [selectedSavePackId, setSelectedSavePackId] = useState(DEFAULT_SAVE_PACK_ID)
  const [newSavePackId, setNewSavePackId] = useState('')
  const [flowError, setFlowError] = useState<string | null>(null)
  const pipelineFlowRef = useRef<HTMLDivElement | null>(null)

  const updateFlowScrollState = useCallback((): void => {
    const container = pipelineFlowRef.current
    if (!container) {
      setCanScrollFlowLeft(false)
      setCanScrollFlowRight(false)
      return
    }

    const maxScrollLeft = container.scrollWidth - container.clientWidth
    setCanScrollFlowLeft(container.scrollLeft > 4)
    setCanScrollFlowRight(maxScrollLeft - container.scrollLeft > 4)
  }, [])

  const scrollFlowBy = (direction: -1 | 1): void => {
    const container = pipelineFlowRef.current
    if (!container) {
      return
    }

    container.scrollBy({
      left: direction * 320,
      behavior: 'smooth',
    })
    window.setTimeout(updateFlowScrollState, 220)
  }

  const onDragEnd = (result: DropResult): void => {
    const { source, destination } = result
    if (!destination || destination.index === source.index) {
      return
    }
    onReorderSteps(source.index, destination.index)
    window.requestAnimationFrame(updateFlowScrollState)
  }

  const startEdit = (step: PipelineStep, field: StepEditableField): void => {
    setEditingStepId(step.id)
    setEditingField(field)
    setEditingValue(field === 'label' ? step.label : step.command)
    setFlowError(null)
  }

  const cancelEdit = (): void => {
    setEditingStepId(null)
    setEditingField(null)
    setEditingValue('')
    setFlowError(null)
  }

  const saveEdit = (): void => {
    if (!editingStepId || !editingField) {
      return
    }

    const nextValue = editingValue.trim()
    if (!nextValue) {
      setFlowError('Value cannot be empty')
      return
    }

    if (editingField === 'label') {
      onUpdateStep(editingStepId, { label: nextValue })
    } else {
      onUpdateStep(editingStepId, { command: nextValue })
    }
    cancelEdit()
  }

  const onEditInputKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter') {
      event.preventDefault()
      saveEdit()
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      cancelEdit()
    }
  }

  const saveStepToDock = async (stepId: string): Promise<void> => {
    const targetPackId =
      selectedSavePackId === NEW_PACK_OPTION_VALUE
        ? newSavePackId.trim()
        : selectedSavePackId.trim()
    if (!targetPackId) {
      setFlowError('Pack id cannot be empty')
      return
    }

    if (savingStepId) {
      return
    }
    setSavingStepId(stepId)
    setFlowError(null)
    try {
      await onSaveStepToDock(stepId, targetPackId)
    } catch (error) {
      if (error instanceof Error) {
        setFlowError(error.message)
      } else {
        setFlowError('Failed to save step to dock')
      }
    } finally {
      setSavingStepId(null)
    }
  }

  const saveCurrentFlow = async (): Promise<void> => {
    setFlowError(null)
    try {
      await onSaveFlow()
    } catch (error) {
      if (error instanceof Error) {
        setFlowError(error.message)
      } else {
        setFlowError('Failed to save pipeline flow')
      }
    }
  }

  const saveCurrentFlowAsNew = async (): Promise<void> => {
    setFlowError(null)
    try {
      await onSaveFlowAsNew()
    } catch (error) {
      if (error instanceof Error) {
        setFlowError(error.message)
      } else {
        setFlowError('Failed to save pipeline flow')
      }
    }
  }

  const renderStepCard = (
    step: PipelineStep,
    index: number,
    draggableProvided: DraggableProvided,
    draggableSnapshot: DraggableStateSnapshot,
    isClone = false,
  ) => {
    const isEditingLabel = editingStepId === step.id && editingField === 'label'
    const isEditingCommand = editingStepId === step.id && editingField === 'command'

    return (
      <article
        ref={draggableProvided.innerRef}
        {...draggableProvided.draggableProps}
        style={draggableProvided.draggableProps.style}
        className={`stepCard stepCard--flow${
          draggableSnapshot.isDragging ? ' stepCard--dragging' : ''
        }${isClone ? ' stepCard--overlay' : ''}`}
      >
        <div className="stepCard__title">
          <span className="stepIndex">{index + 1}</span>
          <span
            className="stepDragHandle"
            {...draggableProvided.dragHandleProps}
            title="Drag to reorder"
          >
            ⋮⋮
          </span>
        </div>

        <div className="templateEditable">
          <span className="templateFieldLabel">Step name</span>
          {isEditingLabel && !isClone ? (
            <div className="templateEditInline">
              <input
                value={editingValue}
                onChange={(event) => setEditingValue(event.target.value)}
                onKeyDown={onEditInputKeyDown}
                autoFocus
              />
              <button type="button" className="templateSaveButton" onClick={saveEdit}>
                ✓
              </button>
            </div>
          ) : (
            <div className="templateDisplayRow">
              <span>{step.label}</span>
              {!isClone ? (
                <button
                  type="button"
                  className="templateEditButton"
                  onClick={() => startEdit(step, 'label')}
                  aria-label={`Edit step name: ${step.label}`}
                >
                  ✎
                </button>
              ) : null}
            </div>
          )}
        </div>

        <div className="templateEditable">
          <span className="templateFieldLabel">Command</span>
          {isEditingCommand && !isClone ? (
            <div className="templateEditInline">
              <input
                value={editingValue}
                onChange={(event) => setEditingValue(event.target.value)}
                onKeyDown={onEditInputKeyDown}
                autoFocus
              />
              <button type="button" className="templateSaveButton" onClick={saveEdit}>
                ✓
              </button>
            </div>
          ) : (
            <div className="templateDisplayRow">
              <code>{step.command}</code>
              {!isClone ? (
                <button
                  type="button"
                  className="templateEditButton"
                  onClick={() => startEdit(step, 'command')}
                  aria-label={`Edit step command: ${step.label}`}
                >
                  ✎
                </button>
              ) : null}
            </div>
          )}
        </div>

        <div className="stepCard__actions">
          <span className="dragHint">{step.type === 'template' ? 'Template step' : 'Custom step'}</span>
          {!isClone ? (
            <div className="flowStepActions">
              <button
                type="button"
                onClick={() => {
                  void saveStepToDock(step.id)
                }}
                disabled={savingStepId === step.id}
              >
                {savingStepId === step.id ? 'Saving...' : 'Save to dock'}
              </button>
              <button type="button" onClick={() => onRemoveStep(step.id)}>
                Remove
              </button>
            </div>
          ) : null}
        </div>
      </article>
    )
  }

  useEffect(() => {
    const packIds = new Set(packOptions.map((option) => option.id))
    if (selectedSavePackId === NEW_PACK_OPTION_VALUE) {
      return
    }
    if (packIds.has(selectedSavePackId)) {
      return
    }
    if (packIds.has(DEFAULT_SAVE_PACK_ID)) {
      setSelectedSavePackId(DEFAULT_SAVE_PACK_ID)
      return
    }
    const firstPackId = packOptions[0]?.id
    if (firstPackId) {
      setSelectedSavePackId(firstPackId)
      return
    }
    setSelectedSavePackId(DEFAULT_SAVE_PACK_ID)
  }, [packOptions, selectedSavePackId])

  useEffect(() => {
    const container = pipelineFlowRef.current
    if (!container) {
      return
    }

    const handleScroll = (): void => {
      updateFlowScrollState()
    }

    const handleResize = (): void => {
      updateFlowScrollState()
    }

    container.addEventListener('scroll', handleScroll, { passive: true })
    window.addEventListener('resize', handleResize)
    const rafId = window.requestAnimationFrame(updateFlowScrollState)

    return () => {
      container.removeEventListener('scroll', handleScroll)
      window.removeEventListener('resize', handleResize)
      window.cancelAnimationFrame(rafId)
    }
  }, [steps.length, updateFlowScrollState])

  return (
    <section className="panel pipelineFlowPanel">
      <div className="section__head">
        <h2>Pipeline Flow</h2>
        <span>
          {steps.length} steps | {run ? run.status : 'idle'}
        </span>
      </div>

      <div className="flowToolbar">
        <div className="flowToolbarRow">
          <label className="flowCompactField flowCompactField--wide">
            <span>Saved flow</span>
            <select
              value={selectedSavedFlowId ?? ''}
              onChange={(event) =>
                onSwitchSavedFlow(event.target.value ? event.target.value : null)
              }
              disabled={isRunning}
            >
              <option value="">Current (unsaved)</option>
              {savedFlows.map((flow) => (
                <option key={flow.id} value={flow.id}>
                  {flow.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flowCompactField flowCompactField--wide">
            <span>Flow name</span>
            <input
              value={pipelineName}
              onChange={(event) => onPipelineNameChange(event.target.value)}
              placeholder="Pipeline flow name"
              disabled={isRunning}
            />
          </label>
          <div className="flowToolbarButtons">
            <button
              type="button"
              className="flowBtn flowBtn--subtle"
              onClick={() => {
                void saveCurrentFlow()
              }}
              disabled={isSavingFlow}
            >
              {isSavingFlow ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              className="flowBtn flowBtn--subtle"
              onClick={() => {
                void saveCurrentFlowAsNew()
              }}
              disabled={isSavingFlow}
            >
              Save as new
            </button>
          </div>
        </div>

        <div className="flowToolbarRow">
          <div className="flowToolbarButtons">
            <button
              type="button"
              className="flowBtn"
              onClick={onRunPipeline}
              disabled={isRunning || steps.length === 0}
            >
              {isRunning ? 'Running…' : 'Run'}
            </button>
            <button
              type="button"
              className="flowBtn flowBtn--subtle"
              onClick={onStopRun}
              disabled={!isRunning}
            >
              Stop
            </button>
            <button
              type="button"
              className="flowBtn flowBtn--subtle"
              onClick={onCreateStep}
              disabled={isRunning}
            >
              New step
            </button>
            <button
              type="button"
              className="flowBtn flowBtn--subtle"
              onClick={onClearSteps}
              disabled={isRunning || steps.length === 0}
            >
              Clear
            </button>
          </div>

          <label className="flowCompactField">
            <span>Save pack</span>
            <select
              value={selectedSavePackId}
              onChange={(event) => setSelectedSavePackId(event.target.value)}
              disabled={isRunning}
            >
              {packOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
              <option value={NEW_PACK_OPTION_VALUE}>New pack…</option>
            </select>
          </label>
          {selectedSavePackId === NEW_PACK_OPTION_VALUE ? (
            <input
              className="flowSavePackInput"
              value={newSavePackId}
              onChange={(event) => setNewSavePackId(event.target.value)}
              placeholder="new_pack_id"
              disabled={isRunning}
            />
          ) : null}
        </div>
      </div>

      {flowError ? <p className="errorBanner">{flowError}</p> : null}

      {run ? (
        <div className="runMeta runMeta--inline">
          <p>
            <strong>Run:</strong> {run.id}
          </p>
          <p>
            <strong>Pipeline:</strong> {run.pipelineName}
          </p>
          <p>
            <strong>Started:</strong> {formatTime(run.startedAt)}
          </p>
          <p>
            <strong>Finished:</strong> {formatTime(run.finishedAt)}
          </p>
          <p>
            <strong>Log file:</strong> <code>{run.logFilePath}</code>
          </p>
        </div>
      ) : null}

      <div className="flowScroller">
        <button
          type="button"
          className="flowScrollButton"
          onClick={() => scrollFlowBy(-1)}
          disabled={!canScrollFlowLeft}
          aria-label="Scroll pipeline flow left"
          title="Scroll left"
        >
          &#8249;
        </button>

        <DragDropContext onDragEnd={onDragEnd}>
          <Droppable
            droppableId="pipeline-flow"
            direction="horizontal"
            renderClone={(
              draggableProvided: DraggableProvided,
              draggableSnapshot: DraggableStateSnapshot,
              rubric: DraggableRubric,
            ) => {
              const step =
                steps.find((item) => item.id === rubric.draggableId) ??
                steps[rubric.source.index]
              if (!step) {
                return null
              }
              return renderStepCard(
                step,
                rubric.source.index,
                draggableProvided,
                draggableSnapshot,
                true,
              )
            }}
          >
            {(droppableProvided, droppableSnapshot) => (
              <div
                className={`pipelineFlow${
                  droppableSnapshot.isDraggingOver ? ' pipelineFlow--dragging' : ''
                }`}
                ref={(element) => {
                  pipelineFlowRef.current = element
                  droppableProvided.innerRef(element)
                }}
                {...droppableProvided.droppableProps}
              >
                {steps.length === 0 ? (
                  <p className="empty">No steps yet. Click “New step” to start.</p>
                ) : (
                  steps.map((step, index) => (
                    <Draggable key={step.id} draggableId={step.id} index={index}>
                      {(draggableProvided, draggableSnapshot) =>
                        renderStepCard(
                          step,
                          index,
                          draggableProvided,
                          draggableSnapshot,
                        )
                      }
                    </Draggable>
                  ))
                )}
                {droppableProvided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>

        <button
          type="button"
          className="flowScrollButton"
          onClick={() => scrollFlowBy(1)}
          disabled={!canScrollFlowRight}
          aria-label="Scroll pipeline flow right"
          title="Scroll right"
        >
          &#8250;
        </button>
      </div>
    </section>
  )
}

export default PipelineFlowPanel
