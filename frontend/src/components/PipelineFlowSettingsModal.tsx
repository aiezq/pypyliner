import { useEffect, useState } from 'react'
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
  const [editingFlowId, setEditingFlowId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [submitError, setSubmitError] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen) {
      return
    }
    setEditingFlowId(null)
    setEditingName('')
    setSubmitError(null)
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) {
      return
    }

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !isMutating) {
        onClose()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [isMutating, isOpen, onClose])

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
          onClose()
        }
      }}
    >
      <section
        className="modalCard modalCard--flowSettings"
        onClick={(event) => {
          event.stopPropagation()
        }}
      >
        <div className="modalHead">
          <h2>Workflow Settings</h2>
          <button
            type="button"
            className="buttonGhost"
            onClick={onClose}
            disabled={isMutating}
          >
            Close
          </button>
        </div>

        <p className="modalHint">
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
