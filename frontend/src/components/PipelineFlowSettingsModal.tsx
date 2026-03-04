import { useCallback, useId, useRef, useState } from 'react'
import { useModalA11y } from '../hooks/useModalA11y'
import { formatTime } from '../lib/mappers'
import type { BackendPipelineFlow } from '../types'


interface PipelineFlowSettingsModalProps {
  isOpen: boolean
  flows: BackendPipelineFlow[]
  selectedFlowId: string | null
  isMutating: boolean
  onClose: () => void
  onSwitchFlow: (flowId: string) => void
  onRenameFlow: (flowId: string, nextName: string) => Promise<void>
  onDeleteFlow: (flowId: string) => Promise<void>
}

function PipelineFlowSettingsModal({
  isOpen,
  flows,
  selectedFlowId,
  isMutating,
  onClose,
  onSwitchFlow,
  onRenameFlow,
  onDeleteFlow,
}: PipelineFlowSettingsModalProps) {
  const dialogRef = useRef<HTMLElement | null>(null)
  const titleId = useId()
  const descriptionId = useId()
  const [editingFlowId, setEditingFlowId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [submitError, setSubmitError] = useState<string | null>(null)

  const resetLocalState = useCallback((): void => {
    setEditingFlowId(null)
    setEditingName('')
    setSubmitError(null)
  }, [])

  const handleClose = useCallback((): void => {
    resetLocalState()
    onClose()
  }, [onClose, resetLocalState])

  useModalA11y({
    isOpen,
    dialogRef,
    onRequestClose: handleClose,
    closeOnEscape: !isMutating,
  })

  if (!isOpen) {
    return null
  }

  const beginRename = (flow: BackendPipelineFlow): void => {
    setEditingFlowId(flow.id)
    setEditingName(flow.flow_name)
    setSubmitError(null)
  }

  const cancelRename = (): void => {
    setEditingFlowId(null)
    setEditingName('')
    setSubmitError(null)
  }

  const submitRename = async (flow: BackendPipelineFlow): Promise<void> => {
    const nextName = editingName.trim()
    if (!nextName) {
      setSubmitError('Workflow name cannot be empty')
      return
    }
    if (nextName === flow.flow_name) {
      cancelRename()
      return
    }

    setSubmitError(null)
    try {
      await onRenameFlow(flow.id, nextName)
      cancelRename()
    } catch (error) {
      if (error instanceof Error) {
        setSubmitError(error.message)
      } else {
        setSubmitError('Failed to rename workflow')
      }
    }
  }

  const removeFlow = async (flow: BackendPipelineFlow): Promise<void> => {
    if (isMutating) {
      return
    }
    const confirmed = window.confirm(
      `Delete workflow "${flow.flow_name}" (${flow.id})?`,
    )
    if (!confirmed) {
      return
    }
    setSubmitError(null)
    try {
      await onDeleteFlow(flow.id)
      if (editingFlowId === flow.id) {
        cancelRename()
      }
    } catch (error) {
      if (error instanceof Error) {
        setSubmitError(error.message)
      } else {
        setSubmitError('Failed to delete workflow')
      }
    }
  }

  return (
    <div
      className="modalBackdrop"
      onClick={() => {
        if (!isMutating) {
          handleClose()
        }
      }}
    >
      <section
        ref={dialogRef}
        className="modalCard modalCard--flowSettings"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        onClick={(event) => {
          event.stopPropagation()
        }}
      >
        <div className="modalHead">
          <h2 id={titleId}>Workflow Settings</h2>
          <button
            type="button"
            className="buttonGhost"
            onClick={handleClose}
            disabled={isMutating}
          >
            Close
          </button>
        </div>

        <p className="modalHint" id={descriptionId}>
          Rename, remove or quickly open saved pipeline workflows.
        </p>

        <div className="flowSettingsList">
          {flows.length === 0 ? (
            <p className="empty">No saved workflows yet.</p>
          ) : (
            flows.map((flow) => {
              const isEditing = editingFlowId === flow.id
              const isSelected = selectedFlowId === flow.id

              return (
                <article
                  key={flow.id}
                  className={`flowSettingsItem${
                    isSelected ? ' flowSettingsItem--active' : ''
                  }`}
                >
                  <div className="templateEditable">
                    <span className="templateFieldLabel">Workflow name</span>
                    {isEditing ? (
                      <div className="templateEditInline">
                        <input
                          value={editingName}
                          onChange={(event) => setEditingName(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              event.preventDefault()
                              void submitRename(flow)
                              return
                            }
                            if (event.key === 'Escape') {
                              event.preventDefault()
                              cancelRename()
                            }
                          }}
                          placeholder="Workflow name"
                          autoFocus
                          disabled={isMutating}
                        />
                        <button
                          type="button"
                          className="templateSaveButton"
                          onClick={() => {
                            void submitRename(flow)
                          }}
                          disabled={!editingName.trim() || isMutating}
                          title={`Save workflow name: ${flow.flow_name}`}
                        >
                          ✓
                        </button>
                      </div>
                    ) : (
                      <div className="templateDisplayRow">
                        <span>{flow.flow_name}</span>
                        <button
                          type="button"
                          className="templateEditButton"
                          onClick={() => beginRename(flow)}
                          aria-label={`Edit workflow name: ${flow.flow_name}`}
                          disabled={isMutating}
                        >
                          ✎
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="flowSettingsMeta">
                    <code>{flow.id}</code>
                    <span>{flow.steps.length} steps</span>
                    <span>Updated {formatTime(flow.updated_at)}</span>
                  </div>

                  <div className="flowSettingsActions">
                    <button
                      type="button"
                      className="buttonGhost"
                      onClick={() => onSwitchFlow(flow.id)}
                      disabled={isMutating}
                    >
                      {isSelected ? 'Active' : 'Open'}
                    </button>
                    <button
                      type="button"
                      className="buttonGhost buttonGhost--danger"
                      onClick={() => {
                        void removeFlow(flow)
                      }}
                      disabled={isMutating}
                    >
                      Delete
                    </button>
                  </div>
                </article>
              )
            })
          )}
        </div>

        {submitError ? <p className="errorBanner">{submitError}</p> : null}
      </section>
    </div>
  )
}

export default PipelineFlowSettingsModal
