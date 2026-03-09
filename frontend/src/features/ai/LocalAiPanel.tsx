import { useEffect, useState } from 'react'
import { useGraphStore } from '../../graph'
import type { AIModel, GeneratePipelineDraftResponse } from '../../lib/schemas'
import {
  cancelAiModelInstall,
  fetchAiModelStatus,
  fetchAiModels,
  generatePipelineDraft,
  installAiModel,
  loadAiModel,
  removeAiModel,
  unloadAiModel,
} from './api'
import { detectDraftRiskFlags } from './riskFlags'
import styles from './LocalAiPanel.module.scss'

interface LocalAiPanelProps {
  onImportComplete: () => void
}

function formatBytesToGb(bytes: number): string {
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`
}

function formatBytes(bytes: number | null): string {
  if (bytes === null) {
    return 'Unknown'
  }
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`
  }
  if (bytes >= 1024 * 1024) {
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  }
  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`
  }
  return `${bytes} B`
}

function mergeModel(models: AIModel[], nextModel: AIModel): AIModel[] {
  return models.map((model) => (model.model_id === nextModel.model_id ? nextModel : model))
}

export default function LocalAiPanel({ onImportComplete }: LocalAiPanelProps) {
  const importPipelineDraft = useGraphStore((state) => state.importPipelineDraft)

  const [runtimeAvailable, setRuntimeAvailable] = useState(false)
  const [runtimeName, setRuntimeName] = useState('ollama')
  const [models, setModels] = useState<AIModel[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [activeActionModelId, setActiveActionModelId] = useState<string | null>(null)
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [documentationText, setDocumentationText] = useState('')
  const [draftResponse, setDraftResponse] = useState<GeneratePipelineDraftResponse | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)

  useEffect(() => {
    let isMounted = true

    void (async () => {
      setIsLoading(true)
      setErrorMessage(null)
      try {
        const response = await fetchAiModels()
        if (!isMounted) {
          return
        }
        setRuntimeAvailable(response.runtime_available)
        setRuntimeName(response.runtime_name)
        setModels(response.models)
        setSelectedModelId(response.models[0]?.model_id ?? null)
      } catch (error) {
        if (!isMounted) {
          return
        }
        setErrorMessage(error instanceof Error ? error.message : 'Failed to load Local AI models.')
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    })()

    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    const installingModelIds = models
      .filter((model) => model.install_state === 'installing')
      .map((model) => model.model_id)

    if (installingModelIds.length === 0) {
      return
    }

    const timer = window.setInterval(() => {
      void Promise.all(installingModelIds.map((modelId) => fetchAiModelStatus(modelId)))
        .then((responses) => {
          setModels((current) => {
            let next = current
            for (const response of responses) {
              next = mergeModel(next, response.model)
            }
            return next
          })
          const latestRuntimeAvailable = responses.at(-1)?.runtime_available
          const latestRuntimeName = responses.at(-1)?.runtime_name
          if (typeof latestRuntimeAvailable === 'boolean') {
            setRuntimeAvailable(latestRuntimeAvailable)
          }
          if (latestRuntimeName) {
            setRuntimeName(latestRuntimeName)
          }
        })
        .catch((error) => {
          setErrorMessage(error instanceof Error ? error.message : 'Failed to refresh install status.')
        })
    }, 1200)

    return () => {
      window.clearInterval(timer)
    }
  }, [models])

  async function refreshModels(): Promise<void> {
    setIsLoading(true)
    setErrorMessage(null)
    try {
      const response = await fetchAiModels()
      setRuntimeAvailable(response.runtime_available)
      setRuntimeName(response.runtime_name)
      setModels(response.models)
      setSelectedModelId((current) => current ?? response.models[0]?.model_id ?? null)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to load Local AI models.')
    } finally {
      setIsLoading(false)
    }
  }

  async function runModelAction(
    modelId: string,
    action: (id: string) => Promise<{ model: AIModel; runtime_available: boolean; runtime_name: string }>,
  ): Promise<void> {
    setActiveActionModelId(modelId)
    setErrorMessage(null)
    try {
      const response = await action(modelId)
      setRuntimeAvailable(response.runtime_available)
      setRuntimeName(response.runtime_name)
      setModels((current) => mergeModel(current, response.model))
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Local AI action failed.')
    } finally {
      setActiveActionModelId(null)
    }
  }

  async function handleGenerate(): Promise<void> {
    if (!selectedModelId) {
      return
    }
    setIsGenerating(true)
    setErrorMessage(null)
    try {
      const response = await generatePipelineDraft(selectedModelId, documentationText)
      setDraftResponse(response)
    } catch (error) {
      setDraftResponse(null)
      setErrorMessage(error instanceof Error ? error.message : 'Draft generation failed.')
    } finally {
      setIsGenerating(false)
    }
  }

  const selectedModel = models.find((model) => model.model_id === selectedModelId) ?? null
  const riskFlags = draftResponse ? detectDraftRiskFlags(draftResponse.draft) : []
  const previewWarnings = draftResponse
    ? Array.from(new Set([...draftResponse.warnings, ...draftResponse.draft.warnings]))
    : []

  return (
    <section className={styles.panel}>
      <div className={styles.header}>
        <div>
          <p className={styles.kicker}>Local AI</p>
          <h2>Local pipeline draft generator</h2>
          <p className={styles.subtitle}>
            Install a local model, paste operator documentation, review the draft, then import it into the graph.
          </p>
        </div>
        <div className={styles.runtimeCard}>
          <span className={runtimeAvailable ? styles.runtimeOk : styles.runtimeWarn}>
            {runtimeName} {runtimeAvailable ? 'available' : 'not installed'}
          </span>
          <button type="button" className="buttonGhost" onClick={() => void refreshModels()}>
            Refresh
          </button>
        </div>
      </div>

      {errorMessage ? <p className="errorBanner">{errorMessage}</p> : null}

      {!runtimeAvailable ? (
        <div className={styles.notice}>
          Runtime is missing. `Install` will first attempt to install Ollama, then pull the selected model.
        </div>
      ) : null}

      {isLoading ? (
        <div className="empty">Loading Local AI models...</div>
      ) : (
        <div className={styles.modelGrid}>
          {models.map((model) => {
            const isBusy = activeActionModelId === model.model_id
            const canGenerate = model.model_state === 'ready'

            return (
              <article
                key={model.model_id}
                className={`${styles.modelCard}${selectedModelId === model.model_id ? ` ${styles.modelCardActive}` : ''}`}
              >
                <div className={styles.modelHead}>
                  <div>
                    <h3>{model.display_name}</h3>
                    <p>{model.provider}</p>
                  </div>
                  <button
                    type="button"
                    className="buttonGhost"
                    onClick={() => setSelectedModelId(model.model_id)}
                  >
                    Select
                  </button>
                </div>

                <dl className={styles.metaList}>
                  <div>
                    <dt>Size</dt>
                    <dd>{formatBytesToGb(model.download_size_bytes)}</dd>
                  </div>
                  <div>
                    <dt>RAM</dt>
                    <dd>
                      {model.min_ram_gb} GB min / {model.recommended_ram_gb} GB recommended
                    </dd>
                  </div>
                  <div>
                    <dt>State</dt>
                    <dd>
                      {model.install_state} / {model.model_state}
                    </dd>
                  </div>
                  <div>
                    <dt>License</dt>
                    <dd>{model.license}</dd>
                  </div>
                </dl>

                {model.last_error ? <div className={styles.modelError}>{model.last_error}</div> : null}

                {model.install_state === 'installing' || model.progress_percent !== null ? (
                  <div className={styles.progressBlock}>
                    <div className={styles.progressHeader}>
                      <strong>{model.progress_status ?? 'Installing model...'}</strong>
                      <span>{model.progress_percent !== null ? `${model.progress_percent.toFixed(1)}%` : '...'}</span>
                    </div>
                    <div
                      className={styles.progressTrack}
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={model.progress_percent ?? 0}
                    >
                      <div
                        className={styles.progressFill}
                        style={{ width: `${model.progress_percent ?? 4}%` }}
                      />
                    </div>
                    <div className={styles.progressMeta}>
                      <span>
                        Downloaded {formatBytes(model.progress_completed_bytes)}
                        {model.progress_total_bytes !== null ? ` of ${formatBytes(model.progress_total_bytes)}` : ''}
                      </span>
                      <span>
                        Remaining{' '}
                        {model.progress_total_bytes !== null && model.progress_completed_bytes !== null
                          ? formatBytes(Math.max(model.progress_total_bytes - model.progress_completed_bytes, 0))
                          : 'Unknown'}
                      </span>
                    </div>
                  </div>
                ) : null}

                <div className={styles.actionRow}>
                  <button
                    type="button"
                    className="buttonGhost"
                    disabled={isBusy || model.install_state === 'installing'}
                    onClick={() => void runModelAction(model.model_id, installAiModel)}
                  >
                    {model.install_state === 'installing' ? 'Installing...' : isBusy && model.install_state !== 'installed' ? 'Installing...' : 'Install'}
                  </button>
                  <button
                    type="button"
                    className="buttonGhost buttonGhost--danger"
                    disabled={isBusy || model.install_state !== 'installing'}
                    onClick={() => void runModelAction(model.model_id, cancelAiModelInstall)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="buttonGhost"
                    disabled={isBusy || model.install_state !== 'installed' || model.model_state === 'ready'}
                    onClick={() => void runModelAction(model.model_id, loadAiModel)}
                  >
                    Load
                  </button>
                  <button
                    type="button"
                    className="buttonGhost"
                    disabled={isBusy || model.model_state !== 'ready'}
                    onClick={() => void runModelAction(model.model_id, unloadAiModel)}
                  >
                    Unload
                  </button>
                  <button
                    type="button"
                    className="buttonGhost buttonGhost--danger"
                    disabled={isBusy || model.install_state === 'not_installed'}
                    onClick={() => void runModelAction(model.model_id, removeAiModel)}
                  >
                    Remove
                  </button>
                </div>

                <button
                  type="button"
                  className={styles.generateButton}
                  disabled={!canGenerate}
                  onClick={() => {
                    setSelectedModelId(model.model_id)
                    setDraftResponse(null)
                    setIsModalOpen(true)
                  }}
                >
                  Generate from docs
                </button>
              </article>
            )
          })}
        </div>
      )}

      {isModalOpen && selectedModel ? (
        <div className="modalBackdrop" role="presentation">
          <div className={`modalCard modalCard--flowSettings ${styles.modalCard}`}>
            <div className="modalHead">
              <div>
                <h2>Generate draft with {selectedModel.display_name}</h2>
                <p className="modalHint">
                  Model must stay in `ready` state. Import stays manual and does not execute commands.
                </p>
              </div>
              <button
                type="button"
                className="buttonGhost"
                onClick={() => {
                  setIsModalOpen(false)
                  setDraftResponse(null)
                }}
              >
                Close
              </button>
            </div>

            <label className={styles.inputBlock}>
              <span>Documentation</span>
              <textarea
                value={documentationText}
                onChange={(event) => setDocumentationText(event.target.value)}
                placeholder="Paste operator documentation here."
                rows={10}
              />
            </label>

            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.generateButton}
                disabled={isGenerating || selectedModel.model_state !== 'ready' || !documentationText.trim()}
                onClick={() => void handleGenerate()}
              >
                {isGenerating ? 'Generating...' : 'Generate draft'}
              </button>
              <button
                type="button"
                className="buttonGhost"
                onClick={() => {
                  setDraftResponse(null)
                  setDocumentationText('')
                }}
              >
                Reset
              </button>
            </div>

            {draftResponse ? (
              <div className={styles.preview}>
                <div className={styles.previewHeader}>
                  <div>
                    <p className={styles.previewKicker}>Preview</p>
                    <h3>{draftResponse.draft.flow_name}</h3>
                    <p>{draftResponse.draft.summary}</p>
                  </div>
                  <div className={styles.confidence}>
                    Confidence {(draftResponse.draft.confidence * 100).toFixed(0)}%
                  </div>
                </div>

                {riskFlags.length > 0 ? (
                  <div className={styles.blockingWarning}>
                    Blocking warning: risk flags detected ({riskFlags.join(', ')}). Import is disabled until the draft is edited or regenerated.
                  </div>
                ) : null}

                <div className={styles.previewGrid}>
                  <section>
                    <h4>Variables</h4>
                    {draftResponse.draft.variables.length === 0 ? (
                      <p className={styles.emptyState}>No variables.</p>
                    ) : (
                      <ul className={styles.simpleList}>
                        {draftResponse.draft.variables.map((variable) => (
                          <li key={variable.name}>
                            <strong>{variable.name}</strong> {variable.required ? '(required)' : '(optional)'} {variable.description}
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>

                  <section>
                    <h4>Steps</h4>
                    <ol className={styles.simpleList}>
                      {draftResponse.draft.steps.map((step) => (
                        <li key={step.id}>
                          <strong>{step.label}</strong>
                          <code>{step.command}</code>
                        </li>
                      ))}
                    </ol>
                  </section>

                  <section>
                    <h4>Warnings</h4>
                    {previewWarnings.length === 0 ? (
                      <p className={styles.emptyState}>No warnings.</p>
                    ) : (
                      <ul className={styles.simpleList}>
                        {previewWarnings.map((warning) => (
                          <li key={warning}>{warning}</li>
                        ))}
                      </ul>
                    )}
                  </section>

                  <section>
                    <h4>Assumptions</h4>
                    {draftResponse.draft.assumptions.length === 0 ? (
                      <p className={styles.emptyState}>No assumptions.</p>
                    ) : (
                      <ul className={styles.simpleList}>
                        {draftResponse.draft.assumptions.map((assumption) => (
                          <li key={assumption}>{assumption}</li>
                        ))}
                      </ul>
                    )}
                  </section>
                </div>

                <div className={styles.modalActions}>
                  <button
                    type="button"
                    className={styles.generateButton}
                    disabled={riskFlags.length > 0}
                    onClick={() => {
                      importPipelineDraft(draftResponse.draft)
                      setIsModalOpen(false)
                      setDraftResponse(null)
                      onImportComplete()
                    }}
                  >
                    Import to graph
                  </button>
                  <button
                    type="button"
                    className="buttonGhost"
                    onClick={() => setIsModalOpen(false)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  )
}
